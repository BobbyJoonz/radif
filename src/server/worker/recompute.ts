import { prisma } from "@/server/db";
import type { Prisma } from "@/generated/prisma/client";
import { jobDedupeKey } from "@/server/domain/dedupe";
import type { ClaimedJob } from "./claim";
import { UnrecoverableJob, isUniqueViolation } from "./errors";

/**
 * `recompute_conversation` — the counters the Inbox and Today read.
 *
 * `unrepliedCount` is *derived*, not incremented: the number of inbound messages
 * after the seller's last outbound message. Deriving it makes the counter
 * self-healing — a crashed worker, a duplicate delivery or an out-of-order replay
 * cannot leave the badge permanently wrong, because the next run recomputes the
 * truth from the stored thread.
 */

export async function enqueueRecompute(input: {
  tenantId: string;
  conversationId: string;
  messageId: string;
  now?: Date;
}): Promise<string | null> {
  const now = input.now ?? new Date();
  // Scoped to the message as well as the conversation: one analysis produces one
  // recount, and a replay of the same message cannot create a second one.
  const dedupeKey = jobDedupeKey("recompute_conversation", input.conversationId, input.messageId);

  const existing = await prisma.job.findFirst({
    where: { tenantId: input.tenantId, dedupeKey },
    select: { id: true },
  });
  if (existing) return existing.id;

  try {
    const job = await prisma.job.create({
      data: {
        tenantId: input.tenantId,
        type: "recompute_conversation",
        payload: { conversationId: input.conversationId } as Prisma.InputJsonValue,
        status: "pending",
        dedupeKey,
        runAt: now,
        maxAttempts: 3,
      },
      select: { id: true },
    });
    return job.id;
  } catch (error) {
    if (isUniqueViolation(error)) return null;
    throw error;
  }
}

export async function recomputeConversation(job: ClaimedJob): Promise<void> {
  const conversationId = readConversationId(job.payload);

  const conversation = await prisma.conversation.findFirst({
    where: { id: conversationId, tenantId: job.tenantId },
    select: { id: true },
  });
  // The conversation was deleted with its tenant: the job has nothing to do.
  if (!conversation) return;

  const messages = await prisma.message.findMany({
    where: { tenantId: job.tenantId, conversationId },
    orderBy: [{ occurredAt: "asc" }, { id: "asc" }],
    select: { direction: true, occurredAt: true },
  });

  let unreplied = 0;
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index]!.direction !== "inbound") break;
    unreplied += 1;
  }

  const lastMessageAt = messages.length > 0 ? messages[messages.length - 1]!.occurredAt : null;

  await prisma.conversation.updateMany({
    where: { id: conversationId, tenantId: job.tenantId },
    data: { unrepliedCount: unreplied, lastMessageAt },
  });
}

function readConversationId(payload: unknown): string {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new UnrecoverableJob("payload کار «بازشماری گفتگو» شیء نیست.");
  }
  const record = payload as Record<string, unknown>;
  if (typeof record.conversationId !== "string" || record.conversationId.length === 0) {
    throw new UnrecoverableJob("payload کار «بازشماری گفتگو» شناسهٔ گفتگو ندارد.");
  }
  return record.conversationId;
}
