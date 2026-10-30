import { handler, ok } from "@/server/http";
import { requireSession } from "@/server/session";
import { claimTask } from "@/server/services/workdesk";

/**
 * POST /api/tasks/:id/claim — take an unassigned task. Atomic: one winner, the
 * loser receives 409 and keeps whatever they were typing in the UI.
 */
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export const POST = handler(async (_request: Request, context: RouteContext) => {
  const ctx = await requireSession();
  const { id } = await context.params;
  return ok(await claimTask(ctx, id));
});
