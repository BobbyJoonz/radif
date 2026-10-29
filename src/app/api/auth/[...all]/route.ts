import { toNextJsHandler } from "better-auth/next-js";
import { getAuth } from "@/server/auth";

/**
 * Better Auth's Next handler, built lazily and memoised.
 *
 * The earlier version passed the lazy `auth` proxy straight into
 * `toNextJsHandler(...)` at module scope; that function introspects the object it
 * is given, and a proxy with no own properties made it call an undefined value at
 * request time ("e is not a function" in the bundle). Building the real instance
 * here keeps laziness at import time without handing a proxy to a library that
 * inspects its argument.
 */
let handlers: ReturnType<typeof toNextJsHandler> | null = null;

function handler() {
  handlers ??= toNextJsHandler(getAuth());
  return handlers;
}

export async function GET(request: Request) {
  return handler().GET(request);
}

export async function POST(request: Request) {
  return handler().POST(request);
}
