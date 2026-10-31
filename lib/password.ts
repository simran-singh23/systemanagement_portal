import { randomBytes } from "node:crypto";
import argon2 from "argon2";
import { z } from "zod";

export const credentialsSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  // Don't trim passwords: spaces are valid password characters.
  password: z.string().min(1).max(256),
});

export const newPasswordSchema = z.string().min(12, "Use at least 12 characters.").max(128, "Password must be 128 characters or fewer.");

const argonOptions = {
  type: argon2.argon2id,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
  hashLength: 32,
} as const;

export function hashPassword(password: string) {
  return argon2.hash(password, argonOptions);
}

export async function verifyPassword(passwordHash: string, password: string) {
  try {
    return await argon2.verify(passwordHash, password);
  } catch {
    return false;
  }
}

let dummyHash: Promise<string> | undefined;

export function getDummyPasswordHash() {
  dummyHash ??= hashPassword(randomBytes(32).toString("base64url"));
  return dummyHash;
}

export function authVersionMatches(tokenVersion: unknown, currentVersion: number) {
  return typeof tokenVersion === "number" && tokenVersion === currentVersion;
}

export function authVersionAccepts(tokenVersion: unknown, currentVersion: number, isFreshAuthentication: boolean) {
  if (typeof tokenVersion === "number") return tokenVersion === currentVersion;
  // Existing JWTs from before password auth are accepted only while the user
  // has never changed credentials. A new successful login may establish a
  // fresh claim even when the version is already greater than zero.
  return isFreshAuthentication || currentVersion === 0;
}
