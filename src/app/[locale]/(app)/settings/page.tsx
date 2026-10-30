import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { SettingsScreen } from "@/components/screens/settings-screen";
import { readDesignedState } from "@/components/ui";
import { getDictionary } from "@/i18n";
import { isLocale, withLocale, type Locale } from "@/i18n/config";
import { getSessionContext } from "@/server/session";
import { getSettings } from "@/server/services/settings";
import type { SettingsDTO } from "@/lib/dto";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  return { title: getDictionary(isLocale(locale) ? locale : "fa").nav.settings };
}

export default async function SettingsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale: raw } = await params;
  const locale: Locale = isLocale(raw) ? raw : "fa";
  const sp = await searchParams;

  const ctx = await getSessionContext();
  if (!ctx) redirect(withLocale(locale, "/login"));

  let state = readDesignedState(sp.state);
  let settings: SettingsDTO | null = null;

  if (!state) {
    try {
      settings = await getSettings(ctx);
    } catch (error) {
      console.error("[settings] read failed", error);
      state = "error";
    }
  }

  // The screen is a document; without settings there is nothing honest to show.
  if (!settings) {
    return (
      <SettingsScreen
        locale={locale}
        role={ctx.role}
        email={ctx.user.email}
        state={state ?? "error"}
        settings={
          {
            tenant: {
              id: ctx.tenant.id,
              nameFa: ctx.tenant.nameFa,
              nameEn: ctx.tenant.nameEn,
              timezone: ctx.tenant.timezone,
              currency: ctx.tenant.currency,
              isDemo: ctx.tenant.isDemo,
            },
            workday: { startMin: ctx.settings.workdayStartMin, endMin: ctx.settings.workdayEndMin },
            sla: { firstReplyMin: ctx.settings.slaFirstReplyMin, shipMin: ctx.settings.slaShipMin },
            priceFreshnessMin: ctx.settings.priceFreshnessMin,
            postingPaused: ctx.settings.postingPaused,
            shippingPaused: false,
            pricing: { inputRatePerMTok: null, outputRatePerMTok: null, readAt: null },
            catalogue: [],
            connections: [],
            modes: {
              appMode: "demo",
              ingestion: "replay",
              decisionProvider: "mock",
              outbound: "preview",
              liveAutomation: false,
            },
            rateLimits: { loginPerMin: 10, importPerMin: 5 },
          } satisfies SettingsDTO
        }
      />
    );
  }

  return (
    <SettingsScreen
      locale={locale}
      role={ctx.role}
      email={ctx.user.email}
      state={state}
      settings={settings}
    />
  );
}
