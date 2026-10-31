import { prisma } from "@/server/db";
import { errors } from "@/server/http";
import type { SessionContext } from "@/server/session";
import { sealToken, unsealToken } from "@/server/crypto/seal";
import {
  InstagramError,
  buildAuthUrl,
  exchangeCode,
  instagramConfig,
  signState,
  verifyState,
  type InboundMessage,
} from "@/server/channels/instagram/api";

/**
 * Connecting an Instagram account and ingesting what arrives in its DMs.
 *
 * Scope of this iteration: **read only**. A shop can link an account, its incoming
 * messages land in the same tables the replay demo uses, and the workdesk analyses
 * them. Sending is deliberately absent — the UI must not claim a reply was sent.
 *
 * Multi-tenant safety:
 *   • only an owner may start the connect flow;
 *   • `state` is signed, short-lived and carries the tenant, so a code exchanged on
 *     one shop can never attach to another;
 *   • a webhook is mapped to a tenant through `ChannelConnection.accountRef` (the
 *     Instagram user id), never through anything in the payload body.
 */

export function instagramStatus() {
  const config = instagramConfig();
  return {
    configured: config.configured,
    verifyTokenSet: Boolean(config.verifyToken),
    graphVersion: config.graphVersion,
  };
}

export async function startConnect(ctx: SessionContext, redirectUri: string): Promise<string> {
  if (ctx.role !== "owner") throw errors.forbidden("اتصال کانال فقط با نقش «مالک» انجام می‌شود.");
  const config = instagramConfig();
  if (!config.configured || !config.appSecret) {
    throw errors.invalid("INSTAGRAM_APP_ID و INSTAGRAM_APP_SECRET تنظیم نشده‌اند.");
  }
  const state = signState({ tenantId: ctx.tenant.id, userId: ctx.user.id }, config.appSecret);
  return buildAuthUrl({ appId: config.appId as string, redirectUri, state });
}

export type ConnectedAccount = { accountRef: string; username: string; expiresAt: string };

export async function completeConnect(
  ctx: SessionContext,
  input: { code: string; state: string; redirectUri: string },
): Promise<ConnectedAccount> {
  if (ctx.role !== "owner") throw errors.forbidden("اتصال کانال فقط با نقش «مالک» انجام می‌شود.");
  const config = instagramConfig();
  if (!config.configured || !config.appSecret) throw errors.invalid("اتصال اینستاگرام پیکربندی نشده است.");

  let tenantId: string;
  try {
    const state = verifyState(input.state, config.appSecret);
    tenantId = state.tenantId;
  } catch (error) {
    throw errors.invalid(error instanceof InstagramError ? error.message : "state نامعتبر است.");
  }
  // The signed state carries the tenant the flow started in; a session from another
  // shop must not complete it.
  if (tenantId !== ctx.tenant.id) throw errors.forbidden("این اتصال به فروشگاه دیگری تعلق دارد.");

  let result;
  try {
    result = await exchangeCode({
      code: input.code,
      redirectUri: input.redirectUri,
      appId: config.appId as string,
      appSecret: config.appSecret,
    });
  } catch (error) {
    throw errors.upstream(
      error instanceof InstagramError ? `متا درخواست را رد کرد (${error.status ?? "?"}).` : "تبادل کد با متا ناموفق بود.",
    );
  }

  const connection = await prisma.channelConnection.upsert({
    where: { tenantId_channel_accountRef: { tenantId: ctx.tenant.id, channel: "instagram", accountRef: result.userId } },
    update: {
      displayName: `@${result.username}`,
      status: "connected",
      sealedToken: sealToken(result.accessToken, ctx.tenant.id),
      tokenExpiresAt: result.expiresAt,
      lastSyncAt: new Date(),
      configUpdatedAt: new Date(),
    },
    create: {
      tenantId: ctx.tenant.id,
      channel: "instagram",
      accountRef: result.userId,
      displayName: `@${result.username}`,
      status: "connected",
      sealedToken: sealToken(result.accessToken, ctx.tenant.id),
      tokenExpiresAt: result.expiresAt,
      lastSyncAt: new Date(),
    },
    select: { accountRef: true, displayName: true, tokenExpiresAt: true },
  });

  await prisma.auditEvent.create({
    data: {
      tenantId: ctx.tenant.id,
      actorType: "user",
      actorId: ctx.user.id,
      action: "channel.instagram_connected",
      entityType: "ChannelConnection",
      entityId: connection.accountRef,
      after: { username: result.username, expiresAt: result.expiresAt.toISOString() },
    },
  });

  return {
    accountRef: connection.accountRef,
    username: connection.displayName,
    expiresAt: (connection.tokenExpiresAt ?? result.expiresAt).toISOString(),
  };
}

export type IngestResult = { stored: number; duplicates: number; ignored: number; unknownAccount: number };

/**
 * Store inbound Instagram messages.
 *
 * Idempotent by provider message id: a webhook retry, or a replayed payload, cannot
 * create a second row or a second task. Everything else (analysis, suggestions,
 * tasks) is produced by the existing worker, so a live message behaves exactly like
 * a replayed one.
 */
export async function ingestInbound(events: readonly InboundMessage[]): Promise<IngestResult> {
  const result: IngestResult = { stored: 0, duplicates: 0, ignored: 0, unknownAccount: 0 };

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
      const identity = await tx.customerIdentity.findFirst({
        where: { connectionId: connection.id, kind: "instagram_user_id", externalRef: event.senderId },
        select: { customerId: true },
      });

      let customerId = identity?.customerId ?? null;
      if (!customerId) {
        const customer = await tx.customer.create({
          data: {
            tenantId: connection.tenantId,
            displayName: event.senderUsername ? `@${event.senderUsername}` : `اینستاگرام ${event.senderId.slice(-6)}`,
          },
          select: { id: true },
        });
        customerId = customer.id;
        await tx.customerIdentity.create({
          data: {
            tenantId: connection.tenantId,
            customerId,
            connectionId: connection.id,
            kind: "instagram_user_id",
            externalRef: event.senderId,
            verifiedAt: event.occurredAt,
          },
        });
        if (event.senderUsername) {
          await tx.customerIdentity.create({
            data: {
              tenantId: connection.tenantId,
              customerId,
              connectionId: connection.id,
              kind: "instagram_username",
              externalRef: event.senderUsername,
            },
          });
        }
      }

      const conversation = await tx.conversation.upsert({
        where: { connectionId_channelRef: { connectionId: connection.id, channelRef: event.senderId } },
        update: { lastMessageAt: event.occurredAt, unrepliedCount: { increment: 1 } },
        create: {
          tenantId: connection.tenantId,
          connectionId: connection.id,
          customerId: customerId as string,
          channelRef: event.senderId,
          lastMessageAt: event.occurredAt,
          unrepliedCount: 1,
          createdAt: event.occurredAt,
        },
        select: { id: true },
      });

      await tx.message.create({
        data: {
          tenantId: connection.tenantId,
          conversationId: conversation.id,
          direction: "inbound",
          source: "instagram",
          externalRef: event.messageId,
          senderRef: event.senderId,
          text: event.text,
          occurredAt: event.occurredAt,
          analysisState: "pending",
        },
      });
    });

    result.stored += 1;
  }

  return result;
}

/** Used by the health screen and the settings card: is this shop actually linked? */
export async function connectionSummary(tenantId: string) {
  const rows = await prisma.channelConnection.findMany({
    where: { tenantId, channel: "instagram" },
    select: { accountRef: true, displayName: true, status: true, tokenExpiresAt: true, lastSyncAt: true, sealedToken: true },
    orderBy: { createdAt: "desc" },
  });
  return rows.map((row) => ({
    accountRef: row.accountRef,
    displayName: row.displayName,
    status: row.tokenExpiresAt && row.tokenExpiresAt.getTime() < Date.now() ? "expired" : row.status,
    tokenExpiresAt: row.tokenExpiresAt?.toISOString() ?? null,
    lastSyncAt: row.lastSyncAt?.toISOString() ?? null,
    hasToken: Boolean(row.sealedToken),
  }));
}

/** Only the token-read path uses this; nothing else should ever unseal. */
export async function accessTokenFor(tenantId: string, accountRef: string): Promise<string | null> {
  const row = await prisma.channelConnection.findFirst({
    where: { tenantId, channel: "instagram", accountRef },
    select: { sealedToken: true },
  });
  if (!row?.sealedToken) return null;
  return unsealToken(row.sealedToken, tenantId);
}
