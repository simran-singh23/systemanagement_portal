import { expect, test } from "@playwright/test";

const managerState = process.env.E2E_MANAGER_STORAGE_STATE;
const employeeState = process.env.E2E_EMPLOYEE_STORAGE_STATE;

test.describe("authenticated manager workflows", () => {
  test.skip(!managerState, "Set E2E_MANAGER_STORAGE_STATE to an approved manager session captured against an isolated test database.");
  if (managerState) test.use({ storageState: managerState });

  test("manager can reach core operations screens", async ({ page }) => {
    for (const path of ["/dashboard/employees", "/dashboard/tasks", "/dashboard/tasks/board", "/dashboard/attendance", "/dashboard/reports", "/dashboard/settings"]) {
      await page.goto(path);
      await expect(page).not.toHaveURL(/\/login/);
      await expect(page.locator("main")).toBeVisible();
    }
  });
});

test.describe("authenticated employee workflows", () => {
  test.skip(!employeeState, "Set E2E_EMPLOYEE_STORAGE_STATE to an approved employee session captured against an isolated test database.");
  if (employeeState) test.use({ storageState: employeeState });

  test("employee can reach personal work screens", async ({ page }) => {
    for (const path of ["/employee/tasks", "/employee/attendance", "/employee/reports", "/employee/leave"]) {
      await page.goto(path);
      await expect(page).not.toHaveURL(/\/login/);
      await expect(page.locator("main")).toBeVisible();
    }
  });
});
