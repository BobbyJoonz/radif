import { env } from "@/lib/env";
import { handler, ok } from "@/server/http";
import { requireRole } from "@/server/session";
import { commitImport, importInputSchema } from "@/server/services/import";
import { enforceRateLimit } from "../../_lib/rate-limit";
import { readJsonBody } from "../../_lib/request";

/**
 * POST /api/import/commit — ingest the file through the normal pipeline
 * (CONTRACTS §5, §6 rule 1).
 *
 * Duplicates are counted by the database, not by this handler: re-importing the
 * same file reports `duplicates` and adds no rows and no jobs. Rate-limited to
 * `RATE_LIMIT_IMPORT_PER_MIN` per user.
 */
export const dynamic = "force-dynamic";

export const POST = handler(async (request: Request) => {
  const ctx = await requireRole("owner", "ورودی پیام‌ها");
  enforceRateLimit(`import:${ctx.user.id}`, env.RATE_LIMIT_IMPORT_PER_MIN);

  const body = importInputSchema.parse(await readJsonBody(request));
  return ok(await commitImport(ctx, body));
});
