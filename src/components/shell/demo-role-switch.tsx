"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * The demo bar: one sandbox, switch the role inside it.
 *
 * The audit asked for this instead of four entry cards — an operator should see the
 * same orders the owner just reviewed, from the other side. It is only rendered for
 * a demo session, and the server refuses it outside a demo tenant, so this is not a
 * production role switch.
 */
type Principal = { role: "owner" | "operator"; name: string; email: string; current: boolean };

export function DemoRoleSwitch({ locale }: { locale: "fa" | "en" }) {
  const router = useRouter();
  const [principals, setPrincipals] = useState<Principal[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/demo/role")
      .then((response) => (response.ok ? response.json() : null))
      .then((payload: { ok?: boolean; data?: { principals?: Principal[] } } | null) => {
        if (!alive) return;
        if (payload?.ok && payload.data?.principals) setPrincipals(payload.data.principals);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  async function switchTo(role: "owner" | "operator") {
    setBusy(role);
    setError(null);
    try {
      const response = await fetch("/api/demo/role", {
        method: "POST",
        headers: { "content-type": "application/json", origin: window.location.origin },
        body: JSON.stringify({ role }),
      });
      const payload = (await response.json()) as {
        ok?: boolean;
        data?: { same?: boolean; email?: string; password?: string | null };
        error?: { message?: string };
      };
      if (!response.ok || !payload.ok) {
        setError(payload.error?.message ?? (locale === "fa" ? "تغییر نقش انجام نشد." : "Role switch failed."));
        setBusy(null);
        return;
      }
      if (payload.data?.same) {
        setBusy(null);
        return;
      }
      if (!payload.data?.email || !payload.data.password) {
        setError(locale === "fa" ? "مدارک ورود این نقش در دسترس نیست." : "Credentials unavailable.");
        setBusy(null);
        return;
      }

      const signIn = await fetch("/api/auth/sign-in/email", {
        method: "POST",
        headers: { "content-type": "application/json", origin: window.location.origin },
        body: JSON.stringify({ email: payload.data.email, password: payload.data.password }),
      });
      if (!signIn.ok) {
        setError(locale === "fa" ? "ورود با نقش دیگر انجام نشد." : "Signing in as that role failed.");
        setBusy(null);
        return;
      }
      // The server components refetch with the new session; this client tree keeps
      // its state, so mark the new role as current instead of showing the old one.
      setPrincipals((previous) => previous?.map((item) => ({ ...item, current: item.role === role })) ?? null);
      router.refresh();
      setBusy(null);
    } catch {
      setError(locale === "fa" ? "خطای شبکه." : "Network error.");
      setBusy(null);
    }
  }

  if (!principals || principals.length < 2) return null;

  return (
    <div className="demobar" role="group" aria-label={locale === "fa" ? "محیط آزمایشی" : "Test environment"}>
      <span className="demobar-label">{locale === "fa" ? "محیط آزمایشی" : "Test environment"}</span>
      {principals.map((principal) => (
        <button
          key={principal.role}
          type="button"
          className="demobar-role"
          data-current={principal.current ? "true" : undefined}
          aria-pressed={principal.current}
          onClick={() => switchTo(principal.role)}
          disabled={busy !== null || principal.current}
        >
          {principal.role === "owner" ? (locale === "fa" ? "مالک" : "Owner") : locale === "fa" ? "اپراتور" : "Operator"}
        </button>
      ))}
      {error ? (
        <span className="demobar-error" role="status">
          {error}
        </span>
      ) : null}
    </div>
  );
}
