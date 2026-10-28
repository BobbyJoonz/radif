import { toPersianDigits } from "./normalize";

/**
 * Money helpers. Two decisions that the rest of the app inherits:
 *
 *  • Money is an integer in *minor units of the tenant currency*. For IRR one
 *    rial has no subunit in practice, so `amountMinor` is a rial count — but the
 *    name stays "minor" so a second currency does not need a schema change.
 *    No floats, ever: 0.1 + 0.2 problems in a shop's ledger are unforgivable.
 *
 *  • Rial ↔ Toman is an explicit conversion (×10 / ÷10) that is only applied
 *    when the *text said which one*, and the source unit is recorded next to the
 *    value. "۲۵۰" alone is not 250 rial and not 2,500 rial — it is unknown, and
 *    unknown means `null`, not a guess.
 */

export type AmountUnit = "toman" | "rial";

/** Multipliers people actually type. «هزار تومان» is 1,000 toman, not 1,000 rial. */
const MULTIPLIERS: Record<string, number> = {
  هزار: 3,
  میلیون: 6,
  میلیارد: 9,
};

/** Unit words, after normalisation (Arabic yeh already folded to Persian). */
const UNIT_WORDS: Record<string, AmountUnit> = {
  تومان: "toman",
  تومانی: "toman",
  تومن: "toman",
  "تومان.": "toman",
  ریال: "rial",
  ریالی: "rial",
  "ریال.": "rial",
};

export type ParsedAmount = {
  /** Null when the unit was never stated: the value is withheld, not guessed. */
  amountMinor: bigint | null;
  unit: AmountUnit | null;
  /** The exact text the amount was read from (for the evidence tooltip). */
  raw: string;
  /** Non-null when a rounding had to happen: surfaced instead of hidden. */
  note: string | null;
};

export function isUnitWord(word: string): boolean {
  return word in UNIT_WORDS;
}

export function unitOf(word: string): AmountUnit | null {
  return UNIT_WORDS[word] ?? null;
}

export function multiplierOf(word: string): number | null {
  return MULTIPLIERS[word] ?? null;
}

/**
 * Parse a decimal string with integer arithmetic.
 *
 * `scale` is the number of decimal digits in `digits`; the returned value is
 * `digits * 10^multiplier / 10^scale`, rounded half-up when it does not divide
 * exactly (and the caller is told, via the returned note, that it rounded).
 */
export function scaledBigInt(digits: string, scale: number, multiplierPowers: number): { value: bigint; rounded: boolean } {
  const multiplier = 10n ** BigInt(multiplierPowers);
  const numerator = BigInt(digits) * multiplier;
  if (scale === 0) return { value: numerator, rounded: false };
  const divisor = 10n ** BigInt(scale);
  const quotient = numerator / divisor;
  const remainder = numerator % divisor;
  if (remainder === 0n) return { value: quotient, rounded: false };
  const rounded = remainder * 2n >= divisor ? quotient + 1n : quotient;
  return { value: rounded, rounded: true };
}

/**
 * Read an amount out of the raw text of one candidate span.
 *
 * The span is expected to be *only* the number plus its multiplier/unit words
 * (the extractor in `spans.ts` decides the boundaries). Anything ambiguous ends
 * as `amountMinor: null` + `unit: null` so the UI can ask the seller.
 */
export function parseAmount(raw: string): ParsedAmount {
  const text = raw
    .replace(/[٬,]/g, "")
    .replace(/\u066c/g, "")
    .replace(/\s+/g, " ")
    .trim();

  // Number first, then any words after it.
  const match = /^([0-9]+(?:\.[0-9]+)?)\s*(.*)$/.exec(text);
  if (!match) return { amountMinor: null, unit: null, raw, note: "مبلغ خوانده نشد." };

  const [, numeric, rest] = match;
  const words = (rest ?? "").split(" ").map((w) => w.trim()).filter(Boolean);

  let multiplier = 0;
  let unit: AmountUnit | null = null;
  for (const word of words) {
    const m = MULTIPLIERS[word];
    if (m !== undefined) multiplier = m;
    const u = UNIT_WORDS[word];
    if (u) unit = u;
  }

  if (!unit) {
    // Rule 7 of CONTRACTS §6: no unit means no amount. We still return the raw
    // text so a human can finish the job in one glance.
    return { amountMinor: null, unit: null, raw, note: "واحد پول گفته نشده." };
  }

  const [intPart, fracPart = ""] = numeric.split(".");
  const digits = `${intPart}${fracPart}`.replace(/^0+(?=\d)/, "");
  if (digits.length === 0) return { amountMinor: null, unit, raw, note: "مبلغ خوانده نشد." };

  // rial = the stored unit; toman is ×10.
  const { value, rounded } = scaledBigInt(digits, fracPart.length, multiplier + (unit === "toman" ? 1 : 0));
  return {
    amountMinor: value,
    unit,
    raw,
    note: rounded ? "مبلغ گرد شد." : null,
  };
}

/** Persian display of an amount in rial, with the unit spelled out. */
export function formatMinorFa(amountMinor: bigint, currency = "IRR"): string {
  const grouped = amountMinor.toString().replace(/\B(?=(\d{3})+(?!\d))/g, "٬");
  const digits = toPersianDigits(grouped);
  return currency === "IRR" ? `${digits} ریال` : `${digits} ${currency}`;
}

/** "۲۵ تومان و ۵۰ ریال"? No: one currency, one unit. Kept for API completeness. */
export function amountToDtoString(amountMinor: bigint | null): string | null {
  return amountMinor === null ? null : amountMinor.toString();
}

/**
 * The order total from its items, in minor units. Pure integer arithmetic, so a
 * mismatch against a claimed payment can be computed exactly.
 */
export function sumLines(items: readonly { qty: number; unitPriceMinor: bigint }[]): bigint {
  return items.reduce((total, item) => total + BigInt(item.qty) * item.unitPriceMinor, 0n);
}
