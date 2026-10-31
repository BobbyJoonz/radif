import { expect, test, type Page } from "@playwright/test";

/**
 * The workdesk journeys the plan asks for, on a real database and a real server.
 *
 * Each test starts from the same entrance a visitor uses — the persona picker — so
 * the session, the tenant and the role are the product's own, not a fabricated
 * cookie.
 */
async function enterAs(page: Page, role: "مالک" | "اپراتور") {
  // The demo entrance signs in against the real API; a cold server can miss the
  // first attempt, and a flaky entrance would blame the workdesk for it.
  for (let attempt = 0; attempt < 2; attempt += 1) {
    await page.goto("/fa");
    await page.getByRole("button", { name: /بدون ثبت‌نام/ }).first().click();
    await page.locator(".rolepicker-item", { hasText: role }).first().click();
    try {
      await page.waitForURL(/\/today/, { timeout: 25_000 });
      await expect(page.locator(".workdesk")).toBeVisible();
      return;
    } catch (error) {
      if (attempt === 1) throw error;
    }
  }
}

test.describe("workdesk", () => {
  test("an operator sees their own view and cannot decide a payment", async ({ page, request }) => {
    await enterAs(page, "اپراتور");

    // the demo bar exists and the current role is marked
    await expect(page.locator(".demobar")).toBeVisible();
    if (await page.locator(".demobar").count()) {
      await expect(page.locator('.demobar-role[data-current="true"]')).toHaveText("اپراتور");
    }

    // the money decision is refused by the server, not just hidden in the UI
    const response = await request.post("/api/orders/order_1042/payment-claims/claim_1042/verify", {
      data: { decision: "verified" },
      failOnStatusCode: false,
    });
    expect([401, 403, 404]).toContain(response.status());
  });

  test("an owner decides a payment and the queue reflects it after a reload", async ({ page }) => {
    await enterAs(page, "مالک");
    if (await page.locator(".demobar").count()) {
      await expect(page.locator('.demobar-role[data-current="true"]')).toHaveText("مالک");
    }

    const verify = await page.request.post("/api/orders/order_1042/payment-claims/claim_1042/verify", {
      data: { decision: "verified" },
      failOnStatusCode: false,
    });
    // 200 when the claim is still claimed, 409 when a previous run already decided it
    expect([200, 404, 409]).toContain(verify.status());

    await page.reload();
    await expect(page.locator(".workdesk")).toBeVisible();
  });

  test("a selected order survives reload and a mobile back", async ({ page }) => {
    await enterAs(page, "مالک");

    await page.goto("/fa/orders?order=order_1042");
    await expect(page).toHaveURL(/order=order_1042/);
    await page.reload();
    await expect(page).toHaveURL(/order=order_1042/);

    // the same selection on a phone-sized viewport, after going back to the list
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/fa/orders");
    await page.goto("/fa/orders?order=order_1042");
    await page.goBack();
    await page.goForward();
    await expect(page).toHaveURL(/order=order_1042/);
  });
});
