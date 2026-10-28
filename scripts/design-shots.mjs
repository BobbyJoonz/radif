#!/usr/bin/env node
/**
 * Authenticated screenshots of every screen at four widths.
 *
 * `web-designer`'s shoot.mjs is the right tool for public pages, but this app is
 * behind a session: this script signs in through the real Better Auth endpoint,
 * reuses the cookies, and shoots the queue as the seller sees it — which is the
 * only view that matters for judging the design.
 *
 *   pnpm design:shots            # all screens, 390 / 768 / 1280 / 1440
 *   pnpm design:shots --only inbox
 *   BASE_URL=http://localhost:3000 pnpm design:shots
 */
import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const BASE = process.env.BASE_URL ?? "http://127.0.0.1:3000";
const OUT = path.resolve("shots/app");
const WIDTHS = (process.env.WIDTHS ?? "390,768,1280,1440").split(",").map(Number);
const EMAIL = process.env.DEMO_EMAIL ?? "maryam@toranj.demo";
const PASSWORD = process.env.DEMO_PASSWORD ?? "radif-demo-1405";

const SCREENS = [
  { name: "today-fa", path: "/fa" },
  { name: "today-en", path: "/en" },
  { name: "inbox-fa", path: "/fa/inbox" },
  { name: "inbox-en", path: "/en/inbox" },
  { name: "orders-fa", path: "/fa/orders" },
  { name: "order-detail-fa", path: "/fa/orders?first=1" },
  { name: "tasks-fa", path: "/fa/tasks" },
  { name: "customers-fa", path: "/fa/customers" },
  { name: "import-fa", path: "/fa/import" },
  { name: "settings-fa", path: "/fa/settings" },
  { name: "evaluation-fa", path: "/fa/evaluation" },
  { name: "login-fa", path: "/fa/login", anonymous: true },
];

const only = process.argv.indexOf("--only") !== -1 ? process.argv[process.argv.indexOf("--only") + 1] : null;

async function signIn() {
  const res = await fetch(`${BASE}/api/auth/sign-in/email`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: BASE },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  if (!res.ok) throw new Error(`sign-in failed ${res.status}: ${await res.text()}`);
  const raw = res.headers.getSetCookie?.() ?? [];
  return raw.map((c) => {
    const [pair] = c.split(";");
    const idx = pair.indexOf("=");
    return { name: pair.slice(0, idx), value: pair.slice(idx + 1) };
  });
}

(async () => {
  await mkdir(OUT, { recursive: true });
  const cookies = await signIn();
  const browser = await chromium.launch({ channel: "chrome" });
  const screens = only ? SCREENS.filter((s) => s.name.includes(only)) : SCREENS;
  let failures = 0;

  for (const screen of screens) {
    for (const width of WIDTHS) {
      const context = await browser.newContext({
        viewport: { width, height: width < 700 ? 844 : 900 },
        deviceScaleFactor: 1,
        locale: screen.path.startsWith("/en") ? "en-GB" : "fa-IR",
        colorScheme: "dark",
        reducedMotion: "no-preference",
      });
      if (!screen.anonymous) await context.addCookies(cookies);
      const page = await context.newPage();
      const problems = [];
      page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));
      page.on("response", (r) => {
        if (r.status() >= 400) problems.push(`http ${r.status()} ${r.url()}`);
      });
      try {
        await page.goto(`${BASE}${screen.path}`, { waitUntil: "networkidle", timeout: 45_000 });
        await page.waitForTimeout(350);
        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        );
        if (overflow > 1) problems.push(`horizontal overflow ${overflow}px`);
        await page.screenshot({
          path: path.join(OUT, `${screen.name}-${width}.png`),
          fullPage: width >= 1280,
        });
      } catch (error) {
        problems.push(`navigation: ${error.message}`);
      }
      if (problems.length) {
        failures += 1;
        console.log(`✗ ${screen.name} @${width}`);
        for (const p of problems) console.log(`    ${p}`);
      } else {
        console.log(`✓ ${screen.name} @${width}`);
      }
      await context.close();
    }
  }
  await browser.close();
  console.log(failures ? `\n${failures} screen/width pairs had problems` : "\nall screens clean");
  process.exit(failures ? 1 : 0);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
