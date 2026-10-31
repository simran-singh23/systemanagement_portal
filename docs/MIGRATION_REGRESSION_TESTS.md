# Migration Regression Tests

## Phase 1 scope

The `test:migration:static` command runs only the two Node built-in unit suites under `tests/unit/`. Those tests use fixture objects and pure functions in `tests/helpers/migration-safety.ts`. They do not import Prisma, `pg`, application database modules, load environment files, or open network connections. This phase deliberately adds no migration runner or database integration test.

Run the static checks with:

```sh
npm run test:migration:static
```

The test-database URL validator is a safety preflight only. It is not a database connection check, does not prove that a database is empty, and must not be treated as authorization to run migrations. Any future database test must use a separately approved runner that validates its target before starting Prisma or another database client.

The helper permits only one URL query parameter, `schema=public`, and returns host/port/database/schema metadata without credentials. It does not attempt a network or database check.

## Safety boundaries

- Never target `teamflow` or `teamflow_rehearsal_20261028`.
- A future disposable test database must have a unique name matching `teamflow_migration_test_<unique-suffix>`, use a PostgreSQL loopback address, port `5432`, and schema `public`.
- Do not take a target from the default Prisma config or inherited `DATABASE_URL`/`DIRECT_URL`. A future runner must require an explicit test target, validate it before loading any Prisma CLI/client code, reject protected names, and bind all database URL inputs it uses to that one validated target. It must also perform a read-only identity/emptiness preflight before any write-capable command.
- `test:migration:static` is the only migration-related test command added in Phase 1. Existing integration and Prisma scripts are not migration safeguards; this phase does not run or wrap them.
- No test may infer remote deployment history from local Git, the local migration directory, or a local `_prisma_migrations` ledger.

## Current migration blockers

Previously reviewed local findings are: 10 migrations recorded as applied, 8 pending, and no failed migration recorded in the inspected local database. Physical schema objects overlap with pending migration work. These are local observations only; deployment history in any shared development, staging, Preview, or Production environment remains **UNKNOWN** until verified by its owner.

The eight pending migrations are:

1. `20261014233000_daily_email_reporting`
2. `20261021200000_analytics_indexes`
3. `20261021230000_organization_policy_settings`
4. `20261022090000_global_search_indexes`
5. `20261022160000_production_hardening`
6. `20261023120000_ai_insights`
7. `20261023130000_daily_email_delivery`
8. `20261023150000_password_auth`

Known migration-specific requirements and evidence (repository inspection only; this is not proof of database state or deployment):

| Requirement | Definition established by repository evidence | Source and representation | Verification plan / gap |
|---|---|---|---|
| Organization-policy CHECKs (5) | `organization_settings_daily_minutes_check`: `expected_daily_minutes BETWEEN 60 AND 1440`; `organization_settings_half_day_check`: `half_day_threshold_mins BETWEEN 30 AND 720 AND half_day_threshold_mins < expected_daily_minutes`; `organization_settings_grace_check`: `late_grace_mins BETWEEN 0 AND 180`; `organization_settings_break_minutes_check`: `max_break_mins IS NULL OR max_break_mins BETWEEN 5 AND 480`; `organization_settings_notice_days_check`: `leave_advance_notice_days BETWEEN 0 AND 365`. | SQL: `prisma/migrations/20261021230000_organization_policy_settings/migration.sql:31-36`. The settings Zod schema uses the same limits in `actions/settings.actions.ts:35-48`, with the half-day relation at line 104. Prisma has the fields/defaults at `prisma/schema.prisma:717-769`, but does not declare these CHECKs. | Exact migration definitions and application limits agree. A future catalog adapter should assert the five names, normalized definitions and `validated: true`. No live database validation status was inspected. |
| AI CHECKs (5) | `organization_settings_ai_request_limit_check`: `ai_monthly_request_limit BETWEEN 1 AND 5000`; `organization_settings_ai_token_limit_check`: `ai_monthly_token_limit BETWEEN 1000 AND 50000000`; `organization_settings_ai_context_check`: `ai_context_max_chars BETWEEN 4000 AND 50000`; `organization_settings_ai_retention_check`: `ai_retention_days BETWEEN 1 AND 90`; `ai_generations_usage_nonnegative`: each of `input_tokens`, `output_tokens`, `total_tokens` is `>= 0`. | SQL: `prisma/migrations/20261023120000_ai_insights/migration.sql:16-19, 39-40`. The four settings bounds agree with `actions/settings.actions.ts:51-54`; the fields are in `prisma/schema.prisma:766-769, 838-856`. The nonnegative rule is migration-only; Prisma does not express it. | Assert all five exact SQL definitions and explicit validation. Product confirmation is still prudent for changing the configured limits; no contrary repository limit was found. The nonnegative rule has no separately located application validator. |
| Analytics indexes (3) | B-tree `(tasks.organization_id, tasks.created_at)`, B-tree `(tasks.organization_id, tasks.completed_at)`, B-tree `(daily_reports.organization_id, daily_reports.submitted_at)`. | `prisma/migrations/20261021200000_analytics_indexes/migration.sql:1-3`. The analytics query implementation is in `lib/analytics/queries.ts`; Prisma models declare corresponding fields, with index declarations not fully represented for all three. | Exact intended migration definitions are known. Add exact index signature checks (including valid status); compare against other Prisma-declared indexes before any migration design. Physical existence is unverified here. |
| Global-search indexes and extension (8 indexes) | `pg_trgm`; GIN `gin_trgm_ops` on `users.name`, `users.email`, `teams.name`, `tasks.title`, `tasks.description`, `daily_reports.summary`; the task title/description indexes have predicate `archived_at IS NULL`. Plus B-tree `(organization_members.organization_id, status, user_id)` and `(leave_requests.organization_id, user_id, created_at DESC)`. | `prisma/migrations/20261022090000_global_search_indexes/migration.sql:4-14`. `lib/search/global-search.ts:35-43` contains case-insensitive `contains` searches for employee name/email, team name, task title/description, and daily-report summary; it also searches job title/department and other relations not covered by these trigram indexes. Prisma does not represent `pg_trgm` or these raw GIN definitions. | Migration SQL establishes exact index intent. Add exact checks for extension, method, opclass, direction and partial predicates. The migration does not add trigram indexes for every search branch; whether those are needed is a performance/product decision, not an established requirement. Creating `pg_trgm` may require elevated database privileges. |
| Email delivery | The current simplified Prisma `EmailDelivery` model is canonical for application behavior: no `recipient_user_id`, `delivery_key`, `last_attempt_at`, or webhook-event model. | `prisma/schema.prisma:814-835`; legacy migration `20261014233000_daily_email_reporting/migration.sql:3-56`; later simplified migration `20261023130000_daily_email_delivery/migration.sql:1-27`. Application usage is in the email reporting code and Prisma model. | The first migration creates conflicting enum/table/columns, including `EmailType`, recipient-user and delivery-key fields, plus `email_webhook_events`. The later migration creates the simplified table but repeats `CREATE TYPE EmailDeliveryStatus` (line 3, without `IF NOT EXISTS`). Preserve the simplified model. Whether webhook-event archival/replay is a product requirement remains unconfirmed; do not silently discard existing data. |
| Password authentication | `password_hash`, `auth_version`; `PasswordTokenPurpose`; `password_tokens`, `auth_rate_limits`, `auth_security_events`; declared indexes and foreign keys. | `prisma/migrations/20261023150000_password_auth/migration.sql:2-46` and Prisma models/schema. | Schema intent is established. Rehearsal should verify fields/defaults, PKs, unique token hash, supporting indexes and both FKs, plus ledger/checksum. No database was inspected in this task. |
| `rate_limit_buckets` | One pending hardening migration creates this table, unique `(scope,key_hash,window_start)` index and `expires_at` index. Current search rate limiting is process-local; no active application/schema reference was found. | `prisma/migrations/20261022160000_production_hardening/migration.sql:1-16`; `lib/search/rate-limit.ts`; `docs/PRODUCTION_READINESS.md:31`. | Keep out of scope unless the product/security owner establishes a current requirement for distributed database-backed rate limiting. Deployment history is not inferred from lack of code references. |

Historical SQL establishes what these files would do; it does not prove they were executed. Migration 20261021230000 also adds daily-email settings already added by the earlier legacy email migration (lines 26-29 versus 20261014233000 lines 6-10), and the two email migrations conflict on `EmailDeliveryStatus` and `email_deliveries`. These are chain blockers, not instructions to edit or execute the files.

The static catalog fixture covers repository-backed simplified email columns, selected SQL types/nullability/defaults and PKs, required enum values, unique `users.email`, password-auth objects, the ten source-backed policy/AI CHECK signatures, and Prisma-declared task/email/auth/AI signatures. Signature matching requires exactly one candidate per table/key-column-set identity for indexes, table/source-column-set identity for FKs, and table/referenced-column-set identity for CHECK constraints; duplicate candidates fail closed. Indexes require `valid: true`; constraints and FKs require `validated: true`. Unsupported SQL constructs, including comments and dollar-quoted strings, fail comparison even when raw text is identical. Fixtures are not physical catalog observations. Exact PostgreSQL catalog rendering of custom enum/default expressions still needs an adapter contract before database-backed tests; a future catalog reader must supply each CHECK constraint's table and referenced columns as well as its definition and validation state.

The historical migrations must remain unchanged while deployment history is unknown. Do not mark migrations as applied to make the ledger match physical objects.

The static fixtures test verification logic; they do not establish that the existing migration chain is executable. Database-backed regression tests are blocked until migration reconciliation and a disposable target are separately approved.

## Future test plan

After reconciliation is approved, a later phase may add read-only catalog inspection and migration rehearsal tests for both (a) a newly restored copy of the schema-drifted backup and (b) a clean database built from the approved chain. Both targets must be new, disposable, uniquely named databases. Never reuse either protected database above.

Catalog acceptance should verify required enum labels; exact CHECK/index/foreign-key definitions and validation/validity; required extensions; simplified email-delivery tables/columns/indexes/FKs; analytics and search indexes; password-auth columns/tables/indexes/FKs; and migration ledger names, checksums, applied-step counts, and failed/in-progress status. Include negative fixtures or isolated test cases that demonstrate a missing or wrongly defined object is rejected. Compare email-delivery row counts and stable row identifiers before and after a drifted-path rehearsal, and verify representative field values without printing personal data.

Do not treat Prisma's migration ledger as a substitute for physical catalog inspection. Record the Prisma migration name, checksum, started/finished/rolled-back timestamps, and applied-step count from each relevant environment owner. A migration history that cannot be obtained remains unknown, not evidence that a migration was never deployed.

## Approval gates before any database-backed work

1. Environment owners provide verifiable migration metadata for each relevant shared development, staging, Preview, and Production database. If an environment is inaccessible, record its history as unknown.
2. Product/security owners confirm the canonical email-delivery model and whether distributed rate limiting is required.
3. The migration strategy supports both the restored schema-drifted path and a clean installation without falsifying migration history.
4. A verified backup is retained; a newly named disposable database is approved and its cluster, database name, schema, and emptiness are checked before any restore or migration command.
5. The regression suite and rollback/data-preservation criteria are reviewed. Approval for a rehearsal does not authorize changes to `teamflow` or `teamflow_rehearsal_20261028`.

Until these gates are met, run only `npm run test:migration:static`; do not execute Prisma migration commands or migration SQL.
