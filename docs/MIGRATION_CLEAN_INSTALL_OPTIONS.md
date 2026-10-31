# TeamFlow Clean-Install Migration Options

**Status:** comparison for owner review only. Deployment history is **UNKNOWN**. Rehearsal is **NOT AUTHORIZED**. This document does not select or implement a migration strategy.

## Evidence reviewed

The existing plan is in `docs/MIGRATION_NEXT_STEPS.md`; source-backed schema notes are in `docs/MIGRATION_REGRESSION_TESTS.md`.

Confirmed from repository SQL and schema:

- `20261014233000_daily_email_reporting` creates `EmailDeliveryStatus`, a legacy-shaped `email_deliveries`, and `email_webhook_events` (`prisma/migrations/20261014233000_daily_email_reporting/migration.sql:3-56`).
- `20261021230000_organization_policy_settings` adds four daily-email settings columns already added by the earlier migration (`migration.sql:26-29` versus `20261014233000_daily_email_reporting/migration.sql:6-10`).
- `20261023130000_daily_email_delivery` creates `EmailDeliveryStatus` and `email_deliveries` again, using the simplified model, and does not guard its `CREATE TYPE` (`prisma/migrations/20261023130000_daily_email_delivery/migration.sql:3-27`).
- The current Prisma model and app use simplified `EmailDelivery` (`prisma/schema.prisma:814-835`).
- Prior local inspection reported 10 migrations applied and 8 pending. That state was not rechecked for this document and does not establish any other environment’s history. Each migration’s deployment status remains **UNKNOWN** until confirmed by its environment owner.

## Why a forward-only migration is not enough for clean installs

Prisma processes pending migrations in order. On an empty database, the earlier legacy email migration and the organization-policy migration run before the later simplified email migration. The policy migration attempts to add columns that the earlier migration already added. Even if that conflict were addressed, the later migration tries to create the enum and table already created by the legacy migration. A corrective migration appended after these files is unreachable if an earlier statement aborts deployment. `IF NOT EXISTS` or a bridge later in the sequence cannot repair an earlier failure retroactively.

For an existing environment, a forward migration may help only if its prior migrations are already recorded as applied and its physical schema is understood. That is not established here. Do not use ledger resolution to skip failed or unapplied migrations merely to reach a bridge.

## Strategy comparison

| Approach | Preserves historical files/checksums? | Fresh-install outcome | Existing-database compatibility | Prerequisites, risks, and approvals |
|---|---|---|---|---|
| **A. Revise the pending historical chain** | No. It changes checksums for edited files. | Can produce one coherent ordered chain if all duplicate operations are corrected and the final schema is agreed. | Safe only if authorized owners prove the exact files were never deployed/applied in every relevant environment; otherwise checksum and history divergence risk. | Requires complete owner evidence for local/shared development, CI, Preview, staging, production, and any other release target; product decisions on webhook retention and rate limiting; migration-lead review of every affected file; approval to revise historical files. Evidence must also explain partial/failed attempts. **Current gate is unmet.** |
| **B1. Append a forward-only bridge to the existing chain** | Yes. | **Does not work by itself.** The clean install fails earlier, before reaching the appended migration. | Could be considered for a specific existing environment only after its ledger and physical schema show the earlier chain is complete and the bridge is appropriate. | Requires per-environment ledger and catalog evidence, product decisions, and a separate compatibility design. Never treat it as a clean-install fix. |
| **B2. Preserve the historical path for existing environments and establish a separate clean baseline/path** | Yes, for the historical path. A new baseline or clean path has its own artifact/history. | Potentially, if the clean baseline creates the canonical schema without executing the conflicting legacy sequence and future changes converge correctly. | Existing environments continue under their verified historical path; new installations use the separately governed path. | Requires Prisma-specific design and proof of how migration directories/configuration, migration ledger records, future migrations, and drift checks remain coherent. Main risks are split histories, double maintenance, accidental use of the wrong path, and divergence between clean and upgraded schemas. Requires Prisma/migration owner, database owner, release owner, and product/security approvals. **Not designed or validated.** |
| **B3. Skip or mark conflicting migrations as applied to reach later files** | Files may remain unchanged, but ledger no longer proves what physically ran. | Could appear to bypass the failure, but creates a history that can misrepresent actual DDL. | May conceal drift or partial application. | Rejected as a default strategy. `migrate resolve` or fabricated ledger records are not a substitute for an approved baseline/compatibility design. Would require an explicit, independently reviewed recovery procedure if ever considered. |

**Recommendation while history is UNKNOWN:** preserve all historical files and checksums. Compare Option A only after owners provide authoritative evidence that every relevant environment has never applied the exact migrations. Otherwise, investigate B2 as a design candidate; do not assume it is supported or safe until its Prisma behavior and operational controls are reviewed. No approach is approved by this comparison.

## Existing-database assessment plan

Do not inspect or change a live database as part of this document. For a future separately approved assessment:

1. Obtain owner-provided migration names, checksums, timestamps, applied-step counts, and failed/in-progress/rolled-back records for each environment. Mark unavailable histories **UNKNOWN**.
2. Compare ledger claims with a read-only physical catalog inventory. Record which objects exist and which migration records claim to have created them; do not infer one from the other.
3. Classify each environment as complete, pending, failed/partial, drifted, or unknown. A failed/partial or contradictory state stops automatic migration planning.
4. If approved later, use a newly named disposable restore of the verified backup to assess drift and preserve email-delivery row identifiers/counts. Use a different newly named disposable target for any clean-install exercise. Never use `teamflow` or `teamflow_rehearsal_20261028`.
5. Design any forward compatibility changes against the observed, approved disposable state while preserving existing migration checksums and data. Do not mark migrations applied to make a ledger match the catalog.

## Decisions still required

- **Deployment owners:** Which migrations were applied in each existing environment? Provide names, checksums, timestamps, applied-step counts, and failed/in-progress state. All eight migrations remain **UNKNOWN** for every environment not covered by complete authoritative evidence.
- **Product owner:** Is legacy email webhook archival/replay required? The simplified `EmailDelivery` model remains the application canonical model unless an approved requirement changes that decision.
- **Product/security owners:** Is distributed database-backed rate limiting through `rate_limit_buckets` required? The table is not used by current application/schema code; do not add it solely because it appears in historical SQL.
- **Migration/Prisma owners:** If history is deployed or remains unknown, what separately governed clean-install baseline/path can preserve existing ledger continuity and guarantee future schema convergence? This is unresolved.

## Approval gates

### Before choosing/designing a strategy

- [ ] Environment inventory and owner contacts are complete; every unverified history remains **UNKNOWN**.
- [ ] Migration metadata and checksums have been reviewed by the authorized owners.
- [ ] Email webhook retention/replay and distributed rate-limiting decisions are recorded.
- [ ] Option A’s non-deployment prerequisite is proved, or Option B’s baseline/compatibility design is written with clean-install and existing-environment behavior documented.
- [ ] Data preservation, rollback, future migration governance, and ledger rules are reviewed.

### Before any disposable-database rehearsal

- [ ] A separate execution approval names the two new disposable targets and explicitly authorizes their creation/restore.
- [ ] Backup provenance and checksum, cluster identity, target database names, schema, and target emptiness are verified.
- [ ] A fail-closed wrapper prevents direct unguarded Prisma migration commands; the current `prisma.config.ts` fallback to `teamflow` is not accepted as a rehearsal target.
- [ ] Exact restore/test commands, acceptance criteria, credential-redacted logs, stop conditions, rollback, and cleanup are reviewed.
- [ ] Both protected databases are explicitly excluded from every connection/command configuration.

Planning approval does not authorize creating databases or restoring a backup. Execution approval is separate. Until then, rehearsal remains **NOT AUTHORIZED** and no migration/restore commands should be run.

## Current stop conditions

- Deployment history remains **UNKNOWN**; no historical migration may be revised on that basis.
- The current chain is not a safe clean-install path as written.
- No clean-install strategy has been chosen or validated.
- No database, migration, schema, package-script, or application change is authorized by this comparison.
