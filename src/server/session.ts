import { headers } from "next/headers";
import { auth } from "./auth";
import { prisma } from "./db";
import { errors } from "./http";
import type { MembershipRole } from "@/generated/prisma/enums";

/**
 * The single place where "who is asking" is decided.
 *
 * Rules that the whole app depends on:
 *   • the tenant comes from the *session + membership*, never from the client;
 *   • a request that names another tenant's id is treated as "not found", not
 *     "forbidden", so ids cannot be probed;
 *   • role checks happen here, on the server, before any service is called.
 */
export type SessionContext = {
  user: { id: string; name: string; email: string; locale: string };
  tenant: {
    id: string;
    slug: string;
    nameFa: string;
    nameEn: string;
    timezone: string;
    currency: string;
    isDemo: boolean;
  };
  role: MembershipRole;
  settings: {
    slaFirstReplyMin: number;
    slaShipMin: number;
    workdayStartMin: number;
    workdayEndMin: number;
    priceFreshnessMin: number;
    postingPaused: boolean;
    demoMode: boolean;
  };
  sessionId: string;
};

export async function getSessionContext(): Promise<SessionContext | null> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) return null;

  const membership = await prisma.membership.findFirst({
    where: { userId: session.user.id },
    orderBy: { createdAt: "asc" },
    include: { tenant: { include: { settings: true } } },
  });
  if (!membership) return null;

  const { tenant } = membership;
  const settings = tenant.settings;

  return {
    sessionId: session.session.id,
    user: {
      id: session.user.id,
      name: session.user.name,
      email: session.user.email,
      locale: (session.user as { locale?: string }).locale ?? "fa",
    },
    tenant: {
      id: tenant.id,
      slug: tenant.slug,
      nameFa: tenant.nameFa,
      nameEn: tenant.nameEn,
      timezone: tenant.timezone,
      currency: tenant.currency,
      isDemo: tenant.isDemo,
    },
    role: membership.role,
    settings: {
      slaFirstReplyMin: settings?.slaFirstReplyMin ?? 120,
      slaShipMin: settings?.slaShipMin ?? 2880,
      workdayStartMin: settings?.workdayStartMin ?? 540,
      workdayEndMin: settings?.workdayEndMin ?? 1260,
      priceFreshnessMin: settings?.priceFreshnessMin ?? 1440,
      postingPaused: settings?.postingPaused ?? false,
      demoMode: settings?.demoMode ?? true,
    },
  };
}

export async function requireSession(): Promise<SessionContext> {
  const ctx = await getSessionContext();
  if (!ctx) throw errors.unauthorized();
  return ctx;
}

export async function requireRole(role: "owner" | "operator", purpose = "تأیید پرداخت و تنظیمات حساس"): Promise<SessionContext> {
  const ctx = await requireSession();
  if (role === "owner" && ctx.role !== "owner") {
    throw errors.forbidden("تأیید پرداخت و تنظیمات حساس فقط با نقش «مالک» انجام می‌شود.");
  }
  return ctx;
}

/** Owners and operators both work the queue; only owners touch money settings. */
export function canVerifyPayments(role: MembershipRole): boolean {
  return role === "owner";
}
