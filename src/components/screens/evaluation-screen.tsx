import Link from "next/link";
import { getDictionary } from "@/i18n";
import type { Locale } from "@/i18n/config";
import { formatNumber } from "@/i18n/format";
import type { EvaluationRow } from "@/lib/dto";
import {
  ButtonLink,
  Chip,
  EmptyState,
  ErrorState,
  ForbiddenState,
  Ltr,
  Mark,
  OfflineState,
  StatusWord,
  type DesignedState,
} from "@/components/ui";
import { dateTimeText, intentWord } from "./labels";
import styles from "./screens.module.css";

/**
 * Evaluation is the honest screen: latency is measured, so it is printed;
 * tokens and cost come back `null` from the mock provider, so they say
 * «نامشخص» — never 0 — and the cascade comparison says «اندازه‌گیری‌نشده» until
 * there is a measured sample (CONTRACTS.md §7, DIRECTION.md §4).
 */
export function EvaluationScreen({
  locale,
  rows,
  state,
  nowISO,
}: {
  locale: Locale;
  rows: EvaluationRow[];
  state: DesignedState | null;
  nowISO: string;
}) {
  const dict = getDictionary(locale);
  void nowISO;
  const loading = state === "loading";
  const designedKind = state && state !== "empty" && state !== "loading" ? state : null;

  const measured = rows.filter((row) => row.costMicroUsd !== null);
  const latencies = rows.filter((row) => row.latencyMs !== null).map((row) => row.latencyMs as number);
  const averageLatency = latencies.length
    ? Math.round(latencies.reduce((sum, value) => sum + value, 0) / latencies.length)
    : null;
  const measuredCostMicro = measured.reduce((sum, row) => sum + BigInt(row.costMicroUsd as string), 0n);
  const measuredCostText = (Number(measuredCostMicro) / 1_000_000).toFixed(4);

  function statusWord(value: string): string {
    switch (value) {
      case "succeeded":
        return dict.evaluation.statusSucceeded;
      case "failed":
        return dict.evaluation.statusFailed;
      case "invalid_output":
        return dict.evaluation.statusInvalidOutput;
      case "running":
        return dict.evaluation.statusRunning;
      default:
        return value;
    }
  }

  return (
    <div className={styles.page}>
      <header className={styles.head}>
        <div>
          <h1 className={styles.h1}>{dict.evaluation.title}</h1>
          <p className={styles.lede}>{dict.evaluation.subtitle}</p>
        </div>
        <div className={styles.headAside}>
          <span className={styles.cellMeta}>
            {loading ? dict.screen.loadingLabel : `${formatNumber(rows.length, locale)} ${dict.evaluation.runsCount}`}
          </span>
        </div>
      </header>

      {designedKind === "error" ? (
        <ErrorState
          dict={dict}
          action={
            <ButtonLink href={`/${locale}/evaluation`} variant="ghost">
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
          title={dict.evaluation.emptyTitle}
          body={dict.evaluation.emptyBody}
          action={
            <ButtonLink href={`/${locale}/inbox`} variant="ghost" small>
              {dict.evaluation.emptyAction}
            </ButtonLink>
          }
        />
      ) : (
        <>
          <div className={styles.comparison}>
            <div className={styles.comparisonHead}>
              <h2 className={styles.sectionTitle}>{dict.evaluation.comparisonTitle}</h2>
              <Mark shape={measured.length > 0 ? "triangle" : "dash"} tone="muted">
                {measured.length > 0 ? dict.common.notMeasured : dict.evaluation.comparisonNotMeasured}
              </Mark>
            </div>
            <div className={styles.comparisonGrid}>
              <div className={styles.comparisonCell}>
                <span className={styles.comparisonKey}>{dict.evaluation.samples}</span>
                <span className={styles.comparisonValue}>{formatNumber(measured.length, locale)}</span>
              </div>
              <div className={styles.comparisonCell}>
                <span className={styles.comparisonKey}>{dict.evaluation.latencyMeasured}</span>
                <span className={styles.comparisonValue}>
                  {averageLatency === null
                    ? dict.common.notMeasured
                    : `${formatNumber(averageLatency, locale)} ms`}
                </span>
              </div>
              <div className={styles.comparisonCell}>
                <span className={styles.comparisonKey}>{dict.evaluation.cascade}</span>
                <span className={styles.comparisonValue}>
                  {measured.length ? <Ltr mono>${measuredCostText}</Ltr> : dict.evaluation.costUnknown}
                </span>
              </div>
              <div className={styles.comparisonCell}>
                <span className={styles.comparisonKey}>{dict.evaluation.savings}</span>
                <span className={styles.comparisonValue}>
                  <span className={styles.unmeasured}>{dict.evaluation.comparisonNotMeasured}</span>
                </span>
              </div>
            </div>
            <p className={styles.docNote}>
              {measured.length ? dict.evaluation.comparisonNote : dict.evaluation.comparisonNone}
            </p>
            <p className={styles.docNote}>{dict.evaluation.notMeasuredLong}</p>
          </div>

          <div className={styles.evalTableWrap}>
            <table className={styles.evalTable}>
              <thead>
                <tr>
                  <th className={styles.th}>{dict.evaluation.colAt}</th>
                  <th className={styles.th}>{dict.evaluation.colMessage}</th>
                  <th className={styles.th}>{dict.evaluation.colModel}</th>
                  <th className={styles.th}>{dict.evaluation.colStatus}</th>
                  <th className={`${styles.th} ${styles.thEnd}`}>{dict.evaluation.colLatency}</th>
                  <th className={`${styles.th} ${styles.thEnd}`}>{dict.evaluation.colTokens}</th>
                  <th className={`${styles.th} ${styles.thEnd}`}>{dict.evaluation.colCost}</th>
                  <th className={styles.th}>{dict.evaluation.colIntents}</th>
                  <th className={`${styles.th} ${styles.thEnd}`}>{dict.evaluation.colAttempts}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className={styles.tr}>
                    <td className={styles.td}>
                      <span className={styles.cellMeta}>{dateTimeText(row.createdAt, locale)}</span>
                    </td>
                    <td className={styles.td}>
                      <Ltr mono>{row.messageId}</Ltr>
                      <span className={styles.cellSub}>
                        <Ltr mono>
                          {row.promptVersion} · {row.rulesVersion}
                        </Ltr>
                      </span>
                    </td>
                    <td className={styles.td}>
                      <Ltr mono>{row.model}</Ltr>
                      <span className={styles.cellSub}>
                        <Ltr mono>{row.provider}</Ltr>
                      </span>
                    </td>
                    <td className={styles.td}>
                      <Mark
                        shape={
                          row.status === "succeeded"
                            ? "dot"
                            : row.status === "running"
                              ? "dash"
                              : row.status === "invalid_output"
                                ? "triangle"
                                : "cross"
                        }
                        tone={row.status === "succeeded" ? "positive" : row.status === "failed" ? "critical" : "ink"}
                      >
                        {statusWord(row.status)}
                      </Mark>
                    </td>
                    <td className={`${styles.td} ${styles.tdEnd} ${styles.tdNums}`}>
                      {row.latencyMs === null ? (
                        <span className={styles.unmeasured}>{dict.common.unknown}</span>
                      ) : (
                        `${formatNumber(row.latencyMs, locale)} ms`
                      )}
                    </td>
                    <td className={`${styles.td} ${styles.tdEnd} ${styles.tdNums}`}>
                      {row.tokensIn === null && row.tokensOut === null ? (
                        <span className={styles.unmeasured}>{dict.evaluation.tokensUnknown}</span>
                      ) : (
                        <Ltr>
                          {row.tokensIn ?? "—"} / {row.tokensOut ?? "—"}
                        </Ltr>
                      )}
                    </td>
                    <td className={`${styles.td} ${styles.tdEnd} ${styles.tdNums}`}>
                      {row.costMicroUsd === null ? (
                        <span className={styles.unmeasured}>{dict.evaluation.costUnknown}</span>
                      ) : (
                        <Ltr mono>${(Number(row.costMicroUsd) / 1_000_000).toFixed(6)}</Ltr>
                      )}
                    </td>
                    <td className={styles.td}>
                      <span className={styles.intents}>
                        {row.intents.length ? (
                          row.intents.map((intent) => (
                            <Chip key={intent} tone="plain">
                              {intentWord(intent, dict)}
                            </Chip>
                          ))
                        ) : (
                          <span className={styles.unmeasured}>{dict.common.unknown}</span>
                        )}
                      </span>
                    </td>
                    <td className={`${styles.td} ${styles.tdEnd} ${styles.tdNums}`}>
                      {formatNumber(row.attempts, locale)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className={styles.docNote}>
            {dict.evaluation.latencyNote}{" "}
            <Link href={`/${locale}/inbox`} className={styles.filter}>
              {dict.nav.inbox}
            </Link>
          </p>
        </>
      )}
    </div>
  );
}
