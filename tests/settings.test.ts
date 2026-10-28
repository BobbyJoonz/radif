import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { errors } from "@/server/http";
import {
  getConnections,
  getSettings,
  settingsPatchSchema,
  updateSettings,
} from "@/server/services/settings";
import { resetDatabase } from "./helpers/db";
import { createConnection, createOperator, createTenant, expectApiError, type TestTenant } from "./helpers/fixtures";

/**
 * Settings — owner-only writes, a working day that must make sense, and a
 * Connections read that never carries token material.
 */
describe("settings service", () => {
  let tenant: TestTenant;

  beforeEach(async () => {
    await resetDatabase();
    tenant = await createTenant({ idPrefix: "tenant_settings" });
  });

  it("returns the tenant, its clock and the runtime modes without any secret", async () => {
    const settings = await getSettings(tenant.ctx);

    expect(settings.tenant).toMatchObject({ id: tenant.tenantId, currency: "IRR", timezone: "Asia/Tehran" });
    expect(settings.workday).toEqual({ startMin: 540, endMin: 1260 });
    expect(settings.sla).toEqual({ firstReplyMin: 120, shipMin: 2880 });
    expect(settings.priceFreshnessMin).toBe(1440);
    expect(settings.postingPaused).toBe(false);
    expect(settings.modes.appMode).toBe("demo");
    expect(settings.rateLimits.importPerMin).toBeGreaterThan(0);
    // The DTO must not be able to carry a channel token by accident.
    expect(JSON.stringify(settings)).not.toContain("sealed");
  });

  it("an owner can change the workday, SLA, freshness and the pause flag", async () => {
    const updated = await updateSettings(tenant.ctx, {
      workday: { startMin: 600, endMin: 1200 },
      sla: { firstReplyMin: 30, shipMin: 1440 },
      priceFreshnessMin: 720,
      postingPaused: true,
    });

    expect(updated.workday).toEqual({ startMin: 600, endMin: 1200 });
    expect(updated.sla).toEqual({ firstReplyMin: 30, shipMin: 1440 });
    expect(updated.priceFreshnessMin).toBe(720);
    expect(updated.postingPaused).toBe(true);

    const stored = await prisma.tenantSettings.findUniqueOrThrow({ where: { tenantId: tenant.tenantId } });
    expect(stored.workdayStartMin).toBe(600);
    expect(stored.postingPaused).toBe(true);
    expect(
      await prisma.auditEvent.count({ where: { tenantId: tenant.tenantId, action: "settings.updated" } }),
    ).toBe(1);
  });

  it("an operator cannot change settings: 403 from the service (rule 10's spirit)", async () => {
    const operator = await createOperator(tenant);

    await expectApiError(
      () => updateSettings(operator.ctx, { postingPaused: true }),
      { status: 403, code: "forbidden" },
    );
    const stored = await prisma.tenantSettings.findUniqueOrThrow({ where: { tenantId: tenant.tenantId } });
    expect(stored.postingPaused).toBe(false);
  });

  it("refuses a working day that is backwards or out of range before it reaches the database", () => {
    expect(() => settingsPatchSchema.parse({ workday: { startMin: 900, endMin: 600 } })).toThrow();
    expect(() => settingsPatchSchema.parse({ workday: { startMin: -1, endMin: 600 } })).toThrow();
    expect(() => settingsPatchSchema.parse({ workday: { startMin: 0, endMin: 1441 } })).toThrow();
    expect(() => settingsPatchSchema.parse({ postingPaused: "yes" })).toThrow();
    // An unknown key is a refused body, not a silently ignored one.
    expect(() => settingsPatchSchema.parse({ tenantId: "tenant_other" })).toThrow();
    expect(settingsPatchSchema.parse({ postingPaused: true })).toEqual({ postingPaused: true });
  });

  it("lists this tenant's connections only, and says honestly whether they are live", async () => {
    await createConnection(tenant.tenantId, "shop.a");
    await createConnection(tenant.tenantId, "shop.b");

    const connections = await getConnections(tenant.ctx);

    expect(connections).toHaveLength(2);
    expect(connections.every((connection) => connection.live === false)).toBe(true);
    expect(Object.keys(connections[0]!).sort()).toEqual(
      ["accountRef", "channel", "displayName", "id", "lastSyncAt", "live", "status"].sort(),
    );
  });

  it("keeps the error helper honest about 403 vs 404", () => {
    expect(errors.forbidden().status).toBe(403);
    expect(errors.notFound().status).toBe(404);
  });
});
