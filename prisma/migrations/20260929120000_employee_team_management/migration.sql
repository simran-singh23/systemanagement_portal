-- Add department as an organization-specific employee attribute.
ALTER TABLE "organization_members" ADD COLUMN "department" TEXT;

CREATE INDEX "organization_members_organization_id_department_idx"
ON "organization_members"("organization_id", "department");
