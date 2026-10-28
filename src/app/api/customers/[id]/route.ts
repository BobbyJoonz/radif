import { errors, handler, ok } from "@/server/http";
import { requireSession } from "@/server/session";
import { getCustomer } from "@/server/services/customers";

/** GET /api/customers/:id — one customer and the merged timeline (CONTRACTS §5). */
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export const GET = handler(async (_request: Request, context: RouteContext) => {
  const ctx = await requireSession();
  const { id } = await context.params;

  const customer = await getCustomer(ctx, id);
  // A customer of another shop is "not here", never "forbidden".
  if (!customer) throw errors.notFound("این مشتری پیدا نشد.");
  return ok(customer);
});
