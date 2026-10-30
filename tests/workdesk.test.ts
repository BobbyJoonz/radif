import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { allowedActions, nextAction, type CaseFacts } from "@/server/domain/next-action";
import { claimTask, getWorkdesk } from "@/server/services/workdesk";
import { resetDatabase } from "./helpers/db";
import { createCustomer, createOperator, createOrder, createTenant, expectApiError, type TestTenant } from "./helpers/fixtures";

const base: CaseFacts = {
  hasOrder: true,
  orderStatus: "confirmed",
  paymentStatus: "verified",
  shipmentStatus: "not_ready",
  hasTracking: false,
  addressMissing: false,
  trackingRequested: false,
  openReasonCodes: [],
};

describe("next action (pure)", () => {
  it("asks for the order when a message cannot be tied to one", () => {
    const next = nextAction({ ...base, hasOrder: false }, "operator");
    expect(next.action).toBe("associate_order");
    expect(next.blocker).toBe("no_order_associated");
  });

  it("treats an incomplete draft as paperwork, not shipping", () => {
    expect(nextAction({ ...base, orderStatus: "draft" }, "owner").action).toBe("review_draft");
    expect(nextAction({ ...base, orderStatus: "needs_review" }, "operator").action).toBe("review_draft");
  });

  it("never hands a money decision to an operator", () => {
    const claimed = { ...base, paymentStatus: "claimed" as const };
    expect(nextAction(claimed, "owner").action).toBe("verify_payment");
    const operator = nextAction(claimed, "operator");
    expect(operator.action).toBe("request_owner_review");
    expect(operator.blocker).toBe("payment_needs_owner");
  });

  it("puts the address before the parcel", () => {
    const next = nextAction({ ...base, addressMissing: true, paymentStatus: "claimed" }, "owner");
    expect(next.action).toBe("complete_address");
  });

  it("refuses to answer 'shipped' without a tracking code", () => {
    const next = nextAction({ ...base, shipmentStatus: "shipped" }, "operator");
    expect(next.action).toBe("record_tracking");
  });

  it("offers shipment preparation only once the facts allow it", () => {
    expect(nextAction(base, "operator").action).toBe("prepare_shipment");
    const verified = { ...base, shipmentStatus: "delivered" as const };
    expect(nextAction(verified, "operator").action).toBe("prepare_reply");
  });

  it("keeps every allowed action while ordering the primary one", () => {
    const facts: CaseFacts = { ...base, paymentStatus: "claimed", addressMissing: true, trackingRequested: true };
    const actions = allowedActions(facts, "owner");
    expect(actions).toContain("complete_address");
    expect(actions).toContain("verify_payment");
    expect(actions).toContain("record_tracking");
    expect(actions).toContain("prepare_reply");
  });
});

describe("workdesk (real database)", () => {
  let toranj: TestTenant;

  beforeEach(async () => {
    await resetDatabase();
    toranj = await createTenant({ idPrefix: "tenant_toranj" });
  });

  async function task(input: { orderId?: string | null; messageId?: string | null; reasonCode: string; assigneeId?: string | null }) {
    return prisma.task.create({
      data: {
        tenantId: toranj.tenantId,
        type: "customer_reply",
        title: input.reasonCode,
        reasonCode: input.reasonCode,
        reasonText: input.reasonCode,
        orderId: input.orderId ?? null,
        messageId: input.messageId ?? null,
        assigneeId: input.assigneeId ?? null,
        dueAt: new Date(Date.now() + 3_600_000),
      },
    });
  }

  it("groups tasks of one order into a single case", async () => {
    const customer = await createCustomer(toranj.tenantId, { displayName: "نگار" });
    const order = await createOrder(toranj.tenantId, customer.id, { status: "confirmed", items: [{ title: "شال", qty: 1, unitPriceMinor: 18_500_000n }] });
    await task({ orderId: order.id, reasonCode: "tracking_missing" });
    await task({ orderId: order.id, reasonCode: "address_change" });

    const cases = await getWorkdesk(toranj.ctx, "all");
    expect(cases).toHaveLength(1);
    expect(cases[0].orderId).toBe(order.id);
    expect(cases[0].openCount).toBe(2);
    expect(cases[0].blockers).toEqual(expect.arrayContaining(["tracking_missing", "address_change"]));
    // address is the blocker in front, so it is the primary action
    expect(cases[0].primaryAction).toBe("complete_address");
  });

  it("filters 'my work' on the server, by assignee", async () => {
    const operator = await createOperator(toranj);
    await task({ reasonCode: "customer_reply", assigneeId: operator.userId });
    await task({ reasonCode: "tracking_missing", assigneeId: null });

    const mine = await getWorkdesk(operator.ctx, "mine");
    expect(mine).toHaveLength(1);
    expect(mine[0].assigneeId).toBe(operator.userId);

    const unassigned = await getWorkdesk(operator.ctx, "unassigned");
    expect(unassigned).toHaveLength(1);
    expect(unassigned[0].assigneeId).toBeNull();
  });

  it("lets exactly one worker claim an unassigned task", async () => {
    const operator = await createOperator(toranj);
    const row = await task({ reasonCode: "customer_reply", assigneeId: null });

    await claimTask(toranj.ctx, row.id);
    await expectApiError(() => claimTask(operator.ctx, row.id), { status: 409, code: "conflict" });

    const stored = await prisma.task.findUnique({ where: { id: row.id }, select: { assigneeId: true } });
    expect(stored?.assigneeId).toBe(toranj.userId);
  });
});
