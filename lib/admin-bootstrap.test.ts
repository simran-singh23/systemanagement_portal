import assert from "node:assert/strict";
import test from "node:test";
import { assertApprovalEvidence, assertLocalBootstrapEnvironment, assertVerifiedGoogleIdentity, bootstrapAuditId, decideBootstrapState } from "./admin-bootstrap";

const localEnvironment = { NODE_ENV: "development" } as NodeJS.ProcessEnv;

test("bootstrap is rejected outside local development", () => {
  assert.throws(() => assertLocalBootstrapEnvironment({ ...localEnvironment, NODE_ENV: "production" }, "postgresql://localhost/teamflow"), /only with NODE_ENV=development/);
  assert.throws(() => assertLocalBootstrapEnvironment({ ...localEnvironment, VERCEL_ENV: "development" }, "postgresql://localhost/teamflow"), /hosted and CI/);
  assert.throws(() => assertLocalBootstrapEnvironment(localEnvironment, "postgresql://db.example.com/teamflow"), /loopback local database/);
});

test("bootstrap requires exact identity/organization approval and a traceable reference", () => {
  assert.throws(() => assertApprovalEvidence("admin@example.com", "northstar-studio", "ticket-123", "APPROVE admin@example.com other-org"), /did not exactly match/);
  assert.throws(() => assertApprovalEvidence("admin@example.com", "northstar-studio", "x", "APPROVE admin@example.com northstar-studio"), /authorization reference/);
  assert.doesNotThrow(() => assertApprovalEvidence("admin@example.com", "northstar-studio", "SECURITY-123", "APPROVE admin@example.com northstar-studio"));
});

test("bootstrap requires one already-linked, verified Google identity and never links accounts", () => {
  const good = { id: "u1", email: "admin@example.com", emailVerified: new Date(), status: "ACTIVE", googleAccounts: [{ provider: "google", userId: "u1" }] };
  assert.doesNotThrow(() => assertVerifiedGoogleIdentity(good));
  assert.throws(() => assertVerifiedGoogleIdentity({ ...good, emailVerified: null }), /not verified/);
  assert.throws(() => assertVerifiedGoogleIdentity({ ...good, googleAccounts: [] }), /exactly one/);
  assert.throws(() => assertVerifiedGoogleIdentity({ ...good, googleAccounts: [{ provider: "google", userId: "other" }] }), /exactly one/);
  assert.throws(() => assertVerifiedGoogleIdentity({ ...good, googleAccounts: [...good.googleAccounts, ...good.googleAccounts] }), /exactly one/);
});

test("repeated exact bootstrap is idempotent and conflicting state is rejected", () => {
  const membership = { role: "SUPER_ADMIN", status: "ACTIVE" };
  const audit = { organizationId: "org1", entityId: "user1", action: "ADMIN_BOOTSTRAP_APPLIED" };
  const expected = { expectedOrganizationId: "org1", expectedUserId: "user1" };
  assert.equal(decideBootstrapState({ ...expected, priorAudit: audit, membership }), "already-applied");
  assert.throws(() => decideBootstrapState({ ...expected, priorAudit: null, membership: { role: "EMPLOYEE", status: "ACTIVE" } }), /already has an organization membership/);
  assert.throws(() => decideBootstrapState({ ...expected, priorAudit: audit, membership: null }), /prior bootstrap audit exists/);
  assert.throws(() => decideBootstrapState({ ...expected, priorAudit: { ...audit, action: "OTHER" }, membership }), /prior bootstrap audit exists/);
  assert.throws(() => decideBootstrapState({ ...expected, priorAudit: { ...audit, entityId: "other" }, membership }), /prior bootstrap audit exists/);
  assert.equal(bootstrapAuditId("org1", "user1", "SECURITY-123"), bootstrapAuditId("org1", "user1", "SECURITY-123"));
});
