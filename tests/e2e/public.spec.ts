import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("login page renders its primary authentication action", async ({ page }) => {
  await page.goto("/login");

  await expect(page).toHaveTitle(/Sign in.*TeamFlow/);
  await expect(page.getByRole("heading", { name: "Sign in to your workspace", level: 1 })).toBeVisible();
  await expect(page.getByRole("button", { name: "Continue with Google" })).toBeVisible();
});

test("unauthenticated dashboard requests are redirected to login", async ({ page }) => {
  await page.goto("/dashboard");

  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByRole("heading", { name: "Sign in to your workspace" })).toBeVisible();
});

test("email delivery history and preview require authentication", async ({ page }) => {
  for (const path of ["/dashboard/email-reports", "/dashboard/email-reports/preview?date=2026-10-22"]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/login/);
  }
});

test("public responses include baseline browser security headers", async ({ request }) => {
  const response = await request.get("/login");

  expect(response.headers()["x-content-type-options"]).toBe("nosniff");
  expect(response.headers()["x-frame-options"]).toBe("DENY");
  expect(response.headers()["referrer-policy"]).toBe("strict-origin-when-cross-origin");
  expect(response.headers()["permissions-policy"]).toContain("camera=()");
});

test("unsigned Resend webhook requests are rejected", async ({ request }) => {
  const response = await request.post("/api/webhooks/resend", { data: { type: "email.delivered" } });
  expect([400, 503]).toContain(response.status());
});

test("@a11y login page has no detectable WCAG A/AA violations", async ({ page }) => {
  await page.goto("/login");
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();

  expect(results.violations).toEqual([]);
});

for (const viewport of [
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
  { width: 1024, height: 768 },
  { width: 1440, height: 900 },
]) {
  test(`login remains usable without page overflow at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto("/login");

    await expect(page.getByRole("button", { name: "Continue with Google" })).toBeVisible();
    const hasHorizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    expect(hasHorizontalOverflow).toBe(false);
  });
}
