import { z } from "zod";
import { handler, ok } from "@/server/http";
import { requireSession } from "@/server/session";
import { listCustomers } from "@/server/services/customers";
import { queryObject } from "../_lib/request";

/** GET /api/customers?q= — the Customers list (CONTRACTS §5). */
export const dynamic = "force-dynamic";

const querySchema = z
  .object({
    q: z.string().trim().max(200).optional(),
  })
  .strict();

export const GET = handler(async (request: Request) => {
  const ctx = await requireSession();
  const query = querySchema.parse(queryObject(request));
  return ok(await listCustomers(ctx, query.q));
});
