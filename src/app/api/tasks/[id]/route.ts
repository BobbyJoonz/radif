import { z } from "zod";
import { handler, ok } from "@/server/http";
import { requireSession } from "@/server/session";
import { updateTask } from "@/server/services/tasks";
import { readJsonBody } from "../../_lib/request";

/**
 * PATCH /api/tasks/:id — move or assign a task (CONTRACTS §5).
 *
 * `done` requires the server to write `closedAt` (the database refuses otherwise)
 * and releases the task's dedupe key so a genuinely new request can open a new task
 * (CONTRACTS §6 rule 1).
 */
export const dynamic = "force-dynamic";

const bodySchema = z
  .object({
    status: z.enum(["open", "in_progress", "waiting_customer", "done"]),
    assigneeId: z.string().trim().min(1).max(60).nullable().optional(),
    closeNote: z.string().trim().max(500).nullable().optional(),
  })
  .strict();

type RouteContext = { params: Promise<{ id: string }> };

export const PATCH = handler(async (request: Request, context: RouteContext) => {
  const ctx = await requireSession();
  const { id } = await context.params;
  const body = bodySchema.parse(await readJsonBody(request));

  const task = await updateTask(ctx, id, body);
  return ok({ task });
});
