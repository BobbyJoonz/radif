import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { EvaluationScreen } from "@/components/screens/evaluation-screen";
import { readDesignedState } from "@/components/ui";
import { getDictionary } from "@/i18n";
import { isLocale, withLocale, type Locale } from "@/i18n/config";
import { getSessionContext } from "@/server/session";
import { canSee, type NavKey } from "@/lib/nav-matrix";
import { listRuns } from "@/server/services/evaluation";
import type { EvaluationRow } from "@/lib/dto";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  return { title: getDictionary(isLocale(locale) ? locale : "fa").nav.evaluation };
}

export default async function EvaluationPage({
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
  // Menu hiding is not authorisation: the page itself refuses a principal that the
  // matrix does not list for this section.
  if (!canSee(ctx.role, "evaluation" as NavKey)) redirect(withLocale(locale, "/today?denied=evaluation"));

  let state = readDesignedState(sp.state);
  let rows: EvaluationRow[] = [];

  if (!state) {
    try {
      rows = await listRuns(ctx);
      if (rows.length === 0) state = "empty";
    } catch (error) {
      console.error("[evaluation] read failed", error);
      state = "error";
    }
  }

  return <EvaluationScreen locale={locale} rows={rows} state={state} nowISO={new Date().toISOString()} />;
}
