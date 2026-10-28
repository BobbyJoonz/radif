import { z } from "zod";
import { handler, ok } from "@/server/http";
import { requireSession } from "@/server/session";
import { listOrders } from "@/server/services/orders";
import { queryObject } from "../_lib/request";

/** GET /api/orders?status= — the Orders list (CONTRACTS §5). */
export const dynamic = "force-dynamic";

const querySchema = z
  .object({
    status: z.enum(["draft", "needs_review", "confirmed", "cancelled"]).optional(),
  })
  .strict();

export const GET = handler(async (request: Request) => {
  const ctx = await requireSession();
  const query = querySchema.parse(queryObject(request));
  return ok(await listOrders(ctx, { status: query.status }));
});
