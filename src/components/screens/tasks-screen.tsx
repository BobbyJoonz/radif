"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { getDictionary } from "@/i18n";
import type { Locale } from "@/i18n/config";
import { formatDateTime, formatNumber } from "@/i18n/format";
import type { TaskRow, TaskStatusValue } from "@/lib/dto";
import {
  Button,
  ButtonLink,
  ErrorState,
  ForbiddenState,
  Ltr,
  Mark,
  OfflineState,
  Select,
  StatusWord,
  Toast,
  apiFetch,
  messageFor,
  useToast,
  type DesignedState,
} from "@/components/ui";
import { dueLabel } from "./labels";
import styles from "./screens.module.css";

const STATUSES: TaskStatusValue[] = ["open", "in_progress", "waiting_customer", "done"];

export type TasksScreenProps = {
  locale: Locale;
  rows: TaskRow[];
  showDone: boolean;
  userId: string;
  role: "owner" | "operator";
  state: DesignedState | null;
  nowISO: string;
};

type Group = { key: "overdue" | "today" | "next" | "done"; rows: TaskRow[] };

/**
 * Tasks are grouped by the thing the seller can act on — overdue, today, next —
 * and "overdue" is computed from the due date and the SLA, never from the tone
 * of a message.
 */
export function TasksScreen({ locale, rows, showDone, userId, role, state, nowISO }: TasksScreenProps) {
  const dict = getDictionary(locale);
  const now = useMemo(() => new Date(nowISO), [nowISO]);
  const router = useRouter();
  const { toast, show, clear } = useToast();
  const [busy, setBusy] = useState<string | null>(null);

  const loading = state === "loading";
  const designedKind = state && state !== "empty" && state !== "loading" ? state : null;

  const groups = useMemo<Group[]>(() => {
    if (showDone) return [{ key: "done", rows }];
    const overdue: TaskRow[] = [];
    const today: TaskRow[] = [];
    const next: TaskRow[] = [];
    for (const row of rows) {
      if (row.overdue) overdue.push(row);
      else if (row.dueAt && isSameDay(new Date(row.dueAt), now)) today.push(row);
      else next.push(row);
    }
    return [
      { key: "overdue", rows: overdue },
      { key: "today", rows: today },
      { key: "next", rows: next },
    ];
  }, [rows, showDone, now]);

  const groupTitles: Record<Group["key"], string> = {
    overdue: dict.tasks.groupOverdue,
    today: dict.tasks.groupToday,
    next: dict.tasks.groupNext,
    done: dict.tasks.filterDone,
  };

  async function patchTask(task: TaskRow, body: Record<string, unknown>, message: string) {
    setBusy(task.id);
    const result = await apiFetch<{ task: TaskRow }>(`./api/tasks/${task.id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    });
    setBusy(null);
    if (result.ok) {
      show(message);
      router.refresh();
    } else {
      show(messageFor(result.error, dict), "error");
    }
  }

  const empty = rows.length === 0;

  return (
    <div className={styles.page}>
      <header className={styles.head}>
        <div>
          <h1 className={styles.h1}>{dict.tasks.title}</h1>
          <p className={styles.lede}>{dict.tasks.overdueNote}</p>
        </div>
        <div className={styles.headAside}>
          {role === "operator" ? (
            <span className={styles.cellMeta}>{dict.common.operator}</span>
          ) : null}
          <span className={styles.cellMeta}>
            {loading ? dict.screen.loadingLabel : `${formatNumber(rows.length, locale)} ${dict.tasks.countLabel}`}
          </span>
        </div>
      </header>

      <div className={styles.toolbar}>
        <Link
          href={`/${locale}/tasks`}
          className={styles.filter}
          aria-current={!showDone ? "true" : undefined}
        >
          {dict.tasks.filterAll}
        </Link>
        <Link
          href={`/${locale}/tasks?status=done`}
          className={styles.filter}
          aria-current={showDone ? "true" : undefined}
        >
          {dict.tasks.filterDone}
        </Link>
        <span className={styles.toolbarSpacer} />
        {!showDone ? <span className={styles.cellMeta}>{dict.tasks.doneNote}</span> : null}
      </div>

      {designedKind === "error" ? (
        <ErrorState
          dict={dict}
          action={
            <ButtonLink href={`/${locale}/tasks`} variant="ghost">
              {dict.screen.retry}
            </ButtonLink>
          }
        />
      ) : designedKind === "offline" ? (
        <OfflineState dict={dict} locale={locale} />
      ) : designedKind === "forbidden" ? (
        <ForbiddenState dict={dict} locale={locale} />
      ) : empty ? (
        <div className={styles.listEmpty}>
          <h2 className={styles.sectionTitle}>{dict.tasks.emptyTitle}</h2>
          <p className={styles.docNote}>{dict.tasks.emptyBody}</p>
          <p>
            <ButtonLink href={`/${locale}/inbox`} variant="ghost" small>
              {dict.tasks.emptyAction}
            </ButtonLink>
          </p>
        </div>
      ) : (
        groups.map((group) => (
          <section key={group.key} className={styles.taskGroup} aria-label={groupTitles[group.key]}>
            <div className={styles.taskGroupHead}>
              <h2 className={styles.taskGroupTitle}>{groupTitles[group.key]}</h2>
              <span className={styles.taskGroupCount}>
                {formatNumber(group.rows.length, locale)} {dict.tasks.countLabel}
              </span>
            </div>
            {group.rows.length === 0 ? (
              <p className={styles.taskEmptyGroup}>{dict.tasks.groupNone}</p>
            ) : (
              group.rows.map((task) => {
                const due = dueLabel(task.dueAt, locale, now);
                const mine = task.assigneeName !== null;
                return (
                  <article key={task.id} className={styles.taskRow}>
                    <div className={styles.taskWhat}>
                      <h3 className={styles.taskTitle}>{task.title}</h3>
                      <div className={styles.taskWho}>
                        {task.customerName ? <span>{task.customerName}</span> : null}
                        {task.orderRef && task.orderId ? (
                          <Link href={`/${locale}/orders?o=${task.orderId}`} className={styles.rowLink}>
                            <Ltr mono>{task.orderRef}</Ltr>
                          </Link>
                        ) : null}
                        {task.conversationId ? (
                          <Link href={`/${locale}/inbox?c=${task.conversationId}`} className={styles.handle}>
                            {dict.nav.inbox}
                          </Link>
                        ) : null}
                        <span>·</span>
                        <Mark shape="ring" tone="muted">
                          {task.reasonText}
                        </Mark>
                      </div>
                      {task.detail ? <p className={styles.taskWhy}>{task.detail}</p> : null}
                      <div className={styles.taskWho}>
                        <span>{dict.tasks.colAssignee}:</span>
                        <span>{task.assigneeName ?? dict.tasks.unassigned}</span>
                      </div>
                    </div>

                    <div className={styles.taskSide}>
                      <div className={styles.taskStatusForm}>
                        <Select
                          aria-label={dict.tasks.colStatus}
                          value={task.status}
                          disabled={busy === task.id}
                          onChange={(event) =>
                            void patchTask(task, { status: event.target.value }, dict.tasks.statusSaved)
                          }
                        >
                          {STATUSES.map((status) => (
                            <option key={status} value={status}>
                              {dict.taskStatus[status]}
                            </option>
                          ))}
                        </Select>
                        {!mine && task.status !== "done" ? (
                          <Button
                            variant="quiet"
                            small
                            disabled={busy === task.id}
                            onClick={() => void patchTask(task, { status: task.status, assigneeId: userId }, dict.tasks.assignedSaved)}
                          >
                            {busy === task.id ? dict.tasks.assigning : dict.tasks.assignToMe}
                          </Button>
                        ) : null}
                      </div>
                    </div>

                    <div className={[styles.taskDue, due?.overdue && !showDone ? styles.taskDueOverdue : ""].join(" ").trim()}>
                      {due ? (
                        <>
                          {due.text}
                          {task.dueAt ? <small>{formatDateTime(task.dueAt, locale)}</small> : null}
                        </>
                      ) : (
                        <span className={styles.cellMeta}>{dict.tasks.dueNone}</span>
                      )}
                      <span className={styles.cellSub}>
                        <StatusWord kind="task" value={task.status} dict={dict} />
                      </span>
                    </div>
                  </article>
                );
              })
            )}
          </section>
        ))
      )}
      <Toast message={toast?.message ?? null} tone={toast?.tone} onClose={clear} />
    </div>
  );
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}
