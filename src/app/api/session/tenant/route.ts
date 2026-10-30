import { cookies } from "next/headers";
import { z } from "zod";
import { handler, ok, errors } from "@/server/http";
import { requireSession, ACTIVE_TENANT_COOKIE, listMemberships } from "@/server/session";
import { isMember } from "@/server/active-tenant";
import { readJsonBody } from "../../_lib/request";

/**
 * GET  /api/session/tenant — the shops this person belongs to (for the switcher)
 * POST /api/session/tenant — choose one.
 *
 * The choice is a cookie, and a cookie is never trusted: the membership row is
 * re-checked on every request (see `getSessionContext`). A tenant the user does
 * not belong to answers 404, not 403, so ids cannot be probed.
 */
export const dynamic = "force-dynamic";

export const GET = handler(async () => {
  const ctx = await requireSession();
  const memberships = await listMemberships(ctx.user.id);
  return ok({
    active: ctx.tenant.id,
    memberships: memberships.map((membership) => ({
      tenantId: membership.tenantId,
      role: membership.role,
      slug: membership.tenantSlug,
      name: membership.nameFa,
    })),
  });
});

const schema = z.object({ tenantId: z.string().min(1) }).strict();

export const POST = handler(async (request: Request) => {
  const ctx = await requireSession();
  const body = schema.parse(await readJsonBody(request));

  const memberships = await listMemberships(ctx.user.id);
  if (!isMember(memberships, body.tenantId)) {
    throw errors.notFound("این فروشگاه پیدا نشد.");
  }

  const store = await cookies();
  store.set(ACTIVE_TENANT_COOKIE, body.tenantId, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 180,
    secure: process.env.NODE_ENV === "production",
  });

  return ok({ active: body.tenantId });
});
