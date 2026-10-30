import type { SessionContext } from "@/server/session";
import { fragment, taskNextAction, taskReason, unnamedCustomer } from "@/i18n/task-copy";
import type { Locale } from "@/i18n/config";
import { prisma } from "@/server/db";
import type { Prisma } from "@/generated/prisma/client";
import type { PriorityValue, SourceValue, TodayDTO, TodayRow } from "@/lib/dto";
import { reasonText as reasonTextForCode } from "@/server/domain/priority";
import { dueLabelOf, minutesBetween, zonedHour, zonedParts } from "@/server/domain/time";
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
 *   • `dayStrip` is 24 hourly inbound counts over a **rolling last-24-hours
 *     window** in the *tenant's* timezone (bucket 23 is the hour the shop is in
 *     now), so a shop that answers DMs past midnight still sees its night;
 *   • `stats` are computed from the stored messages of that same window (a "reply"
 *     is a stored outbound message that answers an inbound one);
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

export type TodayFilter = {
  /** "me" | "unassigned" | a member id. */
  assignee?: "me" | "unassigned" | string;
  /** Rolling windows, not calendar days — the shop works past midnight. */
  due?: "overdue" | "next24h" | "next7d";
};

export async function getToday(ctx: SessionContext, filter: TodayFilter = {}, locale: Locale = "fa"): Promise<TodayDTO> {
  const now = new Date();
  const timeZone = ctx.tenant.timezone;
  const tenantId = ctx.tenant.id;

  // A rolling last-24-hours window, aligned to the tenant's clock hour: bucket 23
  // is the hour the shop is in right now, bucket 0 the same hour one day ago.
  // A calendar day would read as "dead" for a shop that works past midnight —
  // which is exactly when this page is used (DIRECTION §0).
  const window = rollingWindow(now, timeZone);

  const [open, overdue, needsReview, tasks, windowMessages, unanswered, lastUpdatedAt] = await Promise.all([
    prisma.task.count({ where: { tenantId, status: { in: [...OPEN_STATUSES] } } }),
    prisma.task.count({
      where: { tenantId, status: { in: [...OPEN_STATUSES] }, dueAt: { lt: now } },
    }),
    // A message with five proposals is one thing for a human to review, so the
    // counter is distinct *messages*, not suggestion rows.
    countMessagesNeedingReview(tenantId),
    prisma.task.findMany({
      where: { ...ledgerWhere(ctx, filter, now) },
      orderBy: [{ dueAt: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }],
      take: MAX_ROWS,
      include: TODAY_INCLUDE,
    }),
    prisma.message.findMany({
      where: { tenantId, occurredAt: { gte: window.start, lte: now } },
      orderBy: [{ conversationId: "asc" }, { occurredAt: "asc" }, { id: "asc" }],
      select: { conversationId: true, direction: true, occurredAt: true },
    }),
    prisma.conversation.count({ where: { tenantId, unrepliedCount: { gt: 0 } } }),
    getLastSync(tenantId),
  ]);

  const fallbackSources = await sourceFallbackFor(tenantId, tasks);

  const items = tasks.map((task) => toRow(task, now, timeZone, fallbackSources, locale));
  const stats = computeStats(windowMessages, unanswered);
  const dayStrip = hourlyInbound(windowMessages, window, timeZone);

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
 * The ledger query, narrowed by the seller's filters. The three counters stay
 * global on purpose: they answer "how bad is today", which a filter must not
 * change. Only the rows below them are filtered.
 */
function ledgerWhere(ctx: SessionContext, filter: TodayFilter, now: Date) {
  const where: {
    tenantId: string;
    status: { in: ("open" | "in_progress" | "waiting_customer")[] };
    assigneeId?: string | null;
    dueAt?: { lt?: Date; gte?: Date; lte?: Date };
  } = { tenantId: ctx.tenant.id, status: { in: [...LEDGER_STATUSES] } };

  if (filter.assignee === "me") where.assigneeId = ctx.user.id;
  else if (filter.assignee === "unassigned") where.assigneeId = null;
  else if (filter.assignee) where.assigneeId = filter.assignee;

  if (filter.due === "overdue") where.dueAt = { lt: now };
  else if (filter.due === "next24h") where.dueAt = { gte: now, lte: new Date(now.getTime() + 24 * HOUR_MS) };
  else if (filter.due === "next7d") where.dueAt = { gte: now, lte: new Date(now.getTime() + 7 * 24 * HOUR_MS) };

  return where;
}

/** The last 24 clock hours of the tenant's day, as one window. */
const HOUR_MS = 60 * 60 * 1000;

type RollingWindow = { start: Date; end: Date; hours: Date[] };

function rollingWindow(now: Date, timeZone: string): RollingWindow {
  // The current *local* hour began `minute:second` ago — computed from the
  // timezone rather than assuming whole-hour offsets (Tehran is +03:30).
  const parts = zonedParts(now, timeZone);
  const msIntoHour = (parts.minute * 60 + parts.second) * 1000 + now.getMilliseconds();
  const currentHourStart = new Date(now.getTime() - msIntoHour);
  const start = new Date(currentHourStart.getTime() - 23 * HOUR_MS);
  const hours = Array.from({ length: 24 }, (_, index) => new Date(start.getTime() + index * HOUR_MS));
  return { start, end: new Date(currentHourStart.getTime() + HOUR_MS), hours };
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

/**
 * 24 buckets over the rolling window, from stored inbound messages only.
 *
 * `hour` is the bucket's start as a *clock hour* in the tenant's timezone, so the
 * last bucket carries the current hour and the rail can mark it. A bucket is one
 * hour wide; every dot on the rail is a message that exists in the database.
 */
function hourlyInbound(
  messages: readonly { direction: "inbound" | "outbound"; occurredAt: Date }[],
  window: RollingWindow,
  timeZone: string,
): { hour: number; count: number }[] {
  const strip = window.hours.map((bucketStart) => ({ hour: zonedHour(bucketStart, timeZone), count: 0 }));
  for (const message of messages) {
    if (message.direction !== "inbound") continue;
    const index = Math.floor((message.occurredAt.getTime() - window.start.getTime()) / HOUR_MS);
    const bucket = strip[Math.max(0, Math.min(index, 23))];
    if (bucket) bucket.count += 1;
  }
  return strip;
}

/**
 * The window's volume, honestly:
 *   • `inbound` / `replies` count stored messages inside the last 24 hours;
 *   • `unanswered` is how many conversations are waiting for our next message
 *     right now (the worker's `recompute_conversation` keeps that counter from the
 *     thread) — a state, not a count of the window;
 *   • `avgReplyMinutes` is the mean gap from a customer message to the *next*
 *     seller reply in the same conversation, over the same window. No pair →
 *     `null` ("not measured"), never 0 and never a guess.
 */
function computeStats(
  messages: readonly { conversationId: string; direction: "inbound" | "outbound"; occurredAt: Date }[],
  unanswered: number,
): TodayDTO["stats"] {
  let inbound = 0;
  let replies = 0;
  let waitedMinutes = 0;
  let pairs = 0;

  // Messages arrive ordered by conversation and then time, so one pass is enough:
  // the most recent inbound of the thread being read is the one a reply answers.
  let conversationId: string | null = null;
  let pendingInboundAt: Date | null = null;

  for (const message of messages) {
    if (message.conversationId !== conversationId) {
      conversationId = message.conversationId;
      pendingInboundAt = null;
    }
    if (message.direction === "inbound") {
      inbound += 1;
      if (!pendingInboundAt) pendingInboundAt = message.occurredAt;
      continue;
    }
    replies += 1;
    if (pendingInboundAt) {
      waitedMinutes += minutesBetween(pendingInboundAt, message.occurredAt);
      pairs += 1;
      pendingInboundAt = null;
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
  locale: Locale,
): TodayRow {
  const order = task.order;
  const customerName =
    task.customer?.displayName ?? order?.customer?.displayName ?? unnamedCustomer(locale);
  const customerId = task.customerId ?? null;
  const source: SourceValue =
    task.message?.source ??
    (customerId ? fallbackSources.get(customerId) : undefined) ??
    "manual";

  return {
    taskId: task.id,
    priority: task.priority as PriorityValue,
    reasonCode: task.reasonCode,
    reasonText: taskReason(task.reasonCode, reasonOf(task), locale),
    title: task.title,
    nextAction: taskNextAction(task.type, locale),
    subline: sublineOf(task, locale),
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
function sublineOf(task: TodayTask, locale: Locale): string | null {
  const parts: string[] = [];
  const claim = task.order?.paymentClaims[0] ?? null;
  const shipment = task.order?.shipments[0] ?? null;

  if (task.type === "payment_reconcile" || task.reasonCode === "payment_claim_unverified") {
    parts.push(fragment(claim?.status === "verified" ? "payment_verified" : "payment_unverified", locale));
  } else if (claim?.status === "claimed" || claim?.status === "disputed") {
    parts.push(fragment("payment_unverified", locale));
  } else if (claim?.status === "verified") {
    parts.push(fragment("payment_verified", locale));
  }

  if (task.reasonCode === "address_change" || task.type === "address_complete") {
    parts.push(fragment("address_not_in_message", locale));
  }
  if (task.reasonCode === "address_change_after_shipment") {
    parts.push(fragment("address_after_shipment", locale));
  }
  if (task.type === "tracking_followup" || task.reasonCode === "tracking_missing") {
    parts.push(fragment("tracking_missing", locale));
  }

  if (shipment?.status === "preparing") parts.push(fragment("parcel_preparing", locale));
  else if (shipment?.status === "shipped") parts.push(fragment("parcel_shipped", locale));
  else if (shipment?.status === "delivered") parts.push(fragment("parcel_delivered", locale));
  else if (shipment?.status === "paused") parts.push(fragment("shipping_paused", locale));

  if (task.order?.status === "needs_review") parts.push(fragment("order_needs_review", locale));

  if (parts.length === 0) return null;
  return [...new Set(parts)].slice(0, 3).join(" · ");
}
