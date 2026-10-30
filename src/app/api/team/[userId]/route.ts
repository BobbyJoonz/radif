import { handler, ok } from "@/server/http";
import { requireSession } from "@/server/session";
import { removeMember } from "@/server/services/invitations";

/**
 * DELETE /api/team/:userId — remove a colleague.
 *
 * Owner only, never yourself, never the last owner (all three live in the service,
 * so the rule has one home and one test).
 */
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ userId: string }> };

export const DELETE = handler(async (_request: Request, context: RouteContext) => {
  const ctx = await requireSession();
  const { userId } = await context.params;
  await removeMember(ctx, userId);
  return ok({ removed: userId });
});
