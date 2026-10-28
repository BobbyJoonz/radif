import type { ReactNode } from "react";
import styles from "./ui.module.css";

/**
 * A chip is a *label*, not a status: status is always a word plus a 7px shape.
 * `phase` chips are dashed on purpose — dashed means "not built yet".
 */
export function Chip({
  children,
  tone = "line",
  icon,
  title,
}: {
  children: ReactNode;
  tone?: "line" | "accent" | "phase" | "plain";
  icon?: ReactNode;
  title?: string;
}) {
  const toneClass =
    tone === "accent" ? styles.chipAccent : tone === "phase" ? styles.chipPhase : tone === "plain" ? styles.chipPlain : "";
  return (
    <span className={[styles.chip, toneClass].join(" ").trim()} title={title}>
      {icon}
      {children}
    </span>
  );
}

export function SourceChip({
  source,
  label,
  icon,
}: {
  source: string;
  label: string;
  icon?: ReactNode;
}) {
  return (
    <Chip tone="plain" icon={icon} title={`${label}`}>
      {label}
    </Chip>
  );
}
