import { expect, login, test } from "./fixtures/tasks";

test.skip(!process.env.TEST_DATABASE_URL, "Set a dedicated migrated local TEST_DATABASE_URL for authenticated workflows.");

test("manager can reach core operations screens and the owner can open settings", async ({ page, tasks }) => {
  await login(page, tasks.manager);
  for (const path of ["/dashboard/employees", "/dashboard/tasks", "/dashboard/tasks/board", "/dashboard/attendance", "/dashboard/reports"]) {
    await page.goto(path);
    await expect(page).toHaveURL(path);
    await expect(page.locator("#main-content")).toBeVisible();
  }
  await page.context().clearCookies();
  await login(page, tasks.owner);
  await page.goto("/dashboard/settings");
  await expect(page).toHaveURL("/dashboard/settings");
  await expect(page.locator("#main-content")).toBeVisible();
});

test("employee can reach personal work screens", async ({ page, tasks }) => {
  await login(page, tasks.employee);
  for (const path of ["/employee/tasks", "/employee/attendance", "/employee/reports", "/employee/leave"]) {
    await page.goto(path);
    await expect(page).toHaveURL(path);
    await expect(page.locator("#main-content")).toBeVisible();
  }
});
