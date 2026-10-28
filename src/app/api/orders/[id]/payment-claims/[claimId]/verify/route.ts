import { z } from "zod";
import { handler, ok } from "@/server/http";
import { requireRole } from "@/server/session";
import { verifyPayment } from "@/server/services/orders";
import { readJsonBody } from "../../../../../_lib/request";

/**
 * POST /api/orders/:id/payment-claims/:claimId/verify — owner only.
 *
 * Two independent guards, deliberately: `requireRole("owner")` at the edge and the
 * same check inside `verifyPayment`. A route that forgets the first must still not
 * let an operator move money (CONTRACTS §6 rule 10).
 */
export const dynamic = "force-dynamic";

const bodySchema = z
  .object({
    decision: z.enum(["verified", "disputed"]),
    reason: z.string().trim().max(500).nullable().optional(),
  })
  .strict();

type RouteContext = { params: Promise<{ id: string; claimId: string }> };

export const POST = handler(async (request: Request, context: RouteContext) => {
  const ctx = await requireRole("owner");
  const { id, claimId } = await context.params;
  const body = bodySchema.parse(await readJsonBody(request));

  const claim = await verifyPayment(ctx, id, claimId, body);
  return ok({ claim });
});
