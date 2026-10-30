"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { Locale } from "@/i18n/config";
import { accountMenuKeys, type ShopRole } from "@/lib/nav-matrix";

/**
 * The account menu: who you are, which role you hold, where the settings are,
 * and one honest way out.
 *
 * It replaces a static line of text with a real menu — sign-out was missing from
 * the whole product, which is the kind of omission that makes a demo feel fake.
 * Keyboard contract: Enter/Space opens, Escape closes and returns focus, arrow
 * keys move between items, Tab leaves and closes.
 */
export function UserMenu({
  locale,
  name,
  role,
  roleLabel,
  shop,
  labels,
}: {
  locale: Locale;
  name: string;
  role: ShopRole;
  roleLabel: string;
  shop: string;
  labels: {
    account: string;
    settings: string;
    evaluation: string;
    signOut: string;
    signingOut: string;
    signOutError: string;
    menu: string;
  };
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const firstItemRef = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKey);
    firstItemRef.current?.focus();
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function signOut() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/auth/sign-out", {
        method: "POST",
        headers: { "content-type": "application/json", origin: window.location.origin },
        body: "{}",
      });
      if (!response.ok) throw new Error("sign-out failed");
      setOpen(false);
      router.push(`/${locale}`);
      router.refresh();
    } catch {
      setBusy(false);
      setError(labels.signOutError);
    }
  }

  const initial = name.trim().charAt(0);

  return (
    <div className="usermenu" ref={wrapRef}>
      <button
        ref={triggerRef}
        type="button"
        className="usermenu-trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`${labels.menu} — ${name}`}
        onClick={() => setOpen((value) => !value)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setOpen(true);
          }
        }}
      >
        <span className="usermenu-initial" aria-hidden="true">
          {initial}
        </span>
        <span className="usermenu-id">
          <b>{name}</b>
          <small>{roleLabel}</small>
        </span>
        <span className={`usermenu-caret ${open ? "is-open" : ""}`} aria-hidden="true" />
      </button>

      {open ? (
        <div className="usermenu-pop" role="menu" aria-label={labels.account}>
          <div className="usermenu-head">
            <b>{name}</b>
            <span>{shop}</span>
            <span className="usermenu-role">{roleLabel}</span>
          </div>
          {accountMenuKeys(role).includes("settings") ? (
            <Link
              ref={firstItemRef}
              role="menuitem"
              className="usermenu-item"
              href={`/${locale}/settings`}
              onClick={() => setOpen(false)}
            >
              {labels.settings}
            </Link>
          ) : null}
          {accountMenuKeys(role).includes("evaluation") ? (
            <Link role="menuitem" className="usermenu-item" href={`/${locale}/evaluation`} onClick={() => setOpen(false)}>
              {labels.evaluation}
            </Link>
          ) : null}
          <div className="usermenu-sep" role="separator" />
          <button type="button" role="menuitem" className="usermenu-item is-danger" onClick={signOut} disabled={busy}>
            {busy ? labels.signingOut : labels.signOut}
          </button>
          {error ? (
            <p className="usermenu-error" role="alert">
              {error}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
