import type { IntentKey, PriorityValue, ReviewStateValue } from "@/lib/dto";
import type { TaskType } from "@/generated/prisma/enums";
import type { Candidate } from "@/server/domain/spans";
import type { IntentScan } from "@/server/domain/intents";
import type { UrgencySignals } from "@/server/domain/priority";
import { computeDueAt, computePriority } from "@/server/domain/priority";
import { taskDedupeKey, type TaskScope } from "@/server/domain/dedupe";
import { evidenceFor } from "@/server/domain/intents";
import { parseAmount } from "@/server/domain/money";
import type { DecisionOutput } from "@/server/providers/types";
import type { InjectionSignal } from "./injection";

/**
 * Rules → work, as a pure function (no Prisma, no clock of its own).
 *
 * The provider only *classifies* and *chooses among candidates*. Everything that
 * becomes a row — which suggestion, which task, which priority, what the seller
 * reads — is decided here, by our own rules (brief §7 step 4, §8).
 *
 * The two guarantees this file is written for:
 *   • **nothing is invented**: every suggested value either comes from a span of
 *     the customer's own text (a `Candidate` id the provider may only choose) or
 *     is explicitly `null` — "the message did not say it";
 *   • **nothing is duplicated**: tasks are keyed by the *thing being worked on*
 *     (order, else conversation) plus their type, so a replayed message refreshes
 *     the existing task set instead of cloning it (CONTRACTS §6 rules 1, 13).
 */

/** The order facts planning may use. Read by the caller, never guessed here. */
export type PlanOrder = {
  id: string;
  publicRef: string;
  status: "draft" | "needs_review" | "confirmed" | "cancelled";
  confirmedAt: Date | null;
  paymentStatus: "unknown" | "claimed" | "verified" | "disputed" | "refunded";
  shipmentStatus: "not_ready" | "preparing" | "shipped" | "delivered" | "paused";
  trackingCode: string | null;
  totalMinor: bigint;
  currency: string;
  itemCount: number;
};

export type SuggestionPlan = {
  field: string;
  proposedValue: { intent: string } | { value: string | number | null };
  candidateId: string | null;
  evidence: { start: number; end: number } | null;
  confidence: number | null;
  reviewState: ReviewStateValue;
  orderId: string | null;
  customerId: string | null;
};

export type TaskPlan = {
  type: TaskType;
  dedupeKey: string;
  title: string;
  detail: string | null;
  reasonCode: string;
  reasonText: string;
  priority: PriorityValue;
  dueAt: Date | null;
  orderId: string | null;
  customerId: string | null;
};

export type PlanInput = {
  now: Date;
  message: { id: string; conversationId: string };
  customer: { id: string; displayName: string };
  scan: IntentScan;
  candidates: Candidate[];
  output: DecisionOutput;
  openOrders: PlanOrder[];
  /** The one order the message is about, or null when that is undecided. */
  order: PlanOrder | null;
  /** More than one open order and an order-specific intent: a human decides. */
  ambiguousAssociation: boolean;
  firstUnansweredAt: Date | null;
  slaFirstReplyMin: number;
  slaShipMin: number;
  injection: InjectionSignal | null;
};

export type PlanResult = {
  suggestions: SuggestionPlan[];
  tasks: TaskPlan[];
  intents: IntentKey[];
  primary: IntentKey;
};

/** Intents that are about *an order*, so an ambiguous link matters. */
const ORDER_SPECIFIC: readonly IntentKey[] = [
  "payment_claim",
  "tracking_request",
  "address_change",
  "order_status",
  "complaint",
  "cancellation",
  "refund_or_return",
];

export function planAnalysis(input: PlanInput): PlanResult {
  const { output, scan } = input;
  const primary = output.primary;

  // Every intent anyone is sure about: the provider's, plus the ones the rule
  // detector found in the text. A message with three intents keeps all three
  // (CONTRACTS §6 rule 4) — dropping one is how an order gets lost.
  const intents = uniqueIntents([
    primary,
    ...scan.hits.map((hit) => hit.intent),
    ...output.flags.filter((flag) => flag.value).map((flag) => flag.intent),
  ]);

  const suggestions = planSuggestions(input, primary, intents);
  const tasks = planTasks(input, intents);

  return { suggestions, tasks, intents, primary };
}

// ───────────────────────────── suggestions ─────────────────────────────

function planSuggestions(input: PlanInput, primary: IntentKey, intents: IntentKey[]): SuggestionPlan[] {
  const { output, scan, candidates, order, customer, injection } = input;
  const suggestions: SuggestionPlan[] = [];
  const scope = { orderId: order?.id ?? null, customerId: customer.id };

  const add = (
    field: string,
    proposedValue: SuggestionPlan["proposedValue"],
    extra: Partial<Pick<SuggestionPlan, "candidateId" | "evidence" | "confidence">> = {},
  ): void => {
    suggestions.push({
      field,
      proposedValue,
      candidateId: extra.candidateId ?? null,
      evidence: extra.evidence ?? null,
      confidence: extra.confidence ?? null,
      reviewState: "proposed",
      ...scope,
    });
  };

  // 1. The primary intent. Evidence only when the words are really in the text.
  add("intent.primary", { intent: primary }, {
    evidence: evidenceFor(scan, primary),
    confidence: output.probability,
  });

  // 2. Every other intent, with its own span, so none is silently dropped.
  for (const intent of intents) {
    if (intent === primary) continue;
    const flag = output.flags.find((candidate) => candidate.intent === intent && candidate.value);
    add(`intent.flag.${intent}`, { intent }, {
      evidence: evidenceFor(scan, intent),
      confidence: flag?.probability ?? null,
    });
  }

  // 3. The amount the provider chose — from a candidate code found, never from
  //    the model's memory. No unit in the message → `value: null` (rule 7).
  const amountCandidate = findCandidate(candidates, output.amount?.candidateId);
  if (amountCandidate) {
    const parsed = parseAmount(amountCandidate.raw);
    add("order.amount", { value: parsed.amountMinor === null ? null : parsed.amountMinor.toString() }, {
      candidateId: amountCandidate.id,
      evidence: { start: amountCandidate.start, end: amountCandidate.end },
    });
  }

  // 4. A phone number the provider chose, normalised by our own code.
  const phoneCandidate = findCandidate(candidates, output.phone?.candidateId);
  if (phoneCandidate) {
    add("order.phone", { value: phoneCandidate.value }, {
      candidateId: phoneCandidate.id,
      evidence: { start: phoneCandidate.start, end: phoneCandidate.end },
    });
  }

  // 5. Which order this is about. The public ref is the seller's word for it; the
  //    digits found in the text stay as the candidate + evidence.
  const refCandidate = findCandidate(candidates, output.orderRef?.candidateId);
  if (order) {
    add("order.ref", { value: order.publicRef }, {
      candidateId: refCandidate?.id ?? null,
      evidence: refCandidate ? { start: refCandidate.start, end: refCandidate.end } : null,
    });
  } else if (refCandidate) {
    add("order.ref", { value: refCandidate.value }, {
      candidateId: refCandidate.id,
      evidence: { start: refCandidate.start, end: refCandidate.end },
    });
  }

  // 6. The address. `null` is the honest answer when the customer said the
  //    address changed and never wrote the new one (the demo's empty field).
  const addressChanged = intents.includes("address_change");
  if (output.address) {
    add("order.address", { value: output.address.stated ? output.address.value : null }, {
      evidence: output.address.stated ? locateInText(scan.normalizedText, output.address.value) : null,
    });
  } else if (addressChanged) {
    add("order.address", { value: null });
  }

  // 7. A tracking code that is already stored — offered, never invented.
  if (intents.includes("tracking_request") && order?.trackingCode) {
    add("order.tracking", { value: order.trackingCode });
  }

  // 8. Prompt injection is data. It becomes a *risk* suggestion for a human, and
  //    nothing else: no state, permission or amount changes because of text.
  if (injection) {
    add("risk.untrusted_instruction", { value: null }, { evidence: injection.span });
  }

  return suggestions;
}

function findCandidate(candidates: readonly Candidate[], id: string | null | undefined): Candidate | null {
  if (!id) return null;
  return candidates.find((candidate) => candidate.id === id) ?? null;
}

/** Where in the original text a value the provider returned actually appears. */
function locateInText(
  normalizedText: string,
  value: string | null,
): { start: number; end: number } | null {
  if (!value || value.trim().length === 0) return null;
  const index = normalizedText.indexOf(value.trim());
  if (index < 0) return null;
  return { start: index, end: index + value.trim().length };
}

// ───────────────────────────── tasks ─────────────────────────────

function planTasks(input: PlanInput, intents: IntentKey[]): TaskPlan[] {
  const { order, customer, openOrders, ambiguousAssociation, injection } = input;
  const name = customer.displayName;
  const ref = order?.publicRef ?? null;
  const has = (intent: IntentKey) => intents.includes(intent);

  // One signal bundle, computed once: priority is a function of *facts*, and the
  // facts do not change between two tasks of the same analysis.
  const signals: UrgencySignals = {
    taskType: "customer_reply",
    intents,
    orderStatus: order?.status ?? null,
    paymentStatus: order?.paymentStatus ?? null,
    shipmentStatus: order?.shipmentStatus ?? null,
    hasOpenOrder: openOrders.length > 0,
    slaBreached: slaBreached(input),
    paymentMismatch: paymentMismatch(input),
    paymentClaimUnverified:
      has("payment_claim") && order !== null && order.paymentStatus !== "verified",
    amountUnitMissing: amountUnitMissing(input),
    addressChangeRequested: has("address_change"),
    addressChangeAfterShipment:
      has("address_change") && (order?.shipmentStatus === "shipped" || order?.shipmentStatus === "delivered"),
    ambiguousAssociation,
    trackingRequested: has("tracking_request"),
    trackingCodePresent: Boolean(order?.trackingCode),
  };

  const plans: TaskPlan[] = [];
  const push = (task: {
    type: TaskType;
    scope: TaskScope;
    title: string;
    detail: string | null;
  }): void => {
    if (plans.some((plan) => plan.dedupeKey === taskDedupeKey(task.type, task.scope))) return;
    plans.push(buildTask({ ...task, signals, input }));
  };

  const conversationScope: TaskScope = { conversationId: input.message.conversationId };
  const orderScope: TaskScope = order ? { orderId: order.id } : conversationScope;

  // Ambiguity first: acting on a guess ships the wrong parcel (rule 5).
  if (ambiguousAssociation && intents.some((intent) => ORDER_SPECIFIC.includes(intent))) {
    push({
      type: "human_review",
      scope: { ...conversationScope, discriminator: "ambiguous_order_association" },
      title: `انتخاب سفارش برای پیام ${name}`,
      detail: `${openOrders.length} سفارش باز است؛ پیام به هیچ‌کدام به‌طور قطعی وصل نشد.`,
    });
  }

  // A message that tries to give the system orders is a human's problem, not a
  // change of state (rule 11).
  if (injection) {
    push({
      type: "human_review",
      scope: { ...conversationScope, discriminator: "untrusted_instruction" },
      title: `پیام مشکوک — ${name}`,
      detail: "متن پیام دستور سیستمی نیست؛ هیچ وضعیت، دسترسی یا مبلغی تغییر نکرد.",
    });
  }

  if (has("payment_claim")) {
    if (!order) {
      push({
        type: "human_review",
        scope: { ...conversationScope, discriminator: "payment_claim_no_order" },
        title: `اعلام پرداخت بدون سفارش — ${name}`,
        detail: "مشتری اعلام واریز کرده و سفارش بازی برای تطبیق وجود ندارد.",
      });
    } else {
      push({
        type: "payment_reconcile",
        scope: { orderId: order.id },
        title: `تطبیق پرداخت سفارش ${ref}`,
        detail: "مشتری اعلام پرداخت کرده؛ پرداخت تا تأیید مالک «بررسی‌نشده» می‌ماند.",
      });
    }
  }

  if (has("tracking_request")) {
    if (!order?.trackingCode) {
      push({
        type: "tracking_followup",
        scope: orderScope,
        title: order ? `ثبت کد رهگیری سفارش ${ref}` : `پیگیری کد رهگیری — ${name}`,
        detail: "کد رهگیری ثبت نشده؛ کد از خودمان ساخته نمی‌شود.",
      });
    } else {
      push({
        type: "customer_reply",
        scope: conversationScope,
        title: `پاسخ به ${name}`,
        detail: `کد رهگیری ثبت‌شده: ${order.trackingCode}`,
      });
    }
  }

  if (has("address_change")) {
    if (signals.addressChangeAfterShipment) {
      push({
        type: "human_review",
        scope: { ...conversationScope, discriminator: "address_change_after_shipment" },
        title: `تغییر آدرس بعد از ارسال — ${name}`,
        detail: "مرسوله ارسال شده؛ آدرس تغییر نمی‌کند و باید دستی بررسی شود.",
      });
    } else {
      push({
        type: "address_complete",
        scope: orderScope,
        title: order ? `تکمیل آدرس سفارش ${ref}` : `دریافت نشانی تازه — ${name}`,
        detail: "مشتری گفته آدرس عوض شده و نشانی تازه را نفرستاده است.",
      });
    }
  }

  if (has("refund_or_return")) {
    push({
      type: "refund_review",
      scope: { ...conversationScope, discriminator: "refund_request" },
      title: `بررسی بازگشت وجه — ${name}`,
      detail: "بازگشت وجه تصمیم انسانی است؛ هیچ مبلغی خودکار ثبت نمی‌شود.",
    });
  }

  if (has("cancellation")) {
    push({
      type: "human_review",
      scope: { ...conversationScope, discriminator: "cancellation_request" },
      title: `درخواست لغو — ${name}`,
      detail: "لغو سفارش و بازپرداخت خودکار انجام نمی‌شود؛ بررسی انسانی لازم است.",
    });
  }

  if (has("new_order") || has("repeat_order")) {
    push({
      type: "draft_review",
      scope: order ? { orderId: order.id } : { ...conversationScope, discriminator: "draft" },
      title: order ? `بررسی پیش‌نویس سفارش ${ref}` : `ساخت پیش‌نویس سفارش — ${name}`,
      detail: "پیام درخواست خرید دارد؛ پیش‌نویس باید پیش از تأیید دیده شود.",
    });
  }

  if (has("complaint") || has("product_question") || has("order_status")) {
    push({
      type: "customer_reply",
      scope: conversationScope,
      title: `پاسخ به ${name}`,
      detail: null,
    });
  }

  if (has("other_unknown") && plans.length === 0) {
    push({
      type: "human_review",
      scope: { ...conversationScope, discriminator: "unknown_message" },
      title: `بررسی پیام نامشخص — ${name}`,
      detail: "پیام روشن نیست؛ تفسیر آن به انسان سپرده شد.",
    });
  }

  return plans.slice(0, 6);
}

function buildTask(task: {
  type: TaskType;
  scope: TaskScope;
  title: string;
  detail: string | null;
  signals: UrgencySignals;
  input: PlanInput;
}): TaskPlan {
  const { signals, input } = task;
  const result = computePriority({ ...signals, taskType: task.type as string });
  const dueAt = computeDueAt({
    now: input.now,
    firstUnansweredAt: input.firstUnansweredAt,
    slaFirstReplyMin: input.slaFirstReplyMin,
    confirmedAt: input.order?.confirmedAt ?? null,
    slaShipMin: input.slaShipMin,
    reasonCode: result.reasonCode,
  });

  return {
    type: task.type,
    dedupeKey: taskDedupeKey(task.type, task.scope),
    title: task.title,
    detail: task.detail,
    reasonCode: result.reasonCode,
    reasonText: result.reasonText,
    priority: result.priority,
    dueAt,
    orderId: input.order?.id ?? null,
    customerId: input.customer.id,
  };
}

// ───────────────────────────── signals ─────────────────────────────

function slaBreached(input: PlanInput): boolean {
  const { now, order, firstUnansweredAt, slaFirstReplyMin, slaShipMin } = input;
  if (firstUnansweredAt && firstUnansweredAt.getTime() + slaFirstReplyMin * 60_000 < now.getTime()) {
    return true;
  }
  if (order?.confirmedAt && order.confirmedAt.getTime() + slaShipMin * 60_000 < now.getTime()) {
    return true;
  }
  return false;
}

function paymentMismatch(input: PlanInput): boolean {
  const { order } = input;
  if (!order) return false;
  const amount = claimedAmount(input);
  if (amount === null) return false;
  return amount !== order.totalMinor;
}

/** The amount the message claims, when a unit was stated (unit-less is separate). */
function claimedAmount(input: PlanInput): bigint | null {
  const candidate = findCandidate(input.candidates, input.output.amount?.candidateId);
  if (!candidate) return null;
  const parsed = parseAmount(candidate.raw);
  return parsed.amountMinor;
}

function amountUnitMissing(input: PlanInput): boolean {
  const candidate = findCandidate(input.candidates, input.output.amount?.candidateId);
  if (!candidate) return false;
  return parseAmount(candidate.raw).amountMinor === null;
}

// ───────────────────────────── helpers ─────────────────────────────

function uniqueIntents(values: readonly IntentKey[]): IntentKey[] {
  return [...new Set(values)];
}

/** Exported for the worker's logging: the words a plan will act on. */
export function planSummary(plan: PlanResult): string {
  return plan.tasks.map((task) => `${task.type}:${task.priority}`).join(",") || "no-tasks";
}
