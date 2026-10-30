import { describe, expect, it } from "vitest";
import { prisma } from "@/server/db";

/**
 * Audit finding #3, as a regression test.
 *
 * The fifteen composite tenant foreign keys were declared by the initial migration
 * but absent from the live schema once, which let an order point at another shop's
 * customer. This asserts both halves: the constraints exist, and the database
 * refuses the cross-tenant row.
 */
describe("tenant isolation is enforced by the database", () => {
  it("has the fifteen composite tenant foreign keys", async () => {
    const rows = await prisma.$queryRaw<{ n: bigint }[]>`
      SELECT count(*)::bigint AS n FROM pg_constraint WHERE conname LIKE '%_tenant_fk'`;
    expect(Number(rows[0].n)).toBe(15);
  });

  it("rejects an order whose customer belongs to another tenant", async () => {
    const a = await prisma.tenant.create({ data: { slug: `iso-a-${Date.now()}`, nameFa: "الف", nameEn: "A" } });
    const b = await prisma.tenant.create({ data: { slug: `iso-b-${Date.now()}`, nameFa: "ب", nameEn: "B" } });
    const customer = await prisma.customer.create({ data: { tenantId: a.id, displayName: "مشتری الف" } });

    await expect(
      prisma.$transaction(async (tx) => {
        await tx.order.create({
          data: {
            tenantId: b.id,
            customerId: customer.id,
            publicRef: `X-${Date.now()}`,
            totalMinor: 1000n,
            currency: "IRR",
          },
        });
      }),
    ).rejects.toBeTruthy();
  });
});
