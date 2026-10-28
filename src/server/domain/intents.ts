import type { IntentKey } from "@/lib/dto";
import { normalizeText } from "./normalize";

/**
 * Intent detection — rule-based, deterministic, and *not* the source of truth.
 *
 * The model (mock or real) chooses the primary intent; these rules exist for
 * three things the model must never be trusted with alone:
 *   1. finding the evidence span (a phrase that really exists in the text);
 *   2. the multi-intent split — one message can be a payment claim, a tracking
 *      request and an address change at once, and none of them may be dropped;
 *   3. a baseline that the mock provider and the fixtures are both written
 *      against, so "the same input gives the same output" is testable.
 *
 * Patterns are written against the *normalised* text (`normalize.ts`): ZWNJ is a
 * space, Arabic yeh is Persian yeh, digits are Latin. That is why a pattern says
 * `می ?فرستید` and not `می‌فرستید`.
 */

type IntentPattern = { intent: IntentKey; weight: number; patterns: RegExp[] };

/** Label the UI may print in a chip; the reason text of a task is separate. */
export const INTENT_LABELS_FA: Record<IntentKey, string> = {
  product_question: "پرسش محصول",
  new_order: "سفارش جدید",
  repeat_order: "سفارش تکراری",
  payment_claim: "اعلام پرداخت",
  order_status: "وضعیت سفارش",
  tracking_request: "درخواست رهگیری",
  address_change: "تغییر آدرس",
  cancellation: "لغو سفارش",
  refund_or_return: "مرجوعی یا بازگشت وجه",
  complaint: "شکایت",
  other_unknown: "نامشخص",
};

export function intentLabel(intent: IntentKey): string {
  return INTENT_LABELS_FA[intent] ?? INTENT_LABELS_FA.other_unknown;
}

/**
 * Heaviness of an intent when deciding the *primary* one. A payment claim
 * outranks a product question in the same message because it is the one with
 * money in it; ties fall back to whichever appeared first, not to a guess.
 */
export const INTENT_WEIGHT: Record<IntentKey, number> = {
  payment_claim: 50,
  refund_or_return: 45,
  cancellation: 40,
  address_change: 38,
  tracking_request: 36,
  complaint: 30,
  order_status: 28,
  repeat_order: 24,
  new_order: 22,
  product_question: 20,
  other_unknown: 0,
};

const PATTERNS: IntentPattern[] = [
  {
    intent: "payment_claim",
    weight: INTENT_WEIGHT.payment_claim,
    patterns: [
      /واریز ?(کردم|کرده|شد|نمودم|کردیم)/,
      /پرداخت ?(کردم|نمودم|کرده)/,
      /(کارت ?به ?کارت|فیش واریز|رسید واریز|رسید پرداخت)/,
      /پول ?(رو |را )?(ریختم|واریز)/,
      /(انتقال ?(دادم|کردم))/,
      /علی ?الحساب/,
      /(بیعانه|پیش ?پرداخت) ?(ریختم|دادم|واریز)/,
    ],
  },
  {
    intent: "tracking_request",
    weight: INTENT_WEIGHT.tracking_request,
    patterns: [
      /کد ?رهگیری/,
      /کد ?پستی/,
      /کد ?مرسوله/,
      /(شماره ?رهگیری|شماره ?مرسوله)/,
      /رهگیری/,
      /(مرسوله ?(کجاست|کد|را))/,
    ],
  },
  {
    intent: "address_change",
    weight: INTENT_WEIGHT.address_change,
    patterns: [
      /(آدرس|ادرس)(م|مون| ?من)? ?(هم )?(عوض|تغییر|دگرگون)/,
      /(آدرس|ادرس) ?(جدید|دیگه|دیگری|متفاوت)/,
      /(نشونی|نشانی)(م|مون)? ?(عوض|تغییر)/,
      /(آدرس|ادرس) ?(رو |را )?(عوض|تغییر)/,
      /(به|با) ?(آدرس|ادرس) ?(جدید|دیگه)/,
    ],
  },
  {
    intent: "refund_or_return",
    weight: INTENT_WEIGHT.refund_or_return,
    patterns: [
      /مرجوع/,
      /(برگشت|عودت) ?(پول|وجه|داده|بدید|بدهید)/,
      /(پس ?(دادن|بده|بدید|بدین)) ?(پول|وجه)/,
      /(بازگشت وجه|refund)/,
    ],
  },
  {
    intent: "cancellation",
    weight: INTENT_WEIGHT.cancellation,
    patterns: [/(لغو|کنسل|منصرف|انصراف)/],
  },
  {
    intent: "complaint",
    weight: INTENT_WEIGHT.complaint,
    patterns: [
      /شکایت/,
      /(ناراضی|راضی نیستم)/,
      /(خراب|عیب|معیوب)/,
      /(کیفیت(ش|شون)? ?(بد|پایین))/,
      /(دیر ?(کرد|شده|شد))/,
      /(جواب ?(نداد|نگرفتم)|پیگیری نکردید)/,
      /پشیمون/,
    ],
  },
  {
    intent: "order_status",
    weight: INTENT_WEIGHT.order_status,
    patterns: [
      /(وضعیت ?(سفارش|ارسال|خرید))/,
      /(سفارش(م|مون| ?من)? ?(کجاست|کجا شد|چی شد|رسید))/,
      /(پیگیری ?سفارش)/,
      /(کِی|کی) ?(می ?رسه|میرسه|میاد)/,
    ],
  },
  {
    intent: "repeat_order",
    weight: INTENT_WEIGHT.repeat_order,
    patterns: [
      /(همون|همان) ?(قبلی|دفعه|سفارش|مدل)/,
      /(مثل|مثله) ?(قبلی|دفعه قبل|پارسال)/,
      /دوباره/,
      /(باز هم|بازهم) ?(همون|سفارش|می ?خوام)/,
      /(مجدد|تکرار ?(سفارش|خرید))/,
    ],
  },
  {
    intent: "new_order",
    weight: INTENT_WEIGHT.new_order,
    patterns: [
      /(می ?خوام|میخوام|می ?خواستم) ?(که )?(سفارش|بخرم|بگیرم)/,
      /(سفارش ?(بدم|ثبت|دارم|جدید))/,
      /(یه|یک) ?(عدد|دونه|دست|جفت|ست)/,
      /(برای ?(خرید|سفارش))/,
      /ثبت ?سفارش/,
    ],
  },
  {
    intent: "product_question",
    weight: INTENT_WEIGHT.product_question,
    patterns: [
      /(قیمت|قیمتش|قیمت ?این|چند ?(هزار|تومان|ریال))/,
      /(موجود|موجودی|موجوده)/,
      /(سایز|سایزبندی|اندازه)/,
      /(رنگ|رنگبندی|جنس|متری|ابعاد)/,
      /(این محصول|این مدل|این کار)/,
    ],
  },
];

export type IntentHit = {
  intent: IntentKey;
  start: number;
  end: number;
  /** The exact original substring, for the evidence tooltip. */
  phrase: string;
  weight: number;
};

export type IntentScan = {
  hits: IntentHit[];
  /** The intent that should lead the proposal list. */
  primary: IntentKey;
  /** Every other intent that was also present, in text order. */
  flags: IntentKey[];
  normalizedText: string;
};

/**
 * Scan a message for every intent. One hit per intent (the first occurrence) is
 * enough: the value of a second «واریز کردم» in the same message is zero, but a
 * second *different* intent must never be dropped.
 */
export function detectIntents(original: string, normalized?: string): IntentScan {
  const text = normalized ?? normalizeText(original);
  const hits: IntentHit[] = [];

  for (const rule of PATTERNS) {
    for (const pattern of rule.patterns) {
      const match = pattern.exec(text);
      if (!match || match[0].length === 0) continue;
      const start = match.index;
      const end = start + match[0].length;
      hits.push({
        intent: rule.intent,
        start,
        end,
        phrase: original.slice(start, end),
        weight: rule.weight,
      });
      break; // first match of the first matching pattern is the evidence
    }
  }

  hits.sort((a, b) => a.start - b.start);

  const primary = pickPrimary(hits);
  const flags = hits.map((hit) => hit.intent).filter((intent) => intent !== primary);

  return {
    hits,
    primary: primary ?? "other_unknown",
    flags: dedupe(flags),
    normalizedText: text,
  };
}

function dedupe(values: IntentKey[]): IntentKey[] {
  return [...new Set(values)];
}

/** Highest weight wins; equal weight → the one that appeared first. */
export function pickPrimary(hits: readonly IntentHit[]): IntentKey | null {
  let best: IntentHit | null = null;
  for (const hit of hits) {
    if (!best || hit.weight > best.weight) best = hit;
  }
  return best?.intent ?? null;
}

/** Evidence span of one intent, if it is present. */
export function evidenceFor(scan: IntentScan, intent: IntentKey): { start: number; end: number } | null {
  const hit = scan.hits.find((candidate) => candidate.intent === intent);
  return hit ? { start: hit.start, end: hit.end } : null;
}
