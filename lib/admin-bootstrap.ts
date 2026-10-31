import { createHash } from "node:crypto";

export type BootstrapDecision = "apply" | "already-applied";

export function assertLocalBootstrapEnvironment(environment: NodeJS.ProcessEnv, databaseUrl: string) {
  if (environment.NODE_ENV !== "development") {
    throw new Error("Administrator bootstrap is allowed only with NODE_ENV=development.");
  }
  if (environment.VERCEL_ENV || environment.CI) {
    throw new Error("Administrator bootstrap is disabled in hosted and CI environments.");
  }

  let url: URL;
  try {
    url = new URL(databaseUrl);
  } catch {
    throw new Error("DATABASE_URL is not a valid PostgreSQL URL.");
  }
  if (!["postgres:", "postgresql:"].includes(url.protocol)) {
    throw new Error("Administrator bootstrap requires PostgreSQL.");
  }
  if (!["localhost", "127.0.0.1", "::1"].includes(url.hostname)) {
    throw new Error("Administrator bootstrap is restricted to a loopback local database.");
  }
}

export function assertApprovalEvidence(email: string, organizationSlug: string, approvalReference: string, confirmation: string) {
  if (approvalReference.trim().length < 6) {
    throw new Error("Provide a traceable authorization reference (for example, an approved ticket or written owner approval).");
  }
  if (confirmation !== `APPROVE ${email} ${organizationSlug}`) {
    throw new Error("The confirmation did not exactly match the proposed Google email and organization slug.");
  }
}

export function assertVerifiedGoogleIdentity(candidate: {
  id: string;
  email: string;
  emailVerified: Date | null;
  status: string;
  googleAccounts: Array<{ provider: string; userId: string }>;
}) {
  if (candidate.emailVerified === null) throw new Error("The Google identity's email is not verified in the application database.");
  if (candidate.status !== "ACTIVE") throw new Error("Only an active application user can be bootstrapped.");
  if (candidate.googleAccounts.length !== 1 || candidate.googleAccounts[0]?.provider !== "google" || candidate.googleAccounts[0].userId !== candidate.id) {
    throw new Error("The user does not have exactly one unambiguous, linked Google account. No account linking will be performed by this tool.");
  }
}

export function bootstrapAuditId(organizationId: string, userId: string, approvalReference: string) {
  const digest = createHash("sha256").update(`${organizationId}\0${userId}\0${approvalReference.trim()}`).digest("hex");
  return `admin_bootstrap_${digest}`;
}

export function decideBootstrapState(input: {
  expectedOrganizationId: string;
  expectedUserId: string;
  priorAudit: { organizationId: string; entityId: string | null; action: string } | null;
  membership: { role: string; status: string } | null;
}): BootstrapDecision {
  if (input.priorAudit) {
    if (input.priorAudit.organizationId !== input.expectedOrganizationId || input.priorAudit.entityId !== input.expectedUserId || input.priorAudit.action !== "ADMIN_BOOTSTRAP_APPLIED" || !input.membership || input.membership.role !== "SUPER_ADMIN" || input.membership.status !== "ACTIVE") {
      throw new Error("A prior bootstrap audit exists but the current account or membership state conflicts. Manual review is required.");
    }
    return "already-applied";
  }
  if (input.membership) {
    throw new Error("This user already has an organization membership. Use the authorized in-app membership workflow; bootstrap will not alter an existing membership.");
  }
  return "apply";
}
