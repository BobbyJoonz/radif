/**
 * "What is the one next thing to do here?"
 *
 * A pure function: facts in, one action out. It exists so the workdesk, the case
 * panel and any future surface answer that question the same way, and so the
 * answer can be tested without a database. It never invents a fact: an unknown
 * payment stays unknown, and a rejected proposal is not a fact at all (the caller
 * only passes persisted state).
 *
 * The operator never receives a money decision: a claimed payment becomes
 * "request owner review" for that role, while the owner gets the verification
 * itself. That is capability, not preference.
 */
export type Role = "owner" | "operator";

export type CaseFacts = {
  hasOrder: boolean;
  orderStatus: "draft" | "needs_review" | "confirmed" | "cancelled" | null;
  paymentStatus: "unknown" | "claimed" | "verified" | "disputed" | "refunded" | null;
  shipmentStatus: "not_ready" | "preparing" | "shipped" | "delivered" | "paused" | null;
  hasTracking: boolean;
  addressMissing: boolean;
  trackingRequested: boolean;
  openReasonCodes: readonly string[];
};

export type ActionKey =
  | "associate_order"
  | "review_draft"
  | "complete_address"
  | "request_owner_review"
  | "verify_payment"
  | "record_tracking"
  | "prepare_shipment"
  | "prepare_reply";

export type NextAction = {
  action: ActionKey;
  /** Why this and not something else — shown to the seller, not logged as truth. */
  blocker: string;
  /** Roles that may perform it; the services still re-check this themselves. */
  allowed: readonly Role[];
  /** Everything else that is open in the same case, so one action never hides three. */
  remaining: readonly string[];
};

const PAYMENT_DECISION: readonly Role[] = ["owner"];

export function nextAction(facts: CaseFacts, role: Role): NextAction {
  const remaining = [...facts.openReasonCodes];
  const pick = (action: ActionKey, blocker: string, allowed: readonly Role[]): NextAction => ({
    action,
    blocker,
    allowed,
    remaining,
  });

  // 1. A message that cannot be tied to an order is not a case yet.
  if (!facts.hasOrder) return pick("associate_order", "no_order_associated", ["owner", "operator"]);

  // 2. A draft is paperwork: it cannot ship and cannot be paid.
  if (facts.orderStatus === "draft" || facts.orderStatus === "needs_review") {
    return pick("review_draft", "draft_incomplete", ["owner", "operator"]);
  }

  // 3. An address the customer changed but never stated blocks everything physical.
  if (facts.addressMissing) return pick("complete_address", "address_missing", ["owner", "operator"]);

  // 4. Money: a claim is not a payment, and only an owner may decide.
  if (facts.paymentStatus === "claimed" || facts.paymentStatus === "disputed") {
    if (role === "owner") return pick("verify_payment", "payment_claimed_unverified", PAYMENT_DECISION);
    return pick("request_owner_review", "payment_needs_owner", ["operator"]);
  }

  // 5. A parcel that left without a tracking code cannot be answered truthfully.
  if (facts.shipmentStatus === "shipped" && !facts.hasTracking) {
    return pick("record_tracking", "tracking_missing", ["owner", "operator"]);
  }
  if (facts.trackingRequested && !facts.hasTracking) {
    return pick("record_tracking", "tracking_requested", ["owner", "operator"]);
  }

  // 6. Confirmed, paid or free, address known: the physical work is next.
  if (facts.shipmentStatus === "not_ready" || facts.shipmentStatus === "preparing") {
    return pick("prepare_shipment", "ready_to_prepare", ["owner", "operator"]);
  }

  // 7. Nothing blocks the reply; the reply itself is built from persisted state.
  return pick("prepare_reply", "no_blocker", ["owner", "operator"]);
}

/** The actions this role may actually perform for the same case. */
export function allowedActions(facts: CaseFacts, role: Role): ActionKey[] {
  const actions: ActionKey[] = ["prepare_reply"];
  if (!facts.hasOrder) return ["associate_order", "prepare_reply"];
  if (facts.orderStatus === "draft" || facts.orderStatus === "needs_review") actions.unshift("review_draft");
  if (facts.addressMissing) actions.unshift("complete_address");
  if (facts.paymentStatus === "claimed" || facts.paymentStatus === "disputed") {
    actions.unshift(role === "owner" ? "verify_payment" : "request_owner_review");
  }
  if (!facts.hasTracking && (facts.shipmentStatus === "shipped" || facts.trackingRequested)) {
    actions.unshift("record_tracking");
  }
  if (facts.shipmentStatus === "not_ready" || facts.shipmentStatus === "preparing") {
    actions.unshift("prepare_shipment");
  }
  return [...new Set(actions)];
}
