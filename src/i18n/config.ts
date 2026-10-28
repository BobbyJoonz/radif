export const locales = ["fa", "en"] as const;
export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = "fa";

export const localeNames: Record<Locale, { native: string; english: string; dir: "rtl" | "ltr" }> = {
  fa: { native: "فارسی", english: "Persian", dir: "rtl" },
  en: { native: "English", english: "English", dir: "ltr" },
};

export function isLocale(value: string | undefined): value is Locale {
  return value === "fa" || value === "en";
}

export function directionOf(locale: Locale): "rtl" | "ltr" {
  return localeNames[locale].dir;
}

export function withLocale(locale: Locale, path: string): string {
  const clean = path.startsWith("/") ? path : `/${path}`;
  return `/${locale}${clean === "/" ? "" : clean}`;
}

export function otherLocale(locale: Locale): Locale {
  return locale === "fa" ? "en" : "fa";
}

export const LOCALE_COOKIE = "radif_locale";
