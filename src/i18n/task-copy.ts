import type { Locale } from "./config";

/**
 * Task copy in the reader's language.
 *
 * The worker stores what happened in Persian, because the shop's own language is
 * Persian and the record has to be readable by the person who runs the shop. That is
 * a fact, not a label: when the interface is English, the *presentation* must be
 * English too — so the stored `reasonCode` / `type` are translated here, and the
 * stored Persian sentence is only the Persian rendering of the same fact.
 *
 * Unknown codes never leak Persian into an English screen: they fall back to a
 * humanised code (`amount_without_unit` → “Amount without unit”).
 */

const REASONS: Record<string, { fa: string; en: string }> = {
  payment_mismatch: { fa: "اعلام پرداخت بررسی‌نشده پیش از ارسال", en: "Payment claimed, not reconciled before shipping" },
  address_change_before_shipping: { fa: "تغییر آدرس پیش از ارسال", en: "Address change before shipping" },
  tracking_missing: { fa: "کد رهگیری خواسته شده، ثبت نشده", en: "Tracking requested, none recorded" },
  amount_without_unit: { fa: "مبلغ بدون واحد", en: "Amount without a unit" },
  repeat_order: { fa: "درخواست خرید تکراری", en: "Repeat purchase request" },
  product_question: { fa: "پرسش محصول", en: "Product question" },
  untrusted_instruction: { fa: "متن پیام به‌شکل دستور سیستم است", en: "Text in the DM acts like an instruction" },
  complaint_no_delivery: { fa: "شکایت تأخیر در تحویل", en: "Complaint: late delivery" },
  cancellation_request: { fa: "درخواست لغو", en: "Cancellation request" },
  shipment_action: { fa: "ارسال نیاز به اقدام دارد", en: "Shipment needs an action" },
};

const TITLES: Record<string, { fa: string; en: string }> = {
  payment_reconcile: { fa: "تطبیق پرداخت سفارش", en: "Reconcile payment" },
  address_complete: { fa: "تکمیل آدرس سفارش", en: "Complete the address" },
  tracking_followup: { fa: "پیگیری کد رهگیری", en: "Follow up the tracking code" },
  draft_review: { fa: "بررسی پیش‌نویس سفارش", en: "Review the order draft" },
  customer_reply: { fa: "پاسخ به مشتری", en: "Reply to the customer" },
  human_review: { fa: "بررسی انسانی", en: "Needs a human decision" },
  shipment_action: { fa: "اقدام ارسال", en: "Shipment action" },
};

function humanize(code: string): string {
  const words = code.replace(/[_-]+/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function taskReason(code: string | null | undefined, stored: string, locale: Locale): string {
  if (locale === "fa") return stored;
  const hit = code ? REASONS[code] : undefined;
  return hit ? hit.en : humanize(code ?? stored);
}

/** The order reference is data, so it survives translation. */
export function taskTitle(task: { type: string; title: string }, locale: Locale): string {
  if (locale === "fa") return task.title;
  const ref = task.title.match(/[A-Z]+-[A-Z]+-\d+/)?.[0] ?? null;
  const known = TITLES[task.type];
  if (!known) return ref ? `${humanize(task.type)} (${ref})` : humanize(task.type);
  return ref ? `${known.en} (${ref})` : known.en;
}

/** A reply-preview label: the template key is the fact, the sentence is presentation. */
export function replyTemplateLabel(key: string, locale: Locale): string {
  if (locale === "fa") return key;
  return humanize(key);
}

const DETAILS: Record<string, string> = {
  payment_reconcile: "The customer said they paid; reconcile it against the shop's statement before shipping.",
  address_complete: "The customer said the address changed but did not send a new one.",
  tracking_followup: "The customer asked for the tracking code and none is recorded yet.",
  draft_review: "The message asks to buy; the draft has to be reviewed before it becomes an order.",
  customer_reply: "The customer asked something the shop can answer directly.",
  human_review: "This needs a person: the message is not clear enough to act on automatically.",
  shipment_action: "The shipment needs a decision or an update before the customer is told anything.",
};

/** Free-text detail is generated in Persian; English gets the same fact as a sentence. */
export function taskDetail(type: string, stored: string | null, locale: Locale): string | null {
  if (!stored) return null;
  if (locale === "fa") return stored;
  return DETAILS[type] ?? null;
}

const NEXT_ACTIONS: Record<string, { fa: string; en: string }> = {
  payment_reconcile: { fa: "تطبیق پرداخت و تأیید", en: "Reconcile the payment, then confirm" },
  address_complete: { fa: "تکمیل آدرس", en: "Complete the address" },
  tracking_followup: { fa: "گرفتن کد رهگیری", en: "Get the tracking code" },
  draft_review: { fa: "بررسی پیش‌نویس سفارش", en: "Review the order draft" },
  customer_reply: { fa: "پاسخ به مشتری", en: "Reply to the customer" },
  human_review: { fa: "بررسی انسانی", en: "A human has to look at this" },
  shipment_action: { fa: "اقدام ارسال", en: "Shipment action" },
};

export function taskNextAction(type: string, locale: Locale): string {
  if (locale !== "en") return NEXT_ACTIONS[type]?.fa ?? "بررسی و اقدام";
  return NEXT_ACTIONS[type]?.en ?? humanize(type);
}

/** The small facts under a row ("unverified payment · parcel being prepared"). */
const FRAGMENTS: Record<string, { fa: string; en: string }> = {
  payment_unverified: { fa: "پرداخت بررسی‌نشده", en: "payment unverified" },
  payment_verified: { fa: "پرداخت تأییدشده", en: "payment verified" },
  address_not_in_message: { fa: "آدرس تازه در پیام نیامده", en: "no new address in the message" },
  address_after_shipment: { fa: "تغییر آدرس پس از ارسال", en: "address change after shipping" },
  tracking_missing: { fa: "کد رهگیری ثبت نشده", en: "no tracking code recorded" },
  parcel_preparing: { fa: "مرسوله در حال آماده‌سازی", en: "parcel being prepared" },
  parcel_shipped: { fa: "مرسوله ارسال شده", en: "parcel shipped" },
  parcel_delivered: { fa: "مرسوله تحویل شده", en: "parcel delivered" },
  shipping_paused: { fa: "ارسال متوقف شده", en: "shipping paused" },
  order_needs_review: { fa: "سفارش نیازمند بررسی", en: "order needs review" },
};

export function fragment(key: string, locale: Locale): string {
  const hit = FRAGMENTS[key];
  if (!hit) return locale === "en" ? humanize(key) : key;
  return locale === "en" ? hit.en : hit.fa;
}

export function unnamedCustomer(locale: Locale): string {
  return locale === "en" ? "Unnamed customer" : "مشتری بدون نام";
}
