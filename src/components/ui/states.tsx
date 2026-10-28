import type { ReactNode } from "react";
import type { Dictionary } from "@/i18n";
import { ButtonLink } from "./button";
import styles from "./ui.module.css";

/**
 * Designed states, reachable by URL (`?state=loading|empty|error|offline|…`)
 * so each one can be looked at, shot and scanned — not left to chance
 * (DIRECTION.md §4 "States"). Every state says what still works.
 */
export type DesignedState = "loading" | "empty" | "error" | "offline" | "forbidden";

const DESIGNED: readonly string[] = ["loading", "empty", "error", "offline", "forbidden"];

export function readDesignedState(value: string | string[] | undefined): DesignedState | null {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw) return null;
  return DESIGNED.includes(raw) ? (raw as DesignedState) : null;
}

export function StatePanel({
  title,
  body,
  action,
  who,
  compact = false,
}: {
  title: ReactNode;
  body: ReactNode;
  action?: ReactNode;
  who?: ReactNode;
  compact?: boolean;
}) {
  return (
    <div className={[styles.stateBlock, compact ? styles.stateBlockCompact : ""].join(" ").trim()}>
      <h2 className={styles.stateTitle}>{title}</h2>
      <p className={styles.stateBody}>{body}</p>
      {who ? <p className={styles.stateWho}>{who}</p> : null}
      {action ? <div className={styles.stateActions}>{action}</div> : null}
    </div>
  );
}

export function EmptyState({
  title,
  body,
  action,
  note,
  compact,
}: {
  title: ReactNode;
  body: ReactNode;
  action?: ReactNode;
  note?: ReactNode;
  compact?: boolean;
}) {
  return <StatePanel title={title} body={body} action={action} who={note} compact={compact} />;
}

export function ErrorState({
  dict,
  action,
  body,
}: {
  dict: Dictionary;
  action?: ReactNode;
  body?: ReactNode;
}) {
  return <StatePanel title={dict.states.errorTitle} body={body ?? dict.states.errorBody} action={action} />;
}

export function OfflineState({ dict, locale }: { dict: Dictionary; locale: string }) {
  return (
    <StatePanel
      title={dict.screen.offlineTitle}
      body={dict.screen.offlineBody}
      action={
        <ButtonLink href={`/${locale}`} variant="ghost">
          {dict.screen.retry}
        </ButtonLink>
      }
    />
  );
}

export function ForbiddenState({ dict, locale, who }: { dict: Dictionary; locale: string; who?: ReactNode }) {
  return (
    <StatePanel
      title={dict.states.forbiddenTitle}
      body={dict.states.forbiddenBody}
      who={who ?? dict.screen.whoOwner}
      action={
        <ButtonLink href={`/${locale}`} variant="ghost">
          {dict.screen.forbiddenAction}
        </ButtonLink>
      }
    />
  );
}

export function NotFoundState({ dict, locale, action }: { dict: Dictionary; locale: string; action?: ReactNode }) {
  return (
    <StatePanel
      title={dict.states.notFoundTitle}
      body={dict.states.notFoundBody}
      action={
        action ?? (
          <ButtonLink href={`/${locale}`} variant="ghost">
            {dict.screen.forbiddenAction}
          </ButtonLink>
        )
      }
    />
  );
}

/** A hairline line of text for offline / paused / demo notices. */
export function Notice({
  children,
  tone = "line",
  icon,
}: {
  children: ReactNode;
  tone?: "line" | "accent" | "critical";
  icon?: ReactNode;
}) {
  const toneClass = tone === "accent" ? styles.noticeAccent : tone === "critical" ? styles.noticeCritical : "";
  return (
    <div className={[styles.notice, toneClass].join(" ").trim()} role="status">
      {icon}
      <span>{children}</span>
    </div>
  );
}

/* ── skeletons: the real layout, softly pencilled in ─────────────────────── */

export function SkeletonLine({ width = "100%", height }: { width?: string; height?: string }) {
  return <div className={[styles.skel, styles.skelLine].join(" ")} style={{ width, height }} aria-hidden="true" />;
}

export function SkeletonTitle({ width = "42%" }: { width?: string }) {
  return <div className={[styles.skel, styles.skelTitle].join(" ")} style={{ width }} aria-hidden="true" />;
}

export function SkeletonRow() {
  return (
    <div className={styles.skelRow} aria-hidden="true">
      <SkeletonLine width="46%" />
      <SkeletonLine width="76%" />
      <SkeletonLine width="34%" />
    </div>
  );
}

export function SkeletonRows({ count = 4 }: { count?: number }) {
  return (
    <div>
      {Array.from({ length: count }, (_, index) => (
        <SkeletonRow key={index} />
      ))}
    </div>
  );
}

export function SkeletonStack({ lines = 3 }: { lines?: number }) {
  return (
    <div className={styles.skelStack} aria-hidden="true">
      {Array.from({ length: lines }, (_, index) => (
        <SkeletonLine key={index} width={index === 0 ? "38%" : index % 2 ? "88%" : "66%"} />
      ))}
    </div>
  );
}

/** One loading block per pane, so the shape is already recognisable. */
export function LoadingBlock({ label, children }: { label: string; children?: ReactNode }) {
  return (
    <div aria-busy="true" aria-live="polite">
      <span className={styles.srOnly}>{label}</span>
      {children ?? (
        <div className={styles.skelStack}>
          <SkeletonTitle />
          <SkeletonLine width="88%" />
          <SkeletonLine width="64%" />
        </div>
      )}
    </div>
  );
}
