import { handler, ok } from "@/server/http";
import { requireSession } from "@/server/session";
import { getToday } from "@/server/services/today";

/** GET /api/today — the Today payload (CONTRACTS §5). */
export const dynamic = "force-dynamic";

export const GET = handler(async () => {
  const ctx = await requireSession();
  return ok(await getToday(ctx));
});
