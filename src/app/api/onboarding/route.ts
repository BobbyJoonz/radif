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
 * Idempotent by refusal: a user who already has a membership gets 409 instead of a
 * second shop nobody asked for.
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

  const existing = await prisma.membership.findFirst({ where: { userId: session.user.id } });
  if (existing) {
    return ok({ tenantId: existing.tenantId, alreadyMember: true }, { status: 409 });
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
