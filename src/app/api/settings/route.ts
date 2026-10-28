import { handler, ok } from "@/server/http";
import { requireRole, requireSession } from "@/server/session";
import { getSettings, settingsPatchSchema, updateSettings } from "@/server/services/settings";
import { readJsonBody } from "../_lib/request";

/**
 * GET   /api/settings — the shop's clock, SLA, freshness, connections and modes.
 * PATCH /api/settings — owner only (CONTRACTS §5, §6 rule 10's spirit).
 *
 * The PATCH body is validated by `settingsPatchSchema` before the service sees it,
 * and the service checks the role again so a new caller cannot forget it.
 */
export const dynamic = "force-dynamic";

export const GET = handler(async () => {
  const ctx = await requireSession();
  return ok(await getSettings(ctx));
});

export const PATCH = handler(async (request: Request) => {
  const ctx = await requireRole("owner");
  const patch = settingsPatchSchema.parse(await readJsonBody(request));
  return ok(await updateSettings(ctx, patch));
});
