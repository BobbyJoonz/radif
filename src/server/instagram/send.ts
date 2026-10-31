import { prisma } from "@/server/db";
import { errors } from "@/server/http";
import type { SessionContext } from "@/server/session";
import { accessTokenFor } from "@/server/instagram/connect";
import { env } from "@/lib/env";

/**
 * Replying to an Instagram DM — honestly.
 *
 * Three rules come straight from Meta and from this product's own promise:
 *
 *   1. **24-hour window.** A free-form reply is only allowed within 24 hours of the
 *      customer's last message. The window is computed here, on the server, from
 *      stored messages — never from what the screen believes.
 *   2. **Preview is not sending.** With `OUTBOUND_MODE=preview` (the default) an
 *      approved reply is recorded as a draft and reported as a simulation. Only
 *      `live` mode calls Meta, and only a provider message id counts as sent.
 *   3. **One tap, one message.** An idempotency key makes a double-click or a retry
 *      the same outbound row instead of two messages to a customer.
 */

export const WINDOW_MS = 24 * 60 * 60 * 1000;

export type ReplyWindow = { canReply: boolean; expiresAt: string | null; lastInboundAt: string | null; reason?: string };

export async function replyWindow(ctx: SessionContext, conversationId: string): Promise<ReplyWindow> {
  const conversation = await prisma.conversation.findFirst({
    where: { id: conversationId, tenantId: ctx.tenant.id },
    select: { id: true, channelRef: true, connection: { select: { channel: true, status: true } } },
  });
  if (!conversation) throw errors.notFound("این گفتگو پیدا نشد.");

  if (conversation.connection.channel !== "instagram") {
    return { canReply: false, expiresAt: null, lastInboundAt: null, reason: "not_instagram" };
  }
  if (conversation.connection.status !== "connected") {
    return { canReply: false, expiresAt: null, lastInboundAt: null, reason: "connection_not_ready" };
  }

  const lastInbound = await prisma.message.findFirst({
    where: { conversationId: conversation.id, direction: "inbound" },
    orderBy: { occurredAt: "desc" },
    select: { occurredAt: true },
  });
  if (!lastInbound) {
    return { canReply: false, expiresAt: null, lastInboundAt: null, reason: "no_inbound_message" };
  }

  const expiresAt = new Date(lastInbound.occurredAt.getTime() + WINDOW_MS);
  return {
    canReply: expiresAt.getTime() > Date.now(),
    expiresAt: expiresAt.toISOString(),
    lastInboundAt: lastInbound.occurredAt.toISOString(),
    reason: expiresAt.getTime() > Date.now() ? undefined : "window_closed",
  };
}

export type QueueReplyInput = {
  conversationId: string;
  text: string;
  quickReplies?: string[];
  scheduleAt?: Date | null;
};

export type QueuedReply = {
  id: string;
  status: "draft" | "queued";
  /** "preview" means: recorded, labelled, and definitely not sent. */
  mode: "preview" | "live";
  scheduledFor: string | null;
  idempotencyKey: string;
};

export async function queueReply(ctx: SessionContext, input: QueueReplyInput): Promise<QueuedReply> {
  const text = input.text.trim();
  if (text.length === 0) throw errors.invalid("متن پاسخ خالی است.");
  if (text.length > 1000) throw errors.invalid("متن پاسخ بیش از ۱۰۰۰ نویسه است.");

  const window = await replyWindow(ctx, input.conversationId);
  if (!window.canReply) {
    throw errors.conflict(
      window.reason === "window_closed"
        ? "پنجرهٔ ۲۴ ساعتهٔ پاسخ بسته شده است؛ متا اجازهٔ پیام آزاد نمی‌دهد."
        : "پاسخ در این گفتگو ممکن نیست.",
    );
  }
  if (input.scheduleAt && input.scheduleAt.getTime() > Date.now() + WINDOW_MS) {
    throw errors.invalid("زمان‌بندی نمی‌تواند بیرون از پنجرهٔ ۲۴ ساعته باشد.");
  }

  const idempotencyKey = `${input.conversationId}:${input.scheduleAt ? input.scheduleAt.toISOString() : "now"}:${text.length}:${text.slice(0, 40)}`;
  const mode = env.OUTBOUND_MODE;
  const scheduledFor = input.scheduleAt && input.scheduleAt.getTime() > Date.now() + 5_000 ? input.scheduleAt : null;

  const row = await prisma.outboundMessage.upsert({
    where: { tenantId_idempotencyKey: { tenantId: ctx.tenant.id, idempotencyKey } },
    update: {},
    create: {
      tenantId: ctx.tenant.id,
      conversationId: input.conversationId,
      templateKey: "manual_reply",
      templateVersion: "v1",
      body: input.quickReplies?.length ? `${text}\u001f${JSON.stringify(input.quickReplies)}` : text,
      status: mode === "live" ? "queued" : "draft",
      queuedAt: scheduledFor ?? new Date(),
      idempotencyKey,
    },
    select: { id: true, status: true },
  });

  if (mode === "live" && scheduledFor) {
    await prisma.job.create({
      data: {
        tenantId: ctx.tenant.id,
        type: "send_outbound",
        payload: { outboundId: row.id },
        runAt: scheduledFor,
        dedupeKey: `send_outbound:${row.id}`,
        maxAttempts: 3,
      },
    });
  }

  return {
    id: row.id,
    status: mode === "live" ? "queued" : "draft",
    mode,
    scheduledFor: scheduledFor?.toISOString() ?? null,
    idempotencyKey,
  };
}

/** Payload body → text + quick replies (the separator keeps the two apart). */
function parseBody(body: string): { text: string; quickReplies: string[] } {
  const [text, extras] = body.split("\u001f");
  if (!extras) return { text, quickReplies: [] };
  try {
    const parsed = JSON.parse(extras) as unknown;
    return { text, quickReplies: Array.isArray(parsed) ? parsed.filter((q): q is string => typeof q === "string") : [] };
  } catch {
    return { text, quickReplies: [] };
  }
}

export type DeliveryOutcome = { delivered: boolean; providerRef: string | null; reason?: string };

/**
 * Deliver a queued outbound row. Called by the worker for scheduled sends and by
 * the inline path when the seller approves a reply immediately.
 *
 * In preview mode this is a deliberate no-op: it records `delivery_unknown` with a
 * reason instead of pretending. A provider id is the only proof of delivery.
 */
export async function deliverOutbound(outboundId: string): Promise<DeliveryOutcome> {
  const row = await prisma.outboundMessage.findUnique({
    where: { id: outboundId },
    select: { id: true, tenantId: true, conversationId: true, body: true, status: true },
  });
  if (!row) return { delivered: false, providerRef: null, reason: "not_found" };
  if (row.status === "sent") return { delivered: true, providerRef: null, reason: "already_sent" };
  if (!row.conversationId) return { delivered: false, providerRef: null, reason: "no_conversation" };

  if (env.OUTBOUND_MODE !== "live") {
    await prisma.outboundMessage.update({
      where: { id: row.id },
      data: { status: "delivery_unknown", failedReason: "preview mode: nothing was sent to the customer" },
    });
    return { delivered: false, providerRef: null, reason: "preview_mode" };
  }

  const conversation = await prisma.conversation.findFirst({
    where: { id: row.conversationId, tenantId: row.tenantId },
    select: { channelRef: true, connection: { select: { accountRef: true, channel: true, status: true } } },
  });
  if (!conversation || conversation.connection.channel !== "instagram") {
    return { delivered: false, providerRef: null, reason: "not_instagram" };
  }

  const token = await accessTokenFor(row.tenantId, conversation.connection.accountRef);
  if (!token) {
    await prisma.outboundMessage.update({
      where: { id: row.id },
      data: { status: "failed", failedReason: "no channel token" },
    });
    return { delivered: false, providerRef: null, reason: "no_token" };
  }

  const { text, quickReplies } = parseBody(row.body);
  const payload: Record<string, unknown> = {
    recipient: { id: conversation.channelRef },
    message: { text },
  };
  if (quickReplies.length > 0) {
    (payload.message as Record<string, unknown>).quick_replies = quickReplies.map((title) => ({ content_type: "text", title }));
  }

  await prisma.outboundMessage.update({ where: { id: row.id }, data: { status: "sending" } });

  try {
    const response = await fetch(
      `https://graph.instagram.com/v23.0/me/messages?access_token=${encodeURIComponent(token)}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      },
    );
    const body = (await response.json().catch(() => null)) as { message_id?: string; error?: { message?: string } } | null;
    if (!response.ok || !body?.message_id) {
      await prisma.outboundMessage.update({
        where: { id: row.id },
        data: { status: "failed", failedReason: body?.error?.message?.slice(0, 300) ?? `HTTP ${response.status}` },
      });
      return { delivered: false, providerRef: null, reason: "provider_rejected" };
    }

    await prisma.outboundMessage.update({
      where: { id: row.id },
      data: { status: "sent", providerRef: body.message_id, sentAt: new Date() },
    });
    return { delivered: true, providerRef: body.message_id };
  } catch (error) {
    await prisma.outboundMessage.update({
      where: { id: row.id },
      data: {
        status: "delivery_unknown",
        failedReason: error instanceof Error ? error.message.slice(0, 300) : "network error",
      },
    });
    return { delivered: false, providerRef: null, reason: "network" };
  }
}
