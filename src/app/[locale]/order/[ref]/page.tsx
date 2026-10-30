import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/server/db";
import { isDemo } from "@/lib/env";
import { isLocale, type Locale } from "@/i18n/config";

export const dynamic = "force-dynamic";

/**
 * The customer's window — the first, smallest slice of phase 4.
 *
 * Someone with the link sees the state of *one* order and nothing else: no list of
 * orders, no phone, no address. This is the "possession link" the brief describes,
 * kept deliberately minimal and available only in demo mode, where the order refs
 * are synthetic (`DEMO-ORD-*`).
 *
 * It is NOT an identity: the link is not proof that the visitor owns the
 * Instagram account, and the page says so.
 */
export async function generateMetadata({ params }: { params: Promise<{ locale: string; ref: string }> }): Promise<Metadata> {
  const { locale, ref } = await params;
  const safe = isLocale(locale) ? locale : "fa";
  return { title: safe === "fa" ? `وضعیت سفارش ${ref}` : `Order ${ref}` };
}

const paymentLabel: Record<string, { fa: string; en: string }> = {
  unknown: { fa: "پرداخت ثبت نشده", en: "No payment recorded" },
  claimed: { fa: "اعلام پرداخت — در حال بررسی", en: "Payment claimed — under review" },
  verified: { fa: "پرداخت تأیید شده", en: "Payment verified" },
  disputed: { fa: "پرداخت در اختلاف", en: "Payment disputed" },
  refunded: { fa: "برگشت داده شده", en: "Refunded" },
};

const orderLabel: Record<string, { fa: string; en: string }> = {
  draft: { fa: "پیش‌نویس", en: "Draft" },
  needs_review: { fa: "نیاز به بررسی", en: "Needs review" },
  confirmed: { fa: "تأیید شده", en: "Confirmed" },
  cancelled: { fa: "لغو شده", en: "Cancelled" },
};

const shipmentLabel: Record<string, { fa: string; en: string }> = {
  not_ready: { fa: "آمادهٔ ارسال نیست", en: "Not ready" },
  preparing: { fa: "در حال آماده‌سازی", en: "Preparing" },
  shipped: { fa: "ارسال شده", en: "Shipped" },
  delivered: { fa: "تحویل شده", en: "Delivered" },
  paused: { fa: "متوقف", en: "Paused" },
};

export default async function PublicOrderPage({ params }: { params: Promise<{ locale: string; ref: string }> }) {
  const { locale: raw, ref } = await params;
  const locale: Locale = isLocale(raw) ? raw : "fa";
  const fa = locale === "fa";

  if (!isDemo()) notFound();

  const order = await prisma.order.findFirst({
    where: { publicRef: decodeURIComponent(ref) },
    select: {
      publicRef: true,
      status: true,
      totalMinor: true,
      currency: true,
      orderCreatedAt: true,
      confirmedAt: true,
      customer: { select: { displayName: true } },
      paymentClaims: { select: { status: true }, orderBy: { claimedAt: "desc" }, take: 1 },
      shipments: { select: { status: true, trackingCode: true, carrier: true }, orderBy: { updatedAt: "desc" }, take: 1 },
      items: { select: { titleSnapshot: true, qty: true } },
    },
  });
  if (!order) notFound();

  const payment = order.paymentClaims[0]?.status ?? "unknown";
  const shipment = order.shipments[0] ?? null;
  const money = new Intl.NumberFormat(fa ? "fa-IR" : "en-GB").format(order.totalMinor / BigInt(10));
  const when = new Intl.DateTimeFormat(fa ? "fa-IR-u-ca-persian" : "en-GB", {
    dateStyle: "medium",
    timeZone: "Asia/Tehran",
  }).format(order.orderCreatedAt);

  const rows: { label: string; value: string; tone?: "warn" | "ok" }[] = [
    {
      label: fa ? "وضعیت سفارش" : "Order",
      value: (orderLabel[order.status] ?? orderLabel.draft)[fa ? "fa" : "en"],
      tone: order.status === "needs_review" ? "warn" : order.status === "confirmed" ? "ok" : undefined,
    },
    {
      label: fa ? "وضعیت پرداخت" : "Payment",
      value: (paymentLabel[payment] ?? paymentLabel.unknown)[fa ? "fa" : "en"],
      tone: payment === "verified" ? "ok" : payment === "claimed" ? "warn" : undefined,
    },
    {
      label: fa ? "وضعیت ارسال" : "Shipment",
      value: shipment ? (shipmentLabel[shipment.status] ?? shipmentLabel.not_ready)[fa ? "fa" : "en"] : (fa ? "ثبت نشده" : "Not recorded"),
    },
    {
      label: fa ? "کد رهگیری" : "Tracking code",
      value: shipment?.trackingCode ?? (fa ? "هنوز ثبت نشده" : "Not recorded yet"),
    },
  ];

  return (
    <main className="publicstatus">
      <div className="publicstatus-inner">
        <p className="publicstatus-eyebrow">
          {fa ? "دادهٔ نمایشی" : "Demo data"} · {fa ? "وضعیت یک سفارش" : "One order"}
        </p>
        <h1 className="publicstatus-title">
          <bdi className="mono ltr">{order.publicRef}</bdi>
        </h1>
        <p className="publicstatus-sub">
          {fa ? "فروشگاه" : "Shop"}: {order.customer.displayName} · {when}
        </p>

        <dl className="publicstatus-rows">
          {rows.map((row) => (
            <div className="publicstatus-row" key={row.label}>
              <dt>{row.label}</dt>
              <dd data-tone={row.tone}>{row.value}</dd>
            </div>
          ))}
        </dl>

        <div className="publicstatus-items">
          {order.items.map((item, index) => (
            <div key={index} className="publicstatus-item">
              <span>{item.titleSnapshot}</span>
              <span className="nums">×{new Intl.NumberFormat(fa ? "fa-IR" : "en-GB").format(item.qty)}</span>
            </div>
          ))}
          <div className="publicstatus-item total">
            <span>{fa ? "مبلغ" : "Amount"}</span>
            <span className="nums">
              {money} {fa ? "تومان" : "toman"}
            </span>
          </div>
        </div>

        <p className="publicstatus-note">
          {fa
            ? "این لینک فقط وضعیت همان یک سفارش را نشان می‌دهد: نه فهرست سفارش‌ها، نه شماره و نه آدرس. داشتن این لینک به‌معنای احراز هویت اینستاگرام نیست."
            : "This link shows the state of this one order only: no order list, no phone, no address. Holding it is not proof of Instagram ownership."}
        </p>

        <Link className="ghost-btn" href={fa ? "/fa/login" : "/en/login"}>
          {fa ? "بازگشت به ورود" : "Back to sign-in"}
        </Link>
      </div>
    </main>
  );
}
