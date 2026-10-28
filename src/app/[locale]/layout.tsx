import type { Metadata, Viewport } from "next";
import "../globals.css";
import { directionOf, isLocale, locales, type Locale } from "@/i18n/config";

export const metadata: Metadata = {
  applicationName: "Radif",
  title: { default: "ردیف — میز سفارش فروشگاه", template: "%s · ردیف" },
  description:
    "ردیف: صف کار و سفارش برای فروشنده‌های اینستاگرامی. هر دایرکت به یک اقدام روشن تبدیل می‌شود — با شاهد، بدون ادعای بی‌مدرک.",
  formatDetection: { telephone: false },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#000014",
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
};

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

/**
 * The root layout lives inside the locale segment, which is the pattern the
 * Next 16 i18n guide documents: it is the only way `lang` and `dir` can be true
 * for the request instead of patched in at hydration.
 */
export default async function LocaleLayout({ children, params }: LayoutProps<"/[locale]">) {
  const { locale: raw } = await params;
  const locale: Locale = isLocale(raw) ? raw : "fa";
  const dir = directionOf(locale);

  return (
    <html lang={locale} dir={dir} suppressHydrationWarning>
      <head>
        {/* The two weights the first screen needs; the rest swap in. */}
        <link rel="preload" href="/fonts/peyda/Peyda-Regular.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
        <link rel="preload" href="/fonts/peyda/Peyda-SemiBold.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
      </head>
      <body>
        <noscript>
          <div className="noscript-banner">
            {locale === "fa"
              ? "این برنامه برای کار کردن به جاوااسکریپت نیاز دارد."
              : "This app needs JavaScript to work."}
          </div>
        </noscript>
        {children}
      </body>
    </html>
  );
}
