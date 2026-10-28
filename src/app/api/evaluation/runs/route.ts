import { handler, ok } from "@/server/http";
import { requireSession } from "@/server/session";
import { listRuns } from "@/server/services/evaluation";

/**
 * GET /api/evaluation/runs — analysis runs with their cost and intents
 * (CONTRACTS §5). Usage and cost stay `null` when the provider did not report
 * them; they are never rendered as zero.
 */
export const dynamic = "force-dynamic";

export const GET = handler(async () => {
  const ctx = await requireSession();
  return ok(await listRuns(ctx));
});
