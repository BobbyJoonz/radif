import { Inter } from "next/font/google";

/**
 * The Latin face.
 *
 * Peyda is a Persian typeface; its Latin is serviceable but it was not drawn for a
 * ledger — the English UI needs calm x-height, true tabular figures for numbers in
 * tables, and tight display tracking for headings. Inter is variable, so one file
 * covers 400-800, and it is loaded with `display: swap` so text is never invisible.
 *
 * It is applied to the English document only (see `html[lang="en"]` in globals.css):
 * the Persian UI keeps Peyda, which is the approved identity.
 */
export const latin = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-latin",
  fallback: ["system-ui", "Segoe UI", "Roboto", "Helvetica Neue", "Arial"],
  adjustFontFallback: true,
});
