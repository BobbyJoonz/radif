import { z } from "zod";
import { handler, ok } from "@/server/http";
import { requireSession } from "@/server/session";
import { listConversations } from "@/server/services/inbox";
import { queryObject } from "../_lib/request";

/** GET /api/conversations?filter=&q= — the Inbox queue (CONTRACTS §5). */
export const dynamic = "force-dynamic";

const querySchema = z
  .object({
    filter: z.enum(["all", "unanswered", "payment", "review"]).optional(),
    q: z.string().trim().max(200).optional(),
  })
  .strict();

export const GET = handler(async (request: Request) => {
  const ctx = await requireSession();
  const query = querySchema.parse(queryObject(request));
  return ok(await listConversations(ctx, { filter: query.filter, q: query.q }));
});
