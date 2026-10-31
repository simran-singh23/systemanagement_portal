import dotenv from "dotenv";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { createInterface } from "node:readline/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { stdin, stdout } from "node:process";
import { assertApprovalEvidence, assertLocalBootstrapEnvironment, assertVerifiedGoogleIdentity, bootstrapAuditId, decideBootstrapState } from "../lib/admin-bootstrap";
import { reconcileAccountAccess } from "../lib/member-access";

// Match Next.js local env precedence without printing any environment values.
dotenv.config({ path: ".env.local", quiet: true });
dotenv.config({ path: ".env", quiet: true });

function readArgs(args: string[]) {
  const values = new Map<string, string>();
  for (let index = 0; index < args.length; index += 1) {
    const key = args[index];
    const value = args[index + 1];
    if (!key?.startsWith("--") || !value || value.startsWith("--") || values.has(key)) {
      throw new Error("Usage: npm run admin:bootstrap -- --email <verified-google-email> --organization <existing-org-slug> --approval-reference <authorization-record>");
    }
    values.set(key, value);
    index += 1;
  }
  const email = values.get("--email")?.trim().toLowerCase();
  const organizationSlug = values.get("--organization")?.trim().toLowerCase();
  const approvalReference = values.get("--approval-reference")?.trim();
  if (values.size !== 3 || !email || !organizationSlug || !approvalReference || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("Usage: npm run admin:bootstrap -- --email <verified-google-email> --organization <existing-org-slug> --approval-reference <authorization-record>");
  }
  return { email, organizationSlug, approvalReference };
}

async function main() {
  const { email, organizationSlug, approvalReference } = readArgs(process.argv.slice(2));
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required.");
  assertLocalBootstrapEnvironment(process.env, databaseUrl);

  const readline = createInterface({ input: stdin, output: stdout });
  try {
    console.log("LOCAL DEVELOPMENT ADMIN BOOTSTRAP — no changes have been made.");
    console.log(`Proposed Google identity: ${email}`);
    console.log(`Existing organization: ${organizationSlug}`);
    console.log(`Authorization reference: ${approvalReference}`);
    console.log("Before continuing, independently verify that this reference records explicit authorization from the organization owner or authorized project operator for this exact identity and organization.");
    const confirmation = await readline.question(`To authorize this exact mapping, type: APPROVE ${email} ${organizationSlug}\n> `);
    assertApprovalEvidence(email, organizationSlug, approvalReference, confirmation);
  } finally {
    readline.close();
  }

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });
  try {
    const [candidate, organization] = await Promise.all([
      prisma.user.findUnique({
        where: { email },
        select: {
          id: true,
          email: true,
          name: true,
          emailVerified: true,
          status: true,
          role: true,
          accounts: { where: { provider: "google" }, select: { provider: true, userId: true } },
          organizationMembers: { where: { organization: { slug: organizationSlug } }, select: { role: true, status: true } },
        },
      }),
      prisma.organization.findUnique({ where: { slug: organizationSlug }, select: { id: true, slug: true, name: true, owner: { select: { id: true, email: true, role: true, status: true } } } }),
    ]);

    if (!candidate) throw new Error("No existing application user matches that email. Sign in with the intended Google account first; this tool never creates or links accounts.");
    if (!organization) throw new Error("The selected organization does not exist. Bootstrap never creates organizations.");
    if (organization.owner.role !== "SUPER_ADMIN" || organization.owner.status !== "ACTIVE") throw new Error("The existing organization owner is not an active SUPER_ADMIN; manual authorization review is required.");
    assertVerifiedGoogleIdentity({ ...candidate, googleAccounts: candidate.accounts });

    const auditId = bootstrapAuditId(organization.id, candidate.id, approvalReference);
    const result = await prisma.$transaction(async (tx) => {
      const [priorAudit, membership] = await Promise.all([
        tx.activityLog.findUnique({ where: { id: auditId }, select: { organizationId: true, entityId: true, action: true } }),
        tx.organizationMember.findUnique({ where: { organizationId_userId: { organizationId: organization.id, userId: candidate.id } }, select: { role: true, status: true } }),
      ]);
      if (priorAudit && priorAudit.organizationId !== organization.id) throw new Error("Bootstrap audit identity conflict; manual review is required.");
      const decision = decideBootstrapState({ expectedOrganizationId: organization.id, expectedUserId: candidate.id, priorAudit, membership });
      if (decision === "already-applied") return "already-applied" as const;

      await tx.user.update({ where: { id: candidate.id }, data: { role: "SUPER_ADMIN", status: "ACTIVE" } });
      await tx.organizationMember.create({ data: { organizationId: organization.id, userId: candidate.id, role: "SUPER_ADMIN", status: "ACTIVE", joinedAt: new Date() } });
      await reconcileAccountAccess(tx, candidate.id);
      await tx.activityLog.create({
        data: {
          id: auditId,
          organizationId: organization.id,
          actorId: null,
          action: "ADMIN_BOOTSTRAP_APPLIED",
          entityType: "organization_member",
          entityId: candidate.id,
          metadata: {
            method: "local-development-one-time-bootstrap",
            targetEmail: candidate.email,
            targetUserId: candidate.id,
            targetOrganizationId: organization.id,
            authorizationReference: approvalReference,
            previousGlobalRole: candidate.role,
          },
        },
      });
      return "applied" as const;
    });

    console.log(result === "already-applied"
      ? "This exact approved bootstrap was already applied; no database changes were made."
      : "Bootstrap completed. The user role and active organization membership were recorded transactionally with an audit event. No account links or ownership were changed.");
    console.log(`Organization: ${organization.name} (${organization.slug}); identity: ${candidate.email}.`);
  } finally {
    await prisma.$disconnect();
  }
}

if (process.argv[1] && resolve(fileURLToPath(import.meta.url)) === resolve(process.argv[1])) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "Administrator bootstrap failed.");
    process.exitCode = 1;
  });
}
