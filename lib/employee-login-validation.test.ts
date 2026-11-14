import assert from "node:assert/strict";
import test from "node:test";
import { employeeCreationSchema } from "./employee-login-validation";
import { initialPasswordSchema } from "./password-validation";

const employee = { organizationId: "org-1", name: "New Employee", email: " EMPLOYEE@example.com ", role: "EMPLOYEE", jobTitle: "", department: "", teamId: "" };

test("existing invitation submissions remain valid without passwords", () => {
  const result = employeeCreationSchema.parse(employee);
  assert.equal(result.loginMethod, "EMAIL_INVITE");
  assert.equal(result.email, "employee@example.com");
});

test("direct login creation requires a strong, matching initial password", () => {
  for (const fields of [{}, { password: "short", confirmation: "short" }, { password: "Employee-password-123", confirmation: "different-password-123" }]) {
    assert.equal(employeeCreationSchema.safeParse({ ...employee, loginMethod: "ADMIN_PASSWORD", ...fields }).success, false);
  }
  assert.equal(employeeCreationSchema.safeParse({ ...employee, loginMethod: "ADMIN_PASSWORD", password: "Employee-password-123", confirmation: "Employee-password-123" }).success, true);
});

test("password validation preserves spaces and rejects unsupported provisioning methods", () => {
  const password = " Employee-password-123 ";
  assert.equal(initialPasswordSchema.parse({ password, confirmation: password }).password, password);
  assert.equal(initialPasswordSchema.safeParse({ password, confirmation: password.trim() }).success, false);
  assert.equal(employeeCreationSchema.safeParse({ ...employee, loginMethod: "ACTIVATE_ANY_ACCOUNT" }).success, false);
});
