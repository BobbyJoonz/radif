"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { getDictionary, type Dictionary } from "@/i18n";
import type { Locale } from "@/i18n/config";
import { formatDateTime, formatNumber, formatTime } from "@/i18n/format";
import type { ConversationDetailDTO, ConversationRow, SuggestionDTO } from "@/lib/dto";
import {
  Button,
  ButtonLink,
  Chip,
  ErrorState,
  ForbiddenState,
  IconFile,
  IconLive,
  IconManual,
  IconReplay,
  Input,
  Ltr,
  Mark,
  OfflineState,
  Sheet,
  SkeletonLine,
  SkeletonTitle,
  StatusWord,
  Toast,
  apiFetch,
  messageFor,
  useToast,
  type DesignedState,
} from "@/components/ui";
import { REVIEW_VISUAL } from "@/components/ui/status";
import { fieldLabel, whenText } from "./labels";
import styles from "./screens.module.css";
import { taskReason, taskTitle } from "@/i18n/task-copy";

type Filter = "all" | "unanswered" | "payment" | "review";

const FILTERS: { key: Filter; label: "filterAll" | "filterUnanswered" | "filterPayment" | "filterReview" }[] = [
  { key: "all", label: "filterAll" },
  { key: "unanswered", label: "filterUnanswered" },
  { key: "payment", label: "filterPayment" },
  { key: "review", label: "filterReview" },
];

const SOURCE_ICON = {
  file: IconFile,
  replay: IconReplay,
  instagram: IconLive,
  manual: IconManual,
} as const;

/**
 * The inbox is the product's loop drawn once: a queue, the customer's words
 * with their evidence, and what the system proposes — all visible at 1240+.
 * Selecting a proposed field marks the exact character span it came from.
 */
export type InboxScreenProps = {
  locale: Locale;
  rows: ConversationRow[];
  detail: ConversationDetailDTO | null;
  filter: Filter;
  q: string;
  role: "owner" | "operator";
  state: DesignedState | null;
  nowISO: string;
};

type Segment = { text: string; ids: string[] };

export function InboxScreen({ locale, rows, detail, filter, q, state, nowISO }: InboxScreenProps) {
  const dict = getDictionary(locale);
  const now = useMemo(() => new Date(nowISO), [nowISO]);
  const router = useRouter();
  const { toast, show, clear } = useToast();

  const [activeId, setActiveId] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [path, setPath] = useState<string | null>(null);
  const [correction, setCorrection] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [reply, setReply] = useState<string | null>(null);
  const [replyMeta, setReplyMeta] = useState<{ key: string; version: string; allowed: boolean } | null>(null);
  const [replyBusy, setReplyBusy] = useState(false);

  const fieldRefs = useRef(new Map<string, HTMLElement>());
  const spanRefs = useRef(new Map<string, HTMLElement>());
  const threadRef = useRef<HTMLElement | null>(null);

  const loading = state === "loading";
  const conversation = detail?.conversation ?? null;
  const suggestions = detail?.suggestions ?? [];
  const orderId = detail?.order?.id ?? null;
  const designedKind = state && state !== "empty" && state !== "loading" ? state : null;
  const showEmpty = rows.length === 0 || state === "empty";

  const href = useCallback(
    (next: { c?: string; filter?: Filter; q?: string }) => {
      const params = new URLSearchParams();
      const nextFilter = next.filter ?? filter;
      const nextQ = next.q ?? q;
      if (nextFilter && nextFilter !== "all") params.set("filter", nextFilter);
      if (nextQ) params.set("q", nextQ);
      if (next.c) params.set("c", next.c);
      const query = params.toString();
      return `/${locale}/inbox${query ? `?${query}` : ""}`;
    },
    [filter, q, locale],
  );

  /* the signature: measure the field row and the span, draw the hairline */
  const measure = useCallback(() => {
    if (!activeId || typeof window === "undefined" || window.innerWidth < 1240) {
      setPath(null);
      return;
    }
    const field = fieldRefs.current.get(activeId);
    const span = spanRefs.current.get(activeId);
    if (!field || !span) {
      setPath(null);
      return;
    }
    const f = field.getBoundingClientRect();
    const s = span.getBoundingClientRect();
    if (!f.width || !s.width) {
      setPath(null);
      return;
    }
    const rtl = getComputedStyle(document.documentElement).direction === "rtl";
    const sign = rtl ? 1 : -1;
    const fx = rtl ? f.right : f.left;
    const fy = f.top + Math.min(f.height / 2, 26);
    const sx = rtl ? s.left : s.right;
    const sy = s.top + s.height / 2;
    setPath(
      `M ${fx.toFixed(1)} ${fy.toFixed(1)} L ${(fx + sign * 12).toFixed(1)} ${fy.toFixed(1)} C ${(fx + sign * 90).toFixed(1)} ${fy.toFixed(1)}, ${(sx - sign * 90).toFixed(1)} ${sy.toFixed(1)}, ${sx.toFixed(1)} ${sy.toFixed(1)}`,
    );
  }, [activeId]);

  const scrollSpanIntoView = useCallback((id: string) => {
    const span = spanRefs.current.get(id);
    const container = threadRef.current;
    if (!span || !container) return;
    const c = container.getBoundingClientRect();
    const s = span.getBoundingClientRect();
    if (s.top >= c.top + 16 && s.bottom <= c.bottom - 16) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    span.scrollIntoView({ block: "center", behavior: reduced ? "auto" : "smooth" });
  }, []);

  useEffect(() => {
    // No setState in the effect body: when nothing is selected the connector is
    // simply not rendered (derived at render), which is also the React 19 rule.
    if (!activeId) return;
    scrollSpanIntoView(activeId);
    const frame = requestAnimationFrame(() => requestAnimationFrame(measure));
    return () => cancelAnimationFrame(frame);
  }, [activeId, measure, scrollSpanIntoView]);

  useEffect(() => {
    if (!activeId) return;
    let ticking = false;
    const onMove = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        measure();
        ticking = false;
      });
    };
    const thread = threadRef.current;
    thread?.addEventListener("scroll", onMove, { passive: true });
    window.addEventListener("resize", onMove);
    window.addEventListener("scroll", onMove, { passive: true });
    return () => {
      thread?.removeEventListener("scroll", onMove);
      window.removeEventListener("resize", onMove);
      window.removeEventListener("scroll", onMove);
    };
  }, [activeId, measure]);

  useEffect(() => {
    if (!sheetOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSheetOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [sheetOpen]);

  async function review(suggestion: SuggestionDTO, action: "accept" | "correct" | "reject") {
    const value = correction[suggestion.id];
    if (action === "correct" && !value) return;
    setBusy(suggestion.id);
    const result = await apiFetch<{ reviewState: string }>(`/api/suggestions/${suggestion.id}/review`, {
      method: "POST",
      body: JSON.stringify({ action, ...(action === "correct" ? { value } : {}) }),
    });
    setBusy(null);
    if (result.ok) {
      show(dict.inbox.suggestionSaved);
      setActiveId(null);
      router.refresh();
    } else {
      show(messageFor(result.error, dict), "error");
    }
  }

  async function loadReply() {
    if (!orderId) return;
    setReplyBusy(true);
    const result = await apiFetch<{ templateKey: string; templateVersion: string; body: string; allowed: boolean }>(
      `/api/orders/${orderId}/reply-preview`,
    );
    setReplyBusy(false);
    if (result.ok) {
      setReply(result.data.body);
      setReplyMeta({ key: result.data.templateKey, version: result.data.templateVersion, allowed: result.data.allowed });
    } else {
      show(messageFor(result.error, dict), "error");
    }
  }

  /* Offsets → character segments, so the span is the exact words, not a highlight. */
  const segments = useMemo(() => {
    const byMessage = new Map<string, Segment[]>();
    if (!detail) return byMessage;
    for (const message of detail.messages) byMessage.set(message.id, [{ text: message.text, ids: [] }]);
    for (const suggestion of detail.suggestions) {
      if (!suggestion.evidence) continue;
      const list = byMessage.get(suggestion.sourceMessageId);
      if (!list) continue;
      const fullLength = list.reduce((sum, segment) => sum + segment.text.length, 0);
      const start = Math.max(0, Math.min(suggestion.evidence.start, fullLength));
      const end = Math.max(start, Math.min(suggestion.evidence.end, fullLength));
      if (end <= start) continue;
      const next: Segment[] = [];
      let cursor = 0;
      for (const segment of list) {
        const segStart = cursor;
        const segEnd = cursor + segment.text.length;
        cursor = segEnd;
        if (segEnd <= start || segStart >= end) {
          next.push(segment);
          continue;
        }
        const ids = [...segment.ids];
        if (start >= segStart && start < segEnd) ids.push(suggestion.id);
        const localStart = Math.max(start, segStart) - segStart;
        const localEnd = Math.min(end, segEnd) - segStart;
        if (localStart > 0) next.push({ text: segment.text.slice(0, localStart), ids: [] });
        next.push({ text: segment.text.slice(localStart, localEnd), ids });
        if (localEnd < segment.text.length) next.push({ text: segment.text.slice(localEnd), ids: [] });
      }
      byMessage.set(suggestion.sourceMessageId, next);
    }
    return byMessage;
  }, [detail]);

  const registerField = (id: string) => (element: HTMLElement | null) => {
    if (element) fieldRefs.current.set(id, element);
    else fieldRefs.current.delete(id);
  };
  const registerSpan = (ids: string[]) => (element: HTMLElement | null) => {
    for (const id of ids) {
      if (element) spanRefs.current.set(id, element);
      else spanRefs.current.delete(id);
    }
  };

  return (
    <>
      <div className={styles.inbox} data-selected={conversation ? "true" : "false"} data-sheet-open={sheetOpen}>
        {activeId && path ? (
          <svg className={styles.threadPath} aria-hidden="true" key={path}>
            <path d={path} />
          </svg>
        ) : null}

        {/* ── queue ─────────────────────────────────────────────────────── */}
        <aside className={styles.queue} aria-label={dict.inbox.queueLabel}>
          <div className={styles.queueHead}>
            <h1 className={styles.queueTitle}>{dict.inbox.title}</h1>
            <span className={styles.queueCount}>
              {loading ? dict.screen.loadingLabel : `${formatNumber(rows.length, locale)} ${dict.inbox.queueCount}`}
            </span>
            <form className={styles.searchForm} action={`/${locale}/inbox`} method="get" role="search">
              {filter !== "all" ? <input type="hidden" name="filter" value={filter} /> : null}
              <input
                className={styles.searchInput}
                type="search"
                name="q"
                defaultValue={q}
                placeholder={dict.inbox.search}
                aria-label={dict.inbox.search}
              />
              {filter !== "all" || q ? (
                <Link href={`/${locale}/inbox`} className={styles.filter} title={dict.inbox.searchClear}>
                  {dict.inbox.searchClear}
                </Link>
              ) : null}
            </form>
            <div className={styles.queueFilters}>
              {FILTERS.map((item) => (
                <Link
                  key={item.key}
                  href={href({ filter: item.key, c: undefined })}
                  className={styles.filter}
                  aria-current={filter === item.key ? "true" : undefined}
                >
                  {dict.inbox[item.label]}
                </Link>
              ))}
            </div>
          </div>

          {designedKind === "error" ? (
            <div className={styles.paneState}>
              <ErrorState dict={dict} />
            </div>
          ) : designedKind === "offline" ? (
            <div className={styles.paneState}>
              <OfflineState dict={dict} locale={locale} />
            </div>
          ) : designedKind === "forbidden" ? (
            <div className={styles.paneState}>
              <ForbiddenState dict={dict} locale={locale} />
            </div>
          ) : null}

          {showEmpty && !designedKind && !loading ? (
            <div className={styles.paneState}>
              <h2 className={styles.sectionTitle}>{dict.inbox.queueEmptyTitle}</h2>
              <p className={styles.docNote}>{dict.inbox.queueEmptyBody}</p>
              <p>
                <ButtonLink href={`/${locale}/import`} variant="ghost" small>
                  {dict.inbox.queueEmptyAction}
                </ButtonLink>
              </p>
            </div>
          ) : null}

          {loading
            ? Array.from({ length: 7 }, (_, index) => (
                <div className={styles.qrow} aria-hidden="true" key={index}>
                  <SkeletonLine width="54%" />
                  <SkeletonLine width="86%" />
                  <SkeletonLine width="34%" />
                </div>
              ))
            : null}

          {!loading && !designedKind
            ? rows.map((row) => {
                const selected = conversation?.id === row.id;
                const Icon = SOURCE_ICON[row.source] ?? IconManual;
                return (
                  <Link
                    key={row.id}
                    href={href({ c: row.id })}
                    className={styles.qrow}
                    aria-current={selected ? "true" : undefined}
                    prefetch={false}
                  >
                    <span className={styles.qrowTop}>
                      <span className={styles.qrowName}>{row.customerName}</span>
                      <span className={styles.qrowTime}>
                        {row.lastMessageAt ? whenText(row.lastMessageAt, locale, now) : dict.common.none}
                      </span>
                    </span>
                    <span className={styles.qrowPreview}>{row.lastMessagePreview}</span>
                    <span className={styles.qrowMeta}>
                      <Chip tone="plain" icon={<Icon size={12} />}>
                        {dict.source[row.source]}
                      </Chip>
                      {row.unrepliedCount > 0 ? (
                        <span>
                          {formatNumber(row.unrepliedCount, locale)} {dict.inbox.unreplied}
                        </span>
                      ) : null}
                      {row.needsReview ? (
                        <Mark shape="triangle" tone="muted">
                          {dict.common.needsReview}
                        </Mark>
                      ) : null}
                      {row.orderRef ? <Ltr mono>{row.orderRef}</Ltr> : null}
                    </span>
                  </Link>
                );
              })
            : null}
        </aside>

        {/* ── thread ────────────────────────────────────────────────────── */}
        <section className={styles.thread} aria-label={dict.inbox.threadLabel} ref={threadRef}>
          {conversation ? (
            <>
              <header className={styles.threadHead}>
                <div className={styles.threadHeadTop}>
                  <h2 className={styles.threadWho}>{conversation.customerName}</h2>
                  <div className={styles.threadActions}>
                    <ButtonLink href={href({ c: undefined })} variant="quiet" className={styles.mobileOnly}>
                      {dict.inbox.queueLabel}
                    </ButtonLink>
                    {detail?.order ? (
                      <ButtonLink href={`/${locale}/orders?o=${detail.order.id}`} variant="ghost" small>
                        {dict.inbox.openOrder}
                      </ButtonLink>
                    ) : null}
                    <Button
                      variant="ghost"
                      small
                      className={styles.sheetToggle}
                      onClick={() => setSheetOpen(true)}
                      aria-expanded={sheetOpen}
                    >
                      {dict.inbox.openSheet}
                      <span className={styles.filterCount}>{formatNumber(suggestions.length, locale)}</span>
                    </Button>
                  </div>
                </div>
                <div className={styles.threadMeta}>
                  {conversation.handle ? <Ltr mono>@{conversation.handle.replace(/^@/, "")}</Ltr> : null}
                  <span>
                    {formatNumber(detail?.messages.length ?? 0, locale)} {dict.inbox.threadLabel}
                  </span>
                  {detail?.order ? (
                    <span>
                      {dict.inbox.orderRef} <Ltr mono>{detail.order.publicRef}</Ltr>
                    </span>
                  ) : (
                    <span>{dict.inbox.noOrder}</span>
                  )}
                </div>
                {detail?.analysis ? (
                  <div className={styles.msgFoot}>
                    <span>{dict.inbox.analysisTitle}</span>
                    <Ltr mono>{detail.analysis.provider}</Ltr>
                    <Ltr mono>{detail.analysis.model}</Ltr>
                    <span>
                      {detail.analysis.latencyMs === null
                        ? dict.common.notMeasured
                        : `${formatNumber(detail.analysis.latencyMs, locale)} ms`}
                    </span>
                  </div>
                ) : (
                  <div className={styles.msgFoot}>{dict.inbox.analysisNone}</div>
                )}
              </header>

              <div className={styles.messages}>
                {detail?.messages.map((message) => {
                  const parts = segments.get(message.id) ?? [{ text: message.text, ids: [] }];
                  const inbound = message.direction === "inbound";
                  return (
                    <article key={message.id} className={[styles.msg, inbound ? styles.msgIn : styles.msgOut].join(" ")}>
                      <div className={styles.msgHead}>
                        <span className={styles.msgWho}>{message.senderLabel}</span>
                        <span>{formatTime(message.occurredAt, locale)}</span>
                        <span>{inbound ? dict.inbox.inbound : dict.inbox.outbound}</span>
                        {message.analysisState === "failed" || message.analysisState === "needs_human" ? (
                          <span>
                            {message.analysisState === "failed" ? dict.inbox.analysisFailed : dict.common.needsReview}
                          </span>
                        ) : null}
                      </div>
                      <p className={styles.msgText}>
                        {parts.map((part, index) =>
                          part.ids.length ? (
                            <span
                              key={index}
                              className={styles.ev}
                              data-active={activeId && part.ids.includes(activeId) ? "true" : undefined}
                              ref={registerSpan(part.ids)}
                            >
                              {part.text}
                            </span>
                          ) : (
                            <span key={index}>{part.text}</span>
                          ),
                        )}
                      </p>
                      <div className={styles.msgFoot}>
                        <span>{formatDateTime(message.occurredAt, locale)}</span>
                        <span>{dict.source[message.source]}</span>
                        {message.attachments.length ? (
                          <span>
                            {dict.inbox.attachments}: {formatNumber(message.attachments.length, locale)}
                          </span>
                        ) : null}
                      </div>
                    </article>
                  );
                })}
              </div>

              <div className={styles.threadTasks}>
                <h3 className={styles.sectionTitle}>{dict.inbox.tasksTitle}</h3>
                {detail?.tasks.length ? (
                  <ul className={styles.taskList}>
                    {detail.tasks.map((task) => (
                      <li key={task.id} className={styles.auditRow}>
                        <span className={styles.auditWhat}>
                          <span className={styles.auditSummary}>{taskTitle(task, locale)}</span>
                          <span className={styles.auditActor}>{taskReason(task.reasonCode, task.reasonText, locale)}</span>
                        </span>
                        <span className={styles.cellStackEnd}>
                          <StatusWord kind="task" value={task.status} dict={dict} />
                          {task.dueAt ? <span className={styles.auditAt}>{formatDateTime(task.dueAt, locale)}</span> : null}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className={styles.docNote}>{dict.inbox.noTasks}</p>
                )}
              </div>
            </>
          ) : (
            <div className={styles.paneState}>
              {designedKind === "error" ? (
                <ErrorState dict={dict} action={<RetryLink locale={locale} dict={dict} />} />
              ) : designedKind === "offline" ? (
                <OfflineState dict={dict} locale={locale} />
              ) : designedKind === "forbidden" ? (
                <ForbiddenState dict={dict} locale={locale} />
              ) : loading ? (
                <div className={styles.skelStack}>
                  <SkeletonTitle width="34%" />
                  <SkeletonLine width="76%" />
                  <SkeletonLine width="62%" />
                  <SkeletonLine width="44%" />
                </div>
              ) : (
                <>
                  <h2 className={styles.sectionTitle}>{dict.inbox.pickTitle}</h2>
                  <p className={styles.docNote}>{dict.inbox.pickBody}</p>
                </>
              )}
            </div>
          )}
        </section>

        {/* ── action sheet ──────────────────────────────────────────────── */}
        <div className={styles.sheetCol} data-open={sheetOpen ? "true" : "false"}>
          {sheetOpen ? <div className={styles.sheetScrim} onClick={() => setSheetOpen(false)} aria-hidden="true" /> : null}
          <Sheet
            title={dict.inbox.sheetLabel}
            meta={loading ? dict.screen.loadingLabel : formatNumber(suggestions.length, locale)}
            label={dict.inbox.sheetLabel}
            footer={
              conversation ? (
                <>
                  {orderId ? (
                    <>
                      <ButtonLink href={`/${locale}/orders?o=${orderId}`} variant="primary" block>
                        {dict.inbox.reviewDraft}
                      </ButtonLink>
                      <p className={styles.sheetNote}>{dict.inbox.reviewNote}</p>
                      <div className={styles.rowBetween}>
                        <Button variant="quiet" small onClick={loadReply} disabled={replyBusy}>
                          {replyBusy ? dict.inbox.replyLoading : dict.inbox.previewReply}
                        </Button>
                        <Button variant="quiet" small className={styles.sheetClose} onClick={() => setSheetOpen(false)}>
                          {dict.inbox.closeSheet}
                        </Button>
                      </div>
                    </>
                  ) : (
                    <>
                      <p className={styles.sheetNote}>{dict.inbox.noOrder}</p>
                      <Button variant="quiet" small className={styles.sheetClose} onClick={() => setSheetOpen(false)}>
                        {dict.inbox.closeSheet}
                      </Button>
                    </>
                  )}
                  {reply ? (
                    <div className={styles.replyPreview}>
                      <span className={styles.fieldLabel}>{dict.inbox.replyPreviewTitle}</span>
                      <p className={styles.msgText}>{reply}</p>
                      <span className={styles.sheetNote}>
                        {replyMeta && !replyMeta.allowed ? dict.inbox.replyNotAllowed : dict.inbox.replyPreviewNote}
                      </span>
                      {replyMeta ? (
                        <span className={styles.sheetNote}>
                          <Ltr mono>
                            {replyMeta.key} · v{replyMeta.version}
                          </Ltr>
                        </span>
                      ) : null}
                    </div>
                  ) : null}
                </>
              ) : null
            }
          >
            {loading ? (
              <div className={styles.skelStack} aria-hidden="true">
                <SkeletonLine width="72%" />
                <SkeletonLine width="86%" />
                <SkeletonLine width="60%" />
              </div>
            ) : suggestions.length === 0 ? (
              <>
                <p className={styles.sheetNote}>{dict.inbox.noSuggestions}</p>
                <p className={styles.sheetNote}>{dict.inbox.noSuggestionsBody}</p>
              </>
            ) : (
              <>
                <p className={styles.sheetNote}>{dict.inbox.selectedHint}</p>
                <div className={styles.fieldList}>
                  {suggestions.map((suggestion) => {
                    const active = activeId === suggestion.id;
                    const visual = REVIEW_VISUAL[suggestion.reviewState];
                    const value =
                      suggestion.displayValue ?? (suggestion.value === null ? null : String(suggestion.value));
                    return (
                      <div key={suggestion.id} ref={registerField(suggestion.id)}>
                        <button
                          type="button"
                          className={styles.fieldRowBtn}
                          data-active={active ? "true" : undefined}
                          aria-pressed={active}
                          onClick={() => setActiveId(active ? null : suggestion.id)}
                        >
                          <span className={styles.fieldLabel}>{fieldLabel(suggestion.field, dict)}</span>
                          <span className={styles.fieldRowEnd}>
                            <Mark shape={visual.shape} tone={visual.tone}>
                              {dict.reviewState[suggestion.reviewState]}
                            </Mark>
                            <span className={styles.fieldState}>
                              {suggestion.evidence ? dict.inbox.evidenceTitle : dict.inbox.evidenceNone}
                            </span>
                          </span>
                          <span
                            className={[styles.fieldValue, value === null ? styles.fieldValueEmpty : ""].join(" ").trim()}
                          >
                            {value ?? dict.inbox.fieldMissing}
                          </span>
                        </button>
                        {active ? (
                          <>
                            <div className={styles.fieldActions}>
                              <Button
                                variant="ghost"
                                small
                                onClick={() => void review(suggestion, "accept")}
                                disabled={busy === suggestion.id || suggestion.reviewState === "accepted"}
                              >
                                {dict.inbox.accept}
                              </Button>
                              <Button
                                variant="quiet"
                                small
                                onClick={() => void review(suggestion, "reject")}
                                disabled={busy === suggestion.id || suggestion.reviewState === "rejected"}
                              >
                                {dict.inbox.reject}
                              </Button>
                            </div>
                            <form
                              className={styles.correctionForm}
                              onSubmit={(event) => {
                                event.preventDefault();
                                void review(suggestion, "correct");
                              }}
                            >
                              <label className={styles.fieldLabel} htmlFor={`fix-${suggestion.id}`}>
                                {dict.inbox.correcting}
                              </label>
                              <div className={styles.inlineForm}>
                                <Input
                                  id={`fix-${suggestion.id}`}
                                  value={correction[suggestion.id] ?? ""}
                                  onChange={(event) =>
                                    setCorrection((current) => ({ ...current, [suggestion.id]: event.target.value }))
                                  }
                                  placeholder={value ?? dict.inbox.correcting}
                                  className={styles.grow}
                                />
                                <Button
                                  type="submit"
                                  variant="ghost"
                                  small
                                  disabled={busy === suggestion.id || !correction[suggestion.id]}
                                >
                                  {dict.inbox.saveCorrection}
                                </Button>
                              </div>
                            </form>
                          </>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
                <p className={styles.sheetNote}>{dict.inbox.evidenceNote}</p>
              </>
            )}
          </Sheet>
        </div>
      </div>
      <Toast message={toast?.message ?? null} tone={toast?.tone} onClose={clear} />
    </>
  );
}

function RetryLink({ locale, dict }: { locale: Locale; dict: Dictionary }): ReactNode {
  return (
    <ButtonLink href={`/${locale}/inbox`} variant="ghost">
      {dict.screen.retry}
    </ButtonLink>
  );
}
