import { isDemo } from "@/lib/env";
import { errors, handler, ok } from "@/server/http";
import { requireSession } from "@/server/session";
import { replaySampleMessage } from "@/server/services/demo";

/**
 * POST /api/demo/replay — ingest the scripted demo message (CONTRACTS §2, §5).
 *
 * Demo only: in `APP_MODE=production` the route answers 403 and the service refuses
 * too. The message goes through the real ingestion path, so what the demo shows is
 * what a real inbound message would do.
 */
export const dynamic = "force-dynamic";

export const POST = handler(async () => {
  const ctx = await requireSession();
  if (!isDemo()) throw errors.forbidden("بازپخش نمایشی فقط در حالت demo فعال است.");

  const messageId = await replaySampleMessage(ctx);
  return ok({ messageId });
});
