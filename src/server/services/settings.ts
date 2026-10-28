import { z } from "zod";
import { prisma } from "@/server/db";
import type { SessionContext } from "@/server/session";
import { errors } from "@/server/http";
import type { SettingsDTO } from "@/lib/dto";
import { env } from "@/lib/env";
import { canVerifyPayments } from "@/server/domain/state";

/**
 * Settings (CONTRACTS §4, §5). Owner-only, and validated twice: the route parses
 * the body with `settingsPatchSchema` and the database repeats the workday rule as
 * `TenantSettings_workday`, so an impossible working day cannot be stored by any
 * path.
 *
 * Nothing here returns token material: `ChannelConnection.sealedToken` is never
 * selected, only the four fields the screen needs.
 */

/** `SettingsPatch` — declared here because CONTRACTS §5 names it without a DTO. */
export const settingsPatchSchema = z
  .object({
    workday: z
      .object({
        startMin: z.number().int().min(0).max(1439),
        endMin: z.number().int().min(1).max(1440),
      })
      .strict()
      .refine((value) => value.startMin < value.endMin, {
        message: "پایان روز کاری باید بعد از شروع آن باشد.",
        path: ["endMin"],
      })
      .optional(),
    sla: z
      .object({
        firstReplyMin: z.number().int().min(1).max(10_080),
        shipMin: z.number().int().min(1).max(43_200),
      })
      .strict()
      .optional(),
    priceFreshnessMin: z.number().int().min(1).max(43_200).optional(),
    postingPaused: z.boolean().optional(),
  })
  .strict();

export type SettingsPatch = z.infer<typeof settingsPatchSchema>;

/** A connection is "live" only when the shop is actually ingesting live traffic. */
function connectionIsLive(channel: string, status: string): boolean {
  if (env.INGESTION_MODE !== "live") return false;
  return channel === "instagram" && (status === "connected" || status === "ready");
}

export async function getSettings(ctx: SessionContext): Promise<SettingsDTO> {
  const [settings, connections] = await Promise.all([
    prisma.tenantSettings.findUnique({ where: { tenantId: ctx.tenant.id } }),
    getConnections(ctx),
  ]);

  return {
    tenant: {
      id: ctx.tenant.id,
      nameFa: ctx.tenant.nameFa,
      nameEn: ctx.tenant.nameEn,
      timezone: ctx.tenant.timezone,
      currency: ctx.tenant.currency,
      isDemo: ctx.tenant.isDemo,
    },
    workday: {
      startMin: settings?.workdayStartMin ?? ctx.settings.workdayStartMin,
      endMin: settings?.workdayEndMin ?? ctx.settings.workdayEndMin,
    },
    sla: {
      firstReplyMin: settings?.slaFirstReplyMin ?? ctx.settings.slaFirstReplyMin,
      shipMin: settings?.slaShipMin ?? ctx.settings.slaShipMin,
    },
    priceFreshnessMin: settings?.priceFreshnessMin ?? ctx.settings.priceFreshnessMin,
    postingPaused: settings?.postingPaused ?? ctx.settings.postingPaused,
    connections,
    modes: {
      appMode: env.APP_MODE,
      ingestion: env.INGESTION_MODE,
      decisionProvider: env.DECISION_PROVIDER,
      outbound: env.OUTBOUND_MODE,
      liveAutomation: env.LIVE_AUTOMATION_ENABLED,
    },
    rateLimits: {
      loginPerMin: env.RATE_LIMIT_LOGIN_PER_MIN,
      importPerMin: env.RATE_LIMIT_IMPORT_PER_MIN,
    },
  };
}

/**
 * Only an owner changes the shop's clock, its SLA or whether posting is paused.
 * The check is here as well as on the route: the service is the last line, and a
 * new caller must not have to remember it (rule 10's spirit, applied to settings).
 */
export async function updateSettings(ctx: SessionContext, patch: SettingsPatch): Promise<SettingsDTO> {
  if (!canVerifyPayments(ctx.role)) {
    throw errors.forbidden("تغییر تنظیمات فروشگاه فقط با نقش «مالک» انجام می‌شود.");
  }

  const tenantId = ctx.tenant.id;
  const before = await prisma.tenantSettings.findUnique({ where: { tenantId } });

  await prisma.$transaction(async (tx) => {
    const data = {
      ...(patch.workday ? { workdayStartMin: patch.workday.startMin, workdayEndMin: patch.workday.endMin } : {}),
      ...(patch.sla ? { slaFirstReplyMin: patch.sla.firstReplyMin, slaShipMin: patch.sla.shipMin } : {}),
      ...(patch.priceFreshnessMin !== undefined ? { priceFreshnessMin: patch.priceFreshnessMin } : {}),
      ...(patch.postingPaused !== undefined ? { postingPaused: patch.postingPaused } : {}),
    };

    await tx.tenantSettings.upsert({
      where: { tenantId },
      create: {
        tenantId,
        workdayStartMin: patch.workday?.startMin ?? ctx.settings.workdayStartMin,
        workdayEndMin: patch.workday?.endMin ?? ctx.settings.workdayEndMin,
        slaFirstReplyMin: patch.sla?.firstReplyMin ?? ctx.settings.slaFirstReplyMin,
        slaShipMin: patch.sla?.shipMin ?? ctx.settings.slaShipMin,
        priceFreshnessMin: patch.priceFreshnessMin ?? ctx.settings.priceFreshnessMin,
        postingPaused: patch.postingPaused ?? ctx.settings.postingPaused,
      },
      update: data,
    });

    await tx.auditEvent.create({
      data: {
        tenantId,
        actorType: "user",
        actorId: ctx.user.id,
        action: "settings.updated",
        entityType: "tenant_settings",
        entityId: tenantId,
        ...(before
          ? {
              before: {
                workdayStartMin: before.workdayStartMin,
                workdayEndMin: before.workdayEndMin,
                slaFirstReplyMin: before.slaFirstReplyMin,
                slaShipMin: before.slaShipMin,
                priceFreshnessMin: before.priceFreshnessMin,
                postingPaused: before.postingPaused,
              },
            }
          : {}),
        after: {
          ...(patch.workday ? { workdayStartMin: patch.workday.startMin, workdayEndMin: patch.workday.endMin } : {}),
          ...(patch.sla ? { slaFirstReplyMin: patch.sla.firstReplyMin, slaShipMin: patch.sla.shipMin } : {}),
          ...(patch.priceFreshnessMin !== undefined ? { priceFreshnessMin: patch.priceFreshnessMin } : {}),
          ...(patch.postingPaused !== undefined ? { postingPaused: patch.postingPaused } : {}),
        },
      },
    });
  });

  return getSettings(ctx);
}

/** The Connections list — tenant-scoped, no secrets, `live` computed from env. */
export async function getConnections(ctx: SessionContext): Promise<SettingsDTO["connections"]> {
  const connections = await prisma.channelConnection.findMany({
    where: { tenantId: ctx.tenant.id },
    select: {
      id: true,
      channel: true,
      accountRef: true,
      displayName: true,
      status: true,
      lastSyncAt: true,
    },
    orderBy: [{ channel: "asc" }, { accountRef: "asc" }],
  });

  return connections.map((connection) => ({
    id: connection.id,
    channel: connection.channel,
    accountRef: connection.accountRef,
    displayName: connection.displayName,
    status: connection.status,
    lastSyncAt: connection.lastSyncAt?.toISOString() ?? null,
    live: connectionIsLive(connection.channel, connection.status),
  }));
}
