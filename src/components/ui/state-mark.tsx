import type { ReactNode } from "react";
import styles from "./ui.module.css";

/**
 * Status is a **word plus a 7px shape** — hue is never the only carrier.
 * A colour-blind seller, a greyscale print and Windows High Contrast all keep
 * the distinction (DIRECTION.md §3).
 */
export type MarkShape = "dot" | "ring" | "triangle" | "dash" | "cross" | "square";
export type MarkTone = "ink" | "muted" | "positive" | "critical" | "accent";

const TONE_CLASS: Record<MarkTone, string> = {
  ink: styles.toneInk,
  muted: styles.toneMuted,
  positive: styles.tonePositive,
  critical: styles.toneCritical,
  accent: styles.toneAccent,
};

const SHAPE_LABEL: Record<MarkShape, string> = {
  dot: "پر",
  ring: "حلقه",
  triangle: "مثلث",
  dash: "خط",
  cross: "ضربدر",
  square: "مربع",
};

export function Shape({ shape }: { shape: MarkShape }) {
  return (
    <svg viewBox="0 0 8 8" aria-hidden="true" focusable="false">
      {shape === "dot" ? <circle cx="4" cy="4" r="2.7" fill="currentColor" /> : null}
      {shape === "ring" ? (
        <circle cx="4" cy="4" r="2.7" fill="none" stroke="currentColor" strokeWidth="1.4" />
      ) : null}
      {shape === "square" ? (
        <rect x="1.5" y="1.5" width="5" height="5" fill="none" stroke="currentColor" strokeWidth="1.3" />
      ) : null}
      {shape === "triangle" ? (
        <path d="M4 1.2 7.2 6.8H0.8Z" fill="none" stroke="currentColor" strokeWidth="1.15" strokeLinejoin="round" />
      ) : null}
      {shape === "dash" ? <rect x="0.9" y="3.3" width="6.2" height="1.5" fill="currentColor" /> : null}
      {shape === "cross" ? (
        <path d="M1.7 1.7 6.3 6.3M6.3 1.7 1.7 6.3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      ) : null}
    </svg>
  );
}

export function Mark({
  shape,
  tone = "ink",
  children,
  className,
  shapeLabel,
}: {
  shape: MarkShape;
  tone?: MarkTone;
  children: ReactNode;
  className?: string;
  /** the shape's name, for the screen reader; visible text stays the word */
  shapeLabel?: string;
}) {
  return (
    <span className={[styles.mark, TONE_CLASS[tone], className ?? ""].join(" ").trim()}>
      <Shape shape={shape} />
      <span>{children}</span>
      {shapeLabel ? <span className={styles.srOnly}>{shapeLabel}</span> : null}
    </span>
  );
}

export const shapeNames = SHAPE_LABEL;
