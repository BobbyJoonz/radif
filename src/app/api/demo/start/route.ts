import { isDemo } from "@/lib/env";
import { errors, handler, ok } from "@/server/http";
import { createDemoInstance } from "@/server/services/demo-instance";
import { enforceRateLimit } from "../../_lib/rate-limit";

/**
 * POST /api/demo/start — a demo shop of the visitor's own (audit: no shared mutable
 * demo). It clones the seeded template into a fresh tenant with a synthetic owner, so
 * a visitor's writes land in their copy only and reset is allowed there.
 *
 * Demo mode only; rate-limited per caller because it writes a shop.
 */
export const dynamic = "force-dynamic";

export const POST = handler(async (request: Request) => {
  if (!isDemo()) throw errors.forbidden("دموی شخصی فقط در حالت demo ساخته می‌شود.");
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  enforceRateLimit(`demo-start:${ip}`, 5);
  return ok(await createDemoInstance());
});
