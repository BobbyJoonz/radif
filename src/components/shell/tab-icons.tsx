import type { NavKey } from "@/lib/nav-matrix";

/**
 * One icon per destination, drawn here rather than pulled from an icon package:
 * five 20px glyphs are cheaper than a dependency, and they match the hairline weight
 * of the ledger (1.6 stroke, no fills) so the bar belongs to the product.
 */
const PATHS: Record<string, string[]> = {
  today: ["M4 6h16", "M4 12h10", "M4 18h13"],
  inbox: ["M20 12a8 8 0 1 1-3.2-6.4", "M20 4v5h-5"],
  orders: ["M7 3h10a1 1 0 0 1 1 1v17l-3-2-3 2-3-2-3 2V4a1 1 0 0 1 1-1Z", "M9 8h6", "M9 12h6"],
  tasks: ["M4 6h4", "M4 12h4", "M4 18h4", "M11 6h9", "M11 12h9", "M11 18h9"],
  customers: ["M8 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z", "M2 21v-1a6 6 0 0 1 12 0v1", "M16 4.5a3.5 3.5 0 0 1 0 7", "M22 21v-1a5 5 0 0 0-4-4.9"],
  import: ["M12 3v12", "M8 11l4 4 4-4", "M4 21h16"],
  settings: ["M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z", "M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2 2 2 0 1 1-4 0 1.7 1.7 0 0 0-2.9-1.2l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.7 1.7 0 0 0 4.6 15a2 2 0 1 1 0-4 1.7 1.7 0 0 0 1.2-2.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.7 1.7 0 0 0 11.5 4a2 2 0 1 1 4 0 1.7 1.7 0 0 0 2.9 1.2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1A1.7 1.7 0 0 0 19.4 11a2 2 0 1 1 0 4Z"],
  evaluation: ["M4 20V10", "M10 20V4", "M16 20v-7", "M22 20H2"],
  more: ["M5 12h.01", "M12 12h.01", "M19 12h.01"],
};

export function TabIcon({ name, className }: { name: NavKey | "more"; className?: string }) {
  const paths = PATHS[name] ?? PATHS.more;
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {paths.map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}
