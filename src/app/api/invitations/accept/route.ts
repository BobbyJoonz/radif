import { z } from "zod";
import { handler, ok } from "@/server/http";
import { requireSession } from "@/server/session";
import { acceptInvitation } from "@/server/services/invitations";
import { readJsonBody } from "../../_lib/request";

/**
 * POST /api/invitations/accept — join the shop the invitation was issued for.
 * Requires an authenticated identity; the email must match the invitation.
 */
export const dynamic = "force-dynamic";

const schema = z.object({ token: z.string().min(10) }).strict();

export const POST = handler(async (request: Request) => {
  const ctx = await requireSession();
  const body = schema.parse(await readJsonBody(request));
  const result = await acceptInvitation(ctx, body.token);
  return ok(result);
});
