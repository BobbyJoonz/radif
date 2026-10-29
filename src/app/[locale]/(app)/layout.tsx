import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import "../../globals.css";
import { SetupScreen } from "@/components/brand/setup-screen";
import { AppShell } from "@/components/shell/app-shell";
import { getDictionary } from "@/i18n";
import { isLocale, withLocale, type Locale } from "@/i18n/config";
import { missingRequiredEnv } from "@/lib/env";
import { getSessionContext } from "@/server/session";
import { getLastSync, getShellCounts } from "@/server/services/shell";

/**
 * Everything under (app) requires a session and a membership. The redirect
 * happens on the server before any data is read, so an anonymous visitor never
 * gets a flash of an empty queue, and never gets a query result.
 */
export default async function AppLayout({ children, params }: LayoutProps<"/[locale]">) {
  const { locale: raw } = await params;
  const locale: Locale = isLocale(raw) ? raw : "fa";

  const missing = missingRequiredEnv();
  if (missing.length > 0) return <SetupScreen missing={missing} />;

  const session = await getSessionContext();
  if (!session) redirect(withLocale(locale, "/login"));

  const dict = getDictionary(locale);
  const [counts, lastSyncAt] = await Promise.all([
    getShellCounts(session.tenant.id),
    getLastSync(session.tenant.id),
  ]);

  return (
    <AppShell
      locale={locale}
      dict={dict}
      session={{
        userName: session.user.name,
        shopName: locale === "fa" ? session.tenant.nameFa : session.tenant.nameEn,
        role: session.role,
        demo: session.tenant.isDemo,
        lastSyncAt,
      }}
      counts={{ overdue: counts.overdue, needsReview: counts.needsReview }}
    >
      {children}
    </AppShell>
  );
}
