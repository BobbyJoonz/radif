import { headers } from "next/headers";
import { z } from "zod";
import { auth } from "@/server/auth";
import { prisma } from "@/server/db";
import { handler, ok, errors } from "@/server/http";

/**
 * POST /api/onboarding — the second half of registration: create the shop.
 *
 * The identity already exists (Better Auth created it and set the session), so this
 * only needs the auth session — not a membership, which is exactly what it creates.
 * Idempotent by success, not by refusal (audit finding #2): registration already
 * creates the identity *and* a placeholder shop, so a user who reaches this step
 * twice must get the same answer, never a 409 that reads like a failure. The
 * second call simply applies the name they chose to the placeholder shop.
 */
export const dynamic = "force-dynamic";

const Body = z.object({
  shopName: z.string().trim().min(2).max(60),
  locale: z.enum(["fa", "en"]).default("fa"),
});

function slugFor(): string {
  return `shop-${Math.random().toString(36).slice(2, 8)}`;
}

export const POST = handler(async (request: Request) => {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) throw errors.unauthorized();

  const body = Body.parse(await request.json());

  const existing = await prisma.membership.findFirst({
    where: { userId: session.user.id },
    include: { tenant: { select: { id: true, nameFa: true } } },
  });
  if (existing) {
    // The placeholder shop was created at sign-up so the user can never be stuck in
    // a login loop; here is where the name they actually chose replaces it.
    const placeholder = existing.tenant.nameFa === "فروشگاه تازه";
    if (placeholder && body.shopName) {
      await prisma.tenant.update({
        where: { id: existing.tenantId },
        data: { nameFa: body.shopName, nameEn: body.shopName },
      });
      return ok({ tenantId: existing.tenantId, renamed: true, alreadyMember: true });
    }
    return ok({ tenantId: existing.tenantId, alreadyMember: true });
  }

  const created = await prisma.$transaction(async (tx) => {
    const tenant = await tx.tenant.create({
      data: {
        slug: slugFor(),
        nameFa: body.shopName,
        nameEn: body.shopName,
        timezone: "Asia/Tehran",
        currency: "IRR",
        isDemo: false,
        settings: { create: { demoMode: false } },
        memberships: { create: { userId: session.user.id, role: "owner" } },
        connections: {
          create: {
            channel: "replay",
            accountRef: `manual-${Math.random().toString(36).slice(2, 7)}`,
            displayName: body.shopName,
            status: "ready",
          },
        },
      },
    });

    await tx.auditEvent.create({
      data: {
        tenantId: tenant.id,
        actorType: "user",
        actorId: session.user.id,
        action: "tenant.created",
        entityType: "Tenant",
        entityId: tenant.id,
        after: { nameFa: tenant.nameFa, locale: body.locale },
      },
    });

    return tenant;
  });

  return ok({ tenantId: created.id, slug: created.slug });
});
