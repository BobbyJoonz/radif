import { prisma } from "@/server/db";
import { handler, ok } from "@/server/http";
import { requireSession } from "@/server/session";

/**
 * GET /api/team — who works here, and who has been invited.
 *
 * Any member may see the team (it is their colleagues, not a secret); only an owner
 * may change it, and that is enforced in the routes that mutate.
 */
export const dynamic = "force-dynamic";

export const GET = handler(async () => {
  const ctx = await requireSession();

  const [memberships, invitations] = await Promise.all([
    prisma.membership.findMany({
      where: { tenantId: ctx.tenant.id },
      orderBy: { createdAt: "asc" },
      include: { user: { select: { id: true, name: true, email: true } } },
    }),
    prisma.invitation.findMany({
      where: { tenantId: ctx.tenant.id, acceptedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: "desc" },
      select: { id: true, email: true, role: true, expiresAt: true, createdAt: true },
    }),
  ]);

  return ok({
    role: ctx.role,
    members: memberships.map((membership) => ({
      userId: membership.userId,
      name: membership.user.name,
      email: membership.user.email,
      role: membership.role,
      current: membership.userId === ctx.user.id,
    })),
    invitations: invitations.map((invitation) => ({
      id: invitation.id,
      email: invitation.email,
      role: invitation.role,
      expiresAt: invitation.expiresAt.toISOString(),
    })),
  });
});
