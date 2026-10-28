import Image from "next/image";
import type { Locale } from "@/i18n/config";

/**
 * The brand lockup, built from the supplied emblem.
 *
 * Design decision (DIRECTION.md §3): the client's wordmark is Latin-only, while
 * this product is Persian-first. The emblem is the constant; the wordmark is
 * localised — «ردیف» in Peyda 800 for Persian, "radif" in Peyda 800 for English —
 * so the lockup is the same construction in both languages instead of a Latin
 * logo dropped into a Persian header. The exact supplied wordmark files are used
 * where the lockup is the subject (login, social card, store listing).
 */
export function BrandMark({
  locale,
  size = "sm",
  priority = false,
}: {
  locale: Locale;
  size?: "sm" | "lg";
  priority?: boolean;
}) {
  const word = locale === "fa" ? "ردیف" : "radif";
  const px = size === "lg" ? 52 : 26;
  return (
    <span className={`brandmark brandmark-${size}`}>
      <Image
        src="/brand/radif-emblem.png"
        alt=""
        width={px}
        height={px}
        priority={priority}
        className="brandmark-emblem"
        sizes={`${px}px`}
      />
      <span className="brandmark-word" lang={locale}>
        {word}
      </span>
    </span>
  );
}
