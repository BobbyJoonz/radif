import { z } from "zod";
import { handler, ok } from "@/server/http";
import { requireSession } from "@/server/session";
import { createPaymentClaim } from "@/server/services/orders";
import { readJsonBody } from "../../../_lib/request";

/**
 * POST /api/orders/:id/payment-claims — record that the customer says they paid.
 *
 * The row is created `claimed` and can only become `verified` through the owner-only
 * verify route; the amount is optional, because «واریز کردم» with no figure is a
 * real message and `null` is not zero (CONTRACTS §6 rule 2).
 */
export const dynamic = "force-dynamic";

const bodySchema = z
  .object({
    amountMinor: z
      .string()
      .regex(/^[0-9]+$/, "مبلغ باید عدد صحیح (ریال) باشد.")
      .max(20)
      .nullable()
      .optional(),
    currency: z.string().trim().regex(/^[A-Z]{3}$/, "کد ارز باید سه حرف بزرگ باشد.").optional(),
    sourceMessageId: z.string().trim().min(1).max(60).nullable().optional(),
  })
  .strict();

type RouteContext = { params: Promise<{ id: string }> };

export const POST = handler(async (request: Request, context: RouteContext) => {
  const ctx = await requireSession();
  const { id } = await context.params;
  const body = bodySchema.parse(await readJsonBody(request));

  const claim = await createPaymentClaim(ctx, id, body);
  return ok({ claim });
});
