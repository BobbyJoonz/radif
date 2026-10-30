"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * The team tab: who works here, who is invited, and the two actions an owner has.
 *
 * It shows the invitation link instead of pretending to send email — a copyable
 * link is the whole requirement, and claiming an email was sent would be a lie.
 */
type Member = { userId: string; name: string; email: string; role: "owner" | "operator"; current: boolean };
type Invitation = { id: string; email: string; role: "owner" | "operator"; expiresAt: string };

export function TeamPanel({ locale }: { locale: "fa" | "en" }) {
  const fa = locale === "fa";
  const [members, setMembers] = useState<Member[] | null>(null);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [role, setRole] = useState<"owner" | "operator">("operator");
  const [email, setEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"owner" | "operator">("operator");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [link, setLink] = useState<string | null>(null);

  const load = useCallback(async () => {
    const response = await fetch("/api/team");
    if (!response.ok) return;
    const payload = (await response.json()) as {
      ok: boolean;
      data?: { role: "owner" | "operator"; members: Member[]; invitations: Invitation[] };
    };
    if (payload.ok && payload.data) {
      setMembers(payload.data.members);
      setInvitations(payload.data.invitations);
      setRole(payload.data.role);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function invite(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setLink(null);
    try {
      const response = await fetch("/api/invitations", {
        method: "POST",
        headers: { "content-type": "application/json", origin: window.location.origin },
        body: JSON.stringify({ email, role: inviteRole }),
      });
      const payload = (await response.json()) as {
        ok: boolean;
        data?: { path?: string; email?: string };
        error?: { message?: string };
      };
      if (!response.ok || !payload.ok) {
        setError(payload.error?.message ?? (fa ? "ساخت دعوت انجام نشد." : "Could not create the invitation."));
        return;
      }
      setLink(payload.data?.path ?? null);
      setEmail("");
      setNotice(fa ? "دعوت ساخته شد؛ لینک را کپی کنید." : "Invitation created; copy the link.");
      await load();
    } catch {
      setError(fa ? "خطای شبکه." : "Network error.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(userId: string) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(`/api/team/${userId}`, { method: "DELETE" });
      const payload = (await response.json().catch(() => ({}))) as { ok?: boolean; error?: { message?: string } };
      if (!response.ok || !payload.ok) {
        setError(payload.error?.message ?? (fa ? "حذف همکار انجام نشد." : "Could not remove the colleague."));
        return;
      }
      setNotice(fa ? "همکار حذف شد." : "Colleague removed.");
      await load();
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="team" aria-label={fa ? "تیم" : "Team"}>
      <h2 className="team-h2">{fa ? "تیم" : "Team"}</h2>

      <ul className="team-list">
        {(members ?? []).map((member) => (
          <li key={member.userId} className="team-row">
            <span className="team-who">
              <b>{member.name}</b>
              <small className="mono ltr">{member.email}</small>
            </span>
            <span className="team-role">{member.role === "owner" ? (fa ? "مالک" : "owner") : fa ? "اپراتور" : "operator"}</span>
            {role === "owner" && !member.current ? (
              <button type="button" className="ghost-btn team-remove" onClick={() => remove(member.userId)} disabled={busy}>
                {fa ? "حذف" : "Remove"}
              </button>
            ) : (
              <span className="team-note">{member.current ? (fa ? "شما" : "you") : ""}</span>
            )}
          </li>
        ))}
      </ul>

      {role === "owner" ? (
        <form className="team-invite" onSubmit={invite}>
          <label className="team-label" htmlFor="invite-email">
            {fa ? "دعوت همکار" : "Invite a colleague"}
          </label>
          <input
            id="invite-email"
            className="team-input"
            type="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder={fa ? "ایمیل همکار" : "colleague@example.com"}
          />
          <select className="team-input" value={inviteRole} onChange={(event) => setInviteRole(event.target.value as "owner" | "operator")}>
            <option value="operator">{fa ? "اپراتور" : "operator"}</option>
            <option value="owner">{fa ? "مالک" : "owner"}</option>
          </select>
          <button type="submit" className="setup-primary team-submit" disabled={busy || email.trim().length === 0}>
            {busy ? (fa ? "در حال ساخت…" : "Creating…") : fa ? "ساخت دعوت" : "Create invitation"}
          </button>
        </form>
      ) : null}

      {link ? (
        <p className="team-link">
          <span>{fa ? "لینک دعوت:" : "Invite link:"}</span>
          <input className="team-input mono ltr" readOnly value={`${typeof window === "undefined" ? "" : window.location.origin}${link}`} />
        </p>
      ) : null}

      {invitations.length > 0 ? (
        <p className="team-note">
          {fa ? "دعوت‌های باز: " : "Open invitations: "}
          {invitations.map((item) => item.email).join(" · ")}
        </p>
      ) : null}

      {notice ? <p className="team-ok" role="status">{notice}</p> : null}
      {error ? <p className="team-error" role="alert">{error}</p> : null}
    </section>
  );
}
