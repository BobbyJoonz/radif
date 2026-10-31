import { handler, ok } from "@/server/http";
import { requireSession } from "@/server/session";
import { disconnect } from "@/server/instagram";

/** DELETE /api/channels/instagram/:accountRef — destroy the sealed token (owner only). */
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ accountRef: string }> };

export const DELETE = handler(async (_request: Request, context: RouteContext) => {
  const ctx = await requireSession();
  const { accountRef } = await context.params;
  await disconnect(ctx, accountRef);
  return ok({ disconnected: accountRef });
});
