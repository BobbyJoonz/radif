import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/server/db";
import { enqueueAnalysis } from "@/server/ingestion/ingest";
import type { InboundMessage } from "@/server/channels/instagram/api";

/**
 * Ingesting what arrives in a connected account's DMs.
 *
 * This is the write side of the read-only channel: it maps a Meta event onto the
 * same tables the replay demo uses, so a live message and a replayed one behave
 * identically from the worker onwards — including the analysis job, which is
 * enqueued in the same transaction as the message.
 *
 * Guarantees:
 *   • the shop is resolved from `ChannelConnection.accountRef`, never from the
 *     payload (a webhook body cannot choose a tenant);
 *   • a provider message id is stored once (a webhook retry is a duplicate, not a
 *     second conversation);
 *   • a revoked or expired connection is ignored instead of producing rows nobody
 *     can act on.
 */

export type IngestResult = { stored: number; duplicates: number; ignored: number; unknownAccount: number };

export async function ingestInbound(events: readonly InboundMessage[]): Promise<IngestResult> {
  const result: IngestResult = { stored: 0, duplicates: 0, ignored: 0, unknownAccount: 0 };
  const touched = new Set<string>();

  for (const event of events) {
    const connection = await prisma.channelConnection.findFirst({
      where: { channel: "instagram", accountRef: event.accountId },
      select: { id: true, tenantId: true, status: true },
    });
    if (!connection) {
      result.unknownAccount += 1;
      continue;
    }
    if (connection.status === "revoked" || connection.status === "expired") {
      result.ignored += 1;
      continue;
    }

    const existing = await prisma.message.findFirst({
      where: { tenantId: connection.tenantId, source: "instagram", externalRef: event.messageId },
      select: { id: true },
    });
    if (existing) {
      result.duplicates += 1;
      continue;
    }

    await prisma.$transaction(async (tx) => {
      const customerId = await resolveCustomer(tx, connection.id, connection.tenantId, event);
      const conversationId = await resolveConversation(tx, connection.id, connection.tenantId, customerId, event);

      const message = await tx.message.create({
        data: {
          tenantId: connection.tenantId,
          conversationId,
          direction: "inbound",
          source: "instagram",
          externalRef: event.messageId,
          senderRef: event.senderId,
          text: event.text,
          occurredAt: event.occurredAt,
          analysisState: "pending",
        },
        select: { id: true },
      });

      // Same path as replay: the stored message becomes an analysis job, so the
      // worker produces suggestions and tasks without knowing where it came from.
      await enqueueAnalysis(tx, connection.tenantId, message.id, event.occurredAt);
    });

    touched.add(connection.id);
    result.stored += 1;
  }

  if (touched.size > 0) {
    await prisma.channelConnection.updateMany({
      where: { id: { in: [...touched] } },
      data: { lastSyncAt: new Date() },
    });
  }

  return result;
}

async function resolveCustomer(
  tx: Prisma.TransactionClient,
  connectionId: string,
  tenantId: string,
  event: InboundMessage,
): Promise<string> {
  const identity = await tx.customerIdentity.findFirst({
    where: { connectionId, kind: "instagram_user_id", externalRef: event.senderId },
    select: { customerId: true },
  });
  if (identity) return identity.customerId;

  const customer = await tx.customer.create({
    data: {
      tenantId,
      displayName: event.senderUsername ? `@${event.senderUsername}` : `اینستاگرام ${event.senderId.slice(-6)}`,
    },
    select: { id: true },
  });
  await tx.customerIdentity.create({
    data: {
      tenantId,
      customerId: customer.id,
      connectionId,
      kind: "instagram_user_id",
      externalRef: event.senderId,
      verifiedAt: event.occurredAt,
    },
  });
  if (event.senderUsername) {
    await tx.customerIdentity.create({
      data: {
        tenantId,
        customerId: customer.id,
        connectionId,
        kind: "instagram_username",
        externalRef: event.senderUsername,
      },
    });
  }
  return customer.id;
}

async function resolveConversation(
  tx: Prisma.TransactionClient,
  connectionId: string,
  tenantId: string,
  customerId: string,
  event: InboundMessage,
): Promise<string> {
  const conversation = await tx.conversation.upsert({
    where: { connectionId_channelRef: { connectionId, channelRef: event.senderId } },
    update: { lastMessageAt: event.occurredAt, unrepliedCount: { increment: 1 } },
    create: {
      tenantId,
      connectionId,
      customerId,
      channelRef: event.senderId,
      lastMessageAt: event.occurredAt,
      unrepliedCount: 1,
      createdAt: event.occurredAt,
    },
    select: { id: true },
  });
  return conversation.id;
}
