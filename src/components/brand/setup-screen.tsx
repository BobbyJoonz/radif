import { BrandEmblem } from "./brand-mark";

/**
 * The screen a deployment shows when it cannot serve the product yet.
 *
 * Three distinct states used to share one page, which told a visitor "the tables
 * are missing" even when the database had simply gone to sleep — a wrong
 * diagnosis sends someone to run migrations that are already applied.
 *
 *   schema       — reachable, but no tables (offer provisioning)
 *   unreachable  — could not connect at all (offer retry)
 *   env          — a required variable is missing (name it)
 */
export type SetupReason = "schema" | "unreachable" | "env";

const COPY = {
  schema: {
    title: "دیتابیس خالی است",
    body: "به دیتابیس وصل شدیم، ولی جدول‌ها هنوز ساخته نشده‌اند. یک کلیک کافی است: جدول‌ها ساخته می‌شوند و دموی کامل بارگذاری می‌شود.",
    action: "ساخت جدول‌ها و دادهٔ نمایشی",
    actionEn: "Create tables and demo data",
  },
  unreachable: {
    title: "دیتابیس پاسخ نمی‌دهد",
    body: "اتصال برقرار نشد. اگر دیتابیس مدیریت‌شده است ممکن است خواب رفته باشد؛ چند لحظه بعد دوباره تلاش کنید.",
    action: "تلاش دوباره",
    actionEn: "Try again",
  },
  env: {
    title: "این نسخه هنوز پیکربندی نشده",
    body: "این متغیرها در محیط استقرار تنظیم نشده‌اند. بعد از تنظیم، دوباره مستقر کنید.",
    action: null,
    actionEn: null,
  },
} as const;

export function SetupScreen({ missing = [], reason = "env" }: { missing?: string[]; reason?: SetupReason }) {
  const t = COPY[reason];

  return (
    <div className="brandscreen" role="alert">
      <BrandEmblem size={56} />
      <h1 className="brandscreen-title">{t.title}</h1>
      <p className="brandscreen-body">{t.body}</p>

      {reason === "env" && missing.length > 0 ? (
        <ul className="setup-missing">
          {missing.map((name) => (
            <li key={name}>
              <code className="mono ltr">{name}</code>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="brandscreen-actions">
        {t.action ? (
          reason === "schema" ? (
            <a className="setup-primary" href="/api/setup">
              {t.action}
              <span lang="en" dir="ltr">
                {t.actionEn}
              </span>
            </a>
          ) : (
            <a className="setup-primary" href="">
              {t.action}
            </a>
          )
        ) : null}
        <a className="ghost-btn" href="/api/health?deep=1">
          گزارش تشخیص
        </a>
      </div>

      <p className="brandscreen-body setup-hint">
        راهنما: بخش «Deploy on Vercel» در <code className="mono ltr">README.md</code> و{" "}
        <code className="mono ltr">.env.example</code> در مخزن.
      </p>
    </div>
  );
}
