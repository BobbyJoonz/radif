"use client";

import { useEffect, useState } from "react";
import { IconCheck, IconCopy } from "./icons";
import styles from "./ui.module.css";

/**
 * Copies a machine value *as Latin digits* — the value a seller pastes into a
 * postal site or a bank app is never Persian-digit. Confirmation is a word,
 * not a colour flash.
 */
export function CopyButton({
  value,
  label,
  copiedLabel,
  className,
}: {
  value: string;
  label: string;
  copiedLabel: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1800);
    return () => clearTimeout(timer);
  }, [copied]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <button
      type="button"
      className={[styles.btn, styles.quiet, styles.btnSm, className ?? ""].join(" ").trim()}
      onClick={copy}
      aria-label={label}
    >
      {copied ? <IconCheck size={14} /> : <IconCopy size={14} />}
      <span>{copied ? copiedLabel : label}</span>
    </button>
  );
}
