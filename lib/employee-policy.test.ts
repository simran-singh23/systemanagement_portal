import assert from "node:assert/strict";
import test from "node:test";
import { canAssignEmployeeRole, canManageEmployeeRole } from "./employee-policy";

test("only product managers and super admins manage employees, with role assignment boundaries", () => {
  assert.equal(canManageEmployeeRole("SUPER_ADMIN", "PRODUCT_MANAGER"), true);
  assert.equal(canAssignEmployeeRole("SUPER_ADMIN", "SUPER_ADMIN"), false);
  assert.equal(canAssignEmployeeRole("PRODUCT_MANAGER", "TEAM_LEAD"), true);
  assert.equal(canAssignEmployeeRole("PRODUCT_MANAGER", "EMPLOYEE"), true);
  assert.equal(canAssignEmployeeRole("PRODUCT_MANAGER", "PRODUCT_MANAGER"), false);
  assert.equal(canManageEmployeeRole("PRODUCT_MANAGER", "PRODUCT_MANAGER"), false);
  for (const role of ["TEAM_LEAD", "EMPLOYEE"] as const) {
    assert.equal(canManageEmployeeRole(role, "EMPLOYEE"), false);
    assert.equal(canAssignEmployeeRole(role, "TEAM_LEAD"), false);
  }
});
