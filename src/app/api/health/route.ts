import { prisma } from "@/server/db";
import { isDemo } from "@/lib/env";
import { handler, ok } from "@/server/http";

/**
 * GET /api/health — the only unauthenticated route (CONTRACTS §5).
 *
 * It answers the question the shell and the demo script actually ask: "is the
 * database reachable, and is this a demo install?" It reveals nothing else — no
 * tenant, no counts, no host.
 */
export const dynamic = "force-dynamic";

export const GET = handler(async () => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return ok({ db: "up" as const, demo: isDemo });
  } catch {
    // The process is up but its database is not: honest answer, unhealthy status.
    return ok({ db: "down" as const, demo: isDemo }, { status: 503 });
  }
});
