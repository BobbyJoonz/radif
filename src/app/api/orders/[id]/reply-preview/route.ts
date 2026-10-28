import { errors, handler, ok } from "@/server/http";
import { requireSession } from "@/server/session";
import { getReplyPreview } from "@/server/services/orders";

/**
 * GET /api/orders/:id/reply-preview — the sentence a human may copy.
 *
 * Read-only by construction: the service never writes, and there is no `sent` in
 * it. Saying a payment is verified or a parcel delivered when the database has not
 * recorded it is the failure this endpoint exists to prevent (CONTRACTS §6 rule 15).
 */
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export const GET = handler(async (_request: Request, context: RouteContext) => {
  const ctx = await requireSession();
  const { id } = await context.params;

  const preview = await getReplyPreview(ctx, id);
  if (!preview) throw errors.notFound("این سفارش پیدا نشد.");
  return ok(preview);
});
