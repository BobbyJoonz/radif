import { handler, ok } from "@/server/http";
import { requireSession } from "@/server/session";
import { connectionSummary, instagramStatus } from "@/server/instagram";

/**
 * GET /api/channels/instagram/status — what the settings card needs: is the app
 * configured, and is this shop linked? Token material is never part of the answer.
 */
export const dynamic = "force-dynamic";

export const GET = handler(async () => {
  const ctx = await requireSession();
  return ok({
    ...instagramStatus(),
    canConnect: ctx.role === "owner",
    connections: await connectionSummary(ctx.tenant.id),
  });
});
