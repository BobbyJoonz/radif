import type { Metadata } from "next";
import Link from "next/link";
import { BrandEmblem } from "@/components/brand/brand-mark";
import { AcceptInvite } from "@/components/marketing/accept-invite";
import { getSessionContext } from "@/server/session";
import { prisma } from "@/server/db";
import { routes } from "@/lib/routes";
import { isLocale, type Locale } from "@/i18n/config";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "دعوت به فروشگاه · ردیف" };

/**
 * /{locale}/invite/[token] — the page an owner's copyable link opens.
 *
 * It shows the shop and the role the invitation is bound to *before* asking for a
 * decision, because "join what, as who" is the question a person actually has. It
 * never trusts the token for anything beyond display: acceptance is re-checked on
 * the server (single use, expiry, matching identity).
 */
export default async function InvitePage({
  params,
}: {
  params: Promise<{ locale: string; token: string }>;
}) {
  const { locale: raw, token } = await params;
  const locale: Locale = isLocale(raw) ? raw : "fa";
  const fa = locale === "fa";

  const session = await getSessionContext();
  const invitation = await prisma.invitation.findFirst({
    where: { tokenHash: (await import("@/server/services/invitations")).hashToken(token) },
    select: { email: true, role: true, expiresAt: true, acceptedAt: true, tenant: { select: { nameFa: true, nameEn: true } } },
  });

  const title = fa ? "دعوت به فروشگاه" : "Shop invitation";
  const shopName = invitation ? (fa ? invitation.tenant.nameFa : invitation.tenant.nameEn) : null;

  return (
    <div className="brandscreen" role="main">
      <BrandEmblem size={52} />
      <h1 className="brandscreen-title">{title}</h1>

      {!invitation ? (
        <p className="brandscreen-body">{fa ? "این دعوت پیدا نشد یا باطل شده است." : "This invitation was not found."}</p>
      ) : invitation.acceptedAt ? (
        <p className="brandscreen-body">{fa ? "این دعوت قبلاً پذیرفته شده است." : "This invitation was already accepted."}</p>
      ) : invitation.expiresAt.getTime() <= Date.now() ? (
        <p className="brandscreen-body">{fa ? "مهلت این دعوت تمام شده است؛ از مالک فروشگاه دعوت تازه بخواهید." : "This invitation has expired."}</p>
      ) : (
        <>
          <p className="brandscreen-body">
            {fa ? (
              <>
                <b>{shopName}</b> — با نقش <b>{invitation.role === "owner" ? "مالک" : "اپراتور"}</b>.
                {session ? "" : " برای پذیرش، ابتدا وارد شوید."}
              </>
            ) : (
              <>
                <b>{shopName}</b> as <b>{invitation.role}</b>.{session ? "" : " Sign in first to accept."}
              </>
            )}
          </p>
          {session ? (
            <AcceptInvite token={token} locale={locale} />
          ) : (
            <div className="brandscreen-actions">
              <Link className="setup-primary" href={routes.login(locale, `/${locale}/invite/${token}`)}>
                {fa ? "ورود و پذیرش" : "Sign in and accept"}
              </Link>
            </div>
          )}
        </>
      )}

      <p className="brandscreen-body setup-hint">
        {fa ? "این دعوت به ایمیل " : "This invitation is addressed to "}
        <code className="mono ltr">{invitation?.email ?? "—"}</code>
      </p>
    </div>
  );
}
