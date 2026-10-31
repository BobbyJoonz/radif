import { prisma } from "@/server/db";
import { handler, ok } from "@/server/http";
import { requireSession } from "@/server/session";
import { connectionSummary, instagramStatus } from "@/server/instagram";
import { accessTokenFor } from "@/server/instagram/connect";

/**
 * GET /api/channels/instagram/diagnostics — a checklist, not a hope.
 *
 * Each item is something the person setting up the Meta app has to get right, with
 * the current state attached, so "no messages are arriving" becomes a specific row
 * instead of a mystery.
 */
export const dynamic = "force-dynamic";

export const GET = handler(async (request: Request) => {
  const ctx = await requireSession();
  const status = instagramStatus();
  const connections = await connectionSummary(ctx.tenant.id);
  const origin = new URL(request.url).origin;

  const lastEvent = await prisma.webhookEvent.findFirst({
    where: { provider: "instagram" },
    orderBy: { receivedAt: "desc" },
    select: { receivedAt: true, processedAt: true, accountRef: true },
  });
  const pendingEvents = await prisma.webhookEvent.count({ where: { provider: "instagram", processedAt: null } });

  let tokenValid: "unknown" | "valid" | "invalid" | "absent" = "absent";
  const connection = connections[0];
  if (connection?.hasToken) {
    const token = await accessTokenFor(ctx.tenant.id, connection.accountRef);
    if (!token) tokenValid = "invalid";
    else {
      try {
        const response = await fetch(
          `https://graph.instagram.com/v23.0/me?fields=username&access_token=${encodeURIComponent(token)}`,
        );
        tokenValid = response.ok ? "valid" : "invalid";
      } catch {
        tokenValid = "unknown";
      }
    }
  }

  const checks = [
    {
      key: "app_credentials",
      ok: status.configured,
      label: "INSTAGRAM_APP_ID و INSTAGRAM_APP_SECRET",
      hint: "از Meta for Developers → App settings → Basic",
    },
    {
      key: "webhook_verify_token",
      ok: status.verifyTokenSet,
      label: "INSTAGRAM_WEBHOOK_VERIFY_TOKEN",
      hint: "همان مقداری که در Callback URL وبهوک وارد می‌کنید",
    },
    {
      key: "seal_key",
      ok: Boolean(process.env.CHANNEL_TOKEN_ENC_KEY),
      label: "CHANNEL_TOKEN_ENC_KEY",
      hint: "۶۴ کاراکتر هگز برای رمزنگاری توکن",
    },
    {
      key: "webhook_url",
      ok: true,
      label: "Callback URL وبهوک",
      value: `${origin}/api/webhooks/instagram`,
      hint: "در Meta → Webhooks → Instagram: رویداد messages را subscribe کنید",
    },
    {
      key: "connection",
      ok: connections.some((item) => item.status === "connected"),
      label: "اتصال اکانت",
      value: connection ? `${connection.displayName} (${connection.status})` : null,
      hint: "از همین صفحه، دکمهٔ اتصال اکانت اینستاگرام",
    },
    {
      key: "token",
      ok: tokenValid === "valid",
      label: "اعتبار توکن متا",
      value: tokenValid,
    },
    {
      key: "webhook_delivery",
      ok: lastEvent !== null,
      label: "آخرین وبهوک دریافتی",
      value: lastEvent ? `${lastEvent.receivedAt.toISOString()} (${lastEvent.processedAt ? "پردازش‌شده" : "در صف"})` : null,
      hint: "اگر این خالی است، هنوز هیچ رویدادی از متا نیامده",
    },
  ];

  return ok({
    checks,
    pendingWebhookEvents: pendingEvents,
    lastWebhookAt: lastEvent?.receivedAt.toISOString() ?? null,
    connections,
    graphVersion: status.graphVersion,
  });
});
