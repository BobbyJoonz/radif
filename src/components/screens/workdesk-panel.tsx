import Link from "next/link";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n";
import { routes } from "@/lib/routes";
import { ClaimButton } from "./claim-button";
import type { WorkItemView } from "@/server/services/workdesk";

/**
 * The workdesk: one row per case, not one row per task.
 *
 * A row answers four questions in reading order — who/what, why it is here, who
 * owns it and when, and the single next action — followed by a quiet count of the
 * other open needs. The full ledger stays below; this is the part a seller reads
 * first.
 */
const ACTION_LABEL: Record<string, { fa: string; en: string }> = {
  associate_order: { fa: "انتخاب سفارش مرتبط", en: "Choose the order" },
  review_draft: { fa: "تکمیل پیش‌نویس", en: "Complete the draft" },
  complete_address: { fa: "تکمیل نشانی", en: "Complete the address" },
  request_owner_review: { fa: "ارسال برای بررسی مالک", en: "Request owner review" },
  verify_payment: { fa: "بررسی پرداخت", en: "Verify the payment" },
  record_tracking: { fa: "ثبت کد رهگیری", en: "Record tracking" },
  prepare_shipment: { fa: "آماده‌سازی ارسال", en: "Prepare the shipment" },
  prepare_reply: { fa: "آماده‌کردن پاسخ", en: "Prepare the reply" },
};

const BLOCKER_LABEL: Record<string, { fa: string; en: string }> = {
  no_order_associated: { fa: "سفارش مشخص نشده", en: "No order yet" },
  draft_incomplete: { fa: "پیش‌نویس ناقص", en: "Draft incomplete" },
  address_missing: { fa: "نشانی ناقص", en: "Address missing" },
  payment_claimed_unverified: { fa: "پرداخت اعلام‌شده، تأییدنشده", en: "Payment claimed, not verified" },
  payment_needs_owner: { fa: "منتظر بررسی مالک", en: "Waiting for the owner" },
  tracking_missing: { fa: "کد رهگیری ثبت نشده", en: "No tracking code" },
  tracking_requested: { fa: "رهگیری درخواست شده", en: "Tracking requested" },
  ready_to_prepare: { fa: "آمادهٔ آماده‌سازی", en: "Ready to prepare" },
  no_blocker: { fa: "بدون مانع", en: "No blocker" },
};

function text(table: Record<string, { fa: string; en: string }>, key: string, locale: Locale): string {
  const entry = table[key];
  if (!entry) return key;
  return locale === "fa" ? entry.fa : entry.en;
}

export function WorkdeskPanel({
  locale,
  cases,
  dict,
}: {
  locale: Locale;
  cases: WorkItemView[];
  dict: Dictionary;
}) {
  if (cases.length === 0) {
    return (
      <section className="workdesk" aria-label={locale === "fa" ? "میز کار" : "Workdesk"}>
        <p className="workdesk-empty">{locale === "fa" ? "پروندهٔ بازی نیست." : "No open cases."}</p>
      </section>
    );
  }

  return (
    <section className="workdesk" aria-label={locale === "fa" ? "میز کار" : "Workdesk"}>
      <div className="workdesk-head">
        <h2>{locale === "fa" ? "میز کار" : "Workdesk"}</h2>
        <span className="workdesk-count">{cases.length}</span>
      </div>
      <ul className="workdesk-list">
        {cases.map((item) => {
          const href = item.orderId
            ? routes.orders(locale, item.orderId)
            : item.conversationId
              ? routes.inbox(locale, item.conversationId)
              : routes.tasks(locale);
          return (
            <li key={item.key} className="wdcase">
              <div className="wdcase-main">
                <Link className="wdcase-who" href={href}>
                  {item.customerName ?? (locale === "fa" ? "مشتری نامشخص" : "Unknown customer")}
                  {item.orderRef ? <span className="wdcase-ref mono ltr">{item.orderRef}</span> : null}
                </Link>
                <p className="wdcase-why">{text(BLOCKER_LABEL, item.primaryBlocker, locale)}</p>
                <p className="wdcase-meta">
                  <span>{item.assigneeId ? (locale === "fa" ? "واگذارشده" : "assigned") : locale === "fa" ? "بدون مسئول" : "unassigned"}</span>
                  {item.dueAt ? <span>{new Date(item.dueAt).toISOString().slice(0, 10)}</span> : null}
                  {item.openCount > 1 ? (
                    <span>
                      {locale === "fa" ? `${item.openCount} مورد باز` : `${item.openCount} open`}
                    </span>
                  ) : null}
                </p>
              </div>
              <div className="wdcase-end">
                <Link className="wdcase-action" href={href}>
                  {text(ACTION_LABEL, item.primaryAction, locale)}
                </Link>
                {!item.assigneeId ? (
                  <ClaimButton
                    taskId={item.taskIds[0]}
                    label={locale === "fa" ? "برداشتن کار" : "Claim"}
                    conflictLabel={locale === "fa" ? "فرد دیگری زودتر برداشت." : "Someone claimed it first."}
                    errorLabel={locale === "fa" ? "برداشتن کار انجام نشد." : "Claim failed."}
                  />
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
      <p className="workdesk-foot">
        {locale === "fa"
          ? "هر ردیف یک پرونده است: یک اقدام اصلی، و بقیهٔ نیازها در همان پرونده."
          : "One row is one case: a single primary action, the rest stay in the case."}
      </p>
    </section>
  );
}
