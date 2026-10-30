import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { isDemo } from "@/lib/env";
import { handler, ok } from "@/server/http";

/**
 * GET /api/guest — a demo account for "try without signing up".
 *
 * Deliberately not a separate auth path: the browser signs in with the real
 * Better Auth endpoint using these credentials, so a guest gets an ordinary
 * session, ordinary authorization, and can still create a real account later.
 *
 * A random demo member is chosen per request, so two visitors rarely land in the
 * same shop, and the response is demo-mode only (403 in production).
 */
export const dynamic = "force-dynamic";

const DEMO_PASSWORD = "radif-demo-1405";

export const GET = handler(async () => {
  if (!isDemo()) {
    return NextResponse.json(
      { ok: false, error: { code: "forbidden", message: "Guest demo is available in demo mode only." } },
      { status: 403 },
    );
  }

  const members = await prisma.membership.findMany({
    where: { tenant: { isDemo: true } },
    include: { user: true, tenant: true },
    take: 50,
  });

  if (members.length === 0) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "no_demo_account",
          message: "This deployment has no demo data yet. Open /api/setup once, then retry.",
        },
      },
      { status: 409 },
    );
  }

  const pick = members[Math.floor(Math.random() * members.length)];
  return ok({
    email: pick.user.email,
    password: DEMO_PASSWORD,
    shop: pick.tenant.slug,
    locale: pick.user.locale,
  });
});
