# Local development administrator bootstrap

This is a one-time recovery procedure for a local development database only. It is not a public endpoint and must never be run against shared or production data.

Before running it, the operator must independently verify a written approval from the existing organization owner or other authorized project operator that names both the exact Google identity and organization. Put the traceable approval record (for example, an approved internal ticket ID) in `--approval-reference`. An email match by itself is not authorization. If that approval cannot be verified, stop and ask the organization owner/project operator to approve the mapping first.

The target must already have signed into TeamFlow through Google so that Auth.js has linked the Google provider account and verified the email. This utility will not create a user, link or replace a provider account, change organization ownership, or modify an existing organization membership. It requires `NODE_ENV=development` and a PostgreSQL `DATABASE_URL` pointing to `localhost`, `127.0.0.1`, or `::1`; it rejects hosted/CI environments. It prints the proposed mapping and then requires the operator to type the exact email and existing organization slug before making any changes.

First inspect the local database and approval record without printing credentials. For the seeded development organization, the slug is `northstar-studio` (Northstar Studio); do not assume that this is the intended organization without authorization.

Run only after approval and identity verification:

```sh
NODE_ENV=development npm run admin:bootstrap -- \
  --email <verified-google-email> \
  --organization <existing-organization-slug> \
  --approval-reference <approved-record-id>
```

The user role, active organization membership, derived account access, and `ActivityLog` audit event are committed in a single Prisma transaction. The audit ID is deterministic for the approved user, organization, and approval reference. Re-running the exact successful operation is a no-op; an existing conflicting membership, audit, user state, or provider mapping is rejected for manual review.

After the operation, sign in via Google and verify `/dashboard`, Dashboard → Employees, and organization-scoped access. This script does not perform OAuth login or create a Google provider link.
