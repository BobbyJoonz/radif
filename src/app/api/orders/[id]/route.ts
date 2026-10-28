import { z } from "zod";
import { errors, handler, ok } from "@/server/http";
import { requireSession } from "@/server/session";
import { getOrder, updateDraft } from "@/server/services/orders";
import { readJsonBody } from "../../_lib/request";

/**
 * GET  /api/orders/:id — one order, everything the detail screen shows.
 * PATCH /api/orders/:id — edit a draft; `version` is required and a stale one is
 *                          409 (CONTRACTS §5, §6 rule 14).
 */
export const dynamic = "force-dynamic";

const itemSchema = z
  .object({
    title: z.string().trim().min(1, "عنوان قلم لازم است.").max(200),
    qty: z.number().int().min(1, "تعداد باید دست‌کم ۱ باشد.").max(10_000),
    unitPriceMinor: z
      .string()
      .regex(/^[0-9]+$/, "قیمت واحد باید عدد صحیح (ریال) باشد.")
      .max(20),
    sku: z.string().trim().max(80).nullable().optional(),
  })
  .strict();

const patchSchema = z
  .object({
    version: z.number().int().positive("نسخهٔ سفارش لازم است."),
    patch: z
      .object({
        items: z.array(itemSchema).max(100).optional(),
        notes: z.string().max(2_000, "یادداشت بیش از حد بلند است.").nullable().optional(),
      })
      .strict(),
  })
  .strict();

type RouteContext = { params: Promise<{ id: string }> };

export const GET = handler(async (_request: Request, context: RouteContext) => {
  const ctx = await requireSession();
  const { id } = await context.params;

  const order = await getOrder(ctx, id);
  if (!order) throw errors.notFound("این سفارش پیدا نشد.");
  return ok(order);
});

export const PATCH = handler(async (request: Request, context: RouteContext) => {
  const ctx = await requireSession();
  const { id } = await context.params;
  const body = patchSchema.parse(await readJsonBody(request));

  const result = await updateDraft(ctx, id, body);
  return ok(result);
});
