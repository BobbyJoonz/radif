"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BrandEmblem } from "@/components/brand/brand-mark";

/** Not found: the emblem, the reason, one way back. */
export default function LocaleNotFound() {
  const pathname = usePathname();
  const fa = !pathname.startsWith("/en");
  return (
    <div className="brandscreen">
      <BrandEmblem size={48} />
      <h1 className="brandscreen-title">{fa ? "این صفحه پیدا نشد" : "This page was not found"}</h1>
      <p className="brandscreen-body">
        {fa
          ? "ممکن است حذف شده باشد یا نشانی‌اش عوض شده باشد."
          : "It may have been removed, or its address changed."}
      </p>
      <div className="brandscreen-actions">
        <Link className="ghost-btn" href={fa ? "/fa" : "/en"}>
          {fa ? "رفتن به امروز" : "Go to Today"}
        </Link>
      </div>
    </div>
  );
}
