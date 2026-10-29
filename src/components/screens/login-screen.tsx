"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { getDictionary } from "@/i18n";
import type { Locale } from "@/i18n/config";
import { otherLocale } from "@/i18n/config";
import {
  Button,
  ButtonLink,
  CopyButton,
  Field,
  Input,
  MachineInput,
  Notice,
  SkeletonLine,
  SkeletonTitle,
  type DesignedState,
} from "@/components/ui";
import { BrandMark } from "@/components/brand/brand-mark";
import styles from "./screens.module.css";

const DEMO_PASSWORD = "radif-demo-1405";

/** Only in demo mode do these exist; the list is honest about that (CONTRACTS §8). */
const DEMO_ACCOUNTS: { email: string; role: "owner" | "operator"; secondShop?: boolean }[] = [
  { email: "maryam@toranj.demo", role: "owner" },
  { email: "saeed@toranj.demo", role: "operator" },
  { email: "raha@raha.demo", role: "owner", secondShop: true },
];

export function LoginScreen({
  locale,
  nextPath,
  state,
  demoMode,
}: {
  locale: Locale;
  nextPath: string | null;
  state: DesignedState | null;
  demoMode: boolean;
}) {
  const dict = getDictionary(locale);
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const loading = state === "loading";

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    let response: Response | null = null;
    try {
      response = await fetch("./api/auth/sign-in/email", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ email, password }),
      });
    } catch {
      setBusy(false);
      setError(dict.login.noNetwork);
      return;
    }
    if (!response.ok) {
      setBusy(false);
      let message = dict.login.badCredentials;
      try {
        const payload = (await response.json()) as { message?: string };
        if (response.status === 429) message = dict.login.rateLimited;
        else if (payload.message && /invalid|not found|credential/i.test(payload.message)) message = dict.login.badCredentials;
        else if (payload.message) message = payload.message;
      } catch {
        /* keep the designed sentence */
      }
      setError(message);
      return;
    }
    setBusy(false);
    router.push(nextPath ?? `/${locale}`);
    router.refresh();
  }

  function fill(account: { email: string }) {
    setEmail(account.email);
    setPassword(DEMO_PASSWORD);
    setError(null);
  }

  return (
    <div className={styles.page} style={{ padding: 0 }}>
      <div className={styles.login}>
        <div className={styles.loginWrap}>
          <div className={styles.loginPanel}>
            <div className={styles.loginkTop}>
              <Link href={`/${locale}`} className={styles.loginBrand} aria-label={dict.brand.name}>
                <BrandMark locale={locale} size="lg" variant="caps" priority />
              </Link>
              <Link href={`/${otherLocale(locale)}/login`} className={styles.langSwitchInline}>
                {otherLocale(locale) === "en" ? "EN" : "فا"}
              </Link>
            </div>

            <div>
              <h1 className={styles.loginTitle}>{dict.login.title}</h1>
              <p className={styles.loginSub}>{dict.brand.tagline}</p>
            </div>

            {state === "forbidden" ? (
              <Notice tone="accent">
                {dict.login.alreadyIn}{" "}
                <ButtonLink href={`/${locale}`} variant="quiet" small>
                  {dict.login.goToToday}
                </ButtonLink>
              </Notice>
            ) : null}
            {state === "offline" ? <Notice tone="critical">{dict.screen.offlineBody}</Notice> : null}
            {state === "error" ? <Notice tone="critical">{dict.states.errorBody}</Notice> : null}

            {loading ? (
              <div className={styles.skelStack} aria-hidden="true">
                <SkeletonTitle width="56%" />
                <SkeletonLine width="88%" />
                <SkeletonLine width="88%" />
                <SkeletonLine width="46%" />
              </div>
            ) : (
              <form className={styles.loginForm} onSubmit={submit} noValidate>
                <Field label={dict.login.email} htmlFor="login-email">
                  <MachineInput
                    id="login-email"
                    name="email"
                    type="email"
                    inputMode="email"
                    autoComplete="username"
                    required
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                  />
                </Field>
                <Field label={dict.login.password} htmlFor="login-password">
                  <Input
                    id="login-password"
                    name="password"
                    type="password"
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                  />
                </Field>
                {error ? (
                  <p className={styles.formError} role="alert">
                    {error}
                  </p>
                ) : null}
                <Button type="submit" variant="primary" block disabled={busy || !email || !password}>
                  {busy ? dict.login.submitting : dict.login.submit}
                </Button>
                <p className={styles.docNote}>{dict.login.subtitle}</p>
              </form>
            )}
          </div>

          {demoMode ? (
            <aside className={styles.loginAside} aria-label={dict.login.demoTitle}>
              <h2 className={styles.loginAsideTitle}>{dict.login.demoTitle}</h2>
              <p className={styles.docNote}>{dict.login.demoNote}</p>
              <ul className={styles.accountList}>
                {DEMO_ACCOUNTS.map((account) => (
                  <li key={account.email}>
                    <button
                      type="button"
                      className={styles.accountBtn}
                      onClick={() => fill(account)}
                      aria-label={`${dict.login.fill} ${account.email}`}
                    >
                      <span className={styles.accountEmail}>{account.email}</span>
                      <span className={styles.accountWho}>
                        {account.role === "owner" ? dict.shell.roleOwner : dict.shell.roleOperator}
                        {account.secondShop ? ` · ${dict.login.secondShop}` : ""}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
              <div className={styles.passRow}>
                <span>
                  {dict.login.demoPassword}: <span className={styles.passValue}>{DEMO_PASSWORD}</span>
                </span>
                <CopyButton value={DEMO_PASSWORD} label={dict.common.copy} copiedLabel={dict.common.copied} />
              </div>
              <p className={styles.docNote}>{dict.login.fillHint}</p>
            </aside>
          ) : (
            <aside className={styles.loginAside}>
              <h2 className={styles.loginAsideTitle}>{dict.shell.shop}</h2>
              <p className={styles.docNote}>{dict.shell.demoLong}</p>
            </aside>
          )}
        </div>
      </div>
    </div>
  );
}
