"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Accepting an invitation.
 *
 * The token in the URL is only a hint to the server: acceptance is decided by the
 * membership rules (single use, expiry, identity match) in the service. This button
 * exists so the human sees the outcome as a sentence instead of a JSON error.
 */
export function AcceptInvite({ token, locale }: { token: string; locale: "fa" | "en" }) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "busy" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

  async function accept() {
    setState("busy");
    setMessage(null);
    try {
      const response = await fetch("/api/invitations/accept", {
        method: "POST",
        headers: { "content-type": "application/json", origin: window.location.origin },
        body: JSON.stringify({ token }),
      });
      const payload = (await response.json()) as { ok?: boolean; error?: { message?: string } };
      if (!response.ok || !payload.ok) {
        setState("error");
        setMessage(payload.error?.message ?? (locale === "fa" ? "پذیرش دعوت انجام نشد." : "Accepting the invitation failed."));
        return;
      }
      router.push(`/${locale}/today`);
      router.refresh();
    } catch {
      setState("error");
      setMessage(locale === "fa" ? "خطای شبکه؛ دوباره تلاش کنید." : "Network error; try again.");
    }
  }

  return (
    <div className="brandscreen-actions" style={{ display: "grid", gap: 10, justifyItems: "center" }}>
      <button type="button" className="setup-primary" onClick={accept} disabled={state === "busy"} aria-busy={state === "busy"}>
        {state === "busy"
          ? locale === "fa"
            ? "در حال پذیرش…"
            : "Accepting…"
          : locale === "fa"
            ? "پیوستن به فروشگاه"
            : "Join the shop"}
      </button>
      {message ? (
        <p className="brandscreen-body" role="alert">
          {message}
        </p>
      ) : null}
    </div>
  );
}
