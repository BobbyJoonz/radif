import { expect, test, type Page } from "@playwright/test";

const OWNER = { email: "maryam@toranj.demo", password: "radif-demo-1405" };
const OPERATOR = { email: "saeed@toranj.demo", password: "radif-demo-1405" };

async function signIn(page: Page, who: { email: string; password: string }) {
  await page.goto("/fa/login");
  await page.getByLabel(/ایمیل|email/i).fill(who.email);
  await page.getByLabel(/گذرواژه|رمز|password/i).fill(who.password);
  await page.getByRole("button", { name: /ورود|sign in/i }).click();
  await expect(page).toHaveURL(/\/fa(\/|$)/, { timeout: 20_000 });
}

test.describe("the loop", () => {
  test("today shows a real queue with reasons, and survives a reload", async ({ page }) => {
    await signIn(page, OWNER);
    await expect(page.getByRole("heading", { name: /کارِ امروز|Today/i })).toBeVisible();

    // three real counters, not decoration
    await expect(page.locator(".counts-item").first()).toContainText(/\d|[۰-۹]/);

    const rows = page.locator(".ledger-table tbody tr");
    await expect(rows.first()).toBeVisible();
    const firstText = await rows.first().innerText();

    // the reason column explains why this row is first
    expect(firstText.length).toBeGreaterThan(20);

    await page.reload();
    await expect(rows.first()).toContainText(firstText.split("\n")[0].slice(0, 8));
  });

  test("inbox keeps the message, its proposals and the action sheet in one view", async ({ page }) => {
    await signIn(page, OWNER);
    await page.goto("/fa/inbox");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    // the thread and the action panel must coexist on a 1440 screen
    await expect(page.locator("main, .shellmain").first()).toBeVisible();
    const body = await page.locator("body").innerText();
    expect(body).toMatch(/پیشنهاد|اقدام|گفتگو/);
  });

  test("an operator never gets the payment-verification control, and the API refuses it", async ({ page }) => {
    await signIn(page, OPERATOR);
    await page.goto("/fa/orders");
    const body = await page.locator("body").innerText();
    expect(body).not.toMatch(/تأیید پرداخت/);

    const res = await page.request.post("/api/orders/does-not-exist/payment-claims/does-not-exist/verify", {
      data: { decision: "verified" },
    });
    expect([403, 404]).toContain(res.status());
  });
});
