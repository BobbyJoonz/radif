import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { isLocale } from "@/i18n/config";
import { withLocale } from "@/i18n/config";
import { currentPlatformAdmin, platformOverview } from "@/server/platform";

export const metadata: Metadata = { title: "مدیریت پلتفرم" };

export const dynamic = "force-dynamic";

/**
 * The platform desk: metadata about the platform, for the platform principal only.
 *
 * A shop owner who types this URL is sent back to their own queue; an anonymous
 * visitor to /login. There is no private shop content here by construction — the
 * query set below only counts rows.
 */
export default async function AdminPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params;
  const locale = isLocale(raw) ? raw : "fa";
  const admin = await currentPlatformAdmin();
  if (!admin) redirect(withLocale(locale, "/today"));
  const overview = await platformOverview();

  const rows: { label: string; value: string }[] = [
    { label: "فروشگاه‌ها", value: String(overview.shops) },
    { label: "فروشگاه‌های نمایشی مشترک", value: String(overview.sharedDemoShops) },
    { label: "عضویت‌ها", value: String(overview.members) },
    { label: "پیام‌های ذخیره‌شده", value: String(overview.messages) },
    { label: "اجرای تحلیل", value: String(overview.analysisRuns) },
    { label: "پرداخت‌های تأییدشده", value: String(overview.verifiedPayments) },
  ];
  const jobs = Object.entries(overview.jobsByStatus).sort((a, b) => a[0].localeCompare(b[0]));

  return (
    <main className="publicstatus">
      <div className="publicstatus-inner">
        <p className="publicstatus-eyebrow">مدیریت پلتفرم</p>
        <h1 className="publicstatus-title">سلامت سامانه</h1>
        <p className="publicstatus-sub">{admin.email} · فقط فراداده، بدون محتوای خصوصی فروشگاه‌ها</p>
        <dl className="publicstatus-rows">
          {rows.map((row) => (
            <div className="publicstatus-row" key={row.label}>
              <dt>{row.label}</dt>
              <dd className="nums">{row.value}</dd>
            </div>
          ))}
        </dl>
        <h2 className="publicstatus-title" style={{ fontSize: "1.1rem" }}>
          کارهای پردازش
        </h2>
        <dl className="publicstatus-rows">
          {jobs.length === 0 ? (
            <div className="publicstatus-row"><dt>صف</dt><dd>خالی</dd></div>
          ) : (
            jobs.map(([status, count]) => (
              <div className="publicstatus-row" key={status}>
                <dt className="mono ltr">{status}</dt>
                <dd className="nums">{count}</dd>
              </div>
            ))
          )}
        </dl>
      </div>
    </main>
  );
}
