import type { NavKey } from "@/lib/nav-matrix";

/**
 * One glyph per destination, drawn on the same 24px grid with the same 1.5 stroke as
 * the ledger's hairlines — five icons from five different families look like five
 * different products, which is what the first version of this bar got wrong:
 *
 *   today     → a ledger page (the queue is a page, not a "chart")
 *   inbox     → a chat bubble (it was a refresh arrow; an arrow is not a conversation)
 *   orders    → a parcel (the thing the seller actually ships)
 *   tasks     → a check inside a card (work that closes)
 *   more      → an ellipsis
 *
 * 18px is the optical match for a 9.5px label: one hairline weight for the whole bar.
 */
const PATHS: Record<string, string[]> = {
  today: ["M5 4h14a1 1 0 0 1 1 1v15H6a2 2 0 0 1-2-2V5a1 1 0 0 1 1-1Z", "M8 9h8", "M8 13h5"],
  inbox: ["M20 11a7 7 0 0 1-7 7H8l-4 3v-5.2A7 7 0 0 1 13 4a7 7 0 0 1 7 7Z"],
  orders: ["M12 3 4 7v10l8 4 8-4V7l-8-4Z", "M4 7l8 4 8-4", "M12 11v10"],
  tasks: ["M5 4h14a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Z", "M8.5 12.5l2.5 2.5 4.5-5"],
  customers: ["M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z", "M3 20v-.8A5.2 5.2 0 0 1 8.2 14h1.6A5.2 5.2 0 0 1 15 19.2V20", "M16 4.6a3.4 3.4 0 0 1 0 6.8", "M17.5 14.2A4.6 4.6 0 0 1 21 18.7V20"],
  import: ["M12 4v10", "M8.5 10.5 12 14l3.5-3.5", "M4 17v1.5A1.5 1.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5V17"],
  settings: ["M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z", "M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2 2 2 0 1 1-4 0 1.7 1.7 0 0 0-2.9-1.2l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.7 1.7 0 0 0 4.6 15a2 2 0 1 1 0-4 1.7 1.7 0 0 0 1.2-2.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.7 1.7 0 0 0 11.5 4a2 2 0 1 1 4 0 1.7 1.7 0 0 0 2.9 1.2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1A1.7 1.7 0 0 0 19.4 11a2 2 0 1 1 0 4Z"],
  evaluation: ["M4 19V9", "M10 19V5", "M16 19v-6", "M3 19h18"],
  more: ["M6 12h.01", "M12 12h.01", "M18 12h.01"],
};

export function TabIcon({ name, className }: { name: NavKey | "more"; className?: string }) {
  const paths = PATHS[name] ?? PATHS.more;
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
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
