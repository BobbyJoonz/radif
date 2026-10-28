import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ImportScreen } from "@/components/screens/import-screen";
import { readDesignedState } from "@/components/ui";
import { getDictionary } from "@/i18n";
import { isLocale, withLocale, type Locale } from "@/i18n/config";
import { getSessionContext } from "@/server/session";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  return { title: getDictionary(isLocale(locale) ? locale : "fa").nav.import };
}

export default async function ImportPage({
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

  const state = readDesignedState(sp.state);

  return <ImportScreen locale={locale} state={state} role={ctx.role} />;
}
