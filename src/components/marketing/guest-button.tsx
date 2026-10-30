"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Locale } from "@/i18n/config";

/**
 * "Try without signing up".
 *
 * There is no separate guest auth path: the server hands out a **demo account**
 * (one of the seeded shops, chosen at random), the browser signs in with the real
 * Better Auth endpoint, and the seller lands on the real queue. Nothing is faked,
 * every guest action goes through the same authorization as a normal session, and
 * a guest can always create a real account afterwards.
 */
export function GuestButton({
  locale,
  label,
  pendingLabel,
  errorLabel,
  variant = "ghost",
}: {
  locale: Locale;
  label: string;
  pendingLabel: string;
  errorLabel: string;
  variant?: "ghost" | "link";
}) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "busy">("idle");
  const [error, setError] = useState<string | null>(null);

  async function enterDemo() {
    setState("busy");
    setError(null);
    try {
      const response = await fetch("/api/guest", { method: "GET", headers: { accept: "application/json" } });
      if (!response.ok) throw new Error("guest endpoint failed");
      const payload = (await response.json()) as { ok: boolean; data?: { email: string; password: string } };
      if (!payload.ok || !payload.data) throw new Error("no demo account");

      const signIn = await fetch("/api/auth/sign-in/email", {
        method: "POST",
        headers: { "content-type": "application/json", origin: window.location.origin },
        body: JSON.stringify({ email: payload.data.email, password: payload.data.password }),
      });
      if (!signIn.ok) throw new Error("sign-in failed");

      router.push(`/${locale}/today`);
      router.refresh();
    } catch {
      setState("idle");
      setError(errorLabel);
    }
  }

  return (
    <span className="guestwrap">
      <button
        type="button"
        className={variant === "link" ? "marketing-link" : "marketing-cta is-secondary"}
        onClick={enterDemo}
        disabled={state === "busy"}
        aria-busy={state === "busy"}
      >
        {state === "busy" ? pendingLabel : label}
      </button>
      {error ? (
        <span role="alert" className="guest-error">
          {error}
        </span>
      ) : null}
    </span>
  );
}
