import { isDemo } from "@/lib/env";
import { errors, handler, ok } from "@/server/http";
import { prisma } from "@/server/db";
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

// One re-seed per tenant per ten minutes: the reset re-runs the seed process, so
// a second click in the same minute is a button that appears broken, not a feature.
const lastReset = new Map<string, number>();
const COOLDOWN_MS = 10 * 60_000;

export const POST = handler(async (request: Request) => {
  const ctx = await requireRole("owner");
  if (!isDemo()) throw errors.forbidden("بازنشانی نمایشی فقط در حالت demo فعال است.");
  // Audit: a shared demo is entered by many visitors at once; one of them must not
  // be able to rebuild the shop under everybody else's feet.
  const shared = await prisma.tenant.findFirst({
    where: { id: ctx.tenant.id },
    select: { sharedDemo: true },
  });
  if (shared?.sharedDemo) {
    throw errors.forbidden("این فروشگاه نمایشی مشترک است؛ بازنشانی فقط روی دموی شخصی انجام می‌شود.");
  }

  const body = (await request.json().catch(() => ({}))) as { confirm?: string };
  if (body.confirm !== "RESET") {
    throw errors.invalid("برای بازنشانی باید تأیید صریح فرستاده شود.");
  }
  const last = lastReset.get(ctx.tenant.id) ?? 0;
  if (Date.now() - last < COOLDOWN_MS) {
    throw errors.rateLimited();
  }
  lastReset.set(ctx.tenant.id, Date.now());

  await resetDemoData(ctx);
  return ok({ ok: true });
});
