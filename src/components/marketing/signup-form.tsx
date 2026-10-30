"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Locale } from "@/i18n/config";
import { getMarketingCopy } from "@/i18n/marketing";
import { GuestButton } from "./guest-button";

/**
 * Real registration: name, shop, email, password.
 *
 * Two steps, both honest: Better Auth creates the identity (and the session), then
 * `/api/onboarding` creates the shop and the owner membership. If the second step
 * fails, the account still exists and the user is told exactly that — no fake
 * "welcome" screen.
 */
export function SignupForm({ locale }: { locale: Locale }) {
  const t = getMarketingCopy(locale);
  const router = useRouter();
  const [state, setState] = useState<"idle" | "busy">("idle");
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const name = String(form.get("name") ?? "").trim();
    const shop = String(form.get("shop") ?? "").trim();
    const email = String(form.get("email") ?? "").trim();
    const password = String(form.get("password") ?? "");

    if (name.length < 2 || shop.length < 2 || !email.includes("@") || password.length < 8) {
      setError(t.signup.errorGeneric);
      return;
    }

    setState("busy");
    setError(null);
    try {
      const signUp = await fetch("/api/auth/sign-up/email", {
        method: "POST",
        headers: { "content-type": "application/json", origin: window.location.origin },
        body: JSON.stringify({ name, email, password }),
      });
      if (!signUp.ok) {
        setState("idle");
        setError(signUp.status === 422 || signUp.status === 409 ? t.signup.errorTaken : t.signup.errorGeneric);
        return;
      }

      const onboarding = await fetch("/api/onboarding", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ shopName: shop, locale }),
      });
      if (!onboarding.ok) {
        setState("idle");
        setError(t.signup.errorGeneric);
        return;
      }

      router.push(`/${locale}/today`);
      router.refresh();
    } catch {
      setState("idle");
      setError(t.signup.errorGeneric);
    }
  }

  return (
    <div className="signup">
      <div className="signup-panel">
        <h1>{t.signup.title}</h1>
        <p className="signup-lede">{t.signup.lede}</p>

        <form onSubmit={submit} noValidate>
          <label htmlFor="su-name">{t.signup.name}</label>
          <input id="su-name" name="name" autoComplete="name" required minLength={2} />

          <label htmlFor="su-shop">{t.signup.shop}</label>
          <input id="su-shop" name="shop" autoComplete="organization" required minLength={2} />

          <label htmlFor="su-email">{t.signup.email}</label>
          <input id="su-email" name="email" type="email" autoComplete="email" dir="ltr" required />

          <label htmlFor="su-password">{t.signup.password}</label>
          <input
            id="su-password"
            name="password"
            type="password"
            autoComplete="new-password"
            dir="ltr"
            required
            minLength={8}
            aria-describedby="su-password-hint"
          />
          <p id="su-password-hint" className="signup-hint">
            {t.signup.passwordHint}
          </p>

          {error ? (
            <p role="alert" className="signup-error">
              {error}
            </p>
          ) : null}

          <button type="submit" className="marketing-cta is-primary is-wide" disabled={state === "busy"}>
            {state === "busy" ? t.signup.pending : t.signup.submit}
          </button>
        </form>

        <p className="signup-alt">
          {t.signup.haveAccount} <Link href={`/${locale}/login`}>{t.signup.goLogin}</Link>
        </p>
        <p className="signup-alt">
          <GuestButton
            locale={locale}
            label={t.signup.orDemo}
            pendingLabel={t.cta.guestPending}
            errorLabel={t.cta.guestError}
            variant="link"
          />
        </p>
      </div>
    </div>
  );
}
