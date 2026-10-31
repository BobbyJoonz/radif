import { handler, ok } from "@/server/http";
import { requireSession } from "@/server/session";
import { suggestReplies } from "@/server/services/knowledge";

/** GET /api/conversations/:id/replies — known answers + whether the window is open. */
export const dynamic = "force-dynamic";
type RouteContext = { params: Promise<{ id: string }> };

export const GET = handler(async (_request: Request, context: RouteContext) => {
  const ctx = await requireSession();
  const { id } = await context.params;
  return ok(await suggestReplies(ctx, id));
});
