import type { SessionContext } from "@/server/session";
import { prisma } from "@/server/db";
import type { Prisma } from "@/generated/prisma/client";
import type { PriorityValue, SourceValue, TodayDTO, TodayRow } from "@/lib/dto";
import { reasonText as reasonTextForCode } from "@/server/domain/priority";
import { dueLabelOf, minutesBetween, nextZonedDay, startOfZonedDay, zonedHour } from "@/server/domain/time";
import { getLastSync } from "./shell";
import { taskReasonText } from "./task-view";

/**
 * Today — the one screen that answers «الان باید چه کار کنم؟» (DIRECTION §4).
 *
 * Everything on it is read from rows the rest of the server already wrote; this
 * file invents no number:
 *
 *   • `counts` are real `count(*)`s (open work, work past its deadline, proposals
 *     no human has reviewed yet);
 *   • `items` are the open tasks, overdue first and then by deadline — the order
 *     is the argument, not a colour;
 *   • `dayStrip` is 24 hourly inbound counts of the *tenant's* local day, so the
 *     signal on the rail is the shop's night, not the server's UTC day;
 *   • `stats` are computed from the stored messages of that same day (a "reply"
 *     is a stored outbound message that follows an inbound one);
 *   • `lastUpdatedAt` is the newest stored message — the honest "as of" line;
 *   • `paused` is `TenantSettings.postingPaused`, i.e. the shop's own decision.
 *
 * The tenant comes from the session context only; this service has no parameter
 * that could point it at another shop.
 */

/** How many rows the ledger shows. The counters stay exact beyond this. */
const MAX_ROWS = 60;

/** Statuses that are still the shop's work (waiting on the customer is not). */
const OPEN_STATUSES = ["open", "in_progress"] as const;
const LEDGER_STATUSES = ["open", "in_progress"] as const;

const TODAY_INCLUDE = {
  customer: { select: { displayName: true } },
  message: { select: { source: true, conversationId: true } },
  order: {
    select: {
      id: true,
      publicRef: true,
      status: true,
      currency: true,
      totalMinor: true,
      confirmedAt: true,
      customer: { select: { displayName: true } },
      items: { select: { id: true } },
      shipments: {
        orderBy: { updatedAt: "desc" },
        take: 1,
        select: { status: true, trackingCode: true },
      },
      paymentClaims: {
        orderBy: { claimedAt: "desc" },
        take: 1,
        select: { status: true, amountMinor: true },
      },
    },
  },
} satisfies Prisma.TaskInclude;

type TodayTask = Prisma.TaskGetPayload<{ include: typeof TODAY_INCLUDE }>;

/**
 * The next action, in the seller's voice: a verb the screen can print under the
 * customer's name (DIRECTION §4 "next action"). One sentence per task type —
 * never a generic "open" that tells the seller nothing.
 */
const NEXT_ACTION: Record<string, string> = {
  payment_reconcile: "تطبیق پرداخت و تأیید",
  address_complete: "گرفتن نشانی تازه",
  tracking_followup: "ثبت کد رهگیری",
  draft_review: "بررسی پیش‌نویس سفارش",
  customer_reply: "پاسخ به مشتری",
  human_review: "بررسی انسانی و تعیین تکلیف",
  shipment_action: "اقدام ارسال",
  refund_review: "بررسی بازگشت وجه",
};

export async function getToday(ctx: SessionContext): Promise<TodayDTO> {
  const now = new Date();
  const timeZone = ctx.tenant.timezone;
  const tenantId = ctx.tenant.id;

  const dayStart = startOfZonedDay(now, timeZone);
  const dayEnd = nextZonedDay(dayStart, timeZone);

  const [open, overdue, needsReview, tasks, dayMessages, unanswered, lastUpdatedAt] = await Promise.all([
    prisma.task.count({ where: { tenantId, status: { in: [...OPEN_STATUSES] } } }),
    prisma.task.count({
      where: { tenantId, status: { in: [...OPEN_STATUSES] }, dueAt: { lt: now } },
    }),
    // A message with five proposals is one thing for a human to review, so the
    // counter is distinct *messages*, not suggestion rows.
    countMessagesNeedingReview(tenantId),
    prisma.task.findMany({
      where: { tenantId, status: { in: [...LEDGER_STATUSES] } },
      orderBy: [{ dueAt: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }],
      take: MAX_ROWS,
      include: TODAY_INCLUDE,
    }),
    prisma.message.findMany({
      where: { tenantId, occurredAt: { gte: dayStart, lt: dayEnd } },
      orderBy: [{ occurredAt: "asc" }, { id: "asc" }],
      select: { direction: true, occurredAt: true },
    }),
    prisma.conversation.count({ where: { tenantId, unrepliedCount: { gt: 0 } } }),
    getLastSync(tenantId),
  ]);

  const fallbackSources = await sourceFallbackFor(tenantId, tasks);

  const items = tasks.map((task) => toRow(task, now, timeZone, fallbackSources));
  const stats = computeStats(dayMessages, unanswered);
  const dayStrip = hourlyInbound(dayMessages, timeZone);

  return {
    counts: { open, overdue, needsReview },
    items,
    dayStrip,
    stats,
    lastUpdatedAt,
    paused: ctx.settings.postingPaused,
  };
}

/**
 * Distinct messages that still carry at least one unreviewed proposal. One
 * `groupBy` instead of `count()` on suggestions: the seller reviews *messages*,
 * and DIRECTION §4's «۱ نیازمند بررسی» is one message, not five rows.
 */
async function countMessagesNeedingReview(tenantId: string): Promise<number> {
  const groups = await prisma.suggestion.groupBy({
    by: ["sourceMessageId"],
    where: { tenantId, reviewState: "proposed" },
  });
  return groups.length;
}

/** 24 buckets of the tenant's local day, from stored inbound messages only. */
function hourlyInbound(
  messages: readonly { direction: "inbound" | "outbound"; occurredAt: Date }[],
  timeZone: string,
): { hour: number; count: number }[] {
  const strip = Array.from({ length: 24 }, (_, hour) => ({ hour, count: 0 }));
  for (const message of messages) {
    if (message.direction !== "inbound") continue;
    const hour = zonedHour(message.occurredAt, timeZone);
    const bucket = strip[hour];
    if (bucket) bucket.count += 1;
  }
  return strip;
}

/**
 * Today's volume, honestly:
 *   • `inbound` / `replies` count stored messages of the local day;
 *   • `unanswered` is how many conversations are waiting for our next message
 *     (the worker's `recompute_conversation` keeps that counter from the thread);
 *   • `avgReplyMinutes` pairs each seller reply with the oldest unanswered
 *     customer message it answered. No pairs → `null` ("not measured"), never 0.
 */
function computeStats(
  messages: readonly { direction: "inbound" | "outbound"; occurredAt: Date }[],
  unanswered: number,
): TodayDTO["stats"] {
  let inbound = 0;
  let replies = 0;
  let waitedMinutes = 0;
  let pairs = 0;
  let oldestUnanswered: Date | null = null;

  for (const message of messages) {
    if (message.direction === "inbound") {
      inbound += 1;
      if (!oldestUnanswered) oldestUnanswered = message.occurredAt;
      continue;
    }
    replies += 1;
    if (oldestUnanswered) {
      waitedMinutes += minutesBetween(oldestUnanswered, message.occurredAt);
      pairs += 1;
      oldestUnanswered = null;
    }
  }

  return {
    inbound,
    replies,
    unanswered,
    avgReplyMinutes: pairs === 0 ? null : Math.round(waitedMinutes / pairs),
  };
}

/**
 * A row without a message (a task raised straight from an order) still has to
 * say where it came from. One batched query against the customer's newest
 * conversation is enough — and "manual" is only used when there is genuinely no
 * message behind the task.
 */
async function sourceFallbackFor(
  tenantId: string,
  tasks: readonly TodayTask[],
): Promise<Map<string, SourceValue>> {
  const customerIds = new Set<string>();
  for (const task of tasks) {
    if (task.message) continue;
    if (task.customerId) customerIds.add(task.customerId);
  }
  if (customerIds.size === 0) return new Map();

  const conversations = await prisma.conversation.findMany({
    where: { tenantId, customerId: { in: [...customerIds] } },
    select: {
      customerId: true,
      messages: {
        orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
        take: 1,
        select: { source: true },
      },
    },
  });

  const map = new Map<string, SourceValue>();
  for (const conversation of conversations) {
    const source = conversation.messages[0]?.source;
    if (source && !map.has(conversation.customerId)) map.set(conversation.customerId, source);
  }
  return map;
}

function toRow(
  task: TodayTask,
  now: Date,
  timeZone: string,
  fallbackSources: Map<string, SourceValue>,
): TodayRow {
  const order = task.order;
  const customerName =
    task.customer?.displayName ?? order?.customer?.displayName ?? "مشتری بدون نام";
  const customerId = task.customerId ?? null;
  const source: SourceValue =
    task.message?.source ??
    (customerId ? fallbackSources.get(customerId) : undefined) ??
    "manual";

  return {
    taskId: task.id,
    priority: task.priority as PriorityValue,
    reasonCode: task.reasonCode,
    reasonText: reasonOf(task),
    title: task.title,
    nextAction: NEXT_ACTION[task.type] ?? "بررسی و اقدام",
    subline: sublineOf(task),
    dueAt: task.dueAt?.toISOString() ?? null,
    dueLabel: dueLabelOf(task.dueAt, now, timeZone),
    customerName,
    orderRef: order?.publicRef ?? null,
    itemCount: order ? order.items.length : null,
    source,
    conversationId: task.message?.conversationId ?? null,
    orderId: order?.id ?? null,
  };
}

/**
 * Why this row is here, in one short Persian sentence. The sentence stored with
 * the task wins because it was written next to the fact that raised it; the
 * domain dictionary (priority.ts) is the fallback, so a row created by an older
 * rule still explains itself instead of printing a machine code.
 */
function reasonOf(task: TodayTask): string {
  const stored = task.reasonText?.trim();
  if (stored) return stored;
  return taskReasonText(task) || reasonTextForCode(task.reasonCode);
}

/**
 * The concrete sub-fact behind the row (DIRECTION §4: «پرداخت بررسی‌نشده ·
 * آدرس جدید نامشخص»). Only facts read from stored state — a claim nobody has
 * verified, a missing tracking code, where the parcel actually is.
 */
function sublineOf(task: TodayTask): string | null {
  const parts: string[] = [];
  const claim = task.order?.paymentClaims[0] ?? null;
  const shipment = task.order?.shipments[0] ?? null;

  if (task.type === "payment_reconcile" || task.reasonCode === "payment_claim_unverified") {
    parts.push(claim?.status === "verified" ? "پرداخت تأییدشده" : "پرداخت بررسی‌نشده");
  } else if (claim?.status === "claimed" || claim?.status === "disputed") {
    parts.push("پرداخت بررسی‌نشده");
  } else if (claim?.status === "verified") {
    parts.push("پرداخت تأییدشده");
  }

  if (task.reasonCode === "address_change" || task.type === "address_complete") {
    parts.push("آدرس تازه در پیام نیامده");
  }
  if (task.reasonCode === "address_change_after_shipment") {
    parts.push("تغییر آدرس پس از ارسال");
  }
  if (task.type === "tracking_followup" || task.reasonCode === "tracking_missing") {
    parts.push("کد رهگیری ثبت نشده");
  }

  if (shipment?.status === "preparing") parts.push("مرسوله در حال آماده‌سازی");
  else if (shipment?.status === "shipped") parts.push("مرسوله ارسال شده");
  else if (shipment?.status === "delivered") parts.push("مرسوله تحویل شده");
  else if (shipment?.status === "paused") parts.push("ارسال متوقف شده");

  if (task.order?.status === "needs_review") parts.push("سفارش نیازمند بررسی");

  if (parts.length === 0) return null;
  return [...new Set(parts)].slice(0, 3).join(" · ");
}
