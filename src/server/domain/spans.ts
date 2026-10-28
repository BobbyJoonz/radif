import { normalizeText } from "./normalize";
import { type AmountUnit, isUnitWord, multiplierOf, unitOf } from "./money";

/**
 * Candidate extraction — "pre-parsed values", per the brief §7.
 *
 * The model is never asked to *write* a phone number, an amount or an order
 * reference. Code finds every plausible span in the message first and gives each
 * one a stable id; the model may only choose an id (`candidateId`) or say none.
 * That is the whole defence against a hallucinated amount: a value the seller
 * sees always exists, character for character, in the customer's own text.
 *
 * Offsets point into the **original** text. `extractCandidates` takes both
 * strings only to compare; it returns spans computed on `original` because the
 * normalised view is guaranteed to be the same length (see `normalize.ts`).
 */

export type CandidateKind = "phone" | "amount" | "order_ref";

export type Candidate = {
  /** Stable across runs: same text and kind → same id. */
  id: string;
  kind: CandidateKind;
  /** The exact original substring — what the UI underlines as evidence. */
  raw: string;
  /** Normalised form for storage/comparison (phone → +98…, order_ref → digits). */
  value: string;
  start: number;
  end: number;
  meta?: {
    unit?: AmountUnit | null;
    amountMinor?: string | null;
    note?: string | null;
    /** Why the extractor is unsure, when it is. */
    reason?: string | null;
  };
};

/** Money words that make a bare number *likely* to be an amount. */
const MONEY_CONTEXT = [
  "تومان",
  "تومن",
  "ریال",
  "ریالی",
  "تومانی",
  "هزار",
  "میلیون",
  "میلیارد",
  "مبلغ",
  "پول",
  "واریز",
  "واریزی",
  "پرداخت",
  "کارت به کارت",
  "هزینه",
  "جمع",
  "بدهی",
  "قسط",
  "بیعانه",
  "علی‌الحساب",
  "فیش",
  "رسید",
  "حساب",
];

const PHONE_RE = /(?<![0-9])(?:(?:\+|00)98|0)?9(?:[ \t._()\-]{0,2}[0-9]){9}(?![0-9])/g;
const ORDER_REF_RE = /(?<![a-z0-9])(?:demo-)?ord(?:er)?[-_:# ]*([0-9]{2,10})(?![0-9])/g;
const ORDER_REF_FA_RE = /(?:سفارش|سفارشه|سفارش شماره)[ ]*(?:شماره)?[ ]*[#:]?[ ]*([0-9]{3,10})(?![0-9])/g;
const NUMBER_RE = /(?<![0-9])(?:[0-9]{1,3}(?:,[0-9]{3})+(?:\.[0-9]{1,3})?|[0-9]+(?:\.[0-9]{1,3})?)(?![0-9])/g;

/** Iranian mobile numbers only normalise to E.164; anything else stays raw. */
export function normalisePhone(raw: string): string | null {
  const digits = raw.replace(/[^0-9]/g, "");
  if (digits.length === 13 && digits.startsWith("98")) return `+${digits}`;
  if (digits.length === 12 && digits.startsWith("098")) return `+98${digits.slice(3)}`;
  if (digits.length === 11 && digits.startsWith("09")) return `+98${digits.slice(1)}`;
  if (digits.length === 10 && digits.startsWith("9")) return `+98${digits}`;
  return null;
}

function overlaps(a: { start: number; end: number }, b: { start: number; end: number }): boolean {
  return a.start < b.end && b.start < a.end;
}

function candidateId(kind: CandidateKind, start: number, end: number): string {
  return `${kind}:${start}-${end}`;
}

function hasMoneySignal(normalized: string, start: number, end: number): boolean {
  const before = normalized.slice(Math.max(0, start - 32), start);
  const after = normalized.slice(end, Math.min(normalized.length, end + 20));
  return (
    MONEY_CONTEXT.some((word) => before.includes(word)) ||
    MONEY_CONTEXT.some((word) => after.includes(word)) ||
    /^[ ]*(هزار|میلیون|میلیارد)/.test(after)
  );
}

/**
 * Extend an amount span over its multiplier/unit words: for «۲۵۰ هزار تومان» the
 * evidence must underline the whole thing, otherwise the seller cannot see that
 * 250 was not the amount.
 */
function extendOverUnit(normalized: string, end: number): number {
  let cursor = end;
  const rest = normalized.slice(end, end + 40);
  const match = /^[ ]*(?:(هزار|میلیون|میلیارد)[ ]*)?(تومان|تومانی|تومن|ریال|ریالی)/.exec(rest);
  if (!match) return end;
  cursor = end + match[0].length;
  return cursor;
}

/**
 * All candidates in one message, ordered by position.
 *
 * Overlaps are resolved in favour of the stronger kind: a phone is never also an
 * amount, and an order reference is never also an amount.
 */
export function extractCandidates(original: string, normalized?: string): Candidate[] {
  const text = normalized ?? normalizeText(original);
  const occupied: { start: number; end: number }[] = [];
  const found: Candidate[] = [];

  for (const match of text.matchAll(PHONE_RE)) {
    const start = match.index ?? 0;
    const end = start + match[0].length;
    if (occupied.some((range) => overlaps(range, { start, end }))) continue;
    const value = normalisePhone(match[0]);
    occupied.push({ start, end });
    found.push({
      id: candidateId("phone", start, end),
      kind: "phone",
      raw: original.slice(start, end),
      value: value ?? match[0].replace(/\s+/g, ""),
      start,
      end,
      meta: { reason: value ? null : "شماره کامل به نظر نمی‌رسد." },
    });
  }

  const orderRefs: { start: number; end: number; digits: string }[] = [];
  for (const re of [ORDER_REF_RE, ORDER_REF_FA_RE]) {
    for (const match of text.matchAll(re)) {
      const digits = match[1] ?? "";
      if (digits.length === 0) continue;
      // Use the trailing digits as the span: exactly what identifies the order.
      const start = (match.index ?? 0) + match[0].lastIndexOf(digits);
      const end = start + digits.length;
      if (occupied.some((range) => overlaps(range, { start, end }))) continue;
      if (orderRefs.some((range) => overlaps(range, { start, end }))) continue;
      occupied.push({ start, end });
      orderRefs.push({ start, end, digits });
      found.push({
        id: candidateId("order_ref", start, end),
        kind: "order_ref",
        raw: original.slice(start, end),
        value: digits,
        start,
        end,
      });
    }
  }

  for (const match of text.matchAll(NUMBER_RE)) {
    const start = match.index ?? 0;
    const numberEnd = start + match[0].length;
    if (occupied.some((range) => overlaps(range, { start, end: numberEnd }))) continue;

    const end = extendOverUnit(text, numberEnd);
    const raw = original.slice(start, end);
    const unitText = text.slice(numberEnd, end).trim().split(" ").filter(Boolean);
    let unit: AmountUnit | null = null;
    let multiplier = 0;
    for (const word of unitText) {
      if (isUnitWord(word)) unit = unitOf(word);
      const m = multiplierOf(word);
      if (m !== null) multiplier = m;
    }
    const looksLikeMoney = unit !== null || multiplier > 0 || hasMoneySignal(text, start, numberEnd);
    if (!looksLikeMoney) continue;

    // A bare number with no unit is still a candidate: rule 7 says propose it
    // with `value: null` so a human finishes the job, never guess the unit.
    occupied.push({ start, end });
    found.push({
      id: candidateId("amount", start, end),
      kind: "amount",
      raw,
      value: raw,
      start,
      end,
      meta: {
        unit,
        reason: unit ? null : "واحد پول در پیام نیامده.",
      },
    });
  }

  return found.sort((a, b) => a.start - b.start);
}

/** Candidates of one kind, in text order. */
export function candidatesOfKind(candidates: readonly Candidate[], kind: CandidateKind): Candidate[] {
  return candidates.filter((candidate) => candidate.kind === kind);
}

export function findCandidate(candidates: readonly Candidate[], id: string | null | undefined): Candidate | null {
  if (!id) return null;
  return candidates.find((candidate) => candidate.id === id) ?? null;
}

/** First match of a phrase regex, as an evidence span on the original text. */
export function locateSpan(normalizedText: string, pattern: RegExp): { start: number; end: number } | null {
  const withFlags = pattern.flags.includes("g") ? pattern : new RegExp(pattern.source, `${pattern.flags}g`);
  const match = withFlags.exec(normalizedText);
  if (!match || match[0].length === 0) return null;
  const start = match.index ?? 0;
  return { start, end: start + match[0].length };
}

/**
 * Put an evidence span through a minimal sanity check before it is persisted.
 * The database has the same rule as a CHECK constraint; doing it here means the
 * worker fails loudly instead of writing a span nobody can use.
 */
export function clampSpan(
  span: { start: number; end: number } | null | undefined,
  textLength: number,
): { start: number; end: number } | null {
  if (!span) return null;
  const start = Math.max(0, Math.min(span.start, textLength));
  const end = Math.max(0, Math.min(span.end, textLength));
  if (end <= start) return null;
  return { start, end };
}
