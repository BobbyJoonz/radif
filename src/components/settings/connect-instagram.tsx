"use client";

import { useState } from "react";

/**
 * The two interactive pieces of the connect page: copy a value, or start/stop the
 * OAuth handshake. Both are deliberately dumb — the rules live on the server.
 */
export function CopyValue({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <span className="ig-copy">
      <code className="mono ltr">{value}</code>
      <button
        type="button"
        className="ghost-btn ig-copy-btn"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(value);
            setCopied(true);
            setTimeout(() => setCopied(false), 1600);
          } catch {
            setCopied(false);
          }
        }}
      >
        {copied ? "کپی شد" : label}
      </button>
    </span>
  );
}

export function ConnectInstagram({
  locale,
  connection,
  canConnect,
}: {
  locale: "fa" | "en";
  connection: { accountRef: string; displayName: string; status: string } | null;
  canConnect: boolean;
}) {
  const fa = locale === "fa";
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function disconnect() {
    if (!connection) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/channels/instagram/${encodeURIComponent(connection.accountRef)}`, { method: "DELETE" });
      const payload = (await response.json().catch(() => ({}))) as { ok?: boolean; error?: { message?: string } };
      if (!response.ok || !payload.ok) {
        setError(payload.error?.message ?? (fa ? "قطع اتصال انجام نشد." : "Disconnect failed."));
        return;
      }
      window.location.reload();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="ig-actions">
      {connection ? (
        <>
          <p className="ig-connection">
            {fa ? "متصل: " : "Connected: "}
            <b>{connection.displayName}</b>{" "}
            <span className="mono ltr">{connection.accountRef}</span>{" "}
            <span className="ig-state">{connection.status}</span>
          </p>
          <button type="button" className="ghost-btn" onClick={disconnect} disabled={busy}>
            {fa ? "قطع اتصال" : "Disconnect"}
          </button>
        </>
      ) : canConnect ? (
        <a className="setup-primary" href="/api/channels/instagram/connect">
          {fa ? "اتصال اکانت اینستاگرام" : "Connect an Instagram account"}
        </a>
      ) : (
        <p className="ig-step-hint">{fa ? "اتصال فقط با نقش مالک ممکن است." : "Only an owner can connect."}</p>
      )}
      {error ? <p className="ig-blocker" role="alert">{error}</p> : null}
      <p className="ig-step-hint">
        {fa
          ? "پس از اتصال، دایرکت‌های تازه ذخیره و تحلیل می‌شوند. ارسال پاسخ هنوز در حالت پیش‌نمایش است."
          : "After connecting, new DMs are stored and analysed. Sending is still preview-only."}
      </p>
    </div>
  );
}
