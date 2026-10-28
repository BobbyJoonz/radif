import type {
  IntentKey,
  OrderStatusValue,
  PaymentStatusValue,
  PriorityValue,
  ShipmentStatusValue,
} from "@/lib/dto";

/**
 * Priority is computed by code, never read from the tone of a message.
 *
 * The brief (§8) is explicit: a deadline in the past, a payment that does not
 * reconcile, a pending address change or an ambiguous order association are
 * facts the server can evaluate; a customer being angry is not. `P0` is reserved
 * for a human owner escalating a task by hand, so this function never returns it.
 *
 * Every result carries a machine `reasonCode` (persisted on the Task) and a short
 * Persian `reasonText` (what the seller reads). The pair is what makes an
 * unexpected P1 explainable instead of magic.
 */

export type UrgencySignals = {
  taskType: string;
  intents: readonly IntentKey[];
  orderStatus: OrderStatusValue | null;
  paymentStatus: PaymentStatusValue | null;
  shipmentStatus: ShipmentStatusValue | null;
  hasOpenOrder: boolean;
  /** First-reply or ship deadline already passed. */
  slaBreached: boolean;
  /** The claimed amount does not match the order total. */
  paymentMismatch: boolean;
  /** A payment claim exists and no human has verified it. */
  paymentClaimUnverified: boolean;
  /** An amount was said without a unit — it cannot be reconciled yet. */
  amountUnitMissing: boolean;
  addressChangeRequested: boolean;
  /** The parcel is already shipped/delivered and the customer wants a new address. */
  addressChangeAfterShipment: boolean;
  /** The message could belong to more than one open order. */
  ambiguousAssociation: boolean;
  trackingRequested: boolean;
  trackingCodePresent: boolean;
};

export type PriorityResult = {
  priority: PriorityValue;
  reasonCode: string;
  reasonText: string;
  /** True when a human must pick the interpretation before anything is final. */
  needsReview: boolean;
};

/** Persian reason sentences, in the seller's voice (DIRECTION §4 "Voice"). */
export const REASON_TEXT: Record<string, string> = {
  sla_breach: "مهلت پاسخ یا ارسال گذشته است.",
  payment_mismatch: "مبلغ اعلام‌شده با مبلغ سفارش نمی‌خواند.",
  payment_claim_unverified: "مشتری می‌گوید واریز کرده؛ هنوز تأیید نشده است.",
  amount_without_unit: "مبلغ گفته شده واحد ندارد؛ باید روشن شود.",
  address_change: "آدرس پیش از ارسال عوض شده و آدرس تازه نیامده است.",
  address_change_after_shipment: "آدرس بعد از ارسال عوض شده؛ مرسوله را دستی بررسی کنید.",
  ambiguous_order_association: "چند سفارش باز است؛ درخواست به کدام سفارش مربوط است؟",
  tracking_missing: "درخواست کد رهگیری رسیده؛ کدی ثبت نشده است.",
  tracking_present: "کد رهگیری ثبت شده است.",
  repeat_order_no_open_order: "درخواست خرید مجدد؛ سفارش بازی وجود ندارد.",
  product_question: "پرسش محصول بی‌پاسخ مانده است.",
  complaint: "شکایت مشتری بی‌پاسخ مانده است.",
  cancellation_request: "مشتری درخواست لغو داده است.",
  refund_request: "درخواست بازگشت وجه نیاز به بررسی انسانی دارد.",
  analysis_failed: "تحلیل انجام نشد؛ بررسی دستی لازم است.",
  new_order_draft: "سفارش تازه‌ای مطرح شده و پیش‌نویس ندارد.",
  order_open_work: "کار عادی سفارش باز.",
  general_question: "پرسش عمومی؛ سفارش بازی ندارد.",
  unknown_message: "پیام روشن نیست؛ بررسی انسانی لازم است.",
};

export function reasonText(code: string): string {
  return REASON_TEXT[code] ?? "این کار نیاز به بررسی دارد.";
}

/**
 * The precedence is intentional and stable:
 *  1. ambiguity and post-shipment address changes — human first, because acting
 *     on a guess ships the wrong parcel;
 *  2. money that does not reconcile (mismatch, missing unit, unverified claim on
 *     a confirmed order);
 *  3. a passed deadline;
 *  4. normal open-order work;
 *  5. questions with nothing open behind them.
 */
export function computePriority(signals: UrgencySignals): PriorityResult {
  const {
    orderStatus,
    paymentStatus,
    shipmentStatus,
    hasOpenOrder,
    slaBreached,
    paymentMismatch,
    paymentClaimUnverified,
    amountUnitMissing,
    addressChangeRequested,
    addressChangeAfterShipment,
    ambiguousAssociation,
    trackingRequested,
    trackingCodePresent,
  } = signals;

  const openOrder = hasOpenOrder || orderStatus === "confirmed" || orderStatus === "draft" || orderStatus === "needs_review";

  if (ambiguousAssociation) {
    return p("P1", "ambiguous_order_association", true);
  }
  if (addressChangeAfterShipment) {
    return p("P1", "address_change_after_shipment", true);
  }
  if (paymentMismatch) {
    return p("P1", "payment_mismatch", true);
  }
  if (amountUnitMissing) {
    return p("P1", "amount_without_unit", true);
  }
  if (addressChangeRequested) {
    return p("P1", "address_change", true);
  }
  if (signals.intents.includes("refund_or_return")) {
    return p("P1", "refund_request", true);
  }
  if (slaBreached) {
    return p("P1", "sla_breach", false);
  }
  if (
    paymentClaimUnverified &&
    paymentStatus !== "verified" &&
    orderStatus === "confirmed" &&
    shipmentStatus !== "delivered"
  ) {
    return p("P1", "payment_claim_unverified", true);
  }
  if (trackingRequested && !trackingCodePresent) {
    return p(openOrder ? "P2" : "P2", "tracking_missing", false);
  }
  if (paymentClaimUnverified) {
    return p("P2", "payment_claim_unverified", true);
  }
  if (signals.intents.includes("complaint")) {
    return p("P2", "complaint", false);
  }
  if (signals.intents.includes("cancellation")) {
    return p("P2", "cancellation_request", false);
  }
  if (signals.intents.includes("repeat_order")) {
    return p("P2", "repeat_order_no_open_order", false);
  }
  if (signals.intents.includes("new_order")) {
    return p(openOrder ? "P2" : "P2", "new_order_draft", false);
  }
  if (signals.intents.includes("product_question")) {
    return p(openOrder ? "P2" : "P3", "product_question", false);
  }
  if (openOrder) {
    return p("P2", "order_open_work", false);
  }
  if (signals.taskType === "tracking_followup") {
    return p("P2", "tracking_missing", false);
  }
  if (signals.taskType === "human_review") {
    return p("P2", "unknown_message", true);
  }
  return p("P3", "general_question", false);
}

function p(priority: PriorityValue, reasonCode: string, needsReview: boolean): PriorityResult {
  return { priority, reasonCode, reasonText: reasonText(reasonCode), needsReview };
}

/**
 * A deadline, in the tenant's terms: the first-reply SLA for a conversation, the
 * ship SLA for a confirmed order. Null when neither applies — a task with no
 * deadline sorts last on Today, which is correct.
 */
export function computeDueAt(input: {
  now: Date;
  firstUnansweredAt: Date | null;
  slaFirstReplyMin: number;
  confirmedAt: Date | null;
  slaShipMin: number;
  reasonCode: string;
}): Date | null {
  if (input.confirmedAt && (input.reasonCode === "sla_breach" || input.reasonCode === "payment_mismatch")) {
    return new Date(input.confirmedAt.getTime() + input.slaShipMin * 60_000);
  }
  if (input.firstUnansweredAt) {
    return new Date(input.firstUnansweredAt.getTime() + input.slaFirstReplyMin * 60_000);
  }
  if (input.confirmedAt) {
    return new Date(input.confirmedAt.getTime() + input.slaShipMin * 60_000);
  }
  return null;
}
