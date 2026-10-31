import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { Resend } from "resend";
import type { PasswordTokenPurpose, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { reconcileAccountAccess } from "@/lib/member-access";
import { hashPassword, newPasswordSchema } from "@/lib/password";
import { isPasswordTokenUsable } from "@/lib/password-token-policy";

const TOKEN_LIFETIME_MS = 30 * 60_000;

function tokenDigest(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function subjectDigest(email: string) {
  return tokenDigest(email.toLowerCase());
}

export async function recordAuthSecurityEvent(input: {
  event: string;
  userId?: string | null;
  email?: string;
  metadata?: Prisma.InputJsonValue;
}) {
  await prisma.authSecurityEvent.create({
    data: {
      event: input.event,
      userId: input.userId ?? null,
      subjectHash: input.email ? subjectDigest(input.email) : undefined,
      metadata: input.metadata,
    },
  });
}

async function createPasswordToken(userId: string, purpose: PasswordTokenPurpose) {
  const token = randomBytes(32).toString("base64url");
  await prisma.$transaction(async (tx) => {
    await tx.passwordToken.deleteMany({ where: { userId, purpose, consumedAt: null } });
    await tx.passwordToken.create({
      data: { userId, purpose, tokenHash: tokenDigest(token), expiresAt: new Date(Date.now() + TOKEN_LIFETIME_MS) },
    });
  });
  return token;
}

function configuredOrigin() {
  const value = process.env.AUTH_URL?.trim();
  if (!value) throw new Error("Password email requires AUTH_URL.");
  const origin = new URL(value);
  if (process.env.NODE_ENV === "production" && origin.protocol !== "https:") throw new Error("Password email requires an HTTPS AUTH_URL in production.");
  return origin.origin;
}

export function authEmailConfigured() {
  const sender = process.env.RESEND_FROM_EMAIL?.trim();
  return Boolean(process.env.RESEND_API_KEY?.trim() && sender && process.env.AUTH_URL?.trim());
}

function maySendAuthEmailTo(email: string) {
  if (process.env.NODE_ENV === "production") return true;
  const allowlist = new Set((process.env.RESEND_TEST_RECIPIENTS ?? "").split(",").map((value) => value.trim().toLowerCase()).filter(Boolean));
  return allowlist.has(email.toLowerCase());
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!);
}

function passwordLink(token: string, purpose: PasswordTokenPurpose) {
  const path = purpose === "INITIAL_SETUP" ? "/set-password" : "/reset-password";
  const link = new URL(path, configuredOrigin());
  link.searchParams.set("token", token);
  return link;
}

async function sendPasswordLink(email: string, token: string, purpose: PasswordTokenPurpose) {
  const link = passwordLink(token, purpose);
  const action = purpose === "INITIAL_SETUP" ? "Set up your TeamFlow password" : "Reset your TeamFlow password";
  const resend = new Resend(process.env.RESEND_API_KEY);
  const response = await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL!,
    to: [email],
    subject: action,
    text: `${action}\n\nUse this one-time link within 30 minutes: ${link.toString()}\n\nIf you did not request this, you can ignore this email.`,
    html: `<main style="font-family:Arial,sans-serif;color:#172033;max-width:560px;margin:32px auto;padding:32px"><h1 style="font-size:24px">${action}</h1><p>This one-time link expires in 30 minutes.</p><p><a href="${escapeHtml(link.toString())}" style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;padding:12px 18px;border-radius:10px">${purpose === "INITIAL_SETUP" ? "Set password" : "Reset password"}</a></p><p style="color:#667085;font-size:13px">If you did not request this, you can ignore this email.</p></main>`,
  });
  if (response.error) throw new Error("Password email could not be delivered.");
}

export async function sendPasswordSetupOrReset(email: string): Promise<"sent" | "logged" | "not_configured" | "not_eligible" | "test_recipient_not_allowlisted"> {
  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() }, select: { id: true, email: true, passwordHash: true, status: true } });
  if (!user || user.status === "SUSPENDED") return "not_eligible";
  if (!authEmailConfigured()) {
    // Local development without Resend: print the one-time link to the dev server terminal instead of emailing it.
    if (process.env.NODE_ENV !== "development" || !process.env.AUTH_URL?.trim()) return "not_configured";
    const purpose: PasswordTokenPurpose = user.passwordHash ? "PASSWORD_RESET" : "INITIAL_SETUP";
    const token = await createPasswordToken(user.id, purpose);
    await recordAuthSecurityEvent({ event: purpose === "INITIAL_SETUP" ? "password_setup_requested" : "password_reset_requested", userId: user.id, email: user.email });
    console.info(`[dev] Password ${purpose === "INITIAL_SETUP" ? "setup" : "reset"} link for ${user.email} (valid 30 minutes): ${passwordLink(token, purpose).toString()}`);
    return "logged";
  }
  if (!maySendAuthEmailTo(user.email)) return "test_recipient_not_allowlisted";
  const purpose: PasswordTokenPurpose = user.passwordHash ? "PASSWORD_RESET" : "INITIAL_SETUP";
  const token = await createPasswordToken(user.id, purpose);
  await recordAuthSecurityEvent({ event: purpose === "INITIAL_SETUP" ? "password_setup_requested" : "password_reset_requested", userId: user.id, email: user.email });
  await sendPasswordLink(user.email, token, purpose);
  return "sent";
}

export async function consumePasswordToken(token: string, candidatePassword: string) {
  const parsedPassword = newPasswordSchema.safeParse(candidatePassword);
  if (!parsedPassword.success || token.length < 32 || token.length > 128) throw new Error("This password link is invalid or has expired.");
  const digest = tokenDigest(token);
  const now = new Date();
  const record = await prisma.passwordToken.findUnique({ where: { tokenHash: digest }, include: { user: { select: { id: true, email: true, name: true, status: true, emailVerified: true, passwordHash: true } } } });
  if (!record || !isPasswordTokenUsable({
    purpose: record.purpose,
    expiresAt: record.expiresAt,
    consumedAt: record.consumedAt,
    userStatus: record.user.status,
    emailVerified: record.user.emailVerified,
    passwordHash: record.user.passwordHash,
  }, now)) throw new Error("This password link is invalid or has expired.");

  const passwordHash = await hashPassword(parsedPassword.data);
  await prisma.$transaction(async (tx) => {
    const claimed = await tx.passwordToken.updateMany({ where: { id: record.id, consumedAt: null, expiresAt: { gt: new Date() } }, data: { consumedAt: new Date() } });
    if (claimed.count !== 1) throw new Error("This password link is invalid or has expired.");

    const updated = await tx.user.updateMany({
      where: { id: record.user.id, status: record.user.status, passwordHash: record.user.passwordHash },
      data: {
        passwordHash,
        emailVerified: record.user.emailVerified ?? new Date(),
        status: record.purpose === "INITIAL_SETUP" ? "ACTIVE" : record.user.status,
        authVersion: { increment: 1 },
      },
    });
    if (updated.count !== 1) throw new Error("This password link is invalid or has expired.");
    if (record.purpose === "INITIAL_SETUP") {
      await tx.organizationMember.updateMany({ where: { userId: record.user.id, status: "INVITED" }, data: { status: "ACTIVE", joinedAt: new Date() } });
      await reconcileAccountAccess(tx, record.user.id);
    }
    await tx.passwordToken.deleteMany({ where: { userId: record.user.id, consumedAt: null } });
    await tx.authSecurityEvent.create({ data: { userId: record.user.id, event: record.purpose === "INITIAL_SETUP" ? "initial_password_set" : "password_reset_completed" } });
  });
}

export async function changeCurrentPassword(userId: string, currentPassword: string, newPassword: string) {
  const next = newPasswordSchema.safeParse(newPassword);
  if (!next.success) throw new Error("Use a password of at least 12 characters.");
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true, status: true, passwordHash: true } });
  if (!user || user.status !== "ACTIVE" || !user.passwordHash) throw new Error("Password change is unavailable for this account. Use Forgot password to set one.");
  const { verifyPassword } = await import("@/lib/password");
  if (!(await verifyPassword(user.passwordHash, currentPassword))) throw new Error("Current password is incorrect.");
  const passwordHash = await hashPassword(next.data);
  await prisma.$transaction(async (tx) => {
    const updated = await tx.user.updateMany({
      where: { id: userId, status: "ACTIVE", passwordHash: user.passwordHash },
      data: { passwordHash, authVersion: { increment: 1 } },
    });
    if (updated.count !== 1) throw new Error("Password change failed. Sign in and try again.");
    await tx.passwordToken.deleteMany({ where: { userId, consumedAt: null } });
    await tx.authSecurityEvent.create({ data: { userId, event: "password_changed" } });
  });
}
