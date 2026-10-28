#!/usr/bin/env node
/**
 * Authenticated screenshots + the web-designer slop scan, for every screen.
 *
 * web-designer's shoot.mjs cannot reach a page behind a session, so this script
 * signs in through the real Better Auth endpoint, reuses the cookies, and then
 * runs the SAME in-page scan (the skill's scripts/lib/inpage.js) plus its
 * contrast re-check on the authenticated render. The results below are the real
 * ones for the screen the seller actually sees.
 *
 *   node scripts/design-shots.mjs                 # all screens, 390/768/1280/1440
 *   node scripts/design-shots.mjs --only inbox
 *   WIDTHS=1440,390 node scripts/design-shots.mjs
 */
import { chromium } from "@playwright/test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const SKILL = process.env.WEB_DESIGNER_SKILL ?? "D:/dsh-home/skills/web-designer";
const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const OUT = path.resolve("shots/app");
const WIDTHS = (process.env.WIDTHS ?? "390,768,1280,1440").split(",").map(Number);
const EMAIL = process.env.DEMO_EMAIL ?? "maryam@toranj.demo";
const PASSWORD = process.env.DEMO_PASSWORD ?? "radif-demo-1405";

const SCREENS = [
  { name: "today-fa", path: "/fa", app: true },
  { name: "today-en", path: "/en", app: true },
  { name: "inbox-fa", path: "/fa/inbox", app: true },
  { name: "inbox-en", path: "/en/inbox", app: true },
  { name: "orders-fa", path: "/fa/orders", app: true },
  { name: "tasks-fa", path: "/fa/tasks", app: true },
  { name: "customers-fa", path: "/fa/customers", app: true },
  { name: "import-fa", path: "/fa/import", app: true },
  { name: "settings-fa", path: "/fa/settings", app: true },
  { name: "evaluation-fa", path: "/fa/evaluation", app: true },
  { name: "login-fa", path: "/fa/login", anonymous: true },
];

const only = process.argv.includes("--only") ? process.argv[process.argv.indexOf("--only") + 1] : null;

async function signIn() {
  const res = await fetch(BASE + "/api/auth/sign-in/email", {
    method: "POST",
    headers: { "content-type": "application/json", origin: BASE },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  if (!res.ok) throw new Error("sign-in failed " + res.status);
  const raw = res.headers.getSetCookie?.() ?? [];
  return raw.map((c) => {
    const pair = c.split(";")[0];
    const idx = pair.indexOf("=");
    return { name: pair.slice(0, idx), value: pair.slice(idx + 1), url: BASE };
  });
}

(async () => {
  await mkdir(OUT, { recursive: true });
  const cookies = await signIn();
  const INPAGE = await readFile(path.join(SKILL, "scripts", "lib", "inpage.js"), "utf8");
  const browser = await chromium.launch({ channel: "chrome" });
  const screens = only ? SCREENS.filter((s) => s.name.includes(only)) : SCREENS;
  const report = [];
  let failures = 0;

  for (const screen of screens) {
    for (const width of WIDTHS) {
      const context = await browser.newContext({
        viewport: { width, height: width < 700 ? 844 : 900 },
        deviceScaleFactor: 1,
        locale: screen.path.startsWith("/en") ? "en-GB" : "fa-IR",
        colorScheme: "dark",
      });
      if (!screen.anonymous) await context.addCookies(cookies);
      const page = await context.newPage();
      const problems = [];
      page.on("pageerror", (e) => problems.push("pageerror: " + e.message));
      page.on("response", (r) => {
        if (r.status() >= 400) problems.push("http " + r.status() + " " + r.url());
      });
      try {
        await page.goto(BASE + screen.path, { waitUntil: "load", timeout: 45000 });
        await page.waitForTimeout(1200);
        await page.screenshot({ path: path.join(OUT, screen.name + "-" + width + ".png"), fullPage: false });

        await page.evaluate(INPAGE);
        const scan = await page.evaluate((o) => window.__wd.scan(o), { app: Boolean(screen.app) });
        const contrast = await page.evaluate(() => window.__wd.recheckContrast());
        const fails = [...(scan.fails ?? []), ...(contrast?.fails ?? [])];
        const warns = [...(scan.warns ?? []), ...(contrast?.warns ?? [])];
        report.push({
          screen: screen.name,
          width,
          fonts: scan.fonts,
          sizes: scan.sizes,
          hues: scan.hues,
          fails,
          warns,
        });
        if (fails.length) problems.push(...fails.map((f) => "FAIL " + f));
        if (warns.length) console.log("  warn " + screen.name + "@" + width + ": " + warns.join(" | "));
      } catch (error) {
        problems.push("navigation: " + error.message);
      }
      if (problems.length) {
        failures += 1;
        console.log("x " + screen.name + " @" + width);
        for (const p of problems) console.log("    " + p);
      } else {
        console.log("ok " + screen.name + " @" + width);
      }
      await context.close();
    }
  }
  await writeFile(path.join(OUT, "scan.json"), JSON.stringify(report, null, 2));
  await browser.close();
  console.log(failures ? "\n" + failures + " screen/width pairs had problems" : "\nall screens clean");
  process.exit(failures ? 1 : 0);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});

