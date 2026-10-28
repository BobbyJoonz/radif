import { handler, ok } from "@/server/http";
import { requireSession } from "@/server/session";
import { ingestIncoming } from "@/server/ingestion/ingest";
import { enforceRateLimit } from "../../_lib/rate-limit";
import { readJsonBody } from "../../_lib/request";

/**
 * POST /api/messages/ingest — one inbound event through the real path
 * (CONTRACTS §5, §6 rules 1, 12, 13).
 *
 * The body is an `IncomingMessage`. It is validated by
 * `ingestion/schemas.ts` (a strict Zod schema) inside `ingestIncoming`, which is
 * also where the tenant is taken from the session: a body that carries
 * `tenantId` is rejected outright rather than silently ignored.
 *
 * Rate limit: 120/min per user. Ingest is the one route a connected webhook could
 * legitimately burst through, so the limit is a runaway guard, not a business rule.
 */
export const dynamic = "force-dynamic";

export const POST = handler(async (request: Request) => {
  const ctx = await requireSession();
  enforceRateLimit(`ingest:${ctx.user.id}`, 120);

  const body = await readJsonBody(request);
  const result = await ingestIncoming(ctx, body);
  return ok(result);
});
