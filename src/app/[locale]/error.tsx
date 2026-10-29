"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BrandEmblem } from "@/components/brand/brand-mark";

/**
 * Error boundary under the locale segment. Keeps the user's place, offers one
 * retry, and does not pretend nothing happened.
 */
export default function LocaleError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const pathname = usePathname();
  const fa = !pathname.startsWith("/en");
  return (
    <div className="brandscreen">
      <BrandEmblem size={48} />
      <h1 className="brandscreen-title">{fa ? "این بخش باز نشد" : "This part did not open"}</h1>
      <p className="brandscreen-body">
        {fa
          ? "خطا ثبت شد. ورودی‌های شما از بین نرفته؛ دوباره تلاش کنید."
          : "The error was logged. Your input is kept — try again."}
      </p>
      <div className="brandscreen-actions">
        <button type="button" className="ghost-btn" onClick={() => reset()}>
          {fa ? "تلاش دوباره" : "Try again"}
        </button>
        <Link className="ghost-btn" href={fa ? "/fa" : "/en"}>
          {fa ? "بازگشت به امروز" : "Back to Today"}
        </Link>
      </div>
    </div>
  );
}
