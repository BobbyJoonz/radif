import type { IngestResultDTO } from "@/lib/dto";
import type { SessionContext } from "@/server/session";
import { prisma } from "@/server/db";
import { env } from "@/lib/env";
import type { Prisma } from "@/generated/prisma/client";
import { contextHash, jobDedupeKey, PROMPT_VERSION, RULES_VERSION } from "@/server/domain/dedupe";
import { validateIncoming, type ValidatedIncoming } from "./schemas";

/**
 * Ingest: validate → resolve identities → store message → enqueue analysis.
 *
 * The rules this file exists to guarantee (CONTRACTS §6 rules 1, 12, 13):
 *
 *  • **One transaction.** The message, its AnalysisRun row and its Job are written
 *    in a single `$transaction`. There is no window in which a message exists with
 *    no job, or a job exists for a message that was rolled back.
 *  • **Idempotency.** `(tenantId, source, externalRef)` is unique. A second delivery
 *    of the same provider event returns the *existing* message id, creates no new
 *    row and no new job — even when two requests race (the unique index wins the
 *    race; we then re-read and answer "duplicate").
 *  • **Tenant from the server.** `tenantId` comes from the session (or, in the
 *    worker/seed, from an explicit internal reference). Nothing in the payload can
 *    set it; `incomingMessageSchema` is `.strict()` and rejects the attempt.
 *  • **Outbound is not a request.** A seller's own reply is stored and counted, but
 *    it is never queued for analysis: it has no intents to extract.
 */

export type TenantRef = {
  tenantId: string;
  /** The shop's timezone — used to read timestamps and to compute the day. */
  timeZone: string;
  isDemo: boolean;
};

export type IngestOptions = {
  now?: Date;
};

/** Does this error mean "a unique index rejected the insert"? */
function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: string }).code === "P2002";
}

/** JSON columns take plain JSON; this keeps the casts in one place. */
export function toJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

/** Ingest from an HTTP/service caller: the tenant comes from the session context. */
export async function ingestIncoming(
  ctx: SessionContext,
  payload: unknown,
  options: IngestOptions = {},
): Promise<IngestResultDTO> {
  const validated = validateIncoming(payload, ctx.tenant.timezone, options.now);
  return ingestValidated(
    { tenantId: ctx.tenant.id, timeZone: ctx.tenant.timezone, isDemo: ctx.tenant.isDemo },
    validated,
    options,
  );
}

/**
 * The core write. Exposed so the seed, the worker's own tests and the import
 * service can go through exactly the same path with an internal tenant reference.
 */
export async function ingestValidated(
  tenant: TenantRef,
  incoming: ValidatedIncoming,
  options: IngestOptions = {},
): Promise<IngestResultDTO> {
  const now = options.now ?? new Date();
  const { tenantId } = tenant;

  try {
    return await prisma.$transaction(async (tx) => {
      const channel = incoming.source === "replay" ? "replay" : incoming.source === "instagram" ? "instagram" : "file";
      const connection = await resolveConnection(tx, tenant, channel, incoming.accountRef);
      const customer = await resolveCustomer(tx, tenantId, connection.id, incoming.senderRef);
      const conversation = await resolveConversation(
        tx,
        tenantId,
        connection.id,
        customer.id,
        incoming.conversationRef,
      );

      const duplicate = await tx.message.findUnique({
        where: {
          tenantId_source_externalRef: {
            tenantId,
            source: incoming.source,
            externalRef: incoming.messageRef,
          },
        },
        select: { id: true },
      });
      if (duplicate) {
        return { messageId: duplicate.id, duplicate: true, jobId: null } satisfies IngestResultDTO;
      }

      const message = await tx.message.create({
        data: {
          tenantId,
          conversationId: conversation.id,
          direction: incoming.direction,
          source: incoming.source,
          externalRef: incoming.messageRef,
          senderRef: incoming.senderRef.toLowerCase(),
          text: incoming.text,
          attachments: toJson(incoming.attachments),
          occurredAt: incoming.occurredAt,
          ingestState: "stored",
          // An outbound reply needs no analysis; saying "pending" forever would
          // make it look like a stuck job in the Evaluation screen.
          analysisState: incoming.direction === "inbound" ? "pending" : "done",
        },
        select: { id: true },
      });

      await touchConversation(tx, conversation.id, incoming, now);

      if (incoming.direction === "outbound") {
        return { messageId: message.id, duplicate: false, jobId: null } satisfies IngestResultDTO;
      }

      const jobId = await enqueueAnalysis(tx, tenantId, message.id, now);
      return { messageId: message.id, duplicate: false, jobId } satisfies IngestResultDTO;
    });
  } catch (error) {
    // A concurrent delivery of the same provider event: the unique index decided,
    // and the honest answer is "this message already exists, here is its id".
    if (isUniqueViolation(error)) {
      const existing = await prisma.message.findUnique({
        where: {
          tenantId_source_externalRef: { tenantId, source: incoming.source, externalRef: incoming.messageRef },
        },
        select: { id: true },
      });
      if (existing) return { messageId: existing.id, duplicate: true, jobId: null };
    }
    throw error;
  }
}

/**
 * Create the AnalysisRun row and the queue job together.
 *
 * The run is created here (status `running`, `startedAt` null) so the retry route
 * can answer with a `runId` immediately; the worker fills `startedAt`, the real
 * context hash and the outcome. `running` with a null `startedAt` therefore means
 * "queued" — the enum has no separate value for it, and inventing a second boolean
 * column would be worse.
 */
export async function enqueueAnalysis(
  tx: Prisma.TransactionClient,
  tenantId: string,
  messageId: string,
  now: Date,
): Promise<string> {
  const provider = env.DECISION_PROVIDER;
  const model = provider === "mock" ? "mock-v1" : env.TYPESAFE_MODEL;

  const run = await tx.analysisRun.create({
    data: {
      tenantId,
      messageId,
      provider,
      model,
      promptVersion: PROMPT_VERSION,
      rulesVersion: RULES_VERSION,
      // Placeholder until the worker has the exact context it will send; the
      // worker always overwrites this before calling the provider.
      contextHash: contextHash({ tenantId, messageId, PROMPT_VERSION, RULES_VERSION, pending: true }),
      status: "running",
      queuedAt: now,
    },
    select: { id: true },
  });

  const job = await tx.job.create({
    data: {
      tenantId,
      type: "analyze_message",
      payload: toJson({ messageId, runId: run.id }),
      status: "pending",
      dedupeKey: jobDedupeKey("analyze", messageId, run.id),
      runAt: now,
      maxAttempts: 5,
    },
    select: { id: true },
  });

  return job.id;
}

/**
 * Find-or-create the channel connection a message arrived on.
 *
 * A connection is always scoped to the session's tenant, so creating one cannot
 * reach another shop. In demo mode it is `ready` (the replay channel really works);
 * outside demo it starts as `not_configured` so the Settings screen does not claim
 * a live Instagram connection that nobody authorised.
 */
async function resolveConnection(
  tx: Prisma.TransactionClient,
  tenant: TenantRef,
  channel: "file" | "replay" | "instagram",
  accountRef: string,
) {
  const existing = await tx.channelConnection.findUnique({
    where: { tenantId_channel_accountRef: { tenantId: tenant.tenantId, channel, accountRef } },
  });
  if (existing) return existing;

  return tx.channelConnection.create({
    data: {
      tenantId: tenant.tenantId,
      channel,
      accountRef,
      displayName: displayNameForChannel(channel, accountRef),
      status: tenant.isDemo && channel !== "instagram" ? "ready" : "not_configured",
    },
  });
}

function displayNameForChannel(channel: "file" | "replay" | "instagram", accountRef: string): string {
  if (channel === "replay") return "بازپخش نمایشی";
  if (channel === "file") return `ورودی فایل (${accountRef})`;
  return `اینستاگرام (${accountRef})`;
}

/**
 * Resolve the customer behind a sender identity.
 *
 * Identity is per connection and never merges customers: two handles that look
 * alike are two customers until a human says otherwise (brief §5 «مشتری‌ها»). The
 * message text never influences identity.
 */
async function resolveCustomer(
  tx: Prisma.TransactionClient,
  tenantId: string,
  connectionId: string,
  senderRef: string,
) {
  const externalRef = senderRef.trim().toLowerCase();
  const identity = await tx.customerIdentity.findUnique({
    where: { connectionId_kind_externalRef: { connectionId, kind: "instagram_username", externalRef } },
    include: { customer: true },
  });
  if (identity) return identity.customer;

  const customer = await tx.customer.create({
    data: { tenantId, displayName: senderRef.trim() },
  });
  await tx.customerIdentity.create({
    data: { tenantId, customerId: customer.id, connectionId, kind: "instagram_username", externalRef },
  });
  return customer;
}

async function resolveConversation(
  tx: Prisma.TransactionClient,
  tenantId: string,
  connectionId: string,
  customerId: string,
  conversationRef: string,
) {
  const existing = await tx.conversation.findUnique({
    where: { connectionId_channelRef: { connectionId, channelRef: conversationRef } },
  });
  if (existing) return existing;
  return tx.conversation.create({
    data: { tenantId, connectionId, customerId, channelRef: conversationRef, status: "open" },
  });
}

/**
 * Keep the conversation's counters usable for the Inbox before the worker runs.
 * The worker's `recompute_conversation` job is the authority; this is the honest
 * approximation that makes the first paint correct.
 */
async function touchConversation(
  tx: Prisma.TransactionClient,
  conversationId: string,
  incoming: ValidatedIncoming,
  now: Date,
): Promise<void> {
  const conversation = await tx.conversation.findUnique({
    where: { id: conversationId },
    select: { lastMessageAt: true, unrepliedCount: true },
  });
  if (!conversation) return;

  const isNewer = !conversation.lastMessageAt || incoming.occurredAt.getTime() >= conversation.lastMessageAt.getTime();
  const unrepliedCount =
    incoming.direction === "inbound"
      ? conversation.unrepliedCount + 1
      : 0; // the seller answered: nothing is waiting for a reply any more

  await tx.conversation.update({
    where: { id: conversationId },
    data: {
      unrepliedCount,
      ...(isNewer ? { lastMessageAt: incoming.occurredAt } : {}),
      updatedAt: now,
    },
  });
}

/** Ingest a batch (import commit). Sequential on purpose: one bad row must not roll back the good ones. */
export async function ingestBatch(
  tenant: TenantRef,
  messages: readonly ValidatedIncoming[],
  options: IngestOptions = {},
): Promise<{ results: IngestResultDTO[]; imported: number; duplicates: number }> {
  const results: IngestResultDTO[] = [];
  let imported = 0;
  let duplicates = 0;
  for (const message of messages) {
    const result = await ingestValidated(tenant, message, options);
    results.push(result);
    if (result.duplicate) duplicates += 1;
    else imported += 1;
  }
  return { results, imported, duplicates };
}
