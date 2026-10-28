import { errors } from "@/server/http";

/**
 * The two request primitives every route shares.
 *
 * `readJsonBody` accepts an empty body as `{}` (a PATCH that only names the id is
 * legitimate) but refuses malformed JSON with the same `invalid` envelope as a Zod
 * failure, so the client never has to special-case a parse error.
 */
export async function readJsonBody(request: Request): Promise<unknown> {
  let raw: string;
  try {
    raw = await request.text();
  } catch {
    throw errors.invalid("بدنهٔ درخواست خوانده نشد.");
  }
  if (raw.trim().length === 0) return {};
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    throw errors.invalid("بدنهٔ درخواست JSON معتبر نیست.");
  }
}

/** Search params as a plain object, for a Zod schema per route. */
export function queryObject(request: Request): Record<string, string> {
  const url = new URL(request.url);
  const result: Record<string, string> = {};
  for (const [key, value] of url.searchParams) result[key] = value;
  return result;
}
