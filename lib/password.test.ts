import assert from "node:assert/strict";
import test from "node:test";
import { authVersionAccepts, authVersionMatches, credentialsSchema, hashPassword, newPasswordSchema, verifyPassword } from "./password";

test("credential email is normalized while password whitespace is preserved", () => {
  const parsed = credentialsSchema.parse({ email: "  ADMIN@Mail.com ", password: "  valid pass  " });
  assert.equal(parsed.email, "admin@mail.com");
  assert.equal(parsed.password, "  valid pass  ");
  assert.equal(credentialsSchema.safeParse({ email: "not-an-email", password: "x" }).success, false);
});

test("new passwords have bounded length", () => {
  assert.equal(newPasswordSchema.safeParse("long enough password").success, true);
  assert.equal(newPasswordSchema.safeParse("short").success, false);
  assert.equal(newPasswordSchema.safeParse("x".repeat(129)).success, false);
});

test("auth version change invalidates previous JWT versions", () => {
  assert.equal(authVersionMatches(3, 3), true);
  assert.equal(authVersionMatches(2, 3), false);
  assert.equal(authVersionMatches(undefined, 3), false);
  assert.equal(authVersionAccepts(undefined, 0, false), true);
  assert.equal(authVersionAccepts(undefined, 3, false), false);
  assert.equal(authVersionAccepts(undefined, 3, true), true);
  assert.equal(authVersionAccepts(2, 3, true), false);
});

test("passwords are stored as verifiable Argon2id hashes, never plaintext", async () => {
  const password = "correct horse battery staple";
  const hash = await hashPassword(password);
  assert.notEqual(hash, password);
  assert.match(hash, /^\$argon2id\$/);
  assert.equal(await verifyPassword(hash, password), true);
  assert.equal(await verifyPassword(hash, "wrong password"), false);
});
