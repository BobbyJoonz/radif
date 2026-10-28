import type {
  OrderStatusValue,
  PaymentStatusValue,
  ShipmentStatusValue,
  TaskStatusValue,
} from "@/lib/dto";

/**
 * The three state machines (order / payment / shipment) and their guards.
 *
 * They are separate on purpose: `confirmed` describes the order's paperwork,
 * `claimed` describes what the customer said, `preparing` describes the parcel.
 * A single status column would let "confirm the draft" silently imply "payment
 * verified", which is the exact mistake the brief asks us to prevent.
 *
 * Transitions live here, in pure code, so a route handler cannot bypass them and
 * a test can enumerate every legal edge.
 */

export class StateTransitionError extends Error {
  readonly code = "invalid_transition";
  constructor(
    readonly machine: "order" | "payment" | "shipment" | "task",
    readonly from: string,
    readonly to: string,
    readonly messageFa: string,
  ) {
    super(messageFa);
    this.name = "StateTransitionError";
  }
}

export const ORDER_TRANSITIONS: Record<OrderStatusValue, readonly OrderStatusValue[]> = {
  // A draft can be finalised directly (that is what the "تأیید پیش‌نویس" button
  // does) or sent to review first when something about it is uncertain.
  draft: ["needs_review", "confirmed", "cancelled"],
  needs_review: ["draft", "confirmed", "cancelled"],
  // Cancelling a confirmed order is legal until the parcel leaves the building.
  confirmed: ["cancelled"],
  cancelled: [],
};

export const PAYMENT_TRANSITIONS: Record<PaymentStatusValue, readonly PaymentStatusValue[]> = {
  unknown: ["claimed"],
  claimed: ["verified", "disputed"],
  disputed: ["verified", "refunded"],
  verified: ["refunded"],
  refunded: [],
};

export const SHIPMENT_TRANSITIONS: Record<ShipmentStatusValue, readonly ShipmentStatusValue[]> = {
  not_ready: ["preparing", "paused"],
  preparing: ["shipped", "paused"],
  paused: ["not_ready", "preparing"],
  shipped: ["delivered"],
  delivered: [],
};

export const TASK_TRANSITIONS: Record<TaskStatusValue, readonly TaskStatusValue[]> = {
  open: ["in_progress", "waiting_customer", "done"],
  in_progress: ["open", "waiting_customer", "done"],
  waiting_customer: ["open", "in_progress", "done"],
  done: [],
};

export function canTransitionOrder(from: OrderStatusValue, to: OrderStatusValue): boolean {
  return ORDER_TRANSITIONS[from].includes(to);
}

export function canTransitionPayment(from: PaymentStatusValue, to: PaymentStatusValue): boolean {
  return PAYMENT_TRANSITIONS[from].includes(to);
}

export function canTransitionShipment(from: ShipmentStatusValue, to: ShipmentStatusValue): boolean {
  return SHIPMENT_TRANSITIONS[from].includes(to);
}

export function canTransitionTask(from: TaskStatusValue, to: TaskStatusValue): boolean {
  return TASK_TRANSITIONS[from].includes(to);
}

export function assertOrderTransition(from: OrderStatusValue, to: OrderStatusValue): void {
  if (!canTransitionOrder(from, to)) {
    throw new StateTransitionError(
      "order",
      from,
      to,
      `وضعیت سفارش از «${from}» به «${to}» ممکن نیست.`,
    );
  }
}

export function assertPaymentTransition(from: PaymentStatusValue, to: PaymentStatusValue): void {
  if (!canTransitionPayment(from, to)) {
    throw new StateTransitionError("payment", from, to, `وضعیت پرداخت از «${from}» به «${to}» ممکن نیست.`);
  }
}

export function assertShipmentTransition(from: ShipmentStatusValue, to: ShipmentStatusValue): void {
  if (!canTransitionShipment(from, to)) {
    throw new StateTransitionError("shipment", from, to, `وضعیت ارسال از «${from}» به «${to}» ممکن نیست.`);
  }
}

export function assertTaskTransition(from: TaskStatusValue, to: TaskStatusValue): void {
  if (!canTransitionTask(from, to)) {
    throw new StateTransitionError("task", from, to, `وضعیت کار از «${from}» به «${to}» ممکن نیست.`);
  }
}

/**
 * Only an unconfirmed order may have its items or notes edited. Editing a
 * confirmed order in place would break the optimistic-lock contract the UI shows
 * ("این سفارش جای دیگری تغییر کرده"): the human would be editing a record whose
 * version other screens already used.
 */
export function isOrderEditable(status: OrderStatusValue): boolean {
  return status === "draft" || status === "needs_review";
}

/**
 * A shipment may only be marked `shipped` when the order is actually confirmed —
 * otherwise a stray click on a draft order would claim a parcel exists.
 */
export function canShipOrder(orderStatus: OrderStatusValue, shipmentStatus: ShipmentStatusValue): boolean {
  if (orderStatus !== "confirmed") return false;
  return canTransitionShipment(shipmentStatus, "shipped");
}

/** Only an owner verifies money. Operators do the queue, not the ledger. */
export function canVerifyPayments(role: "owner" | "operator"): boolean {
  return role === "owner";
}

/**
 * The machine-independent rule for "can this claim be verified at all": only a
 * `claimed` or `disputed` claim, and only with a named human and a timestamp.
 * The database enforces the same thing as a CHECK constraint.
 */
export function isPaymentClaimVerifiable(status: PaymentStatusValue): boolean {
  return status === "claimed" || status === "disputed";
}

/** A tracking code is data, never something we make up. Blank is not a code. */
export function normaliseTrackingCode(input: string): string | null {
  const cleaned = input.replace(/[۰-۹٠-٩]/g, (d) => {
    const code = d.charCodeAt(0);
    return code >= 0x06f0 ? String(code - 0x06f0) : String(code - 0x0660);
  })
    .replace(/\s+/g, "")
    .trim();
  if (cleaned.length < 4) return null;
  return /^[A-Za-z0-9-]+$/.test(cleaned) ? cleaned.toUpperCase() : null;
}
