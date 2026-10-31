import assert from "node:assert/strict";
import test from "node:test";
import { accountAccessForMemberships, hasApprovedOrganizationAccess } from "./member-access";

test("suspending one membership preserves access through another active organization", () => {
  assert.deepEqual(accountAccessForMemberships([
    { role: "PRODUCT_MANAGER", status: "SUSPENDED" },
    { role: "TEAM_LEAD", status: "ACTIVE" },
  ], false, "ACTIVE"), { role: "TEAM_LEAD", status: "ACTIVE" });
});

test("organization owner retains administrator access", () => {
  assert.deepEqual(accountAccessForMemberships([{ role: "EMPLOYEE", status: "SUSPENDED" }], true, "SUSPENDED"), { role: "SUPER_ADMIN", status: "ACTIVE" });
});

test("an invited member remains invited until authentication", () => {
  assert.deepEqual(accountAccessForMemberships([{ role: "EMPLOYEE", status: "INVITED" }], false, "INVITED"), { role: "EMPLOYEE", status: "INVITED" });
});

test("a new Google account without a membership gets no workspace access", () => {
  const account = accountAccessForMemberships([], false, "ACTIVE");

  assert.deepEqual(account, { role: "EMPLOYEE", status: "ACTIVE" });
  assert.equal(hasApprovedOrganizationAccess([], false), false);
});

test("only active membership or owned organization counts as approved access", () => {
  assert.equal(hasApprovedOrganizationAccess([{ status: "INVITED" }], false), false);
  assert.equal(hasApprovedOrganizationAccess([{ status: "SUSPENDED" }], false), false);
  assert.equal(hasApprovedOrganizationAccess([{ status: "ACTIVE" }], false), true);
  assert.equal(hasApprovedOrganizationAccess([], true), true);
});
