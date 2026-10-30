import type { MembershipRole } from "@/generated/prisma/enums";

/**
 * Which shop is "the" shop for this request.
 *
 * The audit's P1: the context always took the oldest membership, so a person who
 * belongs to two shops had no way to choose — and any client-supplied tenant id
 * was silently ignored rather than validated. The rule is now explicit:
 *
 *   • the preferred tenant is honoured **only** when the user really is a member of
 *     it (a membership row decides, never a cookie value on its own);
 *   • otherwise the oldest membership wins, which keeps the previous behaviour
 *     for everyone with a single shop;
 *   • no memberships means no session context at all — that is how a removed
 *     colleague loses access on their very next request.
 */
export type MembershipView = {
  tenantId: string;
  role: MembershipRole;
  tenantSlug: string;
  nameFa: string;
  nameEn: string;
  createdAt: Date;
};

export function isMember(memberships: readonly MembershipView[], tenantId: string | null | undefined): boolean {
  if (!tenantId) return false;
  return memberships.some((membership) => membership.tenantId === tenantId);
}

export function pickActiveMembership(
  memberships: readonly MembershipView[],
  preferredTenantId: string | null | undefined,
): MembershipView | null {
  if (memberships.length === 0) return null;
  const preferred = memberships.find((membership) => membership.tenantId === preferredTenantId);
  if (preferred) return preferred;
  return [...memberships].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())[0];
}
