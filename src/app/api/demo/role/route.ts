import { z } from "zod";
import { isDemo } from "@/lib/env";
import { errors, handler, ok } from "@/server/http";
import { requireSession } from "@/server/session";
import { demoRoleCredentials, listDemoPrincipals } from "@/server/services/demo-role";
import { readJsonBody } from "../../_lib/request";

/**
 * POST /api/demo/role — move between the principals of *your own* demo sandbox.
 *
 * The audit's P1 asked for one sandbox with a role switch instead of four entry
 * cards. This is the switch, and it is deliberately narrow: demo mode only, only
 * inside a demo tenant, and it never mints a role — it returns the credentials of
 * an account that already belongs to this tenant, so the session that follows is
 * real and carries that account's real permissions.
 */
export const dynamic = "force-dynamic";

const schema = z.object({ role: z.enum(["owner", "operator"]) }).strict();

export const POST = handler(async (request: Request) => {
  if (!isDemo()) throw errors.forbidden("تغییر نقش فقط در محیط آزمایشی است.");
  const ctx = await requireSession();
  const body = schema.parse(await readJsonBody(request));
  return ok(await demoRoleCredentials(ctx, body.role));
});

/** GET — what this sandbox can switch to (for the demo bar). */
export const GET = handler(async () => {
  if (!isDemo()) throw errors.forbidden("تغییر نقش فقط در محیط آزمایشی است.");
  const ctx = await requireSession();
  const principals = await listDemoPrincipals(ctx);
  return ok({ active: ctx.role, principals });
});
