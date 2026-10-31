import { createHash } from "node:crypto";

const WINDOW_MS = 15 * 60_000;
const EMAIL_MAX_ATTEMPTS = 8;
const IP_MAX_ATTEMPTS = 60;

export function isAttemptAllowed(attempts: number, maximum: number) {
  return attempts <= maximum;
}

function keyHash(scope: string, value: string) {
  return createHash("sha256").update(`${scope}\0${value}`).digest("hex");
}

async function incrementWindow(key: string) {
  const { prisma } = await import("@/lib/prisma");
  const rows = await prisma.$queryRaw<Array<{ attempts: number }>>`
    INSERT INTO "auth_rate_limits" ("key_hash", "window_started_at", "attempts")
    VALUES (${key}, NOW(), 1)
    ON CONFLICT ("key_hash") DO UPDATE SET
      "attempts" = CASE
        WHEN "auth_rate_limits"."window_started_at" <= NOW() - INTERVAL '15 minutes' THEN 1
        ELSE "auth_rate_limits"."attempts" + 1
      END,
      "window_started_at" = CASE
        WHEN "auth_rate_limits"."window_started_at" <= NOW() - INTERVAL '15 minutes' THEN NOW()
        ELSE "auth_rate_limits"."window_started_at"
      END
    RETURNING "attempts"
  `;
  return rows[0]?.attempts ?? Number.POSITIVE_INFINITY;
}

export async function consumeCredentialsAttempt(email: string, ip: string) {
  const [emailAttempts, ipAttempts] = await Promise.all([
    incrementWindow(keyHash("credentials-email", email.toLowerCase())),
    incrementWindow(keyHash("credentials-ip", ip || "unknown")),
  ]);
  return isAttemptAllowed(emailAttempts, EMAIL_MAX_ATTEMPTS) && isAttemptAllowed(ipAttempts, IP_MAX_ATTEMPTS);
}

export async function consumePasswordLinkRequest(email: string, ip: string) {
  const [emailAttempts, ipAttempts] = await Promise.all([
    incrementWindow(keyHash("password-link-email", email.toLowerCase())),
    incrementWindow(keyHash("password-link-ip", ip || "unknown")),
  ]);
  return isAttemptAllowed(emailAttempts, 4) && isAttemptAllowed(ipAttempts, 20);
}

export const AUTH_RATE_LIMIT_WINDOW_MS = WINDOW_MS;
