import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ReplayButton } from "@/components/today/replay-button";
import { SignalStrip } from "@/components/today/signal-strip";
import { routes } from "@/lib/routes";
import { WorkdeskPanel } from "@/components/screens/workdesk-panel";
import { getWorkdesk, resolveWorkdeskView } from "@/server/services/workdesk";
import { getDictionary } from "@/i18n";
import { isLocale, withLocale, type Locale } from "@/i18n/config";
import { formatFullDate, formatNumber, formatRelative, formatTime, localizeDigits } from "@/i18n/format";
import { getSessionContext } from "@/server/session";
import { getToday } from "@/server/services/today";
import type { TodayRow } from "@/lib/dto";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps<"/[locale]/today">): Promise<Metadata> {
  const { locale } = await params;
  const dict = getDictionary(isLocale(locale) ? locale : "fa");
  return { title: dict.today.title };
}

function hourIn(timeZone: string, now: Date): number {
  return Number(
    new Intl.DateTimeFormat("en-GB", { hour: "2-digit", hour12: false, timeZone }).format(now).replace(/\D/g, ""),
  );
}

function dueCell(row: TodayRow, locale: Locale, now: Date, dict: ReturnType<typeof getDictionary>) {
  if (!row.dueAt) return <span className="due-tag">{dict.common.none}</span>;
  const stamp = row.dueLabel === "today" ? formatTime(row.dueAt, locale) : formatRelative(row.dueAt, now, locale);
  const tag = row.dueLabel === "overdue" ? dict.today.overdue : row.dueLabel === "today" ? dict.common.today : null;
  return (
    <>
      <span className="due-main">{stamp}</span>
      {tag ? <span className="due-tag">{tag}</span> : null}
    </>
  );
}

export default async function TodayPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale: raw } = await params;
  const locale: Locale = isLocale(raw) ? raw : "fa";
  const dict = getDictionary(locale);

  const ctx = await getSessionContext();
  if (!ctx) redirect(withLocale(locale, "/login"));

  const sp = await searchParams;
  const assignee = typeof sp.assignee === "string" && sp.assignee ? (sp.assignee as "me" | "unassigned" | string) : undefined;
  const due = typeof sp.due === "string" && sp.due ? (sp.due as "overdue" | "next24h" | "next7d") : undefined;
  const filtered = Boolean(assignee || due);

  const data = await getToday(ctx, { assignee, due });

  const rawView = typeof sp.view === "string" ? sp.view : null;
  const view = resolveWorkdeskView(ctx.role === "owner" ? "owner" : "operator", rawView);
  const workdesk = await getWorkdesk(ctx, view);

  // Filters live in the URL, so a view is shareable and the back button works.
  const href = (next: { assignee?: string; due?: string }) => {
    const q = new URLSearchParams();
    const a = next.assignee ?? assignee ?? "";
    const d = next.due ?? due ?? "";
    if (a) q.set("assignee", a);
    if (d) q.set("due", d);
    const qs = q.toString();
    return `/${locale}/today${qs ? `?${qs}` : ""}`;
  };
  const now = new Date();
  const nowHour = hourIn(ctx.tenant.timezone, now);
  const todayLabel = formatFullDate(now, locale, ctx.tenant.timezone);
  const top = data.items[0];
  const topHref = top
    ? top.conversationId
      ? routes.inbox(locale, top.conversationId)
      : top.orderId
        ? routes.orders(locale, top.orderId)
        : routes.tasks(locale)
    : null;

  return (
    <div className="today">
      <WorkdeskPanel locale={locale} cases={workdesk} dict={dict} />

      <div className="today-head">
        <div>
          <h1 className="today-h1">{dict.today.title}</h1>
          <p className="today-date">
            {todayLabel} · {formatTime(now, locale, ctx.tenant.timezone)}
          </p>
          <p className="counts">
            <span className="counts-item">
              <b className="nums">{formatNumber(data.counts.open, locale)}</b> {dict.today.openTasks}
            </span>
            <span className="counts-item hot">
              <b className="nums">{formatNumber(data.counts.overdue, locale)}</b> {dict.today.overdue}
            </span>
            <span className="counts-item">
              <b className="nums">{formatNumber(data.counts.needsReview, locale)}</b> {dict.today.needsReview}
            </span>
            <span className="counts-item">
              {dict.today.lastUpdated}{" "}
              <b>
                {data.lastUpdatedAt ? formatRelative(data.lastUpdatedAt, now, locale) : dict.common.none}
              </b>
            </span>
          </p>
        </div>
        <div className="headend">
          {topHref ? (
            <Link className="start-btn" href={topHref}>
              {dict.today.startTop}
              <small>
                {formatNumber(data.counts.overdue, locale)} {dict.today.overdue}
              </small>
            </Link>
          ) : null}
        </div>
      </div>

      {data.paused ? (
        <div className="paused-banner">
          <b>{dict.today.paused}</b>
          <span>{dict.today.pausedWhy}</span>
        </div>
      ) : null}

      <div className="today-filters" role="group" aria-label={dict.today.filters.label}>
        <span className="filter-group">
          <span className="filter-label">{dict.today.filters.assignee}</span>
          {(
            [
              ["", dict.today.filters.all],
              ["me", dict.today.filters.mine],
              ["unassigned", dict.today.filters.unassigned],
            ] as const
          ).map(([value, label]) => (
            <Link
              key={value || "all"}
              href={href({ assignee: value })}
              className="filter-chip"
              aria-current={(assignee ?? "") === value ? "true" : undefined}
            >
              {label}
            </Link>
          ))}
        </span>
        <span className="filter-group">
          <span className="filter-label">{dict.today.filters.due}</span>
          {(
            [
              ["", dict.today.filters.all],
              ["overdue", dict.today.filters.overdue],
              ["next24h", dict.today.filters.next24h],
              ["next7d", dict.today.filters.next7d],
            ] as const
          ).map(([value, label]) => (
            <Link
              key={value || "all"}
              href={href({ due: value })}
              className="filter-chip"
              aria-current={(due ?? "") === value ? "true" : undefined}
            >
              {label}
            </Link>
          ))}
        </span>
        {filtered ? (
          <>
            <span className="filter-shown">
              {dict.today.filters.shown} {formatNumber(data.items.length, locale)} / {formatNumber(data.counts.open, locale)}
            </span>
            <Link className="filter-clear" href={`/${locale}`}>
              {dict.today.filters.clear}
            </Link>
          </>
        ) : null}
      </div>

      <div className="today-grid">
        <section aria-label={dict.today.title}>
          {data.items.length === 0 ? (
            <div className="empty-state">
              <h2>{dict.today.emptyTitle}</h2>
              <p>{dict.today.emptyBody}</p>
              <div className="row">
                {ctx.tenant.isDemo ? (
                  <ReplayButton label={dict.today.emptyAction} pendingLabel={dict.common.loading} />
                ) : null}
                <Link className="ghost-btn" href={`/${locale}/import`}>
                  {dict.nav.import}
                </Link>
              </div>
            </div>
          ) : (
            <div className="ledger">
              <table className="ledger-table">
                <caption className="visually-hidden">{dict.today.title}</caption>
                <thead>
                  <tr>
                    <th className="col-mark" scope="col">
                      <span className="visually-hidden">{dict.priority.label}</span>
                    </th>
                    <th className="col-customer" scope="col">
                      {dict.today.columns.customer}
                    </th>
                    <th className="col-why" scope="col">
                      {dict.today.columns.why}
                    </th>
                    <th className="col-next" scope="col">
                      {dict.today.columns.next}
                    </th>
                    <th className="col-due" scope="col">
                      {dict.today.columns.due}
                    </th>
                    <th className="col-go" scope="col">
                      <span className="visually-hidden">{dict.common.open}</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((row) => {
                    const href = row.conversationId
                      ? routes.inbox(locale, row.conversationId)
                      : row.orderId
                        ? routes.orders(locale, row.orderId)
                        : routes.tasks(locale);
                    return (
                      <tr key={row.taskId}>
                        <td className="cell-mark">
                          <span className="prio" data-p={row.priority} aria-hidden="true" />
                        </td>
                        <td className="cell-who">
                          <Link className="row-link" href={href}>
                            <span className="cust-name">{row.customerName}</span>
                          </Link>
                          <div className="cust-meta">
                            {row.orderRef ? (
                              <bdi className="mono ltr">{row.orderRef}</bdi>
                            ) : (
                              <span>{row.title}</span>
                            )}
                            {row.itemCount != null ? (
                              <span>
                                {formatNumber(row.itemCount, locale)}{" "}
                                {locale === "fa" ? "قلم" : row.itemCount === 1 ? "item" : "items"}
                              </span>
                            ) : null}
                            <span>{dict.source[row.source]}</span>
                          </div>
                        </td>
                        <td className="cell-why">
                          <span className="why-text">{row.reasonText}</span>
                        </td>
                        <td className="cell-next">
                          <span className="next-text">
                            {row.nextAction}
                            {row.subline ? <span className="next-sub">{row.subline}</span> : null}
                          </span>
                        </td>
                        <td className="cell-due" data-label={row.dueLabel}>
                          {dueCell(row, locale, now, dict)}
                        </td>
                        <td className="cell-go" aria-hidden="true">
                          ‹
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <aside className="rail" aria-label={dict.today.dayRail}>
          <SignalStrip
            data={data.dayStrip}
            locale={locale}
            nowHour={nowHour}
            title={dict.today.dayRail}
          />
          <div className="rail-stats">
            <div>
              <span>{dict.today.statInbound}</span>
              <b className="nums">{formatNumber(data.stats.inbound, locale)}</b>
            </div>
            <div>
              <span>{dict.today.statReplies}</span>
              <b className="nums">{formatNumber(data.stats.replies, locale)}</b>
            </div>
            <div>
              <span>{dict.today.statUnanswered}</span>
              <b className="nums">{formatNumber(data.stats.unanswered, locale)}</b>
            </div>
            <div>
              <span>{dict.today.statAvgReply}</span>
              <b className="nums">
                {data.stats.avgReplyMinutes === null
                  ? dict.common.unknown
                  : locale === "fa"
                      ? `${formatNumber(data.stats.avgReplyMinutes, locale)} دقیقه`
                      : `${formatNumber(data.stats.avgReplyMinutes, locale)} min`}
              </b>
            </div>
          </div>
          <p className="rail-note">{dict.today.railNote}</p>
        </aside>
      </div>
    </div>
  );
}
