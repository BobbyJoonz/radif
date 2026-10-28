import { errors, handler, ok } from "@/server/http";
import { requireSession } from "@/server/session";
import { getConversation } from "@/server/services/inbox";

/** GET /api/conversations/:id — one thread with its evidence (CONTRACTS §5). */
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export const GET = handler(async (_request: Request, context: RouteContext) => {
  const ctx = await requireSession();
  const { id } = await context.params;

  const conversation = await getConversation(ctx, id);
  // Another tenant's id is indistinguishable from a missing one: 404, never 403.
  if (!conversation) throw errors.notFound("این گفتگو پیدا نشد.");
  return ok(conversation);
});
