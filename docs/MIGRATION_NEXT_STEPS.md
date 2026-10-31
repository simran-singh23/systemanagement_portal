# TeamFlow Migration Next Steps

**Purpose:** owner decisions and an ordered path to a safe migration strategy. This document authorizes no database access or rehearsal.

## Current status

- **Deployment history: UNKNOWN** for every environment and all eight migrations listed below. Prior local inspection reported 10 applied and 8 pending, but that ledger was not rechecked for this plan and does not establish any shared or deployed history.
- **Rehearsal: NOT AUTHORIZED.** Neither `teamflow` nor `teamflow_rehearsal_20261028` may be used.
- **Historical migration files: frozen** until deployment-history evidence is confirmed by the relevant owners.
- The current application and Prisma schema use the simplified `EmailDelivery` model. Do not change it based only on legacy SQL.

## Confirmed problems from repository sources

1. `20261014233000_daily_email_reporting` creates `EmailDeliveryStatus` and `email_deliveries` using a legacy model (`recipient_user_id`, `delivery_key`, and other legacy fields) and creates `email_webhook_events`. See `prisma/migrations/20261014233000_daily_email_reporting/migration.sql:3-56`.
2. `20261023130000_daily_email_delivery` creates `EmailDeliveryStatus` again and creates `email_deliveries` again using the simplified model. Its `CREATE TYPE` is not guarded by `IF NOT EXISTS`. See `prisma/migrations/20261023130000_daily_email_delivery/migration.sql:3-27`.
3. `20261021230000_organization_policy_settings` adds `daily_email_enabled`, `daily_email_time`, `primary_report_recipient_id`, and `additional_report_recipient_ids`, which the older email migration already adds. See `20261021230000_organization_policy_settings/migration.sql:26-29` and `20261014233000_daily_email_reporting/migration.sql:6-10`.
4. These ordered conflicts mean the current chain cannot safely run from empty: the policy migration attempts duplicate columns, and the later email-delivery migration attempts duplicate enum/table creation. A forward migration appended after these files cannot repair a clean-install failure that occurs before it is reached.

Other pending migrations define analytics indexes, policy CHECK constraints, global-search indexes and `pg_trgm`, AI objects/CHECK constraints, `rate_limit_buckets`, and password-auth objects. Their exact source-defined requirements and current application relationship are recorded in `docs/MIGRATION_REGRESSION_TESTS.md`. Physical existence and deployed status are not established by those SQL files.

## Migration-command guard prerequisite

Current `package.json:23-25` exposes direct `db:migrate`, `db:deploy`, and `db:seed` commands. `prisma.config.ts:1-14` loads dotenv and falls back to a URL targeting the protected `teamflow` database if direct and runtime URLs are absent. Do not run these commands. Before any future rehearsal, a separately reviewed guard must reject direct unguarded invocation and ensure the explicitly approved disposable target is the sole target used by the Prisma process. Do not rely on a URL validator alone as proof of database identity or emptiness.

## Owner decisions and evidence

### Deployment history — deployment/database owners

For each environment that exists—local/shared development, CI, Preview, staging, and production—provide a non-secret export or reviewable record containing:

- Migration name and checksum for each migration.
- Applied timestamp and applied-step count.
- Failed, rolled-back, or in-progress migration state.
- Environment identity and the authorized owner who confirmed it.

The eight migrations requiring a status are:

| Migration | Status |
|---|---|
| `20261014233000_daily_email_reporting` | UNKNOWN |
| `20261021200000_analytics_indexes` | UNKNOWN |
| `20261021230000_organization_policy_settings` | UNKNOWN |
| `20261022090000_global_search_indexes` | UNKNOWN |
| `20261022160000_production_hardening` | UNKNOWN |
| `20261023120000_ai_insights` | UNKNOWN |
| `20261023130000_daily_email_delivery` | UNKNOWN |
| `20261023150000_password_auth` | UNKNOWN |

If an environment is inaccessible or its evidence is incomplete, leave its history **UNKNOWN**. No remote service is to be queried as part of this plan. The local CI workflow definition references a temporary `teamflow_test` database and `db:deploy`, but a workflow file is not evidence that a run occurred. Deployment documentation is likewise not proof of database history.

**Option A prerequisite:** to establish “never deployed,” authorized owners must account for every relevant environment and release path, confirm the exact migration filenames and checksums were never applied, and explain any failed/partial attempts. Missing records do not satisfy this gate.

### Email behavior — product owner

Confirm whether webhook-event archival/replay is an active product requirement. The app's simplified `EmailDelivery` model remains canonical unless the owner documents a requirement and approves a data-preserving design. Do not silently discard legacy event data if any exists.

Decision: `UNRESOLVED` — owner: __________

### Distributed rate limiting — product/security owners

Confirm whether shared database-backed counters through `rate_limit_buckets` are required for a current deployment architecture. The current search limiter is process-local and has no active reference to that table. Do not add the table solely because it appears in a migration.

Decision: `UNRESOLVED` — owners: __________

## Clean-install strategy options

### Option A — revise pending historical files

Only consider after the deployment owners meet the all-environment “never deployed” evidence gate above. A reviewed revision could align the pending chain with the canonical simplified email model, remove duplicate column/type/table creation, and retain only owner-approved objects. It must also decide whether the legacy webhook table and `rate_limit_buckets` are requirements.

**Risk:** if even one environment applied an edited migration, its stored checksum and history diverge from the repository. Fresh-install success alone does not make this safe.

### Option B — preserve historical files and design a compatibility path

Keep all historical SQL and checksums unchanged while history is unknown. Design an environment-aware path for existing databases, plus a clean-install path that does not execute into the known earlier failure. A forward-only migration by itself is insufficient: Prisma applies ordered pending migrations, so a later bridge cannot be reached if an earlier migration fails.

Potential separate baselining or migration-directory strategies would create history/operations complexity and need their own Prisma-specific design, ledger rules, future migration policy, and owner approval. Do not choose a history rewrite, baseline, `migrate resolve`, or branch-specific chain in this document.

**Recommendation:** preserve history (Option B) now; the exact compatibility and clean-install mechanism remains **UNRESOLVED** until owners supply deployment evidence and approve a design. Do not run the current chain as-is.

## Existing-database assessment strategy

Do not inspect or change either protected database for this work. After separate approval, compare a newly restored disposable copy against its ledger and physical catalog using read-only evidence first. Assess migration names/checksums/status; tables/columns/types/defaults; enum labels; CHECK definitions and validation; index definitions and validity; extensions; FKs; and email-delivery row identifiers/counts. Distinguish objects physically present from migrations recorded as applied. Never use `migrate resolve` merely to make the ledger match physical objects.

Do not infer that objects or migrations are present in any current database from schema files, migration SQL, CI configuration, or the earlier local audit.

## Ordered owner action checklist

| Order | Responsible owner | Required evidence/action | Expected outcome | Stop condition |
|---|---|---|---|---|
| 1 | Project owner | Name an owner for each environment that exists: local/shared dev, CI, Preview, staging, production. Include deployment/release systems that may apply migrations. | Complete environment inventory; inaccessible environments explicitly marked unknown. | Stop Option A assessment if an environment or owner is missing. |
| 2 | Each environment/database owner | Supply migration names, checksums, timestamps, applied-step counts, and failed/in-progress/rolled-back records for all eight files. | Per-environment verified history, or `UNKNOWN` with a reason. | Do not edit historical migrations while any relevant history is unknown. |
| 3 | Product owner | Decide whether webhook archival/replay is required; confirm simplified `EmailDelivery` remains canonical absent that requirement. | Written email data/model requirement. | Stop email migration design if decision is unresolved or existing data-retention needs are unclear. |
| 4 | Product/security owners | Decide whether distributed database-backed rate limiting is required. | Written scope for `rate_limit_buckets`. | Stop production-hardening migration design if the requirement is unresolved. |
| 5 | Migration lead + database owner | Reconcile the owner evidence with repository migration checksums, known duplicate operations, and schema requirements. Do not query databases as part of this plan. | A reviewed assessment of deployed, never-deployed, partial, and unknown histories. | Stop if checksums conflict, partial migrations exist, or sources disagree. |
| 6 | Migration lead + Prisma/application owners | Compare Option A and B against that evidence. Specify how a fresh install avoids earlier chain failures and how deployed environments preserve ledger continuity. | Written strategy, compatibility matrix, migration/data/rollback plan, and acceptance checks. | Stop if the strategy depends on an unapproved history rewrite, false ledger entry, or untested clean-install bypass. |
| 7 | Product/security, database, and project owners | Approve the design and separately review a target-specific rehearsal plan. This is planning approval only. | Authorization to prepare execution details; no database mutation yet. | Do not create or restore databases based on planning approval alone. |
| 8 | Authorized operator + database owner | After a separate explicit execution approval, verify backup provenance/checksum and two new, unique disposable targets; validate cluster/database/schema/emptiness; review exact commands and guard. | Two approved isolated targets: restored-drift path and clean-install path. | Stop on existing/nonempty target, wrong cluster, guard failure, unknown identity, or any migration conflict. Never auto-retry elsewhere. |
| 9 | Authorized rehearsal operator | Execute only the approved wrapper on those targets; record redacted output, catalog/ledger checks, email-record preservation, rollback and cleanup results. | Reviewed evidence for both paths or a stop report. | Any unexpected drift, failure, or record loss halts the rehearsal. No access to protected databases. |

## Approval gates

**Planning approval (needed before finalizing the rehearsal design):** environment owners identified; evidence collected or unknowns explicitly accepted; product email and rate-limit decisions recorded; Option A/B risks and a clean-install path reviewed.

**Execution approval (separate, explicit approval required):** exact backup/checksum, two disposable database names, cluster and URL targets, guard/wrapper, restore and migration commands, expected catalog/ledger checks, stop conditions, rollback, and cleanup have been reviewed. Approval must explicitly authorize creating/restoring those named databases. It does not authorize changes to `teamflow` or `teamflow_rehearsal_20261028`.

Until both gates are satisfied, rehearsal status stays **NOT AUTHORIZED**. Do not run Prisma migrations, `db push`, reset, seed, resolve, restore, or database tests.
