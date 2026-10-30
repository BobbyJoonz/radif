import type { Metadata } from "next";
import { Landing } from "@/components/marketing/landing";
import { getMarketingCopy } from "@/i18n/marketing";
import { isLocale, type Locale } from "@/i18n/config";
import { getSessionContext } from "@/server/session";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const loc: Locale = isLocale(locale) ? locale : "fa";
  const t = getMarketingCopy(loc);
  const title = loc === "fa" ? "ردیف — هر دایرکت، سرِ ردیفش." : "Radif — every DM finds its row";
  return {
    title,
    description: t.hero.lede,
    openGraph: { title, description: t.hero.lede, images: [{ url: "/og.png", width: 1200, height: 630 }] },
  };
}

export default async function MarketingPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const loc: Locale = isLocale(locale) ? locale : "fa";

  // Signed-in visitors get "open the queue" instead of "start free"; a broken
  // environment must not take the public page down, so this is best-effort.
  let signedIn = false;
  try {
    signedIn = (await getSessionContext()) !== null;
  } catch {
    signedIn = false;
  }

  return <Landing locale={loc} signedIn={signedIn} />;
}
