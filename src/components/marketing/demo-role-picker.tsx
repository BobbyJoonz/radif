"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Locale } from "@/i18n/config";

/**
 * "Try without signing up" now asks *who you want to be*, because the three
 * personas see genuinely different products:
 *
 *   • owner    — money, settings, the whole queue
 *   • operator — the assigned work, no payment verification
 *   • customer — their own order history, read-only
 *
 * Owner and operator sign in through the real auth endpoint with a demo account;
 * the customer opens a read-only demo view. No fake session, no mocked permissions.
 */
type Persona = "owner" | "operator" | "customer";

export function DemoRolePicker({
  locale,
  label,
  pendingLabel,
  errorLabel,
}: {
  locale: Locale;
  label: string;
  pendingLabel: string;
  errorLabel: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<Persona | "personal" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [repair, setRepair] = useState<string | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const copy =
    locale === "fa"
      ? {
          title: "بهعنوان چه کسی وارد شوی؟",
          hint: "هر نقش همان محصول را با دسترسی واقعی خودش نشان میدهد.",
          owner: "مالک",
          ownerHint: "کل صف، پرداخت، تنظیمات و ارزیابی",
          operator: "اپراتور",
          operatorHint: "کارهای ارجاع‌شده؛ بدون تأیید پرداخت",
          customer: "مشتری",
          customerHint: "تاریخچهٔ سفارش‌های خودش، فقط خواندنی",
          personal: "دموی شخصی من",
          personalHint: "یک فروشگاه کلون‌شده فقط برای شما — نه حساب مشترک",
        }
      : {
          title: "Which role do you want to be?",
          hint: "Each role shows the same product with its real permissions.",
          owner: "Owner",
          ownerHint: "The whole queue, payments, settings, evaluation",
          operator: "Operator",
          operatorHint: "Assigned work; cannot verify payments",
          customer: "Customer",
          customerHint: "Their own order history, read-only",
          personal: "My own demo",
          personalHint: "A cloned shop for you only — not a shared account",
        };


  /** The visitor's own cloned shop — no shared account, so writes stay theirs. */
  async function startPersonal() {
    setBusy("personal");
    setError(null);
    try {
      const created = await fetch("/api/demo/start", { method: "POST" });
      const payload = (await created.json()) as { ok: boolean; data?: { email: string; password: string } };
      if (!created.ok || !payload.ok || !payload.data) throw new Error("create");
      const signedIn = await fetch("/api/auth/sign-in/email", {
        method: "POST",
        headers: { "content-type": "application/json", origin: window.location.origin },
        body: JSON.stringify({ email: payload.data.email, password: payload.data.password }),
      });
      if (!signedIn.ok) throw new Error("signin");
      router.push(`/${locale}/today`);
      router.refresh();
    } catch {
      setBusy(null);
      setError(errorLabel);
    }
  }
  async function enter(persona: Persona) {
    setBusy(persona);
    setError(null);
    try {
      if (persona === "customer") {
        router.push(`/${locale}/demo/customer`);
        return;
      }
      const response = await fetch(`/api/guest?role=${persona}`, { headers: { accept: "application/json" } });
      const payload = (await response.json()) as {
        ok: boolean;
        data?: { kind?: string; href?: string; email?: string; password?: string };
        error?: { code?: string; message?: string; repairHref?: string };
      };

      // The server is allowed to explain itself: a sleeping database or an
      // outdated schema must not read as "the demo is broken".
      if (!response.ok || !payload.ok) {
        setBusy(null);
        setError(payload.error?.message ?? errorLabel);
        setRepair(payload.error?.repairHref ?? null);
        return;
      }
      if (!payload.data?.email || !payload.data.password) throw new Error("no account");

      const signIn = await fetch("/api/auth/sign-in/email", {
        method: "POST",
        headers: { "content-type": "application/json", origin: window.location.origin },
        body: JSON.stringify({ email: payload.data.email, password: payload.data.password }),
      });
      if (!signIn.ok) throw new Error("sign-in failed");
      setOpen(false);
      router.push(`/${locale}/today`);
      router.refresh();
    } catch {
      setBusy(null);
      setError(errorLabel);
      setRepair(null);
    }
  }

  return (
    <div className="rolepicker" ref={wrapRef}>
      <button
        ref={triggerRef}
        type="button"
        className="marketing-cta is-secondary"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        {label}
      </button>

      {open ? (
        <div className="rolepicker-pop" role="dialog" aria-modal="false" aria-label={copy.title}>
          <p className="rolepicker-title">{copy.title}</p>
          <p className="rolepicker-hint">{copy.hint}</p>
          <div className="rolepicker-list">
            {(["owner", "operator", "customer"] as Persona[]).map((persona) => (
              <button
                key={persona}
                type="button"
                className="rolepicker-item"
                onClick={() => enter(persona)}
                disabled={busy !== null}
                aria-busy={busy === persona}
              >
                <span className="rolepicker-item-head">{copy[persona]}</span>
                <span className="rolepicker-item-hint">{copy[`${persona}Hint`]}</span>
                <span className="rolepicker-item-go" aria-hidden="true">
                  {busy === persona ? pendingLabel : "‹"}
                </span>
              </button>
            ))}
            <button
              type="button"
              className="rolepicker-item"
              onClick={startPersonal}
              disabled={busy !== null}
              aria-busy={busy === "personal"}
            >
              <span className="rolepicker-item-head">{copy.personal}</span>
              <span className="rolepicker-item-hint">{copy.personalHint}</span>
              <span className="rolepicker-item-go" aria-hidden="true">
                {busy === "personal" ? pendingLabel : "‹"}
              </span>
            </button>
          </div>
          {error ? (
            <p role="alert" className="rolepicker-error">
              {error}
              {repair ? (
                <>
                  {" "}
                  <a className="rolepicker-repair" href={repair}>
                    {locale === "fa" ? "ترمیم دیتابیس" : "Repair the database"}
                  </a>
                </>
              ) : null}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
