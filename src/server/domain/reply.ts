import type { OrderStatusValue, PaymentStatusValue, ShipmentStatusValue } from "@/lib/dto";

/**
 * The reply preview — template + database read, no generative model (brief §10).
 *
 * Two absolutes encoded here:
 *   • a reply never claims a state the database has not recorded: no "پرداخت
 *     تأیید شد" unless payment is `verified`, no tracking code unless one is
 *     stored (we never invent one), no "ارسال شد" unless the shipment says so;
 *   • building or copying a reply does not change anything — there is no `sent`
 *     in this file, and the preview is not persisted until a human queues it in
 *     phase 3.
 *
 * In phase 1–2 this text is shown for a human to copy. The template key and
 * version are returned so the UI can label exactly which sentence it is and the
 * record can prove later which version was used.
 */

export const REPLY_TEMPLATE_VERSION = "reply-v1";

export type ReplyTemplateKey =
  | "address_after_shipment"
  | "tracking_registered"
  | "tracking_missing"
  | "payment_claimed"
  | "payment_verified"
  | "address_needed"
  | "shipping_preparing"
  | "general_received";

export type ReplyInput = {
  orderRef: string;
  orderStatus: OrderStatusValue;
  paymentStatus: PaymentStatusValue;
  shipmentStatus: ShipmentStatusValue;
  trackingCode: string | null;
  carrier: string | null;
  /** The customer asked for tracking in this cycle. */
  trackingRequested: boolean;
  /** A new address was announced but the full address is not recorded. */
  addressMissing: boolean;
  /** The parcel is already on its way. */
  addressChangeAfterShipment: boolean;
  /** Posting to the channel is paused by the shop. */
  postingPaused: boolean;
};

export type ReplyPreview = {
  templateKey: ReplyTemplateKey;
  templateVersion: string;
  body: string;
  /** False when the sentence would be misleading in the current state. */
  allowed: boolean;
};

/**
 * Order matters. The first sentence that is *true of the stored state* wins, and
 * every branch below is a fact read from the order, not from the message tone.
 */
export function buildReplyPreview(input: ReplyInput): ReplyPreview {
  const ref = input.orderRef;

  if (input.orderStatus === "cancelled") {
    return reply(
      "general_received",
      `سفارش ${ref} لغو شده است. اگر درخواست تازه‌ای دارید بنویسید تا بررسی شود.`,
      false,
    );
  }

  if (input.addressChangeAfterShipment) {
    return reply(
      "address_after_shipment",
      `آدرس مرسولهٔ سفارش ${ref} پس از ارسال تغییر نمی‌کند؛ درخواست شما برای بررسی به فروشنده ارجاع شد.`,
      true,
    );
  }

  if (input.trackingCode && (input.shipmentStatus === "shipped" || input.shipmentStatus === "delivered")) {
    const carrier = input.carrier ? ` (${input.carrier})` : "";
    return reply(
      "tracking_registered",
      `کد رهگیری سفارش ${ref}${carrier}: ${input.trackingCode}`,
      true,
    );
  }

  if (input.trackingRequested && !input.trackingCode) {
    return reply(
      "tracking_missing",
      `اطلاعات رهگیری سفارش ${ref} هنوز ثبت نشده؛ درخواست پیگیری برای فروشگاه ثبت شد.`,
      true,
    );
  }

  if (input.paymentStatus === "claimed") {
    return reply(
      "payment_claimed",
      `اعلام پرداخت شما برای سفارش ${ref} ثبت شد و در حال بررسی است.`,
      true,
    );
  }

  if (input.paymentStatus === "verified") {
    return reply("payment_verified", `پرداخت سفارش ${ref} تأیید شده است.`, true);
  }

  if (input.addressMissing) {
    return reply("address_needed", `برای ارسال سفارش ${ref}، آدرس کامل و کد پستی را بفرستید.`, true);
  }

  if (input.shipmentStatus === "preparing") {
    return reply("shipping_preparing", `سفارش ${ref} در حال آماده‌سازی است.`, true);
  }

  return reply("general_received", `پیام شما دربارهٔ سفارش ${ref} ثبت شد؛ همکار ما بررسی می‌کند.`, true);
}

function reply(templateKey: ReplyTemplateKey, body: string, allowed: boolean): ReplyPreview {
  return { templateKey, templateVersion: REPLY_TEMPLATE_VERSION, body, allowed };
}
