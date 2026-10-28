import type { Locale } from "./config";

/**
 * Presentation formatting. Pure functions, safe on server and client.
 *
 * Two digit policies, on purpose:
 *   • human-facing Persian text → Persian digits (۰۱۲۳…)
 *   • machine values (ids, tracking codes, usernames, phones, log timestamps)
 *     → Latin digits, wrapped by the caller in `<bdi class="ltr">`
 * The database always stores Latin digits; only this layer localises.
 */
const FA_DIGITS = ["۰", "۱", "۲", "۳", "۴", "۵", "۶", "۷", "۸", "۹"];

export function localeTag(locale: Locale, opts: { calendar?: "persian" } = {}): string {
  if (locale === "fa") return opts.calendar === "persian" ? "fa-IR-u-ca-persian" : "fa-IR";
  return "en-GB";
}

/** Latin digits → Persian digits, for fa only. Never apply to machine values. */
export function localizeDigits(input: string, locale: Locale): string {
  if (locale !== "fa") return input;
  return input.replace(/[0-9]/g, (d) => FA_DIGITS[Number(d)]);
}

/** Force Latin digits (machine values, inputs, copy-to-clipboard). */
export function latinDigits(input: string): string {
  return input
    .replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)));
}

export function formatNumber(value: number | bigint, locale: Locale, opts: Intl.NumberFormatOptions = {}): string {
  return new Intl.NumberFormat(localeTag(locale), opts).format(value);
}

export type MoneyUnit = "IRR" | "IRT";

/**
 * Money is stored as BigInt minor units of the tenant currency (IRR has no
 * minor unit in practice; we still keep the minor-unit convention so other
 * currencies can be added without a migration).
 *
 * Rial → Toman is an explicit, labelled conversion (÷10), never silent: the UI
 * prints «تومان» and the record keeps rial. See DIRECTOR.md §3 / the brief §8.
 */
export function formatMoney(
  minor: bigint | number | string,
  currency: MoneyUnit,
  locale: Locale,
  opts: { unit?: "rial" | "toman" | "auto"; withUnit?: boolean } = {},
): string {
  const raw = typeof minor === "bigint" ? minor : BigInt(Math.round(Number(minor)));
  const asToman = opts.unit === "toman";
  const value = asToman ? raw / BigInt(10) : raw;
  const num = formatNumber(value, locale);
  if (opts.withUnit === false) return num;
  if (currency === "IRR") {
    if (locale === "fa") return `${num} ${asToman ? "تومان" : "ریال"}`;
    return `${num} ${asToman ? "toman" : "rial"}`;
  }
  return `${num} ${currency}`;
}

const RTF = Intl.RelativeTimeFormat;

/** "۲ دقیقه پیش" / "۳ روز پیش" / "فردا" — relative near now, absolute far away. */
export function formatRelative(date: Date | string, now: Date, locale: Locale): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const diffMs = d.getTime() - now.getTime();
  const abs = Math.abs(diffMs);
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;
  const value =
    abs < hour
      ? Math.round(diffMs / minute)
      : abs < day
        ? Math.round(diffMs / hour)
        : Math.round(diffMs / day);
  const unit: Intl.RelativeTimeFormatUnit = abs < hour ? "minute" : abs < day ? "hour" : "day";
  return new RTF(localeTag(locale), { numeric: "auto", style: "long" }).format(value, unit);
}

/** Absolute stamp, Persian calendar for fa. */
export function formatDateTime(
  date: Date | string,
  locale: Locale,
  timeZone = "Asia/Tehran",
  opts: Intl.DateTimeFormatOptions = { dateStyle: "medium", timeStyle: "short" },
): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat(localeTag(locale, { calendar: "persian" }), {
    ...opts,
    timeZone,
  }).format(d);
}

export function formatDate(date: Date | string, locale: Locale, timeZone = "Asia/Tehran"): string {
  return formatDateTime(date, locale, timeZone, { dateStyle: "full" });
}

export function formatTime(date: Date | string, locale: Locale, timeZone = "Asia/Tehran"): string {
  return formatDateTime(date, locale, timeZone, { hour: "2-digit", minute: "2-digit" });
}

export function formatDuration(ms: number, locale: Locale): string {
  if (ms < 1000) return locale === "fa" ? `${localizeDigits(String(ms), locale)} میلی‌ثانیه` : `${ms} ms`;
  const sec = Math.round(ms / 1000);
  if (sec < 90) return locale === "fa" ? `${formatNumber(sec, locale)} ثانیه` : `${sec} s`;
  const min = Math.round(sec / 60);
  if (locale === "fa") return `${formatNumber(min, locale)} دقیقه`;
  return min < 120 ? `${min} min` : `${Math.round(min / 60)} h`;
}

/** Machine values (ids, codes, usernames) are LTR-isolated wherever they print. */
export function machine(value: string): string {
  return latinDigits(value);
}
