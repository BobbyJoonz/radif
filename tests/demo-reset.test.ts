import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { resetDemoData } from "@/server/services/demo";
import { resetDatabase } from "./helpers/db";
import { createOperator, createTenant, expectApiError, type TestTenant } from "./helpers/fixtures";

/**
 * Reset guards. The audit's requirement is that a reset cannot clear another
 * sandbox or run on a real shop; the rebuild itself spawns the seed process, which
 * is out of scope for a unit test, but every refusal happens *before* that spawn —
 * and those refusals are exactly what protects other people's data.
 */
describe("demo reset guards", () => {
  let real: TestTenant;
  let demo: TestTenant;

  beforeEach(async () => {
    await resetDatabase();
    real = await createTenant({ idPrefix: "tenant_real" });
    demo = await createTenant({ idPrefix: "tenant_demo" });
    await prisma.tenant.update({ where: { id: demo.tenantId }, data: { isDemo: true } });
  });

  function ctxOf(tenant: TestTenant, role: "owner" | "operator" = "owner") {
    return { ...tenant.ctx, role, tenant: { ...tenant.ctx.tenant, isDemo: true } };
  }

  it("refuses to reset a shop that is not a demo tenant", async () => {
    const ctx = { ...real.ctx, tenant: { ...real.ctx.tenant, isDemo: false } };
    await expectApiError(() => resetDemoData(ctx), { status: 403, code: "forbidden" });
  });

  it("refuses a reset from an operator", async () => {
    const operator = await createOperator(demo);
    await expectApiError(() => resetDemoData({ ...ctxOf(demo, "operator"), user: operator.ctx.user }), {
      status: 403,
      code: "forbidden",
    });
  });
});
