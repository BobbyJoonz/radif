import { prisma } from "@/server/db";
import { authSecretSource, isDemo, missingRequiredEnv } from "@/lib/env";
import { handler, ok } from "@/server/http";
import { getSessionContext } from "@/server/session";

/**
 * GET /api/health — the only unauthenticated route (CONTRACTS §5).
 *
 * Answers the question a deployment actually needs answered: "is the database
 * reachable, are the required secrets present, and can a session be resolved?"
 * It never returns a secret value — only booleans and a truncated error message,
 * which is what makes a broken deploy diagnosable instead of a bare 500.
 *
 *   /api/health          shallow: db + mode
 *   /api/health?deep=1   also: which required env vars are missing, and the
 *                        first failure from the session layer
 */
export const dynamic = "force-dynamic";

export const GET = handler(async (request: Request) => {
  const deep = new URL(request.url).searchParams.get("deep") === "1";

  let db: "up" | "down" = "down";
  let schema: "ok" | "missing" | "unknown" = "unknown";
  try {
    await prisma.$queryRaw`SELECT 1`;
    db = "up";
    // Is the migration applied? An empty database is a different failure from an
    // unreachable one, and the setup screen must say which.
    try {
      await prisma.$queryRaw`SELECT 1 FROM "User" LIMIT 1`;
      schema = "ok";
    } catch {
      schema = "missing";
    }
  } catch {
    db = "down";
  }

  const missing = missingRequiredEnv();
  // Which build is actually serving? Without this, "did my deploy land?" is a guess.
  const build = {
    commit: (process.env.VERCEL_GIT_COMMIT_SHA ?? "").slice(0, 7) || null,
    env: process.env.VERCEL_ENV ?? null,
    region: process.env.VERCEL_REGION ?? null,
  };
  const base = { db, schema, demo: isDemo(), missingEnv: missing, authSecret: authSecretSource(), build };

  if (!deep) {
    return ok(base, { status: db === "up" ? 200 : 503 });
  }

  const envPresence = {
    DATABASE_URL: Boolean(process.env.DATABASE_URL),
    BETTER_AUTH_SECRET: Boolean(process.env.BETTER_AUTH_SECRET),
    BETTER_AUTH_URL: process.env.BETTER_AUTH_URL ?? null,
    CHANNEL_TOKEN_ENC_KEY: Boolean(process.env.CHANNEL_TOKEN_ENC_KEY),
    APP_MODE: process.env.APP_MODE ?? null,
    NODE_ENV: process.env.NODE_ENV ?? null,
    VERCEL: Boolean(process.env.VERCEL),
  };

  let session: "ok" | "none" | "error" = "none";
  let sessionError: string | null = null;
  try {
    const ctx = await getSessionContext();
    session = ctx ? "ok" : "none";
  } catch (error) {
    session = "error";
    sessionError = (error instanceof Error ? error.message : String(error)).slice(0, 240);
  }

  return ok({ ...base, envPresence, session, sessionError }, { status: db === "up" ? 200 : 503 });
});
