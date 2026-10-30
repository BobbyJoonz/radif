import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { isMember, pickActiveMembership, type MembershipView } from "@/server/active-tenant";
import { listMemberships } from "@/server/session";
import { resetDatabase } from "./helpers/db";
import { createTenant, type TestTenant } from "./helpers/fixtures";

/**
 * The audit's P1: `getSessionContext` always took the oldest membership, so a
 * person in two shops had no explicit active shop, and a client-provided tenant
 * was ignored rather than validated. The selection is a pure function now, and
 * membership is the only thing that grants access.
 */
function view(tenantId: string, createdAt: string, role: "owner" | "operator" = "owner"): MembershipView {
  return { tenantId, role, tenantSlug: tenantId, nameFa: tenantId, nameEn: tenantId, createdAt: new Date(createdAt) };
}

describe("active tenant selection", () => {
  const older = view("tenant_a", "2026-01-01T00:00:00Z");
  const newer = view("tenant_b", "2026-06-01T00:00:00Z");

  it("honours a preferred shop the user actually belongs to", () => {
    expect(pickActiveMembership([older, newer], "tenant_b")?.tenantId).toBe("tenant_b");
  });

  it("falls back to the oldest membership when the preference is foreign", () => {
    expect(pickActiveMembership([older, newer], "tenant_z")?.tenantId).toBe("tenant_a");
    expect(pickActiveMembership([older, newer], null)?.tenantId).toBe("tenant_a");
  });

  it("returns nothing when the user belongs to no shop (removed colleague)", () => {
    expect(pickActiveMembership([], "tenant_a")).toBeNull();
  });

  it("never treats a cookie value alone as membership", () => {
    expect(isMember([older, newer], "tenant_b")).toBe(true);
    expect(isMember([older, newer], "tenant_z")).toBe(false);
    expect(isMember([older, newer], null)).toBe(false);
  });
});

describe("memberships on a real database", () => {
  let toranj: TestTenant;
  let raha: TestTenant;

  beforeEach(async () => {
    await resetDatabase();
    toranj = await createTenant({ idPrefix: "tenant_toranj" });
    raha = await createTenant({ idPrefix: "tenant_raha" });
  });

  it("lists every shop a person belongs to, with the role from that shop", async () => {
    await prisma.membership.create({
      data: { tenantId: raha.tenantId, userId: toranj.userId, role: "operator" },
    });

    const memberships = await listMemberships(toranj.userId);
    expect(memberships).toHaveLength(2);
    const roles = Object.fromEntries(memberships.map((m) => [m.tenantId, m.role]));
    expect(roles[toranj.tenantId]).toBe("owner");
    expect(roles[raha.tenantId]).toBe("operator");
  });

  it("a revoked membership disappears immediately", async () => {
    await prisma.membership.create({
      data: { tenantId: raha.tenantId, userId: toranj.userId, role: "operator" },
    });
    await prisma.membership.deleteMany({ where: { tenantId: raha.tenantId, userId: toranj.userId } });

    const memberships = await listMemberships(toranj.userId);
    expect(memberships.map((m) => m.tenantId)).toEqual([toranj.tenantId]);
    expect(isMember(memberships, raha.tenantId)).toBe(false);
  });
});
