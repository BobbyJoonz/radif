import Image from "next/image";
import type { Locale } from "@/i18n/config";

/**
 * The supplied brand lockup, used as supplied.
 *
 * The client shipped one emblem and two wordmarks (lowercase `radif`, uppercase
 * `RADIF`), all transparent. This component only picks the file and the size —
 * it never redraws, recolours or re-letters the mark:
 *
 *   • header  — lowercase lockup at 26px, the friendlier of the two
 *   • login   — uppercase lockup at 44px, the formal one
 *   • emblem  — favicon, app icons, PWA, loading and error screens
 *
 * `alt` is empty because the lockup always sits inside a link or heading that
 * already names the product; a second accessible name would just repeat it.
 */
export function BrandMark({
  size = "sm",
  variant = "lower",
  priority = false,
}: {
  locale?: Locale;
  size?: "sm" | "lg";
  variant?: "lower" | "caps";
  priority?: boolean;
}) {
  const height = size === "lg" ? 44 : 26;
  // trimmed aspect ratios of the supplied files, measured by scripts/brand-assets.py
  const ratio = variant === "caps" ? 1968 / 598 : 1828 / 791;
  const src = variant === "caps" ? "/brand/radif-lockup-caps.png" : "/brand/radif-lockup.png";

  return (
    <span className={`brandmark brandmark-${size}`}>
      <Image
        src={src}
        alt=""
        width={Math.round(height * ratio)}
        height={height}
        priority={priority}
        className="brandmark-lockup"
        sizes={`${Math.round(height * ratio)}px`}
      />
    </span>
  );
}

/** The emblem alone, for screens where the wordmark would be too much. */
export function BrandEmblem({ size = 40, className = "" }: { size?: number; className?: string }) {
  return (
    <Image
      src="/brand/radif-emblem.png"
      alt=""
      width={size}
      height={size}
      aria-hidden="true"
      className={`brandemblem ${className}`.trim()}
      sizes={`${size}px`}
    />
  );
}
