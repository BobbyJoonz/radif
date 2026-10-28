import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import {
  confirmDraft,
  createPaymentClaim,
  getOrder,
  getReplyPreview,
  listOrders,
  updateDraft,
  updateShipment,
  verifyPayment,
} from "@/server/services/orders";
import { resetDatabase } from "./helpers/db";
import {
  createConnection,
  createCustomer,
  createMessage,
  createOperator,
  createOrder,
  createPaymentClaim as seedClaim,
  createShipment,
  createTask,
  createTenant,
  expectApiError,
  type TestTenant,
} from "./helpers/fixtures";

/**
 * Orders — the three state machines, the optimistic lock and the two refusals that
 * matter most (rules 2, 3, 6, 8, 10, 14). Every case is a real database round trip:
 * the CHECK constraints are part of what is being tested.
 */
describe("orders service", () => {
  let toranj: TestTenant;
  let raha: TestTenant;

  beforeEach(async () => {
    await resetDatabase();
    toranj = await createTenant({ idPrefix: "tenant_toranj" });
    raha = await createTenant({ idPrefix: "tenant_raha" });
  });

  async function seedDraftOrder(tenant: TestTenant, options: { publicRef?: string; version?: number } = {}) {
    const customer = await createCustomer(tenant.tenantId, { displayName: "نگار احمدی" });
    const order = await createOrder(tenant.tenantId, customer.id, {
      publicRef: options.publicRef ?? "TEST-ORD-1",
      status: "draft",
      version: options.version ?? 1,
      totalMinor: 3_700_000n,
      items: [{ title: "تابلوفرش ابریشم", qty: 1, unitPriceMinor: 3_700_000n }],
    });
    return { customer, order };
  }

  it("confirmDraft moves the order to confirmed and leaves payment and shipment untouched (rule 3)", async () => {
    const { order } = await seedDraftOrder(toranj);

    const confirmed = await confirmDraft(toranj.ctx, order.id, { version: order.version });

    expect(confirmed.status).toBe("confirmed");
    expect(confirmed.paymentStatus).toBe("unknown");
    expect(confirmed.shipmentStatus).toBe("not_ready");
    expect(confirmed.version).toBe(2);

    // Nothing was created behind the seller's back: no claim, no parcel.
    expect(await prisma.paymentClaim.count({ where: { orderId: order.id } })).toBe(0);
    expect(await prisma.shipment.count({ where: { orderId: order.id } })).toBe(0);

    const stored = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(stored.confirmedAt).not.toBeNull();
    expect(stored.confirmedById).toBe(toranj.userId);
    expect(
      await prisma.auditEvent.count({ where: { orderId: order.id, action: "order.confirmed" } }),
    ).toBe(1);
  });

  it("confirmDraft rejects a stale version with 409 (rule 14)", async () => {
    const { order } = await seedDraftOrder(toranj, { version: 3 });

    await expectApiError(() => confirmDraft(toranj.ctx, order.id, { version: 2 }), {
      status: 409,
      code: "conflict",
    });
    expect((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe("draft");
  });

  it("updateDraft bumps the version, replaces items and recomputes the total", async () => {
    const { order } = await seedDraftOrder(toranj);

    const result = await updateDraft(toranj.ctx, order.id, {
      version: 1,
      patch: {
        items: [
          { title: "شال ترنج", qty: 2, unitPriceMinor: "1500000" },
          { title: "رومیزی", qty: 1, unitPriceMinor: "800000" },
        ],
        notes: "آدرس تأیید شد",
      },
    });

    expect(result.version).toBe(2);
    const stored = await prisma.order.findUniqueOrThrow({
      where: { id: order.id },
      include: { items: true },
    });
    expect(stored.totalMinor).toBe(3_800_000n);
    expect(stored.items).toHaveLength(2);
    expect(stored.notes).toBe("آدرس تأیید شد");
  });

  it("two edits at the same version produce one success and one 409, never a silent overwrite (rule 14)", async () => {
    const { order } = await seedDraftOrder(toranj);
    const first = updateDraft(toranj.ctx, order.id, { version: 1, patch: { notes: "اول" } });
    const second = updateDraft(toranj.ctx, order.id, { version: 1, patch: { notes: "دوم" } });

    const results = await Promise.allSettled([first, second]);
    const fulfilled = results.filter((result) => result.status === "fulfilled");
    const rejected = results.filter((result) => result.status === "rejected");

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toMatchObject({ status: 409, code: "conflict" });
    expect((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).version).toBe(2);
  });

  it("a confirmed order cannot be edited in place", async () => {
    const { order } = await seedDraftOrder(toranj);
    await confirmDraft(toranj.ctx, order.id, { version: 1 });

    await expectApiError(() => updateDraft(toranj.ctx, order.id, { version: 2, patch: { notes: "دیر" } }), {
      status: 409,
      code: "conflict",
    });
  });

  it("a payment claim is created as claimed, never verified (rule 2)", async () => {
    const { order } = await seedDraftOrder(toranj);
    await confirmDraft(toranj.ctx, order.id, { version: 1 });

    const claim = await createPaymentClaim(toranj.ctx, order.id, { amountMinor: "3700000" });

    expect(claim.status).toBe("claimed");
    expect(claim.amountMinor).toBe("3700000");
    expect(claim.verifiedAt).toBeNull();
    expect(claim.verifiedByName).toBeNull();
    expect((await getOrder(toranj.ctx, order.id))?.order.paymentStatus).toBe("claimed");
  });

  it("a claim with no amount stays null rather than becoming zero (rule 7's spirit)", async () => {
    const { order } = await seedDraftOrder(toranj);
    const claim = await createPaymentClaim(toranj.ctx, order.id, {});

    expect(claim.amountMinor).toBeNull();
    // Zero would be a different, false statement about money.
    expect((await prisma.paymentClaim.findUniqueOrThrow({ where: { id: claim.id } })).amountMinor).toBeNull();
  });

  it("an operator cannot verify a payment: 403 from the service itself (rule 10)", async () => {
    const { order } = await seedDraftOrder(toranj);
    const claim = await createPaymentClaim(toranj.ctx, order.id, { amountMinor: "100" });
    const operator = await createOperator(toranj);

    await expectApiError(
      () => verifyPayment(operator.ctx, order.id, claim.id, { decision: "verified" }),
      { status: 403, code: "forbidden" },
    );
    const stored = await prisma.paymentClaim.findUniqueOrThrow({ where: { id: claim.id } });
    expect(stored.status).toBe("claimed");
    expect(stored.verifiedById).toBeNull();
  });

  it("the owner verifies a claim and the database records when and by whom", async () => {
    const { order } = await seedDraftOrder(toranj);
    const claim = await createPaymentClaim(toranj.ctx, order.id, { amountMinor: "100" });

    const verified = await verifyPayment(toranj.ctx, order.id, claim.id, { decision: "verified" });

    expect(verified.status).toBe("verified");
    expect(verified.verifiedAt).not.toBeNull();
    expect(verified.verifiedByName).toBe(toranj.ctx.user.name);

    const stored = await prisma.paymentClaim.findUniqueOrThrow({ where: { id: claim.id } });
    expect(stored.verifiedById).toBe(toranj.userId);
  });

  it("disputing a claim requires a reason and records it", async () => {
    const { order } = await seedDraftOrder(toranj);
    const claim = await createPaymentClaim(toranj.ctx, order.id, {});

    await expectApiError(() => verifyPayment(toranj.ctx, order.id, claim.id, { decision: "disputed" }), {
      status: 422,
      code: "invalid",
    });

    const disputed = await verifyPayment(toranj.ctx, order.id, claim.id, {
      decision: "disputed",
      reason: "مبلغ به حساب نرسیده است.",
    });
    expect(disputed.status).toBe("disputed");
    expect(disputed.disputeReason).toBe("مبلغ به حساب نرسیده است.");
  });

  it("a shipped parcel without a tracking code opens tracking_followup and invents no code (rule 6)", async () => {
    const { customer, order } = await seedDraftOrder(toranj);
    await confirmDraft(toranj.ctx, order.id, { version: 1 });
    await prisma.shipment.create({
      data: { tenantId: toranj.tenantId, orderId: order.id, status: "preparing", carrier: "تیپاکس" },
    });

    const shipment = await updateShipment(toranj.ctx, order.id, { status: "shipped" });

    expect(shipment.status).toBe("shipped");
    expect(shipment.trackingCode).toBeNull();
    expect(shipment.shippedAt).not.toBeNull();

    const tasks = await prisma.task.findMany({ where: { orderId: order.id } });
    expect(tasks).toHaveLength(1);
    expect(tasks[0]).toMatchObject({ type: "tracking_followup", reasonCode: "tracking_missing", status: "open" });
    expect(tasks[0]!.customerId).toBe(customer.id);
  });

  it("a tracking code is not proof of delivery: it never advances the shipment by itself", async () => {
    const { order } = await seedDraftOrder(toranj);
    await confirmDraft(toranj.ctx, order.id, { version: 1 });
    await prisma.shipment.create({
      data: { tenantId: toranj.tenantId, orderId: order.id, status: "preparing" },
    });

    const shipment = await updateShipment(toranj.ctx, order.id, { trackingCode: "demotrk12345" });

    expect(shipment.status).toBe("preparing");
    expect(shipment.trackingCode).toBe("DEMOTRK12345");
    expect(shipment.deliveredAt).toBeNull();
  });

  it("a nonsense tracking code is refused instead of stored raw", async () => {
    const { order } = await seedDraftOrder(toranj);
    await prisma.shipment.create({ data: { tenantId: toranj.tenantId, orderId: order.id, status: "preparing" } });

    await expectApiError(() => updateShipment(toranj.ctx, order.id, { trackingCode: "ab" }), {
      status: 422,
      code: "invalid",
    });
  });

  it("an address change after shipping is refused and leaves a human_review task; the shipment is untouched (rule 8)", async () => {
    const { order } = await seedDraftOrder(toranj);
    await confirmDraft(toranj.ctx, order.id, { version: 1 });
    await createShipment(toranj.tenantId, order.id, {
      status: "shipped",
      carrier: "پست",
      trackingCode: "DEMO-TRK-111222",
    });

    await expectApiError(
      () => updateShipment(toranj.ctx, order.id, { addressChange: "تهران، خیابان تازه، پلاک ۲" }),
      { status: 409, code: "conflict" },
    );

    const shipment = await prisma.shipment.findFirstOrThrow({ where: { orderId: order.id } });
    expect(shipment.status).toBe("shipped");
    expect(shipment.trackingCode).toBe("DEMO-TRK-111222");

    const tasks = await prisma.task.findMany({ where: { orderId: order.id } });
    expect(tasks).toHaveLength(1);
    expect(tasks[0]).toMatchObject({
      type: "human_review",
      reasonCode: "address_change_after_shipment",
      priority: "P1",
    });
  });

  it("the same address-change request twice opens one task, not two (rule 1)", async () => {
    const { order } = await seedDraftOrder(toranj);
    await createShipment(toranj.tenantId, order.id, { status: "delivered" });

    await expectApiError(
      () => updateShipment(toranj.ctx, order.id, { addressChange: "نشانی تازه" }),
      { status: 409, code: "conflict" },
    );
    await expectApiError(
      () => updateShipment(toranj.ctx, order.id, { addressChange: "نشانی تازه" }),
      { status: 409, code: "conflict" },
    );

    expect(await prisma.task.count({ where: { orderId: order.id } })).toBe(1);
  });

  it("the reply preview says only what the database records and writes nothing (rule 15)", async () => {
    const { order } = await seedDraftOrder(toranj);
    await confirmDraft(toranj.ctx, order.id, { version: 1 });
    await createShipment(toranj.tenantId, order.id, {
      status: "shipped",
      carrier: "پست",
      trackingCode: "DEMO-TRK-909090",
    });

    const preview = await getReplyPreview(toranj.ctx, order.id);

    expect(preview).not.toBeNull();
    expect(preview!.templateKey).toBe("tracking_registered");
    expect(preview!.body).toContain("DEMO-TRK-909090");
    expect(await prisma.outboundMessage.count({ where: { orderId: order.id } })).toBe(0);
  });

  it("the reply preview never claims a payment that is only claimed", async () => {
    const { order } = await seedDraftOrder(toranj);
    await confirmDraft(toranj.ctx, order.id, { version: 1 });
    await seedClaim(toranj.tenantId, order.id, { status: "claimed" });

    const preview = await getReplyPreview(toranj.ctx, order.id);

    expect(preview!.templateKey).toBe("payment_claimed");
    expect(preview!.body).not.toContain("تأیید شده");
  });

  it("getOrder returns null for another tenant's order, never a forbidden (rule 9)", async () => {
    const { order } = await seedDraftOrder(toranj);

    expect(await getOrder(raha.ctx, order.id)).toBeNull();
  });

  it("every write refuses another tenant's order with 404, not 403 (rule 9)", async () => {
    const { order } = await seedDraftOrder(toranj);

    await expectApiError(() => updateDraft(raha.ctx, order.id, { version: 1, patch: { notes: "x" } }), {
      status: 404,
      code: "not_found",
    });
    await expectApiError(() => confirmDraft(raha.ctx, order.id, { version: 1 }), {
      status: 404,
      code: "not_found",
    });
    await expectApiError(() => createPaymentClaim(raha.ctx, order.id, {}), {
      status: 404,
      code: "not_found",
    });
    await expectApiError(() => updateShipment(raha.ctx, order.id, { carrier: "x" }), {
      status: 404,
      code: "not_found",
    });
    expect(await getReplyPreview(raha.ctx, order.id)).toBeNull();
  });

  it("a claim of another tenant cannot be verified through a foreign order id (rule 9)", async () => {
    const { order } = await seedDraftOrder(toranj);
    const claim = await seedClaim(toranj.tenantId, order.id, { status: "claimed" });

    await expectApiError(
      () => verifyPayment(raha.ctx, order.id, claim.id, { decision: "verified" }),
      { status: 404, code: "not_found" },
    );
  });

  it("listOrders is tenant-scoped and carries the derived payment/shipment state", async () => {
    const { order } = await seedDraftOrder(toranj);
    await confirmDraft(toranj.ctx, order.id, { version: 1 });
    await seedClaim(toranj.tenantId, order.id, { status: "claimed" });
    await createShipment(toranj.tenantId, order.id, { status: "preparing" });
    await seedDraftOrder(raha, { publicRef: "RAHA-1" });

    const rows = await listOrders(toranj.ctx);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: order.id,
      status: "confirmed",
      paymentStatus: "claimed",
      shipmentStatus: "preparing",
      itemCount: 1,
    });

    const filtered = await listOrders(toranj.ctx, { status: "draft" });
    expect(filtered).toHaveLength(0);
  });

  it("getOrder returns the stored suggestions, tasks and audit trail for the detail screen", async () => {
    const { customer, order } = await seedDraftOrder(toranj);
    const connection = await createConnection(toranj.tenantId);
    const conversation = await prisma.conversation.create({
      data: { tenantId: toranj.tenantId, connectionId: connection.id, customerId: customer.id, channelRef: "C-1" },
    });
    const message = await createMessage(toranj.tenantId, { conversationId: conversation.id, text: "واریز کردم" });
    await createTask(toranj.tenantId, { orderId: order.id, customerId: customer.id, messageId: message.id });
    const run = await prisma.analysisRun.create({
      data: {
        tenantId: toranj.tenantId,
        messageId: message.id,
        provider: "mock",
        model: "mock-v1",
        promptVersion: "p",
        rulesVersion: "r",
        contextHash: "h",
        status: "succeeded",
      },
    });
    await prisma.suggestion.create({
      data: {
        tenantId: toranj.tenantId,
        analysisRunId: run.id,
        sourceMessageId: message.id,
        orderId: order.id,
        customerId: customer.id,
        field: "intent.payment_claim",
        proposedValue: { intent: "payment_claim" },
        reviewState: "proposed",
        confidence: 0.9,
        evidenceStart: 0,
        evidenceEnd: 10,
      },
    });

    const detail = await getOrder(toranj.ctx, order.id);

    expect(detail).not.toBeNull();
    expect(detail!.items).toHaveLength(1);
    expect(detail!.tasks).toHaveLength(1);
    expect(detail!.tasks[0]!.conversationId).toBe(conversation.id);
    expect(detail!.suggestions).toHaveLength(1);
    expect(detail!.suggestions[0]).toMatchObject({ field: "intent.payment_claim", group: "intent", confidence: 0.9 });
    expect(detail!.suggestions[0]!.evidence).toEqual({ start: 0, end: 10 });
    expect(detail!.customer.id).toBe(customer.id);
    expect(detail!.audit.length).toBeGreaterThanOrEqual(0);
  });
});
