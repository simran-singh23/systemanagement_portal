/**
 * Password setup and first OAuth sign-in are account-level operations. Until
 * invitations carry an organization-scoped acceptance token, activate access
 * only when the account has exactly one pending membership.
 */
export function singlePendingInvitationId(memberships: readonly { id: string }[]) {
  return memberships.length === 1 ? memberships[0]!.id : null;
}
