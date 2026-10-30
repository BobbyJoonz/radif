import type { Metadata } from "next";
import Link from "next/link";
import { BrandMark } from "@/components/brand/brand-mark";
import { SignupForm } from "@/components/marketing/signup-form";
import { isLocale, type Locale } from "@/i18n/config";
import { getMarketingCopy } from "@/i18n/marketing";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = getMarketingCopy(isLocale(locale) ? locale : "fa");
  return { title: t.signup.title };
}

export default async function SignupPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const loc: Locale = isLocale(locale) ? locale : "fa";
  return (
    <div className="signup-shell">
      <header className="signup-head">
        <Link href={`/${loc}`} aria-label="ردیف · Radif">
          <BrandMark priority />
        </Link>
      </header>
      <main>
        <SignupForm locale={loc} />
      </main>
    </div>
  );
}
