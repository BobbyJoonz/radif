import { beforeEach, describe, expect, it } from "vitest";
import { confirmDraft } from "@/server/services/orders";
import { prisma } from "@/server/db";
import { resetDatabase } from "./helpers/db";
import { createCustomer, createOrder, createTenant, expectApiError, type TestTenant } from "./helpers/fixtures";

/**
 * The audit's P0: an automatically created draft had zero items and a default
 * total of zero, and confirming it produced an order that says nothing. These are
 * real database round trips, so the CHECK constraints are exercised too.
 */
describe("draft confirmation gate", () => {
  let toranj: TestTenant;

  beforeEach(async () => {
    await resetDatabase();
    toranj = await createTenant({ idPrefix: "tenant_toranj" });
  });

  it("refuses a draft with no items", async () => {
    const customer = await createCustomer(toranj.tenantId, { displayName: "نگار" });
    const order = await createOrder(toranj.tenantId, customer.id, { status: "draft" });

    await expectApiError(() => confirmDraft(toranj.ctx, order.id, { version: order.version }), {
      status: 422,
      code: "invalid",
    });

    const after = await prisma.order.findFirst({ where: { id: order.id }, select: { status: true } });
    expect(after?.status).toBe("draft");
  });

  it("refuses a zero total unless a human explicitly accepts a free order", async () => {
    const customer = await createCustomer(toranj.tenantId, { displayName: "شیرین" });
    const order = await createOrder(toranj.tenantId, customer.id, {
      status: "draft",
      items: [{ title: "هدیهٔ تبلیغاتی", qty: 1, unitPriceMinor: 0n }],
    });

    await expectApiError(() => confirmDraft(toranj.ctx, order.id, { version: order.version }), {
      status: 422,
      code: "invalid",
    });

    const confirmed = await confirmDraft(toranj.ctx, order.id, {
      version: order.version,
      acknowledgeFreeOrder: true,
    });
    expect(confirmed.status).toBe("confirmed");
    expect(confirmed.totalMinor).toBe("0");
  });

  it("confirms a complete draft, stores the computed total, and leaves payment and shipment alone", async () => {
    const customer = await createCustomer(toranj.tenantId, { displayName: "حسین" });
    const order = await createOrder(toranj.tenantId, customer.id, {
      status: "draft",
      totalMinor: 0n, // what the worker leaves behind
      items: [
        { title: "شال ابریشم", qty: 2, unitPriceMinor: 18_500_000n },
        { title: "روسری", qty: 1, unitPriceMinor: 12_000_000n },
      ],
    });

    const confirmed = await confirmDraft(toranj.ctx, order.id, { version: order.version });

    expect(confirmed.status).toBe("confirmed");
    expect(confirmed.totalMinor).toBe("49000000");
    expect(confirmed.paymentStatus).toBe("unknown");
    expect(confirmed.shipmentStatus).toBe("not_ready");
  });
});
