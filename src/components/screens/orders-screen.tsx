"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { getDictionary, type Dictionary } from "@/i18n";
import type { Locale } from "@/i18n/config";
import { formatDateTime, formatNumber } from "@/i18n/format";
import type {
  OrderDetailDTO,
  OrderRow,
  OrderStatusValue,
  PaymentClaimDTO,
  ShipmentStatusValue,
} from "@/lib/dto";
import {
  Button,
  ButtonLink,
  CopyButton,
  Dialog,
  ErrorState,
  Field,
  ForbiddenState,
  Input,
  KeyValue,
  Ltr,
  MachineInput,
  Mark,
  Notice,
  OfflineState,
  Select,
  SkeletonLine,
  SkeletonTitle,
  StatusWord,
  Textarea,
  Toast,
  apiFetch,
  messageFor,
  useToast,
  type DesignedState,
} from "@/components/ui";
import { dueLabel, moneyText, whenText } from "./labels";
import styles from "./screens.module.css";


export type OrdersScreenProps = {
  locale: Locale;
  rows: OrderRow[];
  detail: OrderDetailDTO | null;
  filter: "all" | OrderStatusValue;
  role: "owner" | "operator";
  state: DesignedState | null;
  nowISO: string;
};

export function OrdersScreen({ locale, rows, detail, filter, role, state, nowISO }: OrdersScreenProps) {
  const dict = getDictionary(locale);
  const now = useMemo(() => new Date(nowISO), [nowISO]);
  const { toast, show, clear } = useToast();
  const loading = state === "loading";
  const designedKind = state && state !== "empty" && state !== "loading" ? state : null;
  const open = Boolean(detail);

  const filters: { key: "all" | OrderStatusValue; label: string }[] = [
    { key: "all", label: dict.orders.filterAll },
    { key: "draft", label: dict.orderStatus.draft },
    { key: "needs_review", label: dict.orderStatus.needs_review },
    { key: "confirmed", label: dict.orderStatus.confirmed },
    { key: "cancelled", label: dict.orderStatus.cancelled },
  ];

  return (
    <div className={styles.page}>
      <header className={styles.head}>
        <div>
          <h1 className={styles.h1}>{dict.orders.title}</h1>
          <p className={styles.lede}>{dict.orders.machineNote}</p>
        </div>
        <div className={styles.headAside}>
          <span className={styles.cellMeta}>
            {loading ? dict.screen.loadingLabel : `${formatNumber(rows.length, locale)} ${dict.orders.itemUnit}`}
          </span>
        </div>
      </header>

      <div className={styles.toolbar}>
        {filters.map((item) => (
          <Link
            key={item.key}
            href={`/${locale}/orders${item.key === "all" ? "" : `?status=${item.key}`}`}
            className={styles.filter}
            aria-current={filter === item.key ? "true" : undefined}
          >
            {item.label}
          </Link>
        ))}
      </div>

      <div className={styles.split} data-open={open ? "true" : "false"}>
        <section className={styles.listCol} aria-label={dict.orders.listLabel}>
          {designedKind === "error" ? (
            <ErrorState dict={dict} action={<ButtonLink href={`/${locale}/orders`} variant="ghost">{dict.screen.retry}</ButtonLink>} />
          ) : designedKind === "offline" ? (
            <OfflineState dict={dict} locale={locale} />
          ) : designedKind === "forbidden" ? (
            <ForbiddenState dict={dict} locale={locale} />
          ) : rows.length === 0 ? (
            <div className={styles.listEmpty}>
              <h2 className={styles.sectionTitle}>{dict.orders.emptyTitle}</h2>
              <p className={styles.docNote}>{dict.orders.emptyBody}</p>
              <p>
                <ButtonLink href={`/${locale}/inbox`} variant="ghost" small>
                  {dict.orders.emptyAction}
                </ButtonLink>
              </p>
            </div>
          ) : (
            <table className={styles.table}>
              <thead>
                <tr>
                  <th className={styles.th}>{dict.orders.colCustomer}</th>
                  <th className={styles.th}>{dict.orders.colItems}</th>
                  <th className={`${styles.th} ${styles.thEnd}`}>{dict.orders.colTotal}</th>
                  <th className={styles.th}>{dict.orders.colStates}</th>
                  <th className={`${styles.th} ${styles.thEnd}`}>{dict.orders.colDue}</th>
                </tr>
              </thead>
              <tbody>
                {(loading ? [] : rows).map((row) => {
                  const selected = detail?.order.id === row.id;
                  const total = moneyText(row.totalMinor, row.currency, locale);
                  const due = dueLabel(row.dueAt, locale, now);
                  return (
                    <tr key={row.id} className={styles.tr} aria-current={selected ? "true" : undefined}>
                      <td className={styles.td}>
                        <Link href={`/${locale}/orders?o=${row.id}${filter !== "all" ? `&status=${filter}` : ""}`} className={styles.rowLink} prefetch={false}>
                          <span className={styles.cellTitle}>{row.customerName}</span>
                          <Ltr mono className={styles.cellSub}>
                            {row.publicRef}
                          </Ltr>
                        </Link>
                      </td>
                      <td className={styles.td}>
                        <span className={styles.cellMeta}>
                          {formatNumber(row.itemCount, locale)} {dict.orders.itemUnit}
                        </span>
                      </td>
                      <td className={`${styles.td} ${styles.tdEnd} ${styles.tdNums}`}>{total ?? dict.common.unknown}</td>
                      <td className={styles.td}>
                        <span className={styles.cellStack}>
                          <StatusWord kind="order" value={row.status} dict={dict} />
                          <StatusWord kind="payment" value={row.paymentStatus} dict={dict} />
                          <StatusWord kind="shipment" value={row.shipmentStatus} dict={dict} />
                        </span>
                      </td>
                      <td className={`${styles.td} ${styles.tdEnd}`}>
                        {due ? (
                          <span className={styles.cellMeta}>{due.text}</span>
                        ) : (
                          <span className={styles.cellMeta}>{dict.tasks.dueNone}</span>
                        )}
                        {row.needsReview ? (
                          <span className={styles.cellSub}>
                            <Mark shape="triangle" tone="accent">
                              {dict.common.needsReview}
                            </Mark>
                          </span>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
          {loading
            ? Array.from({ length: 6 }, (_, index) => (
                <div className={styles.qrow} aria-hidden="true" key={index}>
                  <SkeletonLine width="42%" />
                  <SkeletonLine width="72%" />
                </div>
              ))
            : null}
        </section>

        <section className={styles.detailCol} aria-label={dict.orders.detailLabel}>
          {loading ? (
            <div className={styles.skelStack} aria-hidden="true">
              <SkeletonTitle width="52%" />
              <SkeletonLine width="80%" />
              <SkeletonLine width="64%" />
              <SkeletonLine width="74%" />
            </div>
          ) : detail ? (
            <OrderDetailPane
              key={`${detail.order.id}:${detail.order.version}:${detail.shipment?.id ?? "no-shipment"}`}
              locale={locale}
              dict={dict}
              detail={detail}
              role={role}
              now={now}
              showToast={show}
            />
          ) : designedKind ? null : (
            <div className={styles.listEmpty}>
              <h2 className={styles.sectionTitle}>{dict.orders.pickTitle}</h2>
              <p className={styles.docNote}>{dict.orders.pickBody}</p>
            </div>
          )}
        </section>
      </div>
      <Toast message={toast?.message ?? null} tone={toast?.tone} onClose={clear} />
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────── */

function OrderDetailPane({
  locale,
  dict,
  detail,
  role,
  now,
  showToast,
}: {
  locale: Locale;
  dict: Dictionary;
  detail: OrderDetailDTO;
  role: "owner" | "operator";
  now: Date;
  showToast: (message: string, tone?: "ok" | "error") => void;
}) {
  const router = useRouter();
  const { order, customer, items, paymentClaims, shipment, tasks, audit } = detail;
  const [notes, setNotes] = useState(order.notes ?? "");
  const [notesBusy, setNotesBusy] = useState(false);
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [claimBusy, setClaimBusy] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [dialog, setDialog] = useState<"verify" | "dispute" | null>(null);
  const [claim, setClaim] = useState<PaymentClaimDTO | null>(null);
  const [reason, setReason] = useState("");
  const [decisionBusy, setDecisionBusy] = useState(false);
  const [shipStatus, setShipStatus] = useState<ShipmentStatusValue>(shipment?.status ?? "not_ready");
  const [carrier, setCarrier] = useState(shipment?.carrier ?? "");
  const [tracking, setTracking] = useState(shipment?.trackingCode ?? "");
  const [shipBusy, setShipBusy] = useState(false);

  const latestClaim = paymentClaims[0] ?? null;
  const canVerify = role === "owner";

  async function saveNotes() {
    setNotesBusy(true);
    const result = await apiFetch<{ version: number }>(`/api/orders/${order.id}`, {
      method: "PATCH",
      body: JSON.stringify({ version: order.version, patch: { notes } }),
    });
    setNotesBusy(false);
    if (result.ok) {
      showToast(dict.orders.saved);
      router.refresh();
    } else {
      if (result.error.code === "conflict") setConflict(true);
      showToast(messageFor(result.error, dict), "error");
    }
  }

  async function confirmDraft() {
    setConfirmBusy(true);
    const result = await apiFetch<{ order: unknown }>(`/api/orders/${order.id}/confirm`, {
      method: "POST",
      body: JSON.stringify({ version: order.version }),
    });
    setConfirmBusy(false);
    if (result.ok) {
      showToast(dict.orders.saved);
      router.refresh();
    } else {
      if (result.error.code === "conflict") setConflict(true);
      showToast(messageFor(result.error, dict), "error");
    }
  }

  async function claimPayment() {
    setClaimBusy(true);
    const result = await apiFetch<{ claim: PaymentClaimDTO }>(`/api/orders/${order.id}/payment-claims`, {
      method: "POST",
      body: JSON.stringify({}),
    });
    setClaimBusy(false);
    if (result.ok) {
      showToast(dict.orders.paymentClaimAction);
      router.refresh();
    } else {
      showToast(messageFor(result.error, dict), "error");
    }
  }

  async function decidePayment(decision: "verified" | "disputed") {
    if (!claim) return;
    setDecisionBusy(true);
    const result = await apiFetch<{ claim: PaymentClaimDTO }>(
      `/api/orders/${order.id}/payment-claims/${claim.id}/verify`,
      { method: "POST", body: JSON.stringify({ decision, ...(reason ? { reason } : {}) }) },
    );
    setDecisionBusy(false);
    setDialog(null);
    if (result.ok) {
      showToast(dict.orders.saved);
      setReason("");
      router.refresh();
    } else {
      showToast(messageFor(result.error, dict), "error");
    }
  }

  async function saveShipment() {
    setShipBusy(true);
    const result = await apiFetch<{ shipment: unknown }>(`/api/orders/${order.id}/shipment`, {
      method: "PATCH",
      body: JSON.stringify({
        status: shipStatus,
        ...(carrier ? { carrier } : {}),
        ...(tracking ? { trackingCode: tracking } : {}),
      }),
    });
    setShipBusy(false);
    if (result.ok) {
      showToast(dict.orders.shipmentSaved);
      router.refresh();
    } else {
      showToast(messageFor(result.error, dict), "error");
    }
  }

  const orderStateIsOpen = order.status === "draft" || order.status === "needs_review";
  const total = moneyText(order.totalMinor, order.currency, locale);

  return (
    <div>
      <header className={styles.detailHead}>
        <div className={styles.rowBetween}>
          <span className={styles.detailRef}>{order.publicRef}</span>
          <span className={styles.cellMeta}>
            {dict.orders.version} {formatNumber(order.version, locale)}
          </span>
        </div>
        <h2 className={styles.detailTitle}>{order.customerName}</h2>
        <div className={styles.threadMeta}>
          <span>
            {formatNumber(order.itemCount, locale)} {dict.orders.itemUnit}
          </span>
          <span>{total}</span>
          <span>{order.createdAt ? formatDateTime(order.createdAt, locale) : dict.common.none}</span>
          {order.dueAt ? <span>{whenText(order.dueAt, locale, now)}</span> : null}
        </div>
        <div className={styles.threadActions}>
          <ButtonLink href={`/${locale}/orders`} variant="quiet" className={styles.mobileOnly}>
            {dict.orders.backToList}
          </ButtonLink>

        </div>
      </header>

      {conflict ? (
        <div style={{ paddingTop: "var(--s3)" }}>
          <Notice tone="critical">
            {dict.orders.conflictBody}{" "}
            <Button
              variant="ghost"
              small
              onClick={() => {
                setConflict(false);
                router.refresh();
              }}
            >
              {dict.orders.reload}
            </Button>
          </Notice>
        </div>
      ) : null}

      {/* the three machines, each with its own word and its own controls */}
      <div className={styles.machines} aria-label={dict.orders.machineNote}>
        <div className={styles.machine}>
          <div className={styles.machineHead}>
            <span className={styles.machineTitle}>{dict.orders.machineOrder}</span>
            <StatusWord kind="order" value={order.status} dict={dict} />
          </div>
          <div className={styles.machineBody}>
            {order.status === "needs_review" ? <p className={styles.machineNote}>{dict.orders.needsReviewNote}</p> : null}
            {order.status === "cancelled" ? <p className={styles.machineNote}>{dict.orders.cancelledNote}</p> : null}
            {order.confirmedAt ? (
              <p className={styles.machineNote}>
                {dict.orderStatus.confirmed}: {formatDateTime(order.confirmedAt, locale)}
              </p>
            ) : null}
            {orderStateIsOpen ? (
              <div className={styles.inlineForm}>
                <Button variant="primary" small onClick={confirmDraft} disabled={confirmBusy}>
                  {confirmBusy ? dict.orders.confirming : dict.orders.confirmDraft}
                </Button>
                <span className={styles.machineNote}>{dict.orders.confirmNote}</span>
              </div>
            ) : null}
            <Field label={dict.orders.notesLabel} htmlFor="order-notes">
              <Textarea
                id="order-notes"
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder={dict.orders.notesEmpty}
              />
            </Field>
            <div>
              <Button variant="ghost" small onClick={saveNotes} disabled={notesBusy || notes === (order.notes ?? "")}>
                {notesBusy ? dict.orders.saving : dict.orders.saveNotes}
              </Button>
            </div>
          </div>
        </div>

        <div className={styles.machine}>
          <div className={styles.machineHead}>
            <span className={styles.machineTitle}>{dict.orders.machinePayment}</span>
            <StatusWord kind="payment" value={order.paymentStatus} dict={dict} />
          </div>
          <div className={styles.machineBody}>
            <p className={styles.machineNote}>{dict.orders.paymentClaimNote}</p>
            {latestClaim ? (
              <KeyValue
                rows={[
                  { key: dict.orders.paymentClaimedAt, value: formatDateTime(latestClaim.claimedAt, locale) },
                  {
                    key: dict.orders.paymentAmount,
                    value: latestClaim.amountMinor
                      ? moneyText(latestClaim.amountMinor, latestClaim.currency, locale)
                      : dict.common.unknown,
                  },
                  ...(latestClaim.verifiedAt
                    ? [
                        {
                          key: dict.orders.paymentVerifiedAt,
                          value: formatDateTime(latestClaim.verifiedAt, locale),
                        },
                        { key: dict.orders.paymentVerifiedBy, value: latestClaim.verifiedByName ?? dict.common.unknown },
                      ]
                    : []),
                  ...(latestClaim.disputeReason
                    ? [{ key: dict.orders.paymentDisputeReason, value: latestClaim.disputeReason }]
                    : []),
                  ...(latestClaim.sourceMessageId
                    ? [
                        {
                          key: dict.orders.paymentClaimSource,
                          value: <Ltr mono>{latestClaim.sourceMessageId}</Ltr>,
                        },
                      ]
                    : []),
                ]}
              />
            ) : (
              <p className={styles.machineNote}>{dict.orders.paymentNoClaim}</p>
            )}
            <div className={styles.inlineForm}>
              {order.paymentStatus === "unknown" ? (
                <Button variant="ghost" small onClick={claimPayment} disabled={claimBusy}>
                  {claimBusy ? dict.orders.paymentClaiming : dict.orders.paymentClaimAction}
                </Button>
              ) : null}
              {latestClaim && latestClaim.status === "claimed" ? (
                canVerify ? (
                  <>
                    <Button
                      variant="ghost"
                      small
                      onClick={() => {
                        setClaim(latestClaim);
                        setDialog("verify");
                      }}
                    >
                      {dict.orders.paymentVerify}
                    </Button>
                    <Button
                      variant="critical"
                      small
                      onClick={() => {
                        setClaim(latestClaim);
                        setDialog("dispute");
                      }}
                    >
                      {dict.orders.paymentDispute}
                    </Button>
                  </>
                ) : (
                  <span className={styles.machineNote}>
                    {dict.orders.paymentOwnerOnly} {dict.orders.paymentOwnerWho}
                  </span>
                )
              ) : null}
            </div>
          </div>
        </div>

        <div className={styles.machine}>
          <div className={styles.machineHead}>
            <span className={styles.machineTitle}>{dict.orders.machineShipment}</span>
            <StatusWord kind="shipment" value={shipment?.status ?? order.shipmentStatus} dict={dict} />
          </div>
          <div className={styles.machineBody}>
            <p className={styles.machineNote}>{dict.orders.shipmentNote}</p>
            <div className={styles.cellStack}>
              <span className={styles.fieldLabel}>{dict.orders.shipmentTracking}</span>
              {shipment?.trackingCode ? (
                <span className={styles.copyRow}>
                  <Ltr mono className={styles.copyValue}>
                    {shipment.trackingCode}
                  </Ltr>
                  <CopyButton value={shipment.trackingCode} label={dict.orders.shipmentCopy} copiedLabel={dict.common.copied} />
                </span>
              ) : (
                <span className={styles.machineNote}>{dict.orders.shipmentNoTracking}</span>
              )}
            </div>
            {shipment ? (
              <div className={styles.threadMeta}>
                {shipment.carrier ? <span>{shipment.carrier}</span> : null}
                {shipment.shippedAt ? (
                  <span>
                    {dict.orders.shipmentShippedAt}: {formatDateTime(shipment.shippedAt, locale)}
                  </span>
                ) : null}
                {shipment.deliveredAt ? (
                  <span>
                    {dict.orders.shipmentDeliveredAt}: {formatDateTime(shipment.deliveredAt, locale)}
                  </span>
                ) : null}
                {shipment.pausedReason ? <span>{shipment.pausedReason}</span> : null}
              </div>
            ) : (
              <p className={styles.machineNote}>{dict.orders.shipmentNoRecord}</p>
            )}
            <form
              className={styles.fieldRow}
              onSubmit={(event) => {
                event.preventDefault();
                void saveShipment();
              }}
            >
              <Field label={dict.orders.shipmentStatus} htmlFor="ship-status">
                <Select
                  id="ship-status"
                  value={shipStatus}
                  onChange={(event) => setShipStatus(event.target.value as ShipmentStatusValue)}
                >
                  {(["not_ready", "preparing", "shipped", "delivered", "paused"] as ShipmentStatusValue[]).map((value) => (
                    <option key={value} value={value}>
                      {dict.shipmentStatus[value]}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label={dict.orders.shipmentCarrier} htmlFor="ship-carrier">
                <Input
                  id="ship-carrier"
                  value={carrier}
                  onChange={(event) => setCarrier(event.target.value)}
                  placeholder={dict.orders.shipmentCarrierPlaceholder}
                />
              </Field>
              <Field label={dict.orders.shipmentTracking} htmlFor="ship-tracking">
                <MachineInput
                  id="ship-tracking"
                  value={tracking}
                  onChange={(event) => setTracking(event.target.value)}
                  placeholder={dict.orders.shipmentTrackingPlaceholder}
                />
              </Field>
              <div>
                <Button type="submit" variant="ghost" small disabled={shipBusy}>
                  {shipBusy ? dict.orders.saving : dict.orders.shipmentSave}
                </Button>
              </div>
            </form>
          </div>
        </div>
      </div>

      <div className={styles.blockSection}>
        <div className={styles.sectionHead}>
          <h3 className={styles.sectionTitle}>{dict.orders.itemsTitle}</h3>
        </div>
        {items.length ? (
          <table className={styles.itemsTable}>
            <thead>
              <tr>
                <th className={styles.th}>{dict.orders.itemsTitle}</th>
                <th className={`${styles.th} ${styles.thEnd}`}>{dict.orders.qty}</th>
                <th className={`${styles.th} ${styles.thEnd}`}>{dict.orders.unitPrice}</th>
                <th className={`${styles.th} ${styles.thEnd}`}>{dict.orders.lineTotal}</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const line = moneyText((BigInt(item.qty) * BigInt(item.unitPriceMinor)).toString(), item.currency, locale);
                return (
                  <tr key={item.id} className={styles.tr}>
                    <td className={styles.td}>
                      {item.title}
                      {item.sku ? (
                        <span className={styles.cellSub}>
                          <Ltr mono>{item.sku}</Ltr>
                        </span>
                      ) : null}
                    </td>
                    <td className={`${styles.td} ${styles.tdEnd} ${styles.tdNums}`}>{formatNumber(item.qty, locale)}</td>
                    <td className={`${styles.td} ${styles.tdEnd} ${styles.tdNums}`}>
                      {moneyText(item.unitPriceMinor, item.currency, locale)}
                    </td>
                    <td className={`${styles.td} ${styles.tdEnd} ${styles.tdNums}`}>{line}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <p className={styles.docNote}>{dict.orders.noItems}</p>
        )}
      </div>

      <div className={styles.blockSection}>
        <div className={styles.sectionHead}>
          <h3 className={styles.sectionTitle}>{dict.orders.customerTitle}</h3>
        </div>
        <KeyValue
          rows={[
            { key: dict.orders.phone, value: customer.phone ? <Ltr mono>{customer.phone}</Ltr> : dict.orders.noPhone },
            {
              key: dict.orders.phoneVerified,
              value: customer.phoneVerified ? (
                <Mark shape="dot" tone="positive">
                  {dict.orders.phoneVerified}
                </Mark>
              ) : (
                <Mark shape="ring" tone="muted">
                  {dict.orders.phoneNotVerified}
                </Mark>
              ),
            },
            {
              key: dict.orders.handles,
              value: customer.handles.length ? (
                <span className={styles.handles}>
                  {customer.handles.map((handle) => (
                    <Ltr mono key={handle} className={styles.handle}>
                      {handle}
                    </Ltr>
                  ))}
                </span>
              ) : (
                dict.orders.noHandles
              ),
            },
          ]}
        />
      </div>

      <div className={styles.blockSection}>
        <div className={styles.sectionHead}>
          <h3 className={styles.sectionTitle}>{dict.orders.tasksTitle}</h3>
        </div>
        {tasks.length ? (
          <ul className={styles.taskList}>
            {tasks.map((task) => (
              <li key={task.id} className={styles.auditRow}>
                <span className={styles.auditWhat}>
                  <span className={styles.auditSummary}>{task.title}</span>
                  <span className={styles.auditActor}>{task.reasonText}</span>
                </span>
                <span className={styles.cellStackEnd}>
                  <StatusWord kind="task" value={task.status} dict={dict} />
                  {task.dueAt ? <span className={styles.auditAt}>{formatDateTime(task.dueAt, locale)}</span> : null}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className={styles.docNote}>{dict.orders.tasksNone}</p>
        )}
      </div>

      <div className={styles.blockSection}>
        <div className={styles.sectionHead}>
          <h3 className={styles.sectionTitle}>{dict.orders.auditTitle}</h3>
        </div>
        {audit.length ? (
          <ul className={styles.auditList}>
            {audit.map((entry) => (
              <li key={entry.id} className={styles.auditRow}>
                <span className={styles.auditWhat}>
                  <span className={styles.auditSummary}>{entry.summary ?? entry.action}</span>
                  <span className={styles.auditActor}>
                    {entry.actorName ??
                      (entry.actorType === "system"
                        ? dict.orders.actorSystem
                        : entry.actorType === "demo"
                          ? dict.orders.actorDemo
                          : dict.orders.actorUser)}{" "}
                    · <Ltr mono>{entry.action}</Ltr>
                  </span>
                </span>
                <span className={styles.auditAt}>{formatDateTime(entry.at, locale)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className={styles.docNote}>{dict.orders.auditNone}</p>
        )}
      </div>

      <Dialog
        open={dialog !== null}
        onClose={() => setDialog(null)}
        title={dialog === "verify" ? dict.orders.paymentDialogVerifyTitle : dict.orders.paymentDialogDisputeTitle}
        body={dialog === "verify" ? dict.orders.paymentDialogVerifyBody : dict.orders.paymentDialogDisputeBody}
        actions={
          <>
            <Button variant="ghost" onClick={() => setDialog(null)} disabled={decisionBusy}>
              {dict.common.cancel}
            </Button>
            <Button
              variant={dialog === "verify" ? "primary" : "critical"}
              onClick={() => void decidePayment(dialog === "verify" ? "verified" : "disputed")}
              disabled={decisionBusy}
            >
              {decisionBusy ? dict.orders.saving : dict.orders.paymentDialogConfirm}
            </Button>
          </>
        }
      >
        {claim ? (
          <KeyValue
            rows={[
              { key: dict.orders.paymentAmount, value: claim.amountMinor ? moneyText(claim.amountMinor, claim.currency, locale) : dict.common.unknown },
              { key: dict.orders.paymentClaimedAt, value: formatDateTime(claim.claimedAt, locale) },
            ]}
          />
        ) : null}
        <Field label={dict.orders.paymentDialogReason} htmlFor="dispute-reason">
          <Input id="dispute-reason" value={reason} onChange={(event) => setReason(event.target.value)} />
        </Field>
      </Dialog>
    </div>
  );
}


