import path from "node:path";
import { defineConfig } from "vitest/config";

/**
 * Vitest for the server half of Radif.
 *
 * Two decisions are deliberate:
 *   • `fileParallelism: false` — every test file talks to the *same* PostgreSQL
 *     database (`DATABASE_URL_TEST`) and truncates between cases. Running files in
 *     parallel would make one file's fixtures disappear inside another's assertion,
 *     so the suite is sequential and deterministic rather than fast and flaky.
 *   • `setupFiles` points the Prisma client at the test database *before* any
 *     service module is imported (see `tests/setup/env.ts`), because `server/db.ts`
 *     reads `DATABASE_URL` at module load.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(process.cwd(), "src"),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    setupFiles: ["tests/setup/env.ts"],
    globalSetup: ["tests/setup/global.ts"],
    fileParallelism: false,
    pool: "forks",
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
