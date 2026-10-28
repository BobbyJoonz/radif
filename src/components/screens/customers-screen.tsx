import Link from "next/link";
import { getDictionary } from "@/i18n";
import type { Locale } from "@/i18n/config";
import { formatNumber } from "@/i18n/format";
import type { CustomerDetailDTO, CustomerRow } from "@/lib/dto";
import {
  ButtonLink,
  EmptyState,
  ErrorState,
  ForbiddenState,
  KeyValue,
  Ltr,
  Mark,
  OfflineState,
  StatusWord,
  type DesignedState,
} from "@/components/ui";
import { dateTimeText, moneyText, whenText } from "./labels";
import styles from "./screens.module.css";

/**
 * Customers are read-only in this phase: an identity is never merged
 * automatically, so the screen shows the identities and the evidence, and
 * leaves merging to a human (it is not built, and no button pretends it is).
 */
export function CustomersScreen({
  locale,
  rows,
  detail,
  q,
  state,
  nowISO,
}: {
  locale: Locale;
  rows: CustomerRow[];
  detail: CustomerDetailDTO | null;
  q: string;
  state: DesignedState | null;
  nowISO: string;
}) {
  const dict = getDictionary(locale);
  const now = new Date(nowISO);
  const loading = state === "loading";
  const designedKind = state && state !== "empty" && state !== "loading" ? state : null;

  return (
    <div className={styles.page}>
      <header className={styles.head}>
        <div>
          <h1 className={styles.h1}>{dict.customers.title}</h1>
          <p className={styles.lede}>{dict.customers.identitiesNote}</p>
        </div>
        <div className={styles.headAside}>
          <span className={styles.cellMeta}>
            {loading ? dict.screen.loadingLabel : `${formatNumber(rows.length, locale)} ${dict.common.customer}`}
          </span>
        </div>
      </header>

      <div className={styles.toolbar}>
        <form className={styles.searchForm} action={`/${locale}/customers`} method="get" role="search">
          <input
            className={styles.searchInput}
            type="search"
            name="q"
            defaultValue={q}
            placeholder={dict.customers.search}
            aria-label={dict.customers.search}
          />
        </form>
        {q ? (
          <Link href={`/${locale}/customers`} className={styles.filter}>
            {dict.inbox.searchClear}
          </Link>
        ) : null}
      </div>

      <div className={styles.split} data-open={detail ? "true" : "false"}>
        <section className={styles.listCol} aria-label={dict.customers.listLabel}>
          {designedKind === "error" ? (
            <ErrorState
              dict={dict}
              action={
                <ButtonLink href={`/${locale}/customers`} variant="ghost">
                  {dict.screen.retry}
                </ButtonLink>
              }
            />
          ) : designedKind === "offline" ? (
            <OfflineState dict={dict} locale={locale} />
          ) : designedKind === "forbidden" ? (
            <ForbiddenState dict={dict} locale={locale} />
          ) : rows.length === 0 ? (
            <EmptyState
              title={dict.customers.emptyTitle}
              body={dict.customers.emptyBody}
              action={
                <ButtonLink href={`/${locale}/import`} variant="ghost" small>
                  {dict.customers.emptyAction}
                </ButtonLink>
              }
            />
          ) : (
            <table className={styles.table}>
              <thead>
                <tr>
                  <th className={styles.th}>{dict.customers.colCustomer}</th>
                  <th className={styles.th}>{dict.customers.colHandles}</th>
                  <th className={styles.th}>{dict.customers.colPhone}</th>
                  <th className={`${styles.th} ${styles.thEnd}`}>{dict.customers.colOrders}</th>
                  <th className={`${styles.th} ${styles.thEnd}`}>{dict.customers.colTasks}</th>
                  <th className={`${styles.th} ${styles.thEnd}`}>{dict.customers.colSeen}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className={styles.tr} aria-current={detail?.customer.id === row.id ? "true" : undefined}>
                    <td className={styles.td}>
                      <Link
                        href={`/${locale}/customers?c=${row.id}${q ? `&q=${encodeURIComponent(q)}` : ""}`}
                        className={styles.rowLink}
                        prefetch={false}
                      >
                        <span className={styles.cellTitle}>{row.displayName}</span>
                      </Link>
                    </td>
                    <td className={styles.td}>
                      <span className={styles.handles}>
                        {row.handles.length ? (
                          row.handles.slice(0, 2).map((handle) => (
                            <Ltr mono key={handle} className={styles.handle}>
                              {handle}
                            </Ltr>
                          ))
                        ) : (
                          <span className={styles.cellMeta}>{dict.customers.noHandles}</span>
                        )}
                      </span>
                    </td>
                    <td className={styles.td}>
                      {row.phone ? (
                        <span className={styles.cellStack}>
                          <Ltr mono>{row.phone}</Ltr>
                          <Mark shape={row.phoneVerified ? "dot" : "ring"} tone={row.phoneVerified ? "positive" : "muted"}>
                            {row.phoneVerified ? dict.customers.phoneVerified : dict.customers.phoneNotVerified}
                          </Mark>
                        </span>
                      ) : (
                        <span className={styles.cellMeta}>{dict.customers.noPhone}</span>
                      )}
                    </td>
                    <td className={`${styles.td} ${styles.tdEnd} ${styles.tdNums}`}>{formatNumber(row.ordersCount, locale)}</td>
                    <td className={`${styles.td} ${styles.tdEnd} ${styles.tdNums}`}>{formatNumber(row.openTasks, locale)}</td>
                    <td className={`${styles.td} ${styles.tdEnd}`}>
                      <span className={styles.cellMeta}>
                        {row.lastSeenAt ? whenText(row.lastSeenAt, locale, now) : dict.customers.never}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section className={styles.detailCol} aria-label={dict.customers.detailLabel}>
          {detail ? (
            <>
              <header className={styles.detailHead}>
                <h2 className={styles.detailTitle}>{detail.customer.displayName}</h2>
                <div className={styles.threadMeta}>
                  <span>
                    {formatNumber(detail.customer.ordersCount, locale)} {dict.common.order}
                  </span>
                  <span>
                    {formatNumber(detail.customer.openTasks, locale)} {dict.nav.tasks}
                  </span>
                  <span>
                    {dict.customers.lastSeen}:{" "}
                    {detail.customer.lastSeenAt ? whenText(detail.customer.lastSeenAt, locale, now) : dict.customers.never}
                  </span>
                </div>
                <div className={styles.threadActions}>
                  <ButtonLink href={`/${locale}/customers`} variant="quiet" className={styles.mobileOnly}>
                    {dict.customers.backToList}
                  </ButtonLink>
                </div>
              </header>

              <div className={styles.blockSection}>
                <div className={styles.sectionHead}>
                  <h3 className={styles.sectionTitle}>{dict.customers.identitiesTitle}</h3>
                </div>
                <p className={styles.docNote}>{dict.customers.identitiesNote}</p>
                {detail.customer.handles.length ? (
                  <ul className={styles.identityList}>
                    {detail.customer.handles.map((handle) => (
                      <li key={handle} className={styles.identityRow}>
                        <span className={styles.identityValue}>{handle}</span>
                        <span className={styles.identityKind}>{dict.customers.identitiesTitle}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className={styles.docNote}>{dict.customers.noHandles}</p>
                )}
                <KeyValue
                  rows={[
                    {
                      key: dict.customers.colPhone,
                      value: detail.customer.phone ? <Ltr mono>{detail.customer.phone}</Ltr> : dict.customers.noPhone,
                    },
                    {
                      key: dict.customers.phoneVerified,
                      value: (
                        <Mark
                          shape={detail.customer.phoneVerified ? "dot" : "ring"}
                          tone={detail.customer.phoneVerified ? "positive" : "muted"}
                        >
                          {detail.customer.phoneVerified ? dict.customers.phoneVerified : dict.customers.phoneNotVerified}
                        </Mark>
                      ),
                    },
                  ]}
                />
              </div>

              <div className={styles.blockSection}>
                <div className={styles.sectionHead}>
                  <h3 className={styles.sectionTitle}>{dict.customers.ordersTitle}</h3>
                </div>
                {detail.orders.length ? (
                  <ul className={styles.auditList}>
                    {detail.orders.map((order) => (
                      <li key={order.id} className={styles.auditRow}>
                        <span className={styles.auditWhat}>
                          <Link href={`/${locale}/orders?o=${order.id}`} className={styles.rowLink}>
                            <Ltr mono>{order.publicRef}</Ltr>
                          </Link>
                          <span className={styles.auditActor}>
                            {moneyText(order.totalMinor, order.currency, locale)} ·{" "}
                            {formatNumber(order.itemCount, locale)} {dict.orders.itemUnit}
                          </span>
                        </span>
                        <span className={styles.cellStackEnd}>
                          <StatusWord kind="order" value={order.status} dict={dict} />
                          <StatusWord kind="payment" value={order.paymentStatus} dict={dict} />
                          <StatusWord kind="shipment" value={order.shipmentStatus} dict={dict} />
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className={styles.docNote}>{dict.customers.noOrders}</p>
                )}
              </div>

              <div className={styles.blockSection}>
                <div className={styles.sectionHead}>
                  <h3 className={styles.sectionTitle}>{dict.customers.timelineTitle}</h3>
                </div>
                {detail.timeline.length ? (
                  <ul className={styles.timelineList}>
                    {detail.timeline.map((entry, index) => {
                      const kindWord =
                        entry.kind === "message"
                          ? dict.customers.kindMessage
                          : entry.kind === "order"
                            ? dict.customers.kindOrder
                            : entry.kind === "payment"
                              ? dict.customers.kindPayment
                              : entry.kind === "shipment"
                                ? dict.customers.kindShipment
                                : entry.kind === "task"
                                  ? dict.customers.kindTask
                                  : dict.customers.kindAudit;
                      return (
                        <li key={`${entry.at}-${index}`} className={styles.timelineRow}>
                          <span className={styles.auditWhat}>
                            <span className={styles.timelineKind}>{kindWord}</span>
                            <span className={styles.auditSummary}>{entry.summary}</span>
                            <span className={styles.auditActor}>
                              {entry.conversationId ? (
                                <Link href={`/${locale}/inbox?c=${entry.conversationId}`} className={styles.handle}>
                                  {dict.nav.inbox}
                                </Link>
                              ) : null}
                              {entry.orderId ? (
                                <Link href={`/${locale}/orders?o=${entry.orderId}`} className={styles.handle}>
                                  {dict.common.order}
                                </Link>
                              ) : null}
                            </span>
                          </span>
                          <span className={styles.auditAt}>{dateTimeText(entry.at, locale)}</span>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <p className={styles.docNote}>{dict.customers.noTimeline}</p>
                )}
              </div>
            </>
          ) : (
            <EmptyState title={dict.customers.pickTitle} body={dict.customers.pickBody} compact />
          )}
        </section>
      </div>
    </div>
  );
}
