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
} from "@/server/channels/instagram/api";

/**
 * The connect flow (OAuth) and the state of a shop's Instagram link.
 *
 * Only an owner may connect. The tenant travels inside a signed, short-lived
 * `state`, so an authorization code exchanged in one shop can never attach to
 * another, and the token is sealed with that tenant as associated data.
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
    tenantId = verifyState(input.state, config.appSecret).tenantId;
  } catch (error) {
    throw errors.invalid(error instanceof InstagramError ? error.message : "state نامعتبر است.");
  }
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
    // Never surface Meta's raw body: it can contain token fragments.
    throw errors.upstream(
      error instanceof InstagramError ? `متا درخواست را رد کرد (${error.status ?? "?"}).` : "تبادل کد با متا ناموفق بود.",
    );
  }

  const sealed = sealToken(result.accessToken, ctx.tenant.id);
  const connection = await prisma.channelConnection.upsert({
    where: { tenantId_channel_accountRef: { tenantId: ctx.tenant.id, channel: "instagram", accountRef: result.userId } },
    update: {
      displayName: `@${result.username}`,
      status: "connected",
      sealedToken: sealed,
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
      sealedToken: sealed,
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

export async function disconnect(ctx: SessionContext, accountRef: string): Promise<void> {
  if (ctx.role !== "owner") throw errors.forbidden("قطع اتصال کانال فقط با نقش «مالک» انجام می‌شود.");
  const row = await prisma.channelConnection.findFirst({
    where: { tenantId: ctx.tenant.id, channel: "instagram", accountRef },
    select: { id: true },
  });
  if (!row) throw errors.notFound("این اتصال پیدا نشد.");

  await prisma.$transaction(async (tx) => {
    // The token is destroyed, not just flagged: a revoked link must not be revivable
    // by flipping a status field back.
    await tx.channelConnection.update({
      where: { id: row.id },
      data: { status: "revoked", sealedToken: null, tokenExpiresAt: null, configUpdatedAt: new Date() },
    });
    await tx.auditEvent.create({
      data: {
        tenantId: ctx.tenant.id,
        actorType: "user",
        actorId: ctx.user.id,
        action: "channel.instagram_disconnected",
        entityType: "ChannelConnection",
        entityId: accountRef,
      },
    });
  });
}

/** What the settings card shows; never includes token material. */
export async function connectionSummary(tenantId: string) {
  const rows = await prisma.channelConnection.findMany({
    where: { tenantId, channel: "instagram" },
    select: { accountRef: true, displayName: true, status: true, tokenExpiresAt: true, lastSyncAt: true, sealedToken: true },
    orderBy: { createdAt: "desc" },
  });
  return rows.map((row) => ({
    accountRef: row.accountRef,
    displayName: row.displayName,
    status: row.tokenExpiresAt && row.tokenExpiresAt.getTime() < Date.now() ? ("expired" as const) : row.status,
    tokenExpiresAt: row.tokenExpiresAt?.toISOString() ?? null,
    lastSyncAt: row.lastSyncAt?.toISOString() ?? null,
    hasToken: Boolean(row.sealedToken),
  }));
}

/** The only function allowed to unseal a channel token. */
export async function accessTokenFor(tenantId: string, accountRef: string): Promise<string | null> {
  const row = await prisma.channelConnection.findFirst({
    where: { tenantId, channel: "instagram", accountRef },
    select: { sealedToken: true },
  });
  if (!row?.sealedToken) return null;
  return unsealToken(row.sealedToken, tenantId);
}
