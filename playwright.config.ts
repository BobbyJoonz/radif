import { defineConfig } from "@playwright/test";

/**
 * End-to-end: the loop a seller actually performs (message → suggestion →
 * confirm → reply preview), plus the two authorization facts that must never
 * regress (operator cannot verify payment, one tenant cannot see another).
 *
 * Uses the system Chrome channel so no 130 MB browser download is needed.
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 90_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: process.env.BASE_URL ?? "http://127.0.0.1:3000",
    channel: "chrome",
    locale: "fa-IR",
    colorScheme: "dark",
    viewport: { width: 1440, height: 900 },
    trace: "retain-on-failure",
  },
  webServer: process.env.E2E_NO_SERVER
    ? undefined
    : {
        command: "pnpm dev",
        url: "http://127.0.0.1:3000/fa/login",
        reuseExistingServer: true,
        timeout: 180_000,
      },
});
