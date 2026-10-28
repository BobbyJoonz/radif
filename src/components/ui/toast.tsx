"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import styles from "./ui.module.css";

/**
 * A toast confirms a *stored* fact ("ذخیره شد") or shows the Persian error the
 * server sent. It never says a thing happened when the request failed.
 */
export type ToastTone = "ok" | "error";

export function useToast(durationMs = 4200) {
  const [toast, setToast] = useState<{ message: string; tone: ToastTone } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = useCallback(
    (message: string, tone: ToastTone = "ok") => {
      setToast({ message, tone });
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setToast(null), durationMs);
    },
    [durationMs],
  );

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  return { toast, show, clear: () => setToast(null) };
}

export function Toast({ message, tone = "ok", onClose }: { message: ReactNode | null; tone?: ToastTone; onClose?: () => void }) {
  if (!message) return null;
  return (
    <div className={[styles.toast, tone === "error" ? styles.toastError : ""].join(" ").trim()} role="status" aria-live="polite">
      <span>{message}</span>
      {onClose ? (
        <button type="button" className={styles.quiet} onClick={onClose}>
          ×
        </button>
      ) : null}
    </div>
  );
}
