import { z } from "zod";
import { handler, ok } from "@/server/http";
import { requireSession } from "@/server/session";
import { deliverOutbound, queueReply } from "@/server/instagram/send";
import { readJsonBody } from "../../../_lib/request";

/**
 * POST /api/conversations/:id/reply — the seller approves a reply.
 *
 * Preview mode (the default) records a draft and says so; live mode only reports
 * delivered when Meta returned a message id. A scheduled reply becomes a
 * send_outbound job instead of being forgotten.
 */
export const dynamic = "force-dynamic";

const schema = z
  .object({
    text: z.string().min(1).max(1000),
    quickReplies: z.array(z.string().max(20)).max(13).optional(),
    scheduleAt: z.string().datetime().optional(),
  })
  .strict();

type RouteContext = { params: Promise<{ id: string }> };

export const POST = handler(async (request: Request, context: RouteContext) => {
  const ctx = await requireSession();
  const { id } = await context.params;
  const body = schema.parse(await readJsonBody(request));

  const queued = await queueReply(ctx, {
    conversationId: id,
    text: body.text,
    quickReplies: body.quickReplies,
    scheduleAt: body.scheduleAt ? new Date(body.scheduleAt) : null,
  });

  // Immediate live send; scheduled rows wait for the worker's send_outbound job.
  const delivery = queued.mode === "live" && !queued.scheduledFor ? await deliverOutbound(queued.id) : null;

  return ok({ ...queued, delivery });
});
