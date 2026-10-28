import type { ReactNode } from "react";

/**
 * Machine values (ids, order refs, phones, usernames, tracking codes) print in
 * Latin digits inside an isolated LTR run, so the bidi algorithm cannot
 * reorder them inside a Persian sentence (DIRECTION.md §3).
 */
export function Ltr({
  children,
  mono = false,
  className,
}: {
  children: ReactNode;
  mono?: boolean;
  className?: string;
}) {
  return (
    <bdi dir="ltr" className={[mono ? "mono" : "", "ltr", className ?? ""].join(" ").trim()}>
      {children}
    </bdi>
  );
}

/** Human-facing numbers keep the locale's own digits (fa → ۰۱۲۳). */
export function Num({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={["nums", className ?? ""].join(" ").trim()}>{children}</span>;
}
