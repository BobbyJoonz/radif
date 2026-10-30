import { z } from "zod";
import { handler, ok } from "@/server/http";
import { requireSession } from "@/server/session";
import { assignTask } from "@/server/services/workdesk";
import { readJsonBody } from "../../../_lib/request";

/**
 * POST /api/tasks/:id/assign — delegate to a colleague (owner only) or clear the
 * assignee with null. Membership in this shop is required for either direction.
 */
export const dynamic = "force-dynamic";

const schema = z.object({ assigneeId: z.string().min(1).nullable() }).strict();

type RouteContext = { params: Promise<{ id: string }> };

export const POST = handler(async (request: Request, context: RouteContext) => {
  const ctx = await requireSession();
  const { id } = await context.params;
  const body = schema.parse(await readJsonBody(request));
  return ok(await assignTask(ctx, id, body.assigneeId));
});
