import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getSessionContext } from "@/server/session";
import { withLocale } from "@/i18n/config";
import { isLocale, type Locale } from "@/i18n/config";
import { connectionSummary, instagramStatus } from "@/server/instagram";
import { accessTokenFor } from "@/server/instagram/connect";
import { prisma } from "@/server/db";
import { buildGuide, diagnose } from "@/server/instagram/guide";
import { ConnectInstagram, CopyValue } from "@/components/settings/connect-instagram";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "اتصال اینستاگرام · ردیف" };

/**
 * The connect guide, step by step.
 *
 * It is a page rather than a paragraph in settings because the failure mode is
 * operational: people get the app, the webhook URL, the verify token and the
 * `messages` subscription in slightly the wrong places, and then report "no messages".
 * Each step here shows its own state so the wrong one is visible.
 */
export default async function ConnectInstagramPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params;
  const locale: Locale = isLocale(raw) ? raw : "fa";
  const ctx = await getSessionContext();
  if (!ctx) redirect(withLocale(locale, "/login"));
  if (ctx.role !== "owner") redirect(withLocale(locale, "/today?denied=instagram"));

  const status = instagramStatus();
  const connections = await connectionSummary(ctx.tenant.id);
  const connection = connections[0] ?? null;

  let tokenStatus: "valid" | "invalid" | "unknown" | "absent" = "absent";
  if (connection?.hasToken) {
    const token = await accessTokenFor(ctx.tenant.id, connection.accountRef);
    if (!token) tokenStatus = "invalid";
    else {
      try {
        const response = await fetch(`https://graph.instagram.com/v23.0/me?fields=username&access_token=${encodeURIComponent(token)}`, { cache: "no-store" });
        tokenStatus = response.ok ? "valid" : "invalid";
      } catch {
        tokenStatus = "unknown";
      }
    }
  }

  const lastEvent = await prisma.webhookEvent.findFirst({
    where: { provider: "instagram" },
    orderBy: { receivedAt: "desc" },
    select: { receivedAt: true },
  });
  const pendingWebhooks = await prisma.webhookEvent.count({ where: { provider: "instagram", processedAt: null } });

  const origin = (await headers()).get("origin") ?? `https://${(await headers()).get("host") ?? "localhost:3000"}`;
  const view = buildGuide({
    appConfigured: status.configured,
    verifyTokenSet: status.verifyTokenSet,
    sealKeySet: Boolean(process.env.CHANNEL_TOKEN_ENC_KEY),
    webhookOrigin: origin,
    connectedAccount: connection?.displayName ?? null,
    tokenStatus,
    lastWebhookAt: lastEvent?.receivedAt.toISOString() ?? null,
    pendingWebhooks,
  });

  const fa = locale === "fa";

  return (
    <div className="igpage">
      <p className="ig-eyebrow">{fa ? "تنظیمات · اتصال اینستاگرام" : "Settings · Instagram"}</p>
      <h1 className="ig-title">{fa ? "اتصال حساب اینستاگرام" : "Connect your Instagram account"}</h1>
      <p className="ig-lede">
        {fa
          ? "شش قدم؛ هر قدم وضعیت خودش را دارد. وقتی همه سبز شدند، دایرکت‌ها در صندوق بالا می‌آیند."
          : "Six steps, each with its own state. When all are green, DMs appear in the inbox."}
      </p>

      {view.blocker ? (
        <p className="ig-blocker" role="alert">
          {view.blocker}
        </p>
      ) : null}

      <ol className="ig-steps">
        {view.steps.map((step) => (
          <li key={step.key} className="ig-step" data-ok={step.ok ? "true" : undefined}>
            <span className="ig-step-index">{step.index}</span>
            <div className="ig-step-body">
              <h2>{step.title}</h2>
              <p>{step.body}</p>
              {step.copyValue ? <CopyValue value={step.copyValue} label={fa ? "کپی آدرس وبهوک" : "Copy webhook URL"} /> : null}
              {step.hint ? <p className="ig-step-hint">{step.hint}</p> : null}
            </div>
            <span className="ig-step-state">{step.ok ? (fa ? "آماده" : "ok") : fa ? "باز" : "open"}</span>
          </li>
        ))}
      </ol>

      <section className="ig-final">
        <h2>{fa ? "اتصال و تشخیص" : "Connect and diagnose"}</h2>
        <p className="ig-lede">{diagnose({ lastWebhookAt: view.steps[4].ok ? "ok" : null, pendingWebhooks, tokenStatus })}</p>
        <ConnectInstagram locale={locale} connection={connection} canConnect={ctx.role === "owner"} />
      </section>

      <p className="ig-foot">
        <Link href={withLocale(locale, "/settings")}>{fa ? "بازگشت به تنظیمات" : "Back to settings"}</Link>
        {" · "}
        <a href="/api/channels/instagram/diagnostics">{fa ? "خروجی تشخیص (JSON)" : "Diagnostics (JSON)"}</a>
      </p>
    </div>
  );
}
