import { z } from "zod";
import { handler, ok } from "@/server/http";
import { requireSession } from "@/server/session";
import { updateShipment } from "@/server/services/orders";
import { readJsonBody } from "../../../_lib/request";

/**
 * PATCH /api/orders/:id/shipment — advance the parcel (CONTRACTS §5).
 *
 * A tracking code is data, never proof: sending one does not set `shipped` and
 * certainly not `delivered`, and a code alone is refused when it does not look like
 * one rather than being invented or stored raw.
 *
 * `addressChange` is an additive field (not in the §5 table) for rule 8: an address
 * change after shipping is refused and opens a `human_review` task; before
 * shipping it opens an `address_complete` task. Nothing is stored on the order
 * because there is no address column to store it in.
 */
export const dynamic = "force-dynamic";

const bodySchema = z
  .object({
    status: z.enum(["not_ready", "preparing", "shipped", "delivered", "paused"]).optional(),
    trackingCode: z.string().trim().max(60).nullable().optional(),
    carrier: z.string().trim().max(80).nullable().optional(),
    addressChange: z.string().trim().max(500).nullable().optional(),
  })
  .strict();

type RouteContext = { params: Promise<{ id: string }> };

export const PATCH = handler(async (request: Request, context: RouteContext) => {
  const ctx = await requireSession();
  const { id } = await context.params;
  const body = bodySchema.parse(await readJsonBody(request));

  const shipment = await updateShipment(ctx, id, body);
  return ok({ shipment });
});
