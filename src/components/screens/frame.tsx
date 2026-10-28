import type { ReactNode } from "react";
import styles from "./screens.module.css";

/**
 * The page frame every screen shares: one 800-weight title, one quiet line of
 * real counts, one rule. No KPI card row, no gradient header (DIRECTION.md §5).
 */
export function ScreenFrame({
  title,
  lede,
  aside,
  children,
  below,
}: {
  title: ReactNode;
  lede?: ReactNode;
  aside?: ReactNode;
  children: ReactNode;
  below?: ReactNode;
}) {
  return (
    <div className={styles.page}>
      <header className={styles.head}>
        <div>
          <h1 className={styles.h1}>{title}</h1>
          {lede ? <p className={styles.lede}>{lede}</p> : null}
          {below}
        </div>
        {aside ? <div className={styles.headAside}>{aside}</div> : null}
      </header>
      {children}
    </div>
  );
}

/** Counters are one line of text that filters — never four cards. */
export function CountLine({
  items,
}: {
  items: { label: ReactNode; value: ReactNode; hot?: boolean; href?: string }[];
}) {
  return (
    <div className={styles.countLine}>
      {items.map((item, index) => (
        <span
          key={index}
          className={[styles.countLineItem, item.hot ? styles.countLineItemHot : ""].join(" ").trim()}
        >
          <b>{item.value}</b> {item.label}
        </span>
      ))}
    </div>
  );
}
