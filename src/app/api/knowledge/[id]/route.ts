import { handler, ok } from "@/server/http";
import { requireSession } from "@/server/session";
import { deleteKnowledge } from "@/server/services/knowledge";

export const dynamic = "force-dynamic";
type RouteContext = { params: Promise<{ id: string }> };

export const DELETE = handler(async (_request: Request, context: RouteContext) => {
  const ctx = await requireSession();
  const { id } = await context.params;
  await deleteKnowledge(ctx, id);
  return ok({ deleted: id });
});
