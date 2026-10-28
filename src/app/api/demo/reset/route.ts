import { isDemo } from "@/lib/env";
import { errors, handler, ok } from "@/server/http";
import { requireRole } from "@/server/session";
import { resetDemoData } from "@/server/services/demo";

/**
 * POST /api/demo/reset — wipe and re-seed this tenant's DEMO data (CONTRACTS §2, §5).
 *
 * Owner only, demo only. In production this route is 403: there is no reset for a
 * real shop, and a route that exists but refuses is better than one that is
 * accidentally reachable.
 */
export const dynamic = "force-dynamic";

export const POST = handler(async () => {
  const ctx = await requireRole("owner");
  if (!isDemo) throw errors.forbidden("بازنشانی نمایشی فقط در حالت demo فعال است.");

  await resetDemoData(ctx);
  return ok({ ok: true });
});
