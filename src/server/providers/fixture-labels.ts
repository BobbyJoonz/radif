import type { IntentKey } from "@/lib/dto";
import { DEMO_TEXTS } from "./fixtures";

/**
 * Reference labels for the demo fixtures — brief §16: "for every case, keep the
 * human reference label and the expected result separate from the model output".
 *
 * These are written from the Persian text itself (what a Persian speaker reads),
 * NOT from what the mock provider returns. `tests/fixtures-reference.test.ts`
 * then fails if the provider drifts from the human reading — which is the only
 * honest way to keep a deterministic mock from quietly becoming the answer key.
 *
 * Keyed by the message text: the same sentence must always carry the same
 * reference reading, whatever fixture id it is wrapped in.
 */
export type FixtureLabel = {
  /** A human sentence: what this message means, in one line. */
  human: string;
  /** The reference primary request. */
  primary: IntentKey;
  /** Additional requests genuinely present in the same message. */
  flags: IntentKey[];
  /** Must a person look at this before anything is confirmed? */
  requiresHumanReview: boolean;
  /** Whether the message states a deliverable address. */
  address: "none" | "stated" | "missing";
  /** Whether a money amount is stated with a usable unit. */
  amount: "none" | "unit_known" | "unit_missing";
};

export const FIXTURE_LABELS: Record<string, FixtureLabel> = {
  [DEMO_TEXTS.scripted]: {
    human: "مشتری می‌گوید واریز کرده، کد رهگیری می‌خواهد و می‌گوید آدرس عوض شده — بدون گفتن نشانی تازه.",
    primary: "payment_claim",
    flags: ["tracking_request", "address_change"],
    requiresHumanReview: false,
    address: "missing",
    amount: "none",
  },
  [DEMO_TEXTS.negarEarlierClaim]: {
    human: "اعلام پرداخت ساده، بدون کد رهگیری و بدون آدرس.",
    primary: "payment_claim",
    flags: [],
    requiresHumanReview: false,
    address: "none",
    amount: "none",
  },
  [DEMO_TEXTS.shirinAmountNoUnit]: {
    human: "«۲۵۰ پرداخت کردم» — عددی بدون واحد؛ مبلغ قطعی نیست و نباید تومان/ریال فرض شود.",
    primary: "payment_claim",
    flags: [],
    requiresHumanReview: true,
    address: "none",
    amount: "unit_missing",
  },
  [DEMO_TEXTS.hosseinProductQuestion]: {
    human: "پرسش موجودی و قیمت یک محصول؛ درخواست خرید نیست.",
    primary: "product_question",
    flags: [],
    requiresHumanReview: false,
    address: "none",
    amount: "none",
  },
  [DEMO_TEXTS.elhamRepeatOrder]: {
    human: "خرید مجدد همان سفارش قبلی؛ آدرس دوباره پرسیده می‌شود.",
    primary: "repeat_order",
    flags: [],
    requiresHumanReview: false,
    address: "none",
    amount: "none",
  },
  [DEMO_TEXTS.rezaComplaint]: {
    human: "شکایت از تأخیر و آسیب بسته؛ نیاز به تصمیم انسانی.",
    primary: "complaint",
    flags: [],
    requiresHumanReview: true,
    address: "none",
    amount: "none",
  },
  [DEMO_TEXTS.saraTrackingAmbiguous]: {
    human: "درخواست کد رهگیری بدون گفتن کدام سفارش؛ مشتری چند سفارش باز دارد.",
    primary: "tracking_request",
    flags: [],
    requiresHumanReview: true,
    address: "none",
    amount: "none",
  },
  [DEMO_TEXTS.aminAddressAfterShipping]: {
    human: "تغییر آدرس؛ نشانی تازه گفته نشده و مرسوله ممکن است ارسال شده باشد.",
    primary: "address_change",
    flags: [],
    requiresHumanReview: true,
    address: "missing",
    amount: "none",
  },
  [DEMO_TEXTS.navidInjection]: {
    human: "متن دستوری برای تغییر وضعیت («پرداخت‌شده کن»)؛ داده است، نه دستور سیستم.",
    primary: "other_unknown",
    flags: [],
    requiresHumanReview: true,
    address: "none",
    amount: "none",
  },
  [DEMO_TEXTS.parisaProductQuestion]: {
    human: "پرسش قیمت یک محصول دیگر؛ بدون سفارش باز مرتبط.",
    primary: "product_question",
    flags: [],
    requiresHumanReview: false,
    address: "none",
    amount: "none",
  },
  [DEMO_TEXTS.zahraRefund]: {
    human: "درخواست مرجوعی و بازگشت پول؛ به انسان می‌رسد.",
    primary: "refund_or_return",
    flags: [],
    requiresHumanReview: true,
    address: "none",
    amount: "none",
  },
  [DEMO_TEXTS.omidCancellation]: {
    human: "درخواست لغو سفارش؛ بازپرداخت خودکار انجام نمی‌شود.",
    primary: "cancellation",
    flags: [],
    requiresHumanReview: true,
    address: "none",
    amount: "none",
  },
  [DEMO_TEXTS.mahsaOrderStatus]: {
    human: "پرسش وضعیت سفارش؛ پاسخ از وضعیت ثبت‌شده.",
    primary: "order_status",
    flags: [],
    requiresHumanReview: false,
    address: "none",
    amount: "none",
  },
  [DEMO_TEXTS.kianNewOrder]: {
    human: "سفارش تازه؛ پیش‌نویس لازم دارد، بدون پرداخت تأییدشده.",
    primary: "new_order",
    flags: [],
    requiresHumanReview: false,
    address: "none",
    amount: "none",
  },
  [DEMO_TEXTS.rahaShoeQuestion]: {
    human: "پرسش قیمت در فروشگاه دوم؛ پاسخ از کاتالوگ همان فروشگاه.",
    primary: "product_question",
    flags: [],
    requiresHumanReview: false,
    address: "none",
    amount: "none",
  },
  [DEMO_TEXTS.rahaSizeQuestion]: {
    human: "پرسش موجودی سایز؛ پرسش محصول، نه سفارش.",
    primary: "product_question",
    flags: [],
    requiresHumanReview: false,
    address: "none",
    amount: "none",
  },
  [DEMO_TEXTS.rahaDeliveryQuestion]: {
    human: "پرسش امکان ارسال به شهر دیگر؛ پرسش محصول/ارسال.",
    primary: "product_question",
    flags: [],
    requiresHumanReview: false,
    address: "none",
    amount: "none",
  },
};
