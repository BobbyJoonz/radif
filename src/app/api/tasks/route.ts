import { z } from "zod";
import { handler, ok } from "@/server/http";
import { requireSession } from "@/server/session";
import { listTasks } from "@/server/services/tasks";
import { queryObject } from "../_lib/request";

/**
 * GET /api/tasks?status=&assigneeId=&includeDone= — the work queue (CONTRACTS §5).
 *
 * `includeDone=false` is what the screen's «نمایش انجام‌شده‌ها» toggle sends; without
 * it, done tasks are included (the contract's "all" default).
 */
export const dynamic = "force-dynamic";

const querySchema = z
  .object({
    status: z.enum(["open", "in_progress", "waiting_customer", "done"]).optional(),
    assigneeId: z.string().trim().min(1).max(60).optional(),
    includeDone: z.enum(["0", "1", "true", "false"]).optional(),
  })
  .strict();

export const GET = handler(async (request: Request) => {
  const ctx = await requireSession();
  const query = querySchema.parse(queryObject(request));

  const result = await listTasks(ctx, {
    status: query.status,
    assigneeId: query.assigneeId,
    includeDone: query.includeDone === undefined ? undefined : query.includeDone === "1" || query.includeDone === "true",
  });
  return ok(result);
});
