/**
 * Persian text normalisation — the first rule of the domain layer.
 *
 * Two hard invariants, because everything downstream depends on them:
 *
 *  1. **Length is preserved.** Output character `i` always corresponds to input
 *     character `i`. We never delete a ZWNJ, never collapse spaces, never strip
 *     a prefix. That is what lets an evidence span found in the normalised text
 *     be applied directly to `Message.text` — the text the seller actually sees
 *     and the text we stored. If normalisation changed offsets, every "شاهد"
 *     underline in the UI would point at the wrong characters.
 *
 *  2. **The original is never mutated.** Callers keep `original` and pass the
 *     normalised twin around as a *parallel view* only. Nothing here writes
 *     back into the stored message.
 *
 * The rules are deliberately conservative: digits and letter variants that are
 * pure spelling differences, plus zero-width characters. We do not transliterate,
 * we do not "fix" spelling, and we do not remove diacritics that may carry
 * meaning in a name.
 */

/** Persian ۰-۹ and Arabic ٠-٩ → Latin 0-9. */
const PERSIAN_DIGIT_START = 0x06f0;
const ARABIC_DIGIT_START = 0x0660;

const FA_DIGITS = ["۰", "۱", "۲", "۳", "۴", "۵", "۶", "۷", "۸", "۹"];

/**
 * Replacements are code-point → code-point, so the result has the same length as
 * the input even for astral characters (surrogate pairs pass through untouched).
 */
function mapChar(code: number): number {
  // Persian digits
  if (code >= PERSIAN_DIGIT_START && code <= PERSIAN_DIGIT_START + 9) {
    return 0x30 + (code - PERSIAN_DIGIT_START);
  }
  // Arabic-Indic digits
  if (code >= ARABIC_DIGIT_START && code <= ARABIC_DIGIT_START + 9) {
    return 0x30 + (code - ARABIC_DIGIT_START);
  }
  switch (code) {
    // Arabic yeh / kaf that Persian keyboards produce by accident
    case 0x064a: // ي
      return 0x06cc; // ی
    case 0x0643: // ك
      return 0x06a9; // ک
    case 0x0629: // ة
      return 0x0647; // ه
    case 0x06c0: // ۀ
      return 0x0647; // ه
    case 0x0622: // آ
    case 0x0623: // أ
    case 0x0625: // إ
      return 0x0627; // ا
    // Zero-width characters: a space keeps the length and still separates words
    case 0x200c: // ZWNJ (نیم‌فاصله)
    case 0x200d: // ZWJ
    case 0x200e: // LRM
    case 0x200f: // RLM
    case 0xfeff: // BOM
      return 0x20;
    // Numeric and punctuation variants
    case 0x066b: // ٫ decimal separator
      return 0x2e; // .
    case 0x066c: // ٬ thousands separator
    case 0x060c: // ، Arabic comma
      return 0x2c; // ,
    case 0x061f: // ؟ Arabic question mark
      return 0x3f; // ?
    default:
      return code;
  }
}

/**
 * The length-preserving normalised view of a string.
 *
 * Also lower-cases Latin letters: Instagram handles and `.demo` emails arrive in
 * mixed case and are compared case-insensitively, and lower-casing one char to
 * one char cannot shift an offset.
 */
export function normalizeText(input: string): string {
  let out = "";
  for (let i = 0; i < input.length; i += 1) {
    const code = input.charCodeAt(i);
    const mapped = mapChar(code);
    // ASCII upper-case is a 1:1 character mapping, so it is safe here as well.
    out += mapped >= 0x41 && mapped <= 0x5a ? String.fromCharCode(mapped + 0x20) : String.fromCharCode(mapped);
  }
  return out;
}

/** Digits only, length preserved — safe for spans, unlike stripping separators. */
export function normalizeDigits(input: string): string {
  return input.replace(/[۰-۹٠-٩]/g, (d) => {
    const code = d.charCodeAt(0);
    if (code >= PERSIAN_DIGIT_START && code <= PERSIAN_DIGIT_START + 9) {
      return String(code - PERSIAN_DIGIT_START);
    }
    return String(code - ARABIC_DIGIT_START);
  });
}

/** Persian digits for display (inverse of `normalizeDigits`). */
export function toPersianDigits(input: string | number): string {
  return String(input).replace(/[0-9]/g, (d) => FA_DIGITS[Number(d)]!);
}

/** Latin digits, for machine values (ids, tracking codes, phones). */
export function toLatinDigits(input: string): string {
  return normalizeDigits(input);
}

/**
 * Collapse whitespace and tidy for *comparison only* (search, dedupe of text).
 * Never use the result to index into the original.
 */
export function foldForCompare(input: string): string {
  return normalizeText(input)
    .replace(/[\s\u200c]+/g, " ")
    .replace(/[\u064b-\u065f\u0670]/g, "")
    .trim();
}

/** A substring that is safe to show in a list, cut on a word boundary when possible. */
export function truncateText(input: string, max: number): string {
  if (input.length <= max) return input;
  const cut = input.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  return (lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd() + "…";
}

/** Whitespace-separated tokens of the folded text. */
export function tokensOf(input: string): string[] {
  const folded = foldForCompare(input);
  return folded.length === 0 ? [] : folded.split(" ");
}

/**
 * Does `text` mention any of the given words/phrases? Matching happens on the
 * normalised view, with ZWNJ already turned into a space and digits unified.
 */
export function mentionsAny(normalizedText: string, needles: readonly string[]): boolean {
  return needles.some((needle) => {
    const normalizedNeedle = normalizeText(needle);
    if (normalizedNeedle.length === 0) return false;
    return normalizedText.includes(normalizedNeedle);
  });
}
