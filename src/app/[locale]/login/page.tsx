import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LoginScreen } from "@/components/screens/login-screen";
import { readDesignedState } from "@/components/ui";
import { getDictionary } from "@/i18n";
import { isLocale, withLocale, type Locale } from "@/i18n/config";
import { isDemo } from "@/lib/env";
import { getSessionContext } from "@/server/session";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const dict = getDictionary(isLocale(locale) ? locale : "fa");
  return { title: locale === "fa" ? "ورود" : "Sign in" };
}

export default async function LoginPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale: raw } = await params;
  const locale: Locale = isLocale(raw) ? raw : "fa";
  const sp = await searchParams;

  // Already signed in? Go to the queue rather than showing a login form.
  const session = await getSessionContext();
  if (session) redirect(withLocale(locale, "/"));

  const next = typeof sp.next === "string" ? sp.next : null;
  const state = readDesignedState(sp.state);
  const dict = getDictionary(locale);
  void dict;

  return <LoginScreen locale={locale} nextPath={next} state={state} demoMode={isDemo()} />;
}
