import type { SessionContext } from "@/server/session";
import { prisma } from "@/server/db";
import type { Prisma } from "@/generated/prisma/client";
import type {
  ConversationDetailDTO,
  ConversationRow,
  MessageDTO,
  OrderSummaryDTO,
  PaymentStatusValue,
  ReviewStateValue,
  ShipmentStatusValue,
  SourceValue,
  SuggestionDTO,
  TaskRow,
} from "@/lib/dto";
import { INTENT_LABELS_FA, detectIntents } from "@/server/domain/intents";
import { formatMinorFa } from "@/server/domain/money";
import { truncateText } from "@/server/domain/normalize";
import { buildReplyPreview, type ReplyPreview } from "@/server/domain/reply";
import { errors } from "@/server/http";
import { TASK_VIEW_INCLUDE, toTaskRow } from "./task-view";

/**
 * The inbox: a queue of conversations, one thread with its evidence, and what the
 * system proposes for it (CONTRACTS §4).
 *
 * Three rules this file exists to keep:
 *   • **tenant only from ctx** — every query is scoped by `tenantId: ctx.tenant.id`
 *     and a conversation of another shop is simply "not here" (null → 404 at the
 *     route), never "forbidden", so ids cannot be probed;
 *   • **the database is the only source** — no number, label or state below is
 *     invented; `null` stays null all the way to the screen;
 *   • **evidence offsets index the original message** — `Suggestion.evidenceStart`
 *     /`End` are character offsets into `Message.text` as stored, which is exactly
 *     the string the thread renders, so the «نخ شاهد» underline lands on the
 *     customer's own words.
 */

export type InboxFilter = "all" | "unanswered" | "payment" | "review";

/** Conversations one queue response may carry. The search is still real. */
const MAX_CONVERSATIONS = 100;
const MAX_MESSAGES = 200;
/**
 * One line of queue text. Short on purpose: the row also carries the customer,
 * the source, the counters and the order ref, and a longer preview pushes them
 * into each other in the rendered layout.
 */
const PREVIEW_CHARS = 64;

const ROW_INCLUDE = {
  connection: { select: { channel: true, accountRef: true } },
  customer: {
    select: {
      id: true,
      displayName: true,
      identities: { select: { kind: true, externalRef: true, connectionId: true } },
    },
  },
  messages: {
    orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
    take: 1,
    select: { id: true, text: true, source: true, occurredAt: true, direction: true },
  },
} satisfies Prisma.ConversationInclude;

type RowConversation = Prisma.ConversationGetPayload<{ include: typeof ROW_INCLUDE }>;

const ORDER_INCLUDE = {
  items: { select: { id: true } },
  customer: { select: { displayName: true } },
  shipments: { orderBy: { updatedAt: "desc" }, take: 1 },
  paymentClaims: { orderBy: { claimedAt: "desc" }, take: 1 },
} satisfies Prisma.OrderInclude;

type OrderForView = Prisma.OrderGetPayload<{ include: typeof ORDER_INCLUDE }>;

// ───────────────────────────── queue ─────────────────────────────

/**
 * The queue, newest conversation first. `filter` is the four chips the screen
 * offers and `q` searches the customer's name, handle, channel ref and the text
 * of their messages — all case-insensitive, all inside one tenant.
 */
export async function listConversations(
  ctx: SessionContext,
  opts: { filter?: InboxFilter; q?: string } = {},
): Promise<ConversationRow[]> {
  const tenantId = ctx.tenant.id;
  const filter = opts.filter ?? "all";
  const needle = (opts.q ?? "").trim();

  const conversations = await prisma.conversation.findMany({
    where: { tenantId, ...(needle ? searchWhere(needle) : {}) },
    orderBy: [{ lastMessageAt: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
    take: MAX_CONVERSATIONS,
    include: ROW_INCLUDE,
  });
  if (conversations.length === 0) return [];

  const conversationIds = conversations.map((conversation) => conversation.id);
  const customerIds = [...new Set(conversations.map((conversation) => conversation.customerId))];

  const [pendingByConversation, paymentConversationIds, paymentCustomerIds, reviewCustomerIds, orderRefByCustomer] =
    await Promise.all([
      pendingSuggestionCounts(tenantId, conversationIds),
      conversationsWithPaymentProposal(tenantId, conversationIds),
      customersWithClaimedPayment(tenantId),
      customersWithOrderNeedingReview(tenantId, customerIds),
      latestOrderRefPerCustomer(tenantId, customerIds),
    ]);

  const paymentConversation = new Set<string>();
  const rows: ConversationRow[] = conversations.map((conversation) => {
    const pendingSuggestions = pendingByConversation.get(conversation.id) ?? 0;
    if (paymentConversationIds.has(conversation.id) || paymentCustomerIds.has(conversation.customerId)) {
      paymentConversation.add(conversation.id);
    }
    return toRow(conversation, {
      pendingSuggestions,
      needsReview: pendingSuggestions > 0 || reviewCustomerIds.has(conversation.customerId),
      orderRef: orderRefByCustomer.get(conversation.customerId) ?? null,
    });
  });

  return rows.filter((row) => {
    if (filter === "unanswered") return row.unrepliedCount > 0;
    if (filter === "payment") return paymentConversation.has(row.id);
    if (filter === "review") return row.needsReview;
    return true;
  });
}

function searchWhere(needle: string): Prisma.ConversationWhereInput {
  const lower = needle.toLowerCase();
  return {
    OR: [
      { customer: { displayName: { contains: needle, mode: "insensitive" } } },
      { customer: { identities: { some: { externalRef: { contains: lower, mode: "insensitive" } } } } },
      { channelRef: { contains: needle, mode: "insensitive" } },
      { messages: { some: { text: { contains: needle, mode: "insensitive" } } } },
    ],
  };
}

/** Unreviewed proposals per conversation — a filtered `_count`, one query. */
async function pendingSuggestionCounts(
  tenantId: string,
  conversationIds: string[],
): Promise<Map<string, number>> {
  const rows = await prisma.message.findMany({
    where: {
      tenantId,
      conversationId: { in: conversationIds },
      suggestions: { some: { reviewState: "proposed" } },
    },
    select: {
      conversationId: true,
      _count: { select: { suggestions: { where: { reviewState: "proposed" } } } },
    },
  });

  const counts = new Map<string, number>();
  for (const row of rows) {
    counts.set(row.conversationId, (counts.get(row.conversationId) ?? 0) + row._count.suggestions);
  }
  return counts;
}

/**
 * "اعلام پرداخت" conversations come from two stored facts: a proposal that says
 * the customer claimed a payment, and a `PaymentClaim` row that no human has
 * verified yet. Tone of the message is never consulted.
 */
async function conversationsWithPaymentProposal(
  tenantId: string,
  conversationIds: string[],
): Promise<Set<string>> {
  const suggestions = await prisma.suggestion.findMany({
    where: {
      tenantId,
      sourceMessage: { conversationId: { in: conversationIds } },
      OR: [
        { field: "intent.primary", proposedValue: { path: ["intent"], equals: "payment_claim" } },
        { field: "intent.flag.payment_claim" },
      ],
    },
    select: { sourceMessage: { select: { conversationId: true } } },
  });

  return new Set(suggestions.map((suggestion) => suggestion.sourceMessage.conversationId));
}

async function customersWithClaimedPayment(tenantId: string): Promise<Set<string>> {
  const claims = await prisma.paymentClaim.findMany({
    where: { tenantId, status: { in: ["claimed", "disputed"] } },
    select: { order: { select: { customerId: true } } },
  });
  return new Set(claims.map((claim) => claim.order.customerId));
}

async function customersWithOrderNeedingReview(tenantId: string, customerIds: string[]): Promise<Set<string>> {
  if (customerIds.length === 0) return new Set();
  const orders = await prisma.order.findMany({
    where: { tenantId, customerId: { in: customerIds }, status: "needs_review" },
    select: { customerId: true },
  });
  return new Set(orders.map((order) => order.customerId));
}

/** The order the queue row points at: the customer's newest non-cancelled order. */
async function latestOrderRefPerCustomer(tenantId: string, customerIds: string[]): Promise<Map<string, string>> {
  if (customerIds.length === 0) return new Map();
  const orders = await prisma.order.findMany({
    where: { tenantId, customerId: { in: customerIds }, status: { not: "cancelled" } },
    orderBy: [{ orderCreatedAt: "desc" }],
    select: { customerId: true, publicRef: true },
  });

  const map = new Map<string, string>();
  for (const order of orders) {
    if (!map.has(order.customerId)) map.set(order.customerId, order.publicRef);
  }
  return map;
}

function toRow(
  conversation: RowConversation,
  extras: { pendingSuggestions: number; needsReview: boolean; orderRef: string | null },
): ConversationRow {
  const lastMessage = conversation.messages[0] ?? null;
  return {
    id: conversation.id,
    customerName: conversation.customer.displayName,
    handle: handleOf(conversation),
    lastMessageAt: conversation.lastMessageAt?.toISOString() ?? null,
    lastMessagePreview: lastMessage ? previewOf(lastMessage.text) : "",
    unrepliedCount: conversation.unrepliedCount,
    source: sourceOf(conversation, lastMessage?.source),
    pendingSuggestions: extras.pendingSuggestions,
    needsReview: extras.needsReview,
    orderRef: extras.orderRef,
  };
}

/** One line, collapsed whitespace, cut on a word boundary — never two rows tall. */
function previewOf(text: string): string {
  const singleLine = text.replace(/\s+/g, " ").trim();
  return truncateText(singleLine, PREVIEW_CHARS);
}

/** The identity on *this* connection wins; a customer may have several. */
function handleOf(conversation: RowConversation): string | null {
  const identities = conversation.customer.identities;
  const onConnection = identities.find((identity) => identity.connectionId === conversation.connectionId);
  const chosen = onConnection ?? identities[0] ?? null;
  return chosen ? chosen.externalRef : null;
}

function sourceOf(conversation: RowConversation, messageSource: SourceValue | undefined): SourceValue {
  if (messageSource) return messageSource;
  const channel = conversation.connection.channel;
  if (channel === "file" || channel === "replay" || channel === "instagram") return channel;
  return "manual";
}

// ───────────────────────────── one conversation ─────────────────────────────

/**
 * One thread: the messages oldest→newest, the proposals with their evidence, the
 * order in play, the tasks and the analysis run that produced it all.
 *
 * Returns `null` for a conversation that does not exist *in this tenant* — the
 * route turns that into 404, which is also the answer for another tenant's id.
 */
export async function getConversation(
  ctx: SessionContext,
  conversationId: string,
): Promise<ConversationDetailDTO | null> {
  const tenantId = ctx.tenant.id;

  const conversation = await prisma.conversation.findFirst({
    where: { id: conversationId, tenantId },
    include: ROW_INCLUDE,
  });
  if (!conversation) return null;

  const messages = await prisma.message.findMany({
    where: { tenantId, conversationId: conversation.id },
    // Oldest first: a thread reads downwards.
    orderBy: [{ occurredAt: "asc" }, { id: "asc" }],
    take: MAX_MESSAGES,
    select: {
      id: true,
      direction: true,
      source: true,
      text: true,
      occurredAt: true,
      analysisState: true,
      attachments: true,
    },
  });
  const messageIds = messages.map((message) => message.id);

  const [suggestions, pendingSuggestionCount, reviewCustomerIds, orderRefByCustomer, analysisRun] =
    await Promise.all([
      messageIds.length
        ? prisma.suggestion.findMany({
            where: { tenantId, sourceMessageId: { in: messageIds } },
            orderBy: [{ createdAt: "asc" }],
          })
        : Promise.resolve([]),
      pendingSuggestionCounts(tenantId, [conversation.id]),
      customersWithOrderNeedingReview(tenantId, [conversation.customerId]),
      latestOrderRefPerCustomer(tenantId, [conversation.customerId]),
      messageIds.length
        ? prisma.analysisRun.findFirst({
            where: { tenantId, messageId: { in: messageIds } },
            orderBy: [{ queuedAt: "desc" }],
            select: { id: true, provider: true, model: true, status: true, latencyMs: true, queuedAt: true },
          })
        : Promise.resolve(null),
    ]);

  const pendingSuggestions = pendingSuggestionCount.get(conversation.id) ?? 0;
  const row = toRow(conversation, {
    pendingSuggestions,
    needsReview: pendingSuggestions > 0 || reviewCustomerIds.has(conversation.customerId),
    orderRef: orderRefByCustomer.get(conversation.customerId) ?? null,
  });

  const order = await resolveOrder(tenantId, conversation.customerId, suggestions);
  const tasks = await conversationTasks(tenantId, messageIds, order?.id ?? null);
  const currency = order?.currency ?? ctx.tenant.currency;

  // The header describes the run that produced the proposals the sheet is
  // showing. A newer run can still be queued (the seller pressed replay, or a
  // retry is pending); saying "running" next to finished evidence would be a
  // half-truth, so a succeeded run is preferred and any run is the fallback.
  const analysis = analysisRun?.status === "succeeded" ? analysisRun : (await latestSucceededRun(tenantId, messageIds)) ?? analysisRun;

  return {
    conversation: {
      ...row,
      orderId: order?.id ?? null,
      customerId: conversation.customerId,
    },
    messages: messages.map((message) => toMessageDto(message, row.customerName, ctx.tenant.nameFa)),
    suggestions: suggestions.map((suggestion) => toSuggestionDto(suggestion, currency)),
    order: order ? toOrderSummary(order, ctx.settings.slaShipMin) : null,
    tasks,
    analysis: analysis
      ? {
          runId: analysis.id,
          provider: analysis.provider,
          model: analysis.model,
          status: analysis.status,
          latencyMs: analysis.latencyMs,
          createdAt: analysis.queuedAt.toISOString(),
        }
      : null,
  };
}

async function latestSucceededRun(tenantId: string, messageIds: string[]) {
  if (messageIds.length === 0) return null;
  return prisma.analysisRun.findFirst({
    where: { tenantId, messageId: { in: messageIds }, status: "succeeded" },
    orderBy: [{ queuedAt: "desc" }],
    select: { id: true, provider: true, model: true, status: true, latencyMs: true, queuedAt: true },
  });
}

async function resolveOrder(
  tenantId: string,
  customerId: string,
  suggestions: readonly { orderId: string | null }[],
): Promise<OrderForView | null> {
  // A proposal may already name the order the message is about; use it, but only
  // after proving it belongs to this tenant.
  const suggestedOrderId = suggestions.find((suggestion) => suggestion.orderId)?.orderId ?? null;
  if (suggestedOrderId) {
    const suggested = await prisma.order.findFirst({
      where: { id: suggestedOrderId, tenantId },
      include: ORDER_INCLUDE,
    });
    if (suggested) return suggested;
  }

  return prisma.order.findFirst({
    where: { tenantId, customerId },
    orderBy: [{ orderCreatedAt: "desc" }],
    include: ORDER_INCLUDE,
  });
}

async function conversationTasks(tenantId: string, messageIds: string[], orderId: string | null): Promise<TaskRow[]> {
  const or: Prisma.TaskWhereInput[] = [];
  if (messageIds.length) or.push({ messageId: { in: messageIds } });
  if (orderId) or.push({ orderId });
  if (or.length === 0) return [];

  const now = new Date();
  const tasks = await prisma.task.findMany({
    where: { tenantId, OR: or },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    take: 40,
    include: TASK_VIEW_INCLUDE,
  });
  return tasks.map((task) => toTaskRow(task, now));
}

function toMessageDto(
  message: {
    id: string;
    direction: "inbound" | "outbound";
    source: SourceValue;
    text: string;
    occurredAt: Date;
    analysisState: "pending" | "running" | "done" | "failed" | "needs_human";
    attachments: Prisma.JsonValue;
  },
  customerName: string,
  shopName: string,
): MessageDTO {
  return {
    id: message.id,
    direction: message.direction,
    source: message.source,
    senderLabel: message.direction === "inbound" ? customerName : shopName,
    text: message.text,
    occurredAt: message.occurredAt.toISOString(),
    analysisState: message.analysisState,
    attachments: readAttachments(message.attachments),
  };
}

function readAttachments(value: Prisma.JsonValue): { kind: string; externalRef?: string }[] {
  if (!Array.isArray(value)) return [];
  const attachments: { kind: string; externalRef?: string }[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const record = entry as Record<string, unknown>;
    const kind = typeof record.kind === "string" ? record.kind : null;
    if (!kind) continue;
    attachments.push({
      kind,
      ...(typeof record.externalRef === "string" ? { externalRef: record.externalRef } : {}),
    });
  }
  return attachments;
}

// ───────────────────────────── suggestions ─────────────────────────────

/** Which sheet section a field belongs to (the UI groups by this). */
export function suggestionGroup(field: string): SuggestionDTO["group"] {
  if (field.startsWith("risk")) return "risk";
  if (field.startsWith("intent")) return "intent";
  if (field.startsWith("order") || field.startsWith("shipment") || field.startsWith("payment")) return "order";
  return "field";
}

type ProposedValue = { intent: string | null; value: string | number | null };

/** `proposedValue` is JSON: either `{ intent }` (a classification) or `{ value }`. */
function readProposedValue(proposedValue: Prisma.JsonValue): ProposedValue {
  if (!proposedValue) return { intent: null, value: null };
  if (typeof proposedValue !== "object" || Array.isArray(proposedValue)) {
    return { intent: null, value: scalar(proposedValue) };
  }
  const record = proposedValue as Record<string, unknown>;
  return {
    intent: typeof record.intent === "string" ? record.intent : null,
    value: "value" in record ? scalar(record.value) : null,
  };
}

function scalar(value: unknown): string | number | null {
  if (typeof value === "string" || typeof value === "number") return value;
  return null;
}

function toSuggestionDto(
  suggestion: {
    id: string;
    field: string;
    proposedValue: Prisma.JsonValue;
    candidateId: string | null;
    evidenceStart: number | null;
    evidenceEnd: number | null;
    reviewState: ReviewStateValue;
    confidence: unknown;
    sourceMessageId: string;
  },
  currency: string,
): SuggestionDTO {
  const proposed = readProposedValue(suggestion.proposedValue);
  const value = proposed.intent ?? proposed.value;
  const evidence =
    suggestion.evidenceStart !== null && suggestion.evidenceEnd !== null
      ? { start: suggestion.evidenceStart, end: suggestion.evidenceEnd }
      : null;

  return {
    id: suggestion.id,
    field: suggestion.field,
    value,
    displayValue: displayValueOf(suggestion.field, proposed, currency),
    confidence: nullableNumber(suggestion.confidence),
    reviewState: suggestion.reviewState,
    evidence,
    sourceMessageId: suggestion.sourceMessageId,
    candidateId: suggestion.candidateId,
    group: suggestionGroup(suggestion.field),
  };
}

/** `Decimal | null` → `number | null`; a missing confidence stays null, not 0. */
function nullableNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

/**
 * A human-readable value, in Persian, or `null` when the message never said it.
 * `null` is the interesting case (DIRECTION §4: the address field is *empty*
 * because the customer said the address changed and never wrote the new one).
 */
function displayValueOf(field: string, proposed: ProposedValue, currency: string): string | null {
  if (field.startsWith("risk")) return "دستور مشکوک در متن پیام";
  if (field.startsWith("intent")) {
    const intent = proposed.intent ?? (typeof proposed.value === "string" ? proposed.value : null);
    if (!intent) return null;
    return INTENT_LABELS_FA[intent as keyof typeof INTENT_LABELS_FA] ?? intent;
  }
  if (proposed.value === null) return null;
  if (field.includes("amount") || field.includes("price") || field.includes("total")) {
    return formatAmount(proposed.value, currency);
  }
  return String(proposed.value);
}

function formatAmount(value: string | number, currency: string): string {
  try {
    return formatMinorFa(BigInt(String(value)), currency);
  } catch {
    return String(value);
  }
}

// ───────────────────────────── orders & reply ─────────────────────────────

function paymentStatusOf(order: { paymentClaims: { status: string }[] }): PaymentStatusValue {
  const latest = order.paymentClaims[0];
  return (latest?.status as PaymentStatusValue | undefined) ?? "unknown";
}

function shipmentStatusOf(order: { shipments: { status: string }[] }): ShipmentStatusValue {
  const latest = order.shipments[0];
  return (latest?.status as ShipmentStatusValue | undefined) ?? "not_ready";
}

function toOrderSummary(order: OrderForView, slaShipMin: number): OrderSummaryDTO {
  // The order's deadline is the shop's ship SLA from the moment a human confirmed
  // it — not a promise invented from the message.
  const dueAt = order.confirmedAt ? new Date(order.confirmedAt.getTime() + slaShipMin * 60_000) : null;

  return {
    id: order.id,
    publicRef: order.publicRef,
    customerName: order.customer.displayName,
    status: order.status,
    paymentStatus: paymentStatusOf(order),
    shipmentStatus: shipmentStatusOf(order),
    totalMinor: order.totalMinor.toString(),
    currency: order.currency,
    itemCount: order.items.length,
    dueAt: dueAt?.toISOString() ?? null,
    createdAt: order.orderCreatedAt.toISOString(),
    version: order.version,
  };
}

export type ReplyPreviewView = {
  templateKey: string;
  templateVersion: string;
  body: string;
  allowed: boolean;
};

/**
 * The reply preview, built from stored state only (CONTRACTS §4, brief §10).
 *
 * It is *pure*: reading it writes nothing. No `OutboundMessage`, no `sent`, no
 * copy of the text is queued — copying a reply is not sending one, and the whole
 * outbox is phase 3. The sentence is chosen by `domain/reply.ts`, which never
 * says a state the database has not recorded: a claimed payment stays «در حال
 * بررسی», and a missing tracking code is never filled in with an invented one.
 */
export async function previewReply(ctx: SessionContext, orderId: string): Promise<ReplyPreviewView> {
  const tenantId = ctx.tenant.id;

  const order = await prisma.order.findFirst({
    where: { id: orderId, tenantId },
    include: {
      customer: { select: { displayName: true } },
      shipments: { orderBy: { updatedAt: "desc" }, take: 1 },
      paymentClaims: { orderBy: { claimedAt: "desc" }, take: 1 },
    },
  });
  // Another tenant's order id answers exactly like a missing one.
  if (!order) throw errors.notFound("سفارش پیدا نشد.");

  const settings = await prisma.tenantSettings.findUnique({
    where: { tenantId },
    select: { shippingPaused: true },
  });
  const shippingPaused = settings?.shippingPaused ?? false;

  const shipment = order.shipments[0] ?? null;
  const recentMessages = await prisma.message.findMany({
    where: { tenantId, conversation: { customerId: order.customerId } },
    orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
    take: 12,
    select: { text: true, direction: true },
  });

  // What the customer actually asked for, read with the same rule-based detector
  // the worker uses (domain/intents.ts) — never by asking a model to summarise.
  let trackingRequested = false;
  let addressChangeRequested = false;
  for (const message of recentMessages) {
    if (message.direction !== "inbound") continue;
    const scan = detectIntents(message.text);
    if (scan.hits.some((hit) => hit.intent === "tracking_request")) trackingRequested = true;
    if (scan.hits.some((hit) => hit.intent === "address_change")) addressChangeRequested = true;
  }

  // The audit's P0: this read ignored the human decision, so a *rejected*
  // address proposal was treated as the customer's stated address and the reply
  // flipped from "address_needed" to "shipping_preparing" — a false statement to
  // the customer. Only an accepted (or human-corrected) suggestion is operational
  // truth; a proposal awaiting review is not.
  const addressSuggestion = await prisma.suggestion.findFirst({
    where: {
      tenantId,
      orderId: order.id,
      field: "order.address",
      reviewState: { in: ["accepted", "corrected"] },
    },
    orderBy: { reviewedAt: "desc" },
    select: { proposedValue: true },
  });
  const statedAddress = addressSuggestion ? readProposedValue(addressSuggestion.proposedValue).value : null;

  const preview: ReplyPreview = buildReplyPreview({
    orderRef: order.publicRef,
    orderStatus: order.status,
    paymentStatus: paymentStatusOf(order),
    shipmentStatus: shipmentStatusOf(order),
    trackingCode: shipment?.trackingCode ?? null,
    carrier: shipment?.carrier ?? null,
    trackingRequested,
    addressMissing: addressChangeRequested && statedAddress === null,
    addressChangeAfterShipment:
      addressChangeRequested && (shipment?.status === "shipped" || shipment?.status === "delivered"),
    postingPaused: ctx.settings.postingPaused || shippingPaused,
  });

  return {
    templateKey: preview.templateKey,
    templateVersion: preview.templateVersion,
    body: preview.body,
    // A paused shop can still read the sentence, but the screen must not offer it
    // as something that can be sent right now.
    allowed: preview.allowed && !ctx.settings.postingPaused && !shippingPaused,
  };
}
