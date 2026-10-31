"use client";

import { TeamPanel } from "@/components/settings/team-panel";
import { InstagramCard } from "@/components/settings/instagram-card";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { getDictionary } from "@/i18n";
import type { Locale } from "@/i18n/config";
import { formatNumber } from "@/i18n/format";
import type { SettingsDTO } from "@/lib/dto";
import {
  Button,
  ButtonLink,
  Chip,
  ErrorState,
  Field,
  ForbiddenState,
  Input,
  KeyValue,
  Ltr,
  Mark,
  Notice,
  OfflineState,
  Select,
  SkeletonLine,
  SkeletonTitle,
  Toast,
  apiFetch,
  messageFor,
  useToast,
  type DesignedState,
} from "@/components/ui";
import { dateTimeText } from "./labels";
import styles from "./screens.module.css";

function minutesToTime(value: number): string {
  const hours = Math.floor(value / 60);
  const minutes = value % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function timeToMinutes(value: string): number {
  const [hours, minutes] = value.split(":").map(Number);
  return (hours || 0) * 60 + (minutes || 0);
}

const CONNECTION_STATE: Record<string, "ready" | "connected" | "expired" | "revoked" | "not_configured"> = {
  not_configured: "not_configured",
  ready: "ready",
  connected: "connected",
  expired: "expired",
  revoked: "revoked",
};

/**
 * Settings is a document that states what is configured and what is demo.
 * A phase-3 feature is a sentence with a «فاز بعد» chip — never a dead button.
 */
export function SettingsScreen({
  locale,
  settings,
  role,
  email,
  state,
}: {
  locale: Locale;
  settings: SettingsDTO;
  role: "owner" | "operator";
  email: string;
  state: DesignedState | null;
}) {
  const dict = getDictionary(locale);
  const router = useRouter();
  const { toast, show, clear } = useToast();
  const [busy, setBusy] = useState(false);

  const [form, setForm] = useState({
    startMin: settings.workday.startMin,
    endMin: settings.workday.endMin,
    firstReplyMin: settings.sla.firstReplyMin,
    shipMin: settings.sla.shipMin,
    freshnessMin: settings.priceFreshnessMin,
    postingPaused: settings.postingPaused,
  });

  const loading = state === "loading";
  const designedKind = state && state !== "empty" && state !== "loading" ? state : null;
  const canEdit = role === "owner";

  const dirty =
    form.startMin !== settings.workday.startMin ||
    form.endMin !== settings.workday.endMin ||
    form.firstReplyMin !== settings.sla.firstReplyMin ||
    form.shipMin !== settings.sla.shipMin ||
    form.freshnessMin !== settings.priceFreshnessMin ||
    form.postingPaused !== settings.postingPaused;

  async function save() {
    if (!dirty) {
      show(dict.settings.noChanges, "error");
      return;
    }
    setBusy(true);
    const result = await apiFetch<SettingsDTO>("/api/settings", {
      method: "PATCH",
      body: JSON.stringify({
        workday: { startMin: form.startMin, endMin: form.endMin },
        sla: { firstReplyMin: form.firstReplyMin, shipMin: form.shipMin },
        priceFreshnessMin: form.freshnessMin,
        postingPaused: form.postingPaused,
      }),
    });
    setBusy(false);
    if (result.ok) {
      show(dict.settings.saved);
      router.refresh();
    } else {
      show(messageFor(result.error, dict), "error");
    }
  }

  return (
    <div className={styles.page}>
      <header className={styles.head}>
        <div>
          <h1 className={styles.h1}>{dict.settings.title}</h1>
          <p className={styles.lede}>{dict.settings.subtitle}</p>
        </div>
        <div className={styles.headAside}>
          {canEdit ? (
            <Button variant="primary" small onClick={save} disabled={busy || !dirty}>
              {busy ? dict.settings.saving : dict.settings.save}
            </Button>
          ) : (
            <span className={styles.cellMeta}>{dict.settings.ownerOnly}</span>
          )}
        </div>
      </header>

      {designedKind === "error" ? (
        <ErrorState
          dict={dict}
          action={
            <ButtonLink href={`/${locale}/settings`} variant="ghost">
              {dict.screen.retry}
            </ButtonLink>
          }
        />
      ) : designedKind === "offline" ? (
        <OfflineState dict={dict} locale={locale} />
      ) : designedKind === "forbidden" ? (
        <ForbiddenState dict={dict} locale={locale} />
      ) : loading ? (
        <div className={styles.skelStack} aria-hidden="true">
          <SkeletonTitle width="38%" />
          <SkeletonLine width="72%" />
          <SkeletonLine width="58%" />
        </div>
      ) : (
        <div className={styles.doc}>
          {!canEdit ? <Notice>{dict.settings.readOnly}</Notice> : null}

          <section className={styles.docSection}>
            <div className={styles.docSectionHead}>
              <h2 className={styles.docSectionTitle}>{dict.settings.tenantTitle}</h2>
              {settings.tenant.isDemo ? <Chip tone="accent">{dict.shell.demo}</Chip> : null}
            </div>
            <KeyValue
              rows={[
                { key: dict.settings.tenantName, value: locale === "fa" ? settings.tenant.nameFa : settings.tenant.nameEn },
                { key: dict.settings.timezone, value: <Ltr mono>{settings.tenant.timezone}</Ltr> },
                { key: dict.settings.currency, value: <Ltr mono>{settings.tenant.currency}</Ltr> },
                { key: dict.settings.demo, value: settings.tenant.isDemo ? dict.settings.demoYes : dict.settings.demoNo },
              ]}
            />
          </section>

          <section className={styles.docSection}>
            <div className={styles.docSectionHead}>
              <h2 className={styles.docSectionTitle}>{dict.settings.workdayTitle}</h2>
            </div>
            <div className={styles.docFields}>
              <Field label={dict.settings.workdayStart} htmlFor="wd-start" hint={dict.settings.workdayNote}>
                <Input
                  id="wd-start"
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  spellCheck={false}
                  placeholder="09:00"
                  pattern="^([01][0-9]|2[0-3]):[0-5][0-9]$"
                  title={locale === "fa" ? "ساعت ۲۴ساعته، مثل ۰۹:۰۰ یا ۲۱:۰۰" : "24-hour clock, e.g. 09:00 or 21:00"}
                  dir="ltr"
                  
                  readOnly={!canEdit}
                  value={minutesToTime(form.startMin)}
                  onChange={(event) => setForm((current) => ({ ...current, startMin: timeToMinutes(event.target.value) }))}
                />
              </Field>
              <Field label={dict.settings.workdayEnd} htmlFor="wd-end">
                <Input
                  id="wd-end"
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  spellCheck={false}
                  placeholder="09:00"
                  pattern="^([01][0-9]|2[0-3]):[0-5][0-9]$"
                  title={locale === "fa" ? "ساعت ۲۴ساعته، مثل ۰۹:۰۰ یا ۲۱:۰۰" : "24-hour clock, e.g. 09:00 or 21:00"}
                  dir="ltr"
                  readOnly={!canEdit}
                  value={minutesToTime(form.endMin)}
                  onChange={(event) => setForm((current) => ({ ...current, endMin: timeToMinutes(event.target.value) }))}
                />
              </Field>
            </div>
          </section>

          <section className={styles.docSection}>
            <div className={styles.docSectionHead}>
              <h2 className={styles.docSectionTitle}>{dict.settings.slaTitle}</h2>
            </div>
            <div className={styles.docFields}>
              <Field label={dict.settings.slaFirstReply} htmlFor="sla-reply" hint={dict.settings.slaNote}>
                <Input
                  id="sla-reply"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  dir="ltr"
                  readOnly={!canEdit}
                  value={form.firstReplyMin}
                  onChange={(event) => setForm((current) => ({ ...current, firstReplyMin: Number(event.target.value) }))}
                />
              </Field>
              <Field label={dict.settings.slaShip} htmlFor="sla-ship">
                <Input
                  id="sla-ship"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  dir="ltr"
                  readOnly={!canEdit}
                  value={form.shipMin}
                  onChange={(event) => setForm((current) => ({ ...current, shipMin: Number(event.target.value) }))}
                />
              </Field>
            </div>
          </section>

          <section className={styles.docSection}>
            <div className={styles.docSectionHead}>
              <h2 className={styles.docSectionTitle}>{dict.settings.freshnessTitle}</h2>
            </div>
            <div className={styles.docFields}>
              <Field label={dict.settings.freshnessMinutes} htmlFor="freshness" hint={dict.settings.freshnessNote}>
                <Input
                  id="freshness"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  dir="ltr"
                  readOnly={!canEdit}
                  value={form.freshnessMin}
                  onChange={(event) => setForm((current) => ({ ...current, freshnessMin: Number(event.target.value) }))}
                />
              </Field>
            </div>
          </section>

          <section className={styles.docSection}>
            <div className={styles.docSectionHead}>
              <h2 className={styles.docSectionTitle}>{dict.settings.postingTitle}</h2>
              <Mark shape={form.postingPaused ? "dash" : "dot"} tone={form.postingPaused ? "critical" : "ink"}>
                {form.postingPaused ? dict.settings.postingPaused : dict.settings.postingOpen}
              </Mark>
            </div>
            <div className={styles.docFields}>
              <Field label={dict.settings.postingTitle} htmlFor="posting" hint={dict.settings.postingNote}>
                <Select
                  id="posting"
                  disabled={!canEdit}
                  value={form.postingPaused ? "paused" : "open"}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, postingPaused: event.target.value === "paused" }))
                  }
                >
                  <option value="open">{dict.settings.postingOpen}</option>
                  <option value="paused">{dict.settings.postingPaused}</option>
                </Select>
              </Field>
            </div>
          </section>

          <section className={styles.docSection}>
            <div className={styles.docSectionHead}>
              <h2 className={styles.docSectionTitle}>{dict.settings.connectionsTitle}</h2>
            </div>
            <p className={styles.docNote}>{dict.settings.connectionsNote}</p>
            {settings.connections.length ? (
              settings.connections.map((connection) => {
                const connectionState = CONNECTION_STATE[connection.status] ?? "not_configured";
                const word =
                  connectionState === "ready"
                    ? dict.settings.connectionReady
                    : connectionState === "connected"
                      ? dict.settings.connectionConnected
                      : connectionState === "expired"
                        ? dict.settings.connectionExpired
                        : connectionState === "revoked"
                          ? dict.settings.connectionRevoked
                          : dict.settings.connectionNotConfigured;
                const visual =
                  connectionState === "connected"
                    ? { shape: "dot" as const, tone: "positive" as const }
                    : connectionState === "ready"
                      ? { shape: "triangle" as const, tone: "muted" as const }
                      : { shape: "ring" as const, tone: "muted" as const };
                return (
                  <div className={styles.connectionRow} key={connection.id}>
                    <span>
                      <span className={styles.connectionName}>{connection.displayName}</span>
                      <span className={styles.connectionMeta}>
                        <span>
                          {dict.settings.connectionChannel}: <Ltr mono>{connection.channel}</Ltr>
                        </span>
                        <span>
                          {dict.settings.connectionAccount}: <Ltr mono>{connection.accountRef}</Ltr>
                        </span>
                        <span>
                          {dict.settings.connectionLastSync}:{" "}
                          {connection.lastSyncAt ? dateTimeText(connection.lastSyncAt, locale) : dict.settings.connectionNever}
                        </span>
                      </span>
                    </span>
                    <Mark shape={visual.shape} tone={visual.tone}>
                      {word}
                    </Mark>
                  </div>
                );
              })
            ) : (
              <p className={styles.docNote}>{dict.settings.connectionsEmpty}</p>
            )}
          </section>

          <section className={styles.docSection}>
            <div className={styles.docSectionHead}>
              <h2 className={styles.docSectionTitle}>{dict.settings.modesTitle}</h2>
            </div>
            <p className={styles.docNote}>{dict.settings.modesNote}</p>
            <div className={styles.modeGrid}>
              {[
                { key: dict.settings.modeAppMode, value: settings.modes.appMode },
                { key: dict.settings.modeIngestion, value: settings.modes.ingestion },
                { key: dict.settings.modeDecision, value: settings.modes.decisionProvider },
                { key: dict.settings.modeOutbound, value: settings.modes.outbound },
              ].map((row) => (
                <div className={styles.modeRow} key={row.key}>
                  <span className={styles.modeKey}>{row.key}</span>
                  <span className={styles.modeValue}>{row.value}</span>
                </div>
              ))}
              <div className={styles.modeRow}>
                <span className={styles.modeKey}>{dict.settings.modeLive}</span>
                <Mark shape={settings.modes.liveAutomation ? "dot" : "ring"} tone={settings.modes.liveAutomation ? "positive" : "muted"}>
                  {settings.modes.liveAutomation ? dict.settings.modeOn : dict.settings.modeOff}
                </Mark>
              </div>
            </div>
          </section>

          <section className={styles.docSection}>
            <div className={styles.docSectionHead}>
              <h2 className={styles.docSectionTitle}>{dict.settings.rateTitle}</h2>
            </div>
            <KeyValue
              rows={[
                { key: dict.settings.rateLogin, value: formatNumber(settings.rateLimits.loginPerMin, locale) },
                { key: dict.settings.rateImport, value: formatNumber(settings.rateLimits.importPerMin, locale) },
              ]}
            />
            <p className={styles.docNote}>{dict.settings.rateNote}</p>
          </section>

          <section className={styles.docSection}>
            <div className={styles.docSectionHead}>
              <h2 className={styles.docSectionTitle}>{dict.settings.evaluationLink}</h2>
            </div>
            <p className={styles.docNote}>{dict.evaluation.subtitle}</p>
            <p>
              <ButtonLink href={`/${locale}/evaluation`} variant="ghost" small>
                {dict.nav.evaluation}
              </ButtonLink>
            </p>
          </section>

          <section className={styles.docSection}>
            <div className={styles.docSectionHead}>
              <h2 className={styles.docSectionTitle}>{dict.settings.phaseTitle}</h2>
              <Chip tone="phase">{dict.common.phaseNext}</Chip>
            </div>
            <p className={styles.docNote}>{dict.settings.phaseBody}</p>
            <ul className={styles.phaseList}>
              {[dict.settings.phaseInstagram, dict.settings.phaseAutoReply, dict.settings.phaseMultiWarehouse].map((item) => (
                <li className={styles.phaseItem} key={item}>
                  <Chip tone="phase">{dict.common.phaseNext}</Chip>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </section>

          <section className={styles.docSection}>
            <div className={styles.docSectionHead}>
              <h2 className={styles.docSectionTitle}>{dict.settings.identityTitle}</h2>
            </div>
            <KeyValue
              rows={[
                { key: dict.settings.identityRole, value: role === "owner" ? dict.common.owner : dict.common.operator },
                { key: dict.settings.identityEmail, value: <Ltr mono>{email}</Ltr> },
              ]}
            />
          </section>

          {canEdit ? (
            <div className={styles.inlineForm}>
              <Button variant="ghost" onClick={save} disabled={busy || !dirty}>
                {busy ? dict.settings.saving : dict.settings.save}
              </Button>
              {!dirty ? <span className={styles.docNote}>{dict.settings.noChanges}</span> : null}
              <Link href={`/${locale}/evaluation`} className={styles.filter}>
                {dict.settings.evaluationLink}
              </Link>
            </div>
          ) : null}
        </div>
      )}
      <InstagramCard locale={locale} outcome={typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("instagram")} />

      <TeamPanel locale={locale} />

      <Toast message={toast?.message ?? null} tone={toast?.tone} onClose={clear} />
    </div>
  );
}