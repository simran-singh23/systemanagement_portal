import dotenv from "dotenv";
import { createHash, randomBytes } from "node:crypto";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { Resend } from "resend";

dotenv.config({ path: ".env.local", quiet: true });
dotenv.config({ path: ".env", quiet: true });

function parseArgs(args: string[]) {
  const values = new Map<string, string>();
  for (let index = 0; index < args.length; index += 2) {
    const key = args[index];
    const value = args[index + 1];
    if (!key?.startsWith("--") || !value || value.startsWith("--") || values.has(key)) throw new Error("Provide --admin-email, --organization-name, --organization-slug and --approval-reference.");
    values.set(key, value.trim());
  }
  const email = values.get("--admin-email")?.toLowerCase();
  const name = values.get("--organization-name");
  const slug = values.get("--organization-slug")?.toLowerCase();
  const approvalReference = values.get("--approval-reference");
  if (values.size !== 4 || !email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !name || name.length < 2 || name.length > 120 || !slug || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || !approvalReference || approvalReference.length < 6) {
    throw new Error("Provide a valid admin email, organization name/slug and traceable authorization reference.");
  }
  return { email, name, slug, approvalReference };
}

function auditId(slug: string, email: string, approvalReference: string) {
  const digest = createHash("sha256").update(`${slug}\0${email}\0${approvalReference}`).digest("hex");
  return `org_admin_onboarding_${digest}`;
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!);
}

async function sendInitialSetup(prisma: import("@prisma/client").PrismaClient, userId: string, email: string) {
  const token = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  await prisma.$transaction(async (tx) => {
    await tx.passwordToken.deleteMany({ where: { userId, purpose: "INITIAL_SETUP", consumedAt: null } });
    await tx.passwordToken.create({ data: { userId, tokenHash, purpose: "INITIAL_SETUP", expiresAt: new Date(Date.now() + 30 * 60_000) } });
    await tx.authSecurityEvent.create({ data: { userId, event: "password_setup_requested", subjectHash: createHash("sha256").update(email).digest("hex") } });
  });
  const link = new URL("/set-password", process.env.AUTH_URL!);
  link.searchParams.set("token", token);
  const action = "Set up your TeamFlow password";
  const response = await new Resend(process.env.RESEND_API_KEY).emails.send({
    from: process.env.RESEND_FROM_EMAIL!,
    to: [email],
    subject: action,
    text: `${action}\n\nUse this one-time link within 30 minutes: ${link.toString()}\n\nIf you did not expect this, ignore this email.`,
    html: `<main style="font-family:Arial,sans-serif;color:#172033;max-width:560px;margin:32px auto;padding:32px"><h1 style="font-size:24px">${action}</h1><p>This one-time link expires in 30 minutes.</p><p><a href="${escapeHtml(link.toString())}" style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;padding:12px 18px;border-radius:10px">Set password</a></p><p style="color:#667085;font-size:13px">If you did not expect this, ignore this email.</p></main>`,
  });
  if (response.error) throw new Error("Password setup email could not be delivered.");
}

async function main() {
  const input = parseArgs(process.argv.slice(2));
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required.");
  if (!process.env.AUTH_URL?.trim() || !process.env.RESEND_API_KEY?.trim() || !process.env.RESEND_FROM_EMAIL?.trim()) throw new Error("Configure AUTH_URL, RESEND_API_KEY and RESEND_FROM_EMAIL before provisioning an administrator.");
  const appUrl = new URL(process.env.AUTH_URL);
  if (process.env.NODE_ENV === "production" && appUrl.protocol !== "https:") throw new Error("Production AUTH_URL must use HTTPS.");
  if (process.env.NODE_ENV !== "production") {
    const testRecipients = new Set((process.env.RESEND_TEST_RECIPIENTS ?? "").split(",").map((value) => value.trim().toLowerCase()).filter(Boolean));
    if (!testRecipients.has(input.email)) throw new Error("Add the approved administrator address to RESEND_TEST_RECIPIENTS before local onboarding.");
  }
  const id = auditId(input.slug, input.email, input.approvalReference);

  const readline = createInterface({ input: stdin, output: stdout });
  try {
    console.log("Organization administrator onboarding — review before making changes.");
    console.log(`Administrator email: ${input.email}`);
    console.log(`New organization: ${input.name} (${input.slug})`);
    console.log(`Authorization reference: ${input.approvalReference}`);
    console.log("Verify this reference records explicit approval from the organization owner or authorized operator for this exact administrator and organization.");
    const confirmation = await readline.question(`Type CREATE ${input.slug} FOR ${input.email} to continue:\n> `);
    if (confirmation !== `CREATE ${input.slug} FOR ${input.email}`) throw new Error("Confirmation did not match; no changes were made.");
  } finally {
    readline.close();
  }

  const { prisma } = await import("../lib/prisma");
  try {
    const state = await prisma.$transaction(async (tx) => {
    const previous = await tx.authSecurityEvent.findUnique({ where: { id }, select: { event: true, metadata: true } });
    if (previous) {
      const existingUser = await tx.user.findUnique({ where: { email: input.email }, select: { id: true, passwordHash: true, status: true, role: true } });
      const existingOrg = await tx.organization.findUnique({ where: { slug: input.slug }, select: { id: true, ownerId: true } });
      const membership = existingUser && existingOrg ? await tx.organizationMember.findUnique({ where: { organizationId_userId: { organizationId: existingOrg.id, userId: existingUser.id } }, select: { role: true, status: true } }) : null;
      if (previous.event !== "organization_admin_onboarding_prepared" || !existingUser || !existingOrg || existingOrg.ownerId !== existingUser.id || existingUser.role !== "SUPER_ADMIN" || membership?.role !== "SUPER_ADMIN") throw new Error("Prior onboarding audit conflicts with current account or organization state. No changes were made.");
      if (existingUser.status === "ACTIVE" && membership.status === "ACTIVE") return { userId: existingUser.id, passwordHash: existingUser.passwordHash, created: false, complete: true };
      if (existingUser.status !== "INVITED" || existingUser.passwordHash || membership.status !== "INVITED") throw new Error("Prior onboarding state is incomplete or conflicting. Manual review is required; no changes were made.");
      return { userId: existingUser.id, passwordHash: existingUser.passwordHash, created: false, complete: false };
    }

    const [existingUser, existingOrg] = await Promise.all([
      tx.user.findUnique({ where: { email: input.email }, select: { id: true } }),
      tx.organization.findUnique({ where: { slug: input.slug }, select: { id: true } }),
    ]);
    if (existingUser || existingOrg) throw new Error("The email or organization slug already exists. This bootstrap will not link, promote, or reuse existing records.");

    const user = await tx.user.create({ data: { email: input.email, role: "SUPER_ADMIN", status: "INVITED" }, select: { id: true, passwordHash: true } });
    const organization = await tx.organization.create({ data: { name: input.name, slug: input.slug, ownerId: user.id, contactEmail: input.email }, select: { id: true } });
    await tx.organizationMember.create({ data: { organizationId: organization.id, userId: user.id, role: "SUPER_ADMIN", status: "INVITED" } });
    await tx.authSecurityEvent.create({
      data: {
        id,
        userId: user.id,
        event: "organization_admin_onboarding_prepared",
        subjectHash: createHash("sha256").update(input.email).digest("hex"),
        metadata: { organizationId: organization.id, organizationSlug: input.slug, approvalReference: input.approvalReference, status: "INVITED; activation requires one-time email verification and password setup" },
      },
    });
    return { userId: user.id, passwordHash: user.passwordHash, created: true, complete: false };
    });

    try {
      if (state.complete) {
        console.log("This exact onboarding is already complete; no database changes or additional email were made.");
      } else {
        if (!state.passwordHash) await sendInitialSetup(prisma, state.userId, input.email);
        console.log(state.created ? "Organization and invited administrator were created; a one-time password setup link was sent." : "This exact approved onboarding already exists; no records were changed. A fresh setup link was sent if the account remains eligible.");
        console.log("The account remains unable to sign in until the recipient completes the emailed, expiring setup link.");
      }
    } catch (error) {
      console.error("The invite is safely stored as INVITED, but the setup email could not be sent. Correct the email configuration and re-run with the same organization, email and authorization reference.", error instanceof Error ? error.message : "unknown error");
      process.exitCode = 1;
    }
  } finally {
    await prisma.$disconnect();
  }
}

if (process.argv[1] && resolve(fileURLToPath(import.meta.url)) === resolve(process.argv[1])) {
  main().catch(async (error: unknown) => {
    console.error(error instanceof Error ? error.message : "Organization administrator onboarding failed.");
    process.exitCode = 1;
  });
}
