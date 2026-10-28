import { z } from "zod";
import { handler, ok } from "@/server/http";
import { requireSession } from "@/server/session";
import { confirmDraft } from "@/server/services/orders";
import { readJsonBody } from "../../../_lib/request";

/**
 * POST /api/orders/:id/confirm — finalise the paperwork (CONTRACTS §5).
 *
 * The response is the order only: payment stays `unknown`, shipment stays
 * `not_ready`. Confirming a draft is not a payment confirmation (rule 3).
 */
export const dynamic = "force-dynamic";

const bodySchema = z
  .object({
    version: z.number().int().positive("نسخهٔ سفارش لازم است."),
  })
  .strict();

type RouteContext = { params: Promise<{ id: string }> };

export const POST = handler(async (request: Request, context: RouteContext) => {
  const ctx = await requireSession();
  const { id } = await context.params;
  const body = bodySchema.parse(await readJsonBody(request));

  const order = await confirmDraft(ctx, id, body);
  return ok({ order });
});
