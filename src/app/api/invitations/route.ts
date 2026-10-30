import { z } from "zod";
import { handler, ok } from "@/server/http";
import { requireSession } from "@/server/session";
import { createInvitation } from "@/server/services/invitations";
import { readJsonBody } from "../_lib/request";

/**
 * POST /api/invitations — an owner invites a colleague (role-bound, expiring).
 * The response carries the token once; only its hash is stored.
 */
export const dynamic = "force-dynamic";

const schema = z
  .object({
    email: z.string().min(3),
    role: z.enum(["owner", "operator"]).optional(),
  })
  .strict();

export const POST = handler(async (request: Request) => {
  const ctx = await requireSession();
  const body = schema.parse(await readJsonBody(request));
  const invitation = await createInvitation(ctx, body);
  return ok({ ...invitation, path: `/invite/${invitation.token}` }, { status: 201 });
});
