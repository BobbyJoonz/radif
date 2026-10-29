import "./globals.css";
import Link from "next/link";
import type { Metadata } from "next";
import { BrandEmblem } from "@/components/brand/brand-mark";

export const metadata: Metadata = {
  title: "۴۰۴ · ردیف",
  robots: { index: false, follow: false },
};

/**
 * Unmatched routes never enter the locale layout, so this page has to bring its
 * own document, styles and theme (Next's global-not-found convention). Without
 * it, a wrong URL inside a dark product lands on Next's white 404 — the single
 * most jarring screen a user can hit.
 */
export default function GlobalNotFound() {
  return (
    <html lang="fa" dir="rtl">
      <body>
        <div className="brandscreen">
          <BrandEmblem size={56} />
          <h1 className="brandscreen-title">این صفحه پیدا نشد</h1>
          <p className="brandscreen-body">
            نشانی اشتباه است یا صفحه جابه‌جا شده. ردیف و فروشگاه شما سرِ جایشان هستند.
          </p>
          <p className="brandscreen-body" lang="en" dir="ltr">
            This page does not exist. Your queue is untouched.
          </p>
          <div className="brandscreen-actions">
            <Link className="ghost-btn" href="/fa">
              رفتن به امروز
            </Link>
            <Link className="ghost-btn" href="/en" lang="en">
              Go to Today
            </Link>
          </div>
        </div>
      </body>
    </html>
  );
}
