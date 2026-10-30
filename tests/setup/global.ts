import path from "node:path";
import { execFileSync } from "node:child_process";
import { config } from "dotenv";

/**
 * Runs once, before the workers start: bring `DATABASE_URL_TEST` up to date with
 * `prisma/migrations` (an idempotent no-op when it already is).
 *
 * Why the CLI instead of hand-running SQL: the migration files are the single
 * source of the schema, including the CHECK constraints and composite foreign keys
 * the tests depend on. Re-implementing them here would let the tests drift from
 * production.
 *
 * The Prisma CLI is executed as a Node script (`node node_modules/prisma/build/
 * index.js`) rather than through a shell, so no `npx`/`pnpm` resolution is needed
 * and a failure surfaces its stderr instead of an empty exit code.
 */
export default async function globalSetup(): Promise<void> {
  config({ path: path.resolve(process.cwd(), ".env") });

  const testUrl = process.env.DATABASE_URL_TEST;
  if (!testUrl) {
    throw new Error(
      "DATABASE_URL_TEST is missing. Add it to .env (e.g. postgresql://radif:radif_dev@127.0.0.1:5433/radif_test?schema=public).",
    );
  }

  // Workers inherit `process.env` from the main process, but `tests/setup/env.ts`
  // sets it again per worker for clarity and for direct `vitest --run <file>` use.
  process.env.DATABASE_URL = testUrl;

  try {
    execFileSync(
      process.execPath,
      [path.resolve(process.cwd(), "node_modules/prisma/build/index.js"), "migrate", "reset", "--force"],
      {
        env: { ...process.env, DATABASE_URL: testUrl },
        stdio: "pipe",
        cwd: process.cwd(),
      },
    );
  } catch (error) {
    const stderr = (error as { stderr?: Buffer }).stderr?.toString().trim();
    throw new Error(
      [
        "prisma migrate deploy failed for the test database.",
        "Start PostgreSQL first:  powershell -NoProfile -ExecutionPolicy Bypass -File scripts/pg-local.ps1 start",
        stderr ?? String(error),
      ].join("\n"),
    );
  }
}
