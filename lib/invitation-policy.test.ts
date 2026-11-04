import assert from "node:assert/strict";
import test from "node:test";
import { singlePendingInvitationId } from "./invitation-policy";

test("resolves one pending invitation without expanding access to other organizations", () => {
  assert.equal(singlePendingInvitationId([{ id: "membership-a" }]), "membership-a");
});

test("fails closed when no invitation or multiple organizations are pending", () => {
  assert.equal(singlePendingInvitationId([]), null);
  assert.equal(singlePendingInvitationId([{ id: "membership-a" }, { id: "membership-b" }]), null);
});
