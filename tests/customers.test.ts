import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { getCustomer, listCustomers } from "@/server/services/customers";
import { resetDatabase } from "./helpers/db";
import {
  createConnection,
  createConversation,
  createCustomer,
  createMessage,
  createOrder,
  createPaymentClaim,
  createShipment,
  createTask,
  createTenant,
  type TestTenant,
} from "./helpers/fixtures";

/**
 * Customers — a merged read, and nothing else.
 *
 * The point of these cases is that the timeline is assembled from rows that already
 * point at this customer, and that two separate identities are never silently
 * merged (brief §5 «مشتری‌ها»).
 */
describe("customers service", () => {
  let tenant: TestTenant;
  let other: TestTenant;

  beforeEach(async () => {
    await resetDatabase();
    tenant = await createTenant({ idPrefix: "tenant_cust" });
    other = await createTenant({ idPrefix: "tenant_cust_other" });
  });

  it("lists only this tenant's customers with real counts", async () => {
    const connection = await createConnection(tenant.tenantId);
    const negar = await createCustomer(tenant.tenantId, {
      displayName: "نگار احمدی",
      handle: "negar.ahmadi",
      connectionId: connection.id,
    });
    await createCustomer(other.tenantId, { displayName: "نگار دیگر" });

    const conversation = await createConversation(tenant.tenantId, {
      connectionId: connection.id,
      customerId: negar.id,
      lastMessageAt: new Date("2026-10-01T10:00:00.000Z"),
    });
    await createOrder(tenant.tenantId, negar.id, { publicRef: "TEST-ORD-1" });
    await createTask(tenant.tenantId, { customerId: negar.id, status: "open" });

    const rows = await listCustomers(tenant.ctx);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: negar.id,
      displayName: "نگار احمدی",
      handles: ["negar.ahmadi"],
      ordersCount: 1,
      openTasks: 1,
      lastSeenAt: "2026-10-01T10:00:00.000Z",
    });
    expect(conversation.id).toBeTruthy();
  });

  it("searches by name, phone and handle without leaving the tenant", async () => {
    const connection = await createConnection(tenant.tenantId);
    await createCustomer(tenant.tenantId, {
      displayName: "شیرین کیانی",
      phone: "+989351112233",
      handle: "shirin.kiani",
      connectionId: connection.id,
    });
    await createCustomer(tenant.tenantId, { displayName: "حسین مرادی" });

    expect((await listCustomers(tenant.ctx, "شیرین")).map((row) => row.displayName)).toEqual(["شیرین کیانی"]);
    expect((await listCustomers(tenant.ctx, "935")).map((row) => row.displayName)).toEqual(["شیرین کیانی"]);
    expect((await listCustomers(tenant.ctx, "kiani")).map((row) => row.displayName)).toEqual(["شیرین کیانی"]);
    expect(await listCustomers(other.ctx, "شیرین")).toHaveLength(0);
  });

  it("returns null for another tenant's customer (rule 9)", async () => {
    const customer = await createCustomer(tenant.tenantId, {});
    expect(await getCustomer(other.ctx, customer.id)).toBeNull();
  });

  it("merges messages, orders, payment, shipment, task and audit into one timeline", async () => {
    const connection = await createConnection(tenant.tenantId);
    const customer = await createCustomer(tenant.tenantId, { displayName: "نگار احمدی" });
    const conversation = await createConversation(tenant.tenantId, {
      connectionId: connection.id,
      customerId: customer.id,
      lastMessageAt: new Date("2026-10-01T09:00:00.000Z"),
    });
    await createMessage(tenant.tenantId, {
      conversationId: conversation.id,
      text: "واریز کردم",
      occurredAt: new Date("2026-10-01T09:00:00.000Z"),
    });
    const order = await createOrder(tenant.tenantId, customer.id, {
      publicRef: "TEST-ORD-42",
      status: "confirmed",
      totalMinor: 3_700_000n,
    });
    await createPaymentClaim(tenant.tenantId, order.id, { status: "claimed", amountMinor: 3_700_000n });
    await createShipment(tenant.tenantId, order.id, { status: "preparing", carrier: "تیپاکس" });
    await createTask(tenant.tenantId, { customerId: customer.id, orderId: order.id, status: "open" });
    await prisma.auditEvent.create({
      data: {
        tenantId: tenant.tenantId,
        actorType: "user",
        actorId: tenant.userId,
        action: "order.confirmed",
        entityType: "order",
        entityId: order.id,
        orderId: order.id,
      },
    });

    const detail = await getCustomer(tenant.ctx, customer.id);

    expect(detail).not.toBeNull();
    expect(detail!.customer.id).toBe(customer.id);
    expect(detail!.orders).toHaveLength(1);
    expect(detail!.orders[0]).toMatchObject({
      publicRef: "TEST-ORD-42",
      paymentStatus: "claimed",
      shipmentStatus: "preparing",
    });

    const kinds = new Set(detail!.timeline.map((entry) => entry.kind));
    expect(kinds).toEqual(new Set(["message", "order", "payment", "shipment", "task", "audit"]));

    // Newest first, and every entry can be traced back to a row.
    const times = detail!.timeline.map((entry) => Date.parse(entry.at));
    expect(times).toEqual([...times].sort((a, b) => b - a));
    const paymentEntry = detail!.timeline.find((entry) => entry.kind === "payment");
    expect(paymentEntry?.orderId).toBe(order.id);
    const messageEntry = detail!.timeline.find((entry) => entry.kind === "message");
    expect(messageEntry?.conversationId).toBe(conversation.id);
  });

  it("does not merge identities: two handles stay two customers while nothing links them", async () => {
    const connection = await createConnection(tenant.tenantId);
    const first = await createCustomer(tenant.tenantId, {
      displayName: "نگار",
      handle: "negar.ahmadi",
      connectionId: connection.id,
    });
    const second = await createCustomer(tenant.tenantId, {
      displayName: "نگار ۲",
      handle: "negar.ahmadi2",
      connectionId: connection.id,
    });

    expect(first.id).not.toBe(second.id);
    expect(await prisma.customer.count({ where: { tenantId: tenant.tenantId } })).toBe(2);

    const detail = await getCustomer(tenant.ctx, first.id);
    expect(detail!.customer.handles).toEqual(["negar.ahmadi"]);
    expect(detail!.customer.displayName).toBe("نگار");
  });
});
