import assert from "node:assert/strict";
import test from "node:test";
import { searchAccessScopes } from "./access";

test("employee search scopes every personal category to the actor", () => {
  const scope = searchAccessScopes("EMPLOYEE", "employee-1", "org-1");
  assert.equal(scope.manager, false);
  assert.deepEqual(scope.taskScope, { assignedToId: "employee-1" });
  assert.deepEqual(scope.userScope, { id: "employee-1" });
});

test("team lead search remains inside managed organization teams", () => {
  const scope = searchAccessScopes("TEAM_LEAD", "lead-1", "org-1");
  assert.equal(scope.manager, true);
  assert.deepEqual(scope.taskScope, { team: { managerId: "lead-1" } });
  assert.deepEqual(scope.userScope, { teamMembers: { some: { team: { organizationId: "org-1", managerId: "lead-1" } } } });
});
