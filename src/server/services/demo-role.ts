import { prisma } from "@/server/db";
import { errors } from "@/server/http";
import type { SessionContext } from "@/server/session";

/**
 * Role switching inside one demo sandbox (see /api/demo/role).
 *
 * Kept as a service so the rules are testable without a request: demo tenant only,
 * never a cross-tenant hop, and never a minted role — the caller receives the
 * credentials of an account that already belongs to this tenant, so the session
 * that follows is a real one with that account's real permissions.
 */
const DEMO_PASSWORD = "radif-demo-1405";

export type DemoPrincipal = { role: "owner" | "operator"; name: string; email: string; current: boolean };

function assertDemoSandbox(ctx: SessionContext): void {
  if (!ctx.tenant.isDemo) throw errors.forbidden("این فروشگاه محیط آزمایشی نیست.");
}

export async function listDemoPrincipals(ctx: SessionContext): Promise<DemoPrincipal[]> {
  assertDemoSandbox(ctx);
  const rows = await prisma.membership.findMany({
    where: { tenantId: ctx.tenant.id },
    orderBy: { createdAt: "asc" },
    include: { user: { select: { id: true, email: true, name: true } } },
  });
  return rows.map((row) => ({
    role: row.role,
    name: row.user.name,
    email: row.user.email,
    current: row.userId === ctx.user.id,
  }));
}

export async function demoRoleCredentials(
  ctx: SessionContext,
  role: "owner" | "operator",
): Promise<{ role: "owner" | "operator"; same: boolean; email: string; name: string; password: string | null }> {
  assertDemoSandbox(ctx);
  const membership = await prisma.membership.findFirst({
    where: { tenantId: ctx.tenant.id, role },
    orderBy: { createdAt: "asc" },
    include: { user: { select: { id: true, email: true, name: true } } },
  });
  if (!membership) throw errors.notFound("در این نمونه نقشی با این دسترسی وجود ندارد.");

  const same = membership.userId === ctx.user.id;
  return {
    role,
    same,
    email: membership.user.email,
    name: membership.user.name,
    password: same ? null : DEMO_PASSWORD,
  };
}
