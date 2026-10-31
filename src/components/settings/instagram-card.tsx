"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * The Instagram card in settings.
 *
 * It shows exactly two things a seller needs: whether the app is configured at all,
 * and whether *this shop* is linked — with an honest "read-only" line, because
 * nothing here can send a reply yet.
 */
type Connection = {
  accountRef: string;
  displayName: string;
  status: string;
  tokenExpiresAt: string | null;
  lastSyncAt: string | null;
};

type Status = { configured: boolean; verifyTokenSet: boolean; canConnect: boolean; connections: Connection[] };

export function InstagramCard({ locale, outcome }: { locale: "fa" | "en"; outcome?: string | null }) {
  const fa = locale === "fa";
  const [status, setStatus] = useState<Status | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const response = await fetch("/api/channels/instagram/status");
    if (!response.ok) return;
    const payload = (await response.json()) as { ok: boolean; data?: Status };
    if (payload.ok && payload.data) setStatus(payload.data);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function disconnect(accountRef: string) {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/channels/instagram/${encodeURIComponent(accountRef)}`, { method: "DELETE" });
      const payload = (await response.json().catch(() => ({}))) as { ok?: boolean; error?: { message?: string } };
      if (!response.ok || !payload.ok) {
        setError(payload.error?.message ?? (fa ? "قطع اتصال انجام نشد." : "Disconnect failed."));
        return;
      }
      await load();
    } finally {
      setBusy(false);
    }
  }

  const outcomeMessage =
    outcome === "connected"
      ? fa
        ? "اتصال برقرار شد؛ دایرکت‌های تازه در صندوق می‌آیند."
        : "Connected. New DMs will arrive in the inbox."
      : outcome === "denied"
        ? fa
          ? "اجازه در متا رد شد."
          : "Permission was declined in Meta."
        : outcome === "config"
          ? fa
            ? "APP_ID / APP_SECRET اینستاگرام تنظیم نشده است."
            : "INSTAGRAM_APP_ID / SECRET is not set."
          : outcome === "failed" || outcome === "invalid"
            ? fa
              ? "اتصال کامل نشد؛ دوباره تلاش کنید."
              : "The connection did not complete; try again."
            : null;

  return (
    <section className="ig" aria-label={fa ? "اتصال اینستاگرام" : "Instagram"}>
      <h2 className="ig-h2">{fa ? "اینستاگرام" : "Instagram"}</h2>

      {outcomeMessage ? (
        <p className={outcome === "connected" ? "ig-ok" : "ig-error"} role="status">
          {outcomeMessage}
        </p>
      ) : null}

      {!status ? (
        <p className="ig-note">{fa ? "در حال خواندن وضعیت…" : "Reading status…"}</p>
      ) : !status.configured ? (
        <p className="ig-note">
          {fa
            ? "این سرویس هنوز پیکربندی نشده است: INSTAGRAM_APP_ID و INSTAGRAM_APP_SECRET لازم است."
            : "Not configured yet: INSTAGRAM_APP_ID and INSTAGRAM_APP_SECRET are required."}
        </p>
      ) : (
        <>
          {status.connections.length === 0 ? (
            <p className="ig-note">
              {fa ? "هنوز هیچ اکانتی وصل نیست." : "No account is linked yet."}
            </p>
          ) : (
            <ul className="ig-list">
              {status.connections.map((connection) => (
                <li key={connection.accountRef} className="ig-row">
                  <span className="ig-who">
                    <b>{connection.displayName}</b>
                    <small className="mono ltr">{connection.accountRef}</small>
                  </span>
                  <span className={`ig-state ig-state-${connection.status}`}>{connection.status}</span>
                  <button type="button" className="ghost-btn ig-remove" onClick={() => disconnect(connection.accountRef)} disabled={busy}>
                    {fa ? "قطع اتصال" : "Disconnect"}
                  </button>
                </li>
              ))}
            </ul>
          )}

          {status.canConnect ? (
            <a className="setup-primary ig-connect" href="/api/channels/instagram/connect">
              {fa ? "اتصال اکانت اینستاگرام" : "Connect an Instagram account"}
            </a>
          ) : (
            <p className="ig-note">{fa ? "اتصال فقط با نقش مالک ممکن است." : "Only an owner can connect an account."}</p>
          )}

          <p className="ig-note">
            {fa
              ? "خواندن دایرکت‌ها فعال است؛ ارسال پاسخ هنوز فعال نیست و هیچ پیامی از این صفحه فرستاده نمی‌شود."
              : "Reading DMs is on; sending is not implemented yet, and nothing is sent from this screen."}
          </p>
        </>
      )}

      {error ? <p className="ig-error" role="alert">{error}</p> : null}
    </section>
  );
}
