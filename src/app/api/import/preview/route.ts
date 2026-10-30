import { env } from "@/lib/env";
import { handler, ok } from "@/server/http";
import { requireRole } from "@/server/session";
import { importInputSchema, previewImport } from "@/server/services/import";
import { enforceRateLimit } from "../../_lib/rate-limit";
import { readJsonBody } from "../../_lib/request";

/**
 * POST /api/import/preview — parse without writing (CONTRACTS §5).
 *
 * Same parse as the commit, so the accepted/rejected numbers a seller approves are
 * the ones that will run. Rate-limited to `RATE_LIMIT_IMPORT_PER_MIN` per user:
 * each preview reads the whole file.
 */
export const dynamic = "force-dynamic";

export const POST = handler(async (request: Request) => {
  const ctx = await requireRole("owner");
  enforceRateLimit(`import:${ctx.user.id}`, env.RATE_LIMIT_IMPORT_PER_MIN);

  const body = importInputSchema.parse(await readJsonBody(request));
  return ok(await previewImport(ctx, body));
});
