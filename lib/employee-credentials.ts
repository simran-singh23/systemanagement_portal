import "server-only";

import type { Prisma, UserRole } from "@prisma/client";
import { canManageEmployeeRole } from "./employee-policy";
import { reconcileAccountAccess } from "./member-access";
import { lockTransaction } from "./transaction-lock";

type ProvisioningContext = { organizationId: string; employeeId: string; actorId: string; actorRole: UserRole; passwordHash: string };

export class EmployeeCredentialsError extends Error {}

// Call only inside the same transaction that creates or accepts membership.
// Existing active/shared accounts must use their own password-change flow.
export async function provisionInitialEmployeePassword(tx: Prisma.TransactionClient, context: ProvisioningContext) {
  if (context.actorRole !== "SUPER_ADMIN" || context.actorId === context.employeeId) {
    throw new EmployeeCredentialsError("Only a super admin can create initial employee credentials.");
  }
  await lockTransaction(tx, context.employeeId);
  const person = await tx.user.findUnique({ where: { id: context.employeeId }, select: {
    id: true, status: true, passwordHash: true, emailVerified: true, authVersion: true,
    organizationMembers: { select: { id: true, organizationId: true, role: true, status: true } },
    _count: { select: { accounts: true, ownedOrganizations: true } },
  } });
  const membership = person?.organizationMembers[0];
  if (!person || person.status !== "INVITED" || person.passwordHash || person._count.accounts || person._count.ownedOrganizations ||
    person.organizationMembers.length !== 1 || !membership || membership.organizationId !== context.organizationId ||
    membership.status !== "INVITED" || !canManageEmployeeRole(context.actorRole, membership.role)) {
    throw new EmployeeCredentialsError("Initial credentials can only be created for a pending employee with no existing login and no other workspace memberships.");
  }
  const now = new Date();
  const updated = await tx.user.updateMany({ where: { id: person.id, status: "INVITED", passwordHash: null, authVersion: person.authVersion }, data: {
    passwordHash: context.passwordHash, status: "ACTIVE", authVersion: { increment: 1 },
    // The authorized administrator approves this account's email identifier
    // directly. No email confirmation or OAuth approval is required in this flow.
    emailVerified: person.emailVerified ?? now,
  } });
  const activated = await tx.organizationMember.updateMany({ where: { id: membership.id, status: "INVITED" }, data: { status: "ACTIVE", joinedAt: now } });
  if (updated.count !== 1 || activated.count !== 1) throw new EmployeeCredentialsError("This employee changed elsewhere. Refresh their profile and try again.");
  await tx.passwordToken.deleteMany({ where: { userId: person.id, consumedAt: null } });
  await reconcileAccountAccess(tx, person.id);
  await tx.authSecurityEvent.create({ data: { userId: person.id, event: "admin_password_provisioned", metadata: { actorId: context.actorId, organizationId: context.organizationId } } });
  await tx.activityLog.create({ data: { organizationId: context.organizationId, actorId: context.actorId, action: "employee.password_provisioned", entityType: "user", entityId: person.id } });
}
