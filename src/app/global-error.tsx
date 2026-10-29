"use client";

import { BrandEmblem } from "@/components/brand/brand-mark";
import "./globals.css";

/**
 * Last line of defence: an error thrown above the locale layout (a broken
 * environment, a provider crash) renders this instead of Next's white error page.
 * It must bring its own <html>/<body> and styles, and it must not print a stack
 * trace to the visitor.
 */
export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  return (
    <html lang="fa" dir="rtl">
      <body>
        <div className="brandscreen">
          <BrandEmblem size={56} />
          <h1 className="brandscreen-title">این صفحه باز نشد</h1>
          <p className="brandscreen-body">
            خطا ثبت شد. اگر تازه نصب کرده‌اید، ابتدا متغیرهای محیطی را تنظیم کنید.
          </p>
          <p className="brandscreen-body" lang="en" dir="ltr">
            Something failed before the app could render. Check the deployment
            environment first, then retry.
          </p>
          <div className="brandscreen-actions">
            <a className="ghost-btn" href="/api/health?deep=1">
              گزارش تشخیص / diagnostics
            </a>
            <a className="ghost-btn" href="/fa">
              بازگشت / Back
            </a>
          </div>
          {error.digest ? (
            <p className="brandscreen-body mono ltr">digest: {error.digest}</p>
          ) : null}
        </div>
      </body>
    </html>
  );
}
