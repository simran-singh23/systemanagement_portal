import type { Prisma } from "@prisma/client";

export function reportRecipientWhere(organizationId: string): Prisma.UserWhereInput {
  return {
    status: "ACTIVE",
    emailVerified: { not: null },
    OR: [
      { ownedOrganizations: { some: { id: organizationId } }, role: "SUPER_ADMIN" },
      { organizationMembers: { some: { organizationId, status: "ACTIVE", role: { in: ["SUPER_ADMIN", "PRODUCT_MANAGER"] } } } },
    ],
  };
}
