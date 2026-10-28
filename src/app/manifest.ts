import type { MetadataRoute } from "next";

/**
 * PWA manifest. The icons are generated from the supplied emblem by
 * scripts/brand-assets.py; `maskable` is a full-bleed navy tile so Android can
 * crop it to any launcher shape without clipping the ribbon.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "ردیف — میز سفارش فروشگاه | Radif",
    short_name: "ردیف",
    description:
      "صف کار و سفارش برای فروشنده‌های اینستاگرامی: هر دایرکت به یک اقدام روشن با شاهد تبدیل می‌شود.",
    id: "/",
    start_url: "/fa",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    lang: "fa",
    dir: "rtl",
    background_color: "#000014",
    theme_color: "#000014",
    categories: ["business", "productivity"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
