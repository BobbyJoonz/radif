import { z } from "zod";
import { handler, ok } from "@/server/http";
import { requireSession } from "@/server/session";
import { createKnowledge, listKnowledge, searchKnowledge } from "@/server/services/knowledge";
import { readJsonBody } from "../_lib/request";

/** GET /api/knowledge?q= — the answer book, optionally searched. POST — add one. */
export const dynamic = "force-dynamic";

export const GET = handler(async (request: Request) => {
  const ctx = await requireSession();
  const q = new URL(request.url).searchParams.get("q");
  if (q && q.trim().length > 0) return ok({ results: await searchKnowledge(ctx, q, 5) });
  return ok({ entries: await listKnowledge(ctx) });
});

const schema = z.object({
  question: z.string().min(3).max(300),
  answer: z.string().min(2).max(4000),
  tags: z.array(z.string().max(40)).max(10).optional(),
}).strict();

export const POST = handler(async (request: Request) => {
  const ctx = await requireSession();
  const body = schema.parse(await readJsonBody(request));
  return ok(await createKnowledge(ctx, body), { status: 201 });
});
