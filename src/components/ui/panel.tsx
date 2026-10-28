import type { ReactNode } from "react";
import styles from "./ui.module.css";

/**
 * Surfaces are only drawn when the thing is an **object**: a message, a sheet,
 * a selected row. Everything else is grouped with space and a hairline
 * (DIRECTION.md §3). Nothing here nests a panel inside a panel.
 */
export function Panel({
  children,
  className,
  as: Tag = "div",
}: {
  children: ReactNode;
  className?: string;
  as?: "div" | "section" | "article" | "li";
}) {
  return <Tag className={[styles.panel, className ?? ""].join(" ").trim()}>{children}</Tag>;
}

export function Sheet({
  title,
  meta,
  children,
  footer,
  className,
  id,
  label,
}: {
  title: ReactNode;
  meta?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
  id?: string;
  label?: string;
}) {
  return (
    <section className={[styles.sheet, className ?? ""].join(" ").trim()} id={id} aria-label={label}>
      <header className={styles.sheetHead}>
        <h2 className={styles.sheetTitle}>{title}</h2>
        {meta ? <span className={styles.sheetMeta}>{meta}</span> : null}
      </header>
      <div className={styles.sheetBody}>{children}</div>
      {footer ? <div className={styles.sheetFoot}>{footer}</div> : null}
    </section>
  );
}

export { styles as uiStyles };
