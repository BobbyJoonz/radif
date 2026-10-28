"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

/**
 * Demo-only control: replays the scripted customer message through the real
 * ingestion path (store → queue → analysis), then refreshes the server render.
 * It calls the same route an import would; nothing is faked in the UI.
 */
export function ReplayButton({ label, pendingLabel }: { label: string; pendingLabel: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  async function replay() {
    setError(null);
    try {
      const res = await fetch("/api/demo/replay", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
      const payload = (await res.json()) as { ok: boolean; error?: { message: string } };
      if (!res.ok || !payload.ok) {
        setError(payload.error?.message ?? "بازپخش انجام نشد.");
        return;
      }
      startTransition(() => router.refresh());
    } catch {
      setError("شبکه در دسترس نیست.");
    }
  }

  return (
    <div style={{ display: "grid", gap: 6 }}>
      <button type="button" className="ghost-btn" onClick={replay} disabled={pending}>
        {pending ? pendingLabel : label}
      </button>
      {error ? (
        <span role="alert" style={{ fontSize: "var(--t-meta)", color: "var(--critical)" }}>
          {error}
        </span>
      ) : null}
    </div>
  );
}
