import assert from "node:assert/strict";
import test from "node:test";
import { isPasswordTokenUsable } from "./password-token-policy";

const now = new Date("2026-10-23T10:00:00.000Z");
const activeReset = {
  purpose: "PASSWORD_RESET" as const,
  expiresAt: new Date(now.getTime() + 1000),
  consumedAt: null,
  userStatus: "ACTIVE" as const,
  emailVerified: new Date(now.getTime() - 1000),
  passwordHash: "argon2id-hash",
};

test("password reset tokens require an active, verified account and current password", () => {
  assert.equal(isPasswordTokenUsable(activeReset, now), true);
  assert.equal(isPasswordTokenUsable({ ...activeReset, userStatus: "SUSPENDED" }, now), false);
  assert.equal(isPasswordTokenUsable({ ...activeReset, emailVerified: null }, now), false);
  assert.equal(isPasswordTokenUsable({ ...activeReset, passwordHash: null }, now), false);
});

test("password links reject consumed and expired tokens including exact expiry", () => {
  assert.equal(isPasswordTokenUsable({ ...activeReset, consumedAt: now }, now), false);
  assert.equal(isPasswordTokenUsable({ ...activeReset, expiresAt: now }, now), false);
});

test("initial password setup only applies before a password exists", () => {
  const setup = { ...activeReset, purpose: "INITIAL_SETUP" as const, userStatus: "INVITED" as const, emailVerified: null, passwordHash: null };
  assert.equal(isPasswordTokenUsable(setup, now), true);
  assert.equal(isPasswordTokenUsable({ ...setup, passwordHash: "already-set" }, now), false);
});
