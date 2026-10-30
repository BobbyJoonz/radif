import type { Metadata } from "next";
import Link from "next/link";
import { BrandMark } from "@/components/brand/brand-mark";
import { isDemo } from "@/lib/env";
import { prisma } from "@/server/db";
import { isLocale, type Locale } from "@/i18n/config";
import { formatDateTime, formatMoney, formatNumber } from "@/i18n/format";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "نمای مشتری · ردیف" };

/**
 * The customer persona, read-only.
 *
 * There is no customer account in phase 1–2 (phase 4 adds verified identity), so
 * this route is a deliberate, clearly-labelled demo view: one seeded customer,
 * their own orders and their own messages, nothing else. It is demo-mode only and
 * contains no action other than leaving.
 */
export default async function CustomerDemoPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params;
  const locale: Locale = isLocale(raw) ? raw : "fa";

  if (!isDemo()) {
    return (
      <main className="brandscreen">
        <BrandMark />
        <h1 className="brandscreen-title">این صفحه فقط در حالت دمو است</h1>
        <Link className="ghost-btn" href={`/${locale}`}>
          بازگشت
        </Link>
      </main>
    );
  }

  const customer = await prisma.customer.findFirst({
    where: { tenantId: "tenant_toranj", id: "cust_negar" },
    include: {
      orders: {
        orderBy: { orderCreatedAt: "desc" },
        take: 60,
        include: { items: true, paymentClaims: true, shipments: true },
      },
      conversations: {
        include: { messages: { orderBy: { occurredAt: "desc" }, take: 1 } },
        take: 3,
        orderBy: { lastMessageAt: "desc" },
      },
    },
  });

  const fa = locale === "fa";
  const t = {
    eyebrow: fa ? "نمای مشتری · دموی خواندنی" : "Customer view · read-only demo",
    name: customer?.displayName ?? (fa ? "مشتری نمونه" : "Demo customer"),
    intro: fa
      ? "این همان چیزی است که مشتری از سفارش خودش می‌بیند: وضعیت‌ها، بدون دسترسی به صف فروشگاه."
      : "This is what the customer sees of their own orders: states only, no access to the shop's queue.",
    orders: fa ? "سفارش‌ها" : "Orders",
    empty: fa ? "سفارشی ثبت نشده." : "No orders yet.",
    back: fa ? "بازگشت به لندینگ" : "Back to the site",
    items: fa ? "قلم" : "items",
    payment: fa ? "پرداخت" : "payment",
    shipment: fa ? "ارسال" : "shipment",
  };

  const paymentLabel = (status: string) =>
    fa
      ? { unknown: "نامشخص", claimed: "اعلام‌شده", verified: "تأیید شده", disputed: "اختلاف", refunded: "برگشتی" }[
          status as "unknown"
        ] ?? status
      : status;
  const shipmentLabel = (status: string) =>
    fa
      ? {
          not_ready: "آمادهٔ ارسال نیست",
          preparing: "در حال آماده‌سازی",
          shipped: "ارسال شده",
          delivered: "تحویل شده",
          paused: "متوقف",
        }[status as "not_ready"] ?? status
      : status;

  return (
    <div className="mkt">
      <header className="mkt-head">
        <div className="mkt-head-inner">
          <Link href={`/${locale}`} className="brand" aria-label="ردیف · Radif">
            <BrandMark priority />
          </Link>
          <span className="mkt-head-spacer" aria-hidden="true" />
          <Link href={`/${locale}`} className="mkt-signin">
            {t.back}
          </Link>
        </div>
      </header>

      <main className="cust">
        <p className="cust-eyebrow">{t.eyebrow}</p>
        <h1>{t.name}</h1>
        <p className="cust-intro">{t.intro}</p>

        <h2 className="cust-h2">
          {t.orders}
          <span className="cust-count">{formatNumber(customer?.orders.length ?? 0, locale)}</span>
        </h2>

        {customer && customer.orders.length > 0 ? (
          <ul className="cust-orders">
            {customer.orders.map((order) => {
              const payment = order.paymentClaims[0]?.status ?? "unknown";
              const shipment = order.shipments[0]?.status ?? "not_ready";
              return (
                <li key={order.id} className="cust-order">
                  <span className="cust-ref mono ltr">{order.publicRef}</span>
                  <span className="cust-when">{formatDateTime(order.orderCreatedAt, locale)}</span>
                  <span className="cust-amount nums">{formatMoney(order.totalMinor, "IRR", locale, { unit: "toman" })}</span>
                  <span className="cust-states">
                    <span>{t.payment}: {paymentLabel(payment)}</span>
                    <span>{t.shipment}: {shipmentLabel(shipment)}</span>
                  </span>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="cust-intro">{t.empty}</p>
        )}
      </main>
    </div>
  );
}
