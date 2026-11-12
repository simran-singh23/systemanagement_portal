# Database migration and recovery plan

Status: **fresh showcase database recommended; existing database upgrade is not approved or rehearsed**.

## Current repository evidence

- The committed clean-install chain contains 19 PostgreSQL migrations.
- A previous local disposable backup/restore rehearsal passed for the schema and fixture records noted in `docs/LOCAL_LAUNCH_REVIEW.md`. This is local evidence only; it does not establish hosted backup recovery.
- The historical migration `20261014233000_daily_email_reporting` was repaired locally. An existing database that applied another version may have a checksum/schema mismatch. Compare its actual `_prisma_migrations` ledger before deciding to upgrade.
- The later `20261031100000_email_retry_payload` migration adds `email_deliveries.request_payload`; deployments using the current code need that migration applied.
- `prisma migrate deploy` applies pending migrations but does not detect schema drift. Never use `migrate reset`, `db push`, delete ledger rows, or mark a migration applied to conceal a mismatch.

## Recommended portfolio path

Start with a **new, dedicated showcase database**. Keep Preview and Production separate. Apply the committed migrations to the empty target, run the guarded fictional demo initializer once, validate role workflows, and document how demo data will be reset. Do not copy local/test data or employee information into the showcase.

## Existing-data upgrade path, if later required

1. Obtain owner approval and a consistent backup of the exact target database.
2. On a restricted operator machine, compare the target migration names/checksums and schema with this checkout; record the result without changing the database.
3. Restore the backup into an isolated database and test the planned forward-only migrations there.
4. Compare representative row counts, important account/membership records, constraints, indexes, and application workflows after migration.
5. Rehearse restoring the original backup and record elapsed time and recovery point. Do not infer production RTO/RPO from the existing local rehearsal.
6. For an approved maintenance window, take a final backup, apply the same reviewed migrations, run smoke checks, and keep the previous application/schema compatibility plan available.

## Recovery baseline to decide with the database owner

- Automated backups plus point-in-time recovery where the selected provider supports it.
- Proposed minimum retention from `DEPLOYMENT.md`: 7 days for Preview and 30 days for Production, subject to account policy and cost.
- Monthly restore rehearsal into an isolated target. Capture backup identifier, timestamp, migration version, row/integrity checks, operator, elapsed time, and cleanup.
- Name the database owner and incident contact; set approved recovery point and recovery time objectives after a measured hosted rehearsal.
- During an incident, freeze writes/automations, preserve evidence, restore to an isolated database, validate, rotate affected credentials if needed, smoke-test Preview, then obtain release approval before repointing Production.

## One-time fictional demo initialization

`npm run db:demo-init -- --initialize-demo` reuses the fictional showcase fixture only when `NODE_ENV=production` or `VERCEL_ENV=production`, requires `DEMO_INITIALIZER_CONFIRM=CREATE_FICTIONAL_DEMO_ON_EMPTY_DATABASE`, requires a password from `DEMO_ACCOUNT_PASSWORD`, and refuses to write if any users or organizations already exist. The ordinary `npm run db:seed` remains blocked in production. Never put the password in Git or print it in logs.

The shared password intentionally lets an operator provide a single demo credential for the fictional accounts. Decide how those credentials are disclosed and how the demo database is reset before public access. The initializer has not been run against any hosted database.
