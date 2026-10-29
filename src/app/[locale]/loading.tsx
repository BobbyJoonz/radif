import { BrandEmblem } from "@/components/brand/brand-mark";

/**
 * Route-level loading state: the emblem, and nothing else. No spinner — a
 * three-dot bounce would be the tenth different thing on a screen that is about
 * to fill with real work. Language-neutral on purpose, so it needs no dictionary.
 */
export default function Loading() {
  return (
    <div className="brandscreen" role="status" aria-live="polite">
      <BrandEmblem size={56} className="brandscreen-emblem" />
      <span className="visually-hidden">در حال بارگذاری / Loading</span>
    </div>
  );
}
