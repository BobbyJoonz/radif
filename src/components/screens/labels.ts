import type { Dictionary } from "@/i18n";
import type { Locale } from "@/i18n/config";
import { formatDateTime, formatMoney, formatNumber, formatRelative } from "@/i18n/format";

/**
 * Presentation helpers shared by the screens. Nothing here invents a value:
 * a null in the DTO stays «نامشخص» / «ثبت نشده» all the way to the screen.
 */
const DAY = 24 * 60 * 60 * 1000;

export function moneyText(minor: string | null, currency: string, locale: Locale): string | null {
  if (minor === null) return null;
  if (currency === "IRR") return formatMoney(minor, "IRR", locale, { unit: "toman" });
  return formatMoney(minor, currency as "IRR", locale);
}

/** Latin digits for machine values, never localised (contract in §3). */
export function machineText(value: string): string {
  return value;
}

export function numberText(value: number, locale: Locale): string {
  return formatNumber(value, locale);
}

/** Within a day it is «۲ دقیقه پیش»; beyond that, a stamps with the Persian date. */
export function whenText(iso: string | null, locale: Locale, now: Date = new Date()): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const delta = Math.abs(now.getTime() - date.getTime());
  return delta < DAY ? formatRelative(date, now, locale) : formatDateTime(date, locale);
}

export function dateTimeText(iso: string | null, locale: Locale): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : formatDateTime(date, locale);
}

export type DueLabel = { text: string; overdue: boolean };

export function dueLabel(iso: string | null, locale: Locale, now: Date = new Date()): DueLabel | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return { text: formatRelative(date, now, locale), overdue: date.getTime() < now.getTime() };
}

/** "۲ روز پیش" for a task that is in the past; "فردا" for the future. */
export function relativeText(iso: string | null, locale: Locale, now: Date = new Date()): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : formatRelative(date, now, locale);
}

const FIELD_PREFIX: { match: RegExp; key: keyof Dictionary["inbox"]["fields"] }[] = [
  { match: /^intent/, key: "intent" },
  { match: /amount|price|total/, key: "amount" },
  { match: /product|item|sku/, key: "product" },
  { match: /qty|quantity|count/, key: "quantity" },
  { match: /address/, key: "address" },
  { match: /tracking|waybill/, key: "tracking" },
  { match: /phone|mobile/, key: "phone" },
];

/** The DB field name is a machine value; the sheet shows a seller's word. */
export function fieldLabel(field: string, dict: Dictionary): string {
  const key = FIELD_PREFIX.find((entry) => entry.match.test(field))?.key;
  return key ? dict.inbox.fields[key] : dict.inbox.fields.other;
}

export function intentWord(value: string, dict: Dictionary): string {
  const table = dict.intent as Record<string, string>;
  return table[value] ?? value;
}

export function isToday(iso: string | null, now: Date = new Date()): boolean {
  if (!iso) return false;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return false;
  return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth() && date.getDate() === now.getDate();
}
