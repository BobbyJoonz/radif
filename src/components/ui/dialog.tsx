"use client";

import { useEffect, useRef, type ReactNode } from "react";
import styles from "./ui.module.css";

/**
 * A dialog for the one action that changes a *verified* fact (money, mostly).
 * It states the consequence in the body and keeps the confirm button last.
 */
export function Dialog({
  open,
  title,
  body,
  children,
  actions,
  onClose,
  labelledBy,
}: {
  open: boolean;
  title: ReactNode;
  body?: ReactNode;
  children?: ReactNode;
  actions?: ReactNode;
  onClose: () => void;
  labelledBy?: string;
}) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const titleId = labelledBy ?? "radif-dialog-title";

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const first = panelRef.current?.querySelector<HTMLElement>("button, input, select, textarea");
    first?.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className={styles.backdrop}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby={titleId} ref={panelRef}>
        <h2 className={styles.dialogTitle} id={titleId}>
          {title}
        </h2>
        {body ? <p className={styles.dialogBody}>{body}</p> : null}
        {children}
        {actions ? <div className={styles.dialogActions}>{actions}</div> : null}
      </div>
    </div>
  );
}
