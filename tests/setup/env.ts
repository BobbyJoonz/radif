import path from "node:path";
import { afterAll } from "vitest";
import { config } from "dotenv";

/**
 * Per-worker setup. This must run before any test file imports a service, because
 * `src/server/db.ts` builds its pool from `process.env.DATABASE_URL` at module load
 * and `src/lib/env.ts` parses the rest of the environment once.
 *
 * The app database (`radif`) is never touched: the whole suite runs against
 * `radif_test` and truncates it between cases.
 */
config({ path: path.resolve(process.cwd(), ".env") });

const testUrl = process.env.DATABASE_URL_TEST;
if (!testUrl) {
  throw new Error("DATABASE_URL_TEST is missing from .env; the test suite will not touch DATABASE_URL.");
}

process.env.DATABASE_URL = testUrl;
// The suite drives services, never a browser: keep any accidental logging quiet and
// make sure nothing treats the run as a production build. `NODE_ENV` is typed
// read-only by @types/node, so it is written through the index signature.
process.env.APP_MODE = process.env.APP_MODE ?? "demo";
if (!process.env.NODE_ENV) (process.env as Record<string, string | undefined>).NODE_ENV = "test";

/**
 * Close the pool after each file so vitest can exit cleanly; the next file
 * reconnects lazily, and `server/db.ts` keeps one client per process either way.
 */
afterAll(async () => {
  const { prisma } = await import("@/server/db");
  await prisma.$disconnect().catch(() => undefined);
});
