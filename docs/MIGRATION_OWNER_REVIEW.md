# TeamFlow Migration Owner Review

**Purpose:** consolidate the owner evidence, decisions, and approvals required before choosing a migration strategy. This is a read-only decision package, not authorization to change migrations or rehearse against a database.

## Current status

- **Deployment history: UNKNOWN** for all eight migrations and every environment not covered by authoritative owner evidence.
- **Rehearsal: NOT AUTHORIZED.** `teamflow` and `teamflow_rehearsal_20261028` are protected and excluded.
- **Historical migration files: unchanged until deployment history is verified.** Do not infer non-deployment from missing Git history, remotes, CI logs, or migration records.
- Prior local inspection reported 10 applied and 8 pending; it was not rechecked for this document and does not establish other environments' status.

## Verified conflicts and unresolved technical risks

### Verified from repository sources

1. `20261014233000_daily_email_reporting` creates `EmailDeliveryStatus`, a legacy-shaped `email_deliveries` table (including `recipient_user_id` and `delivery_key`), and `email_webhook_events`.
2. `20261021230000_organization_policy_settings` adds four daily-email settings columns already added by the earlier email migration: `daily_email_enabled`, `daily_email_time`, `primary_report_recipient_id`, and `additional_report_recipient_ids`.
3. `20261023130000_daily_email_delivery` creates `EmailDeliveryStatus` and `email_deliveries` again using the simplified shape. Its `CREATE TYPE` is not guarded with `IF NOT EXISTS`.
4. The current Prisma/application model is the simplified `EmailDelivery`. A forward migration after these files cannot repair an earlier failure during a clean install because the ordered migration process stops before reaching that later migration.
5. `package.json` exposes direct migration commands, and `prisma.config.ts` loads dotenv and falls back to `teamflow`. A future rehearsal needs a separately reviewed guard against direct unguarded invocation and accidental protected-target fallback.

### Still unknown or unresolved

- Whether any of the eight migrations have been deployed, partially applied, or failed in any environment.
- Whether physical schema objects match their ledger records in any current database. The prior audit observed drift locally; it is not a current recheck or evidence about other environments.
- Whether webhook-event archival/replay is a product requirement and whether any existing data must be retained.
- Whether distributed database-backed rate limiting via `rate_limit_buckets` is required. Current application code uses a process-local search limiter and does not use that table.
- How a separately governed clean-install path could coexist with deployed migration history and future Prisma migration operations.
- Any physical catalog validation, backup provenance/checksum, and data-preservation results for a future rehearsal.

## Deployment-history evidence owners must provide

For each environment that exists, the responsible owner should provide a non-secret, reviewable migration record with:

- Environment identity and confirming owner.
- Migration names and checksums.
- Applied timestamps and applied-step counts.
- Failed, rolled-back, and in-progress migration records, including partial attempts.
- Any release/deployment record needed to cover migrations applied outside the normal CI path.

Environments to inventory: local/shared development, CI (including ephemeral database jobs), Preview, staging, production, and any other environment or release path that could have run migrations. If inaccessible or incompletely documented, mark its history **UNKNOWN**.

| Migration | Deployment status |
|---|---|
| `20261014233000_daily_email_reporting` | UNKNOWN |
| `20261021200000_analytics_indexes` | UNKNOWN |
| `20261021230000_organization_policy_settings` | UNKNOWN |
| `20261022090000_global_search_indexes` | UNKNOWN |
| `20261022160000_production_hardening` | UNKNOWN |
| `20261023120000_ai_insights` | UNKNOWN |
| `20261023130000_daily_email_delivery` | UNKNOWN |
| `20261023150000_password_auth` | UNKNOWN |

To establish “never deployed” for Option A, evidence must cover **every** relevant environment and release path, identify the exact migration versions/checksums, and account for failed or partial attempts. Missing evidence is not proof of non-deployment.

## Owner decisions required

### Deployment/database owners

- Which environments exist, who owns each, and which release paths can apply migrations?
- What are the migration names, checksums, timestamps, applied-step counts, and failed/in-progress/rolled-back records for each environment?
- Can the owners confirm the evidence covers every relevant target and any CI or manual deployment path?
- If a database is inaccessible or evidence conflicts, can its status remain explicitly **UNKNOWN** until resolved?

### Product owner

- Is legacy email webhook-event archival or replay an active requirement?
- If yes, what retention, lookup, and data-preservation behavior is required?
- Confirm that the simplified `EmailDelivery` model remains canonical unless an approved product requirement changes that decision.

### Product/security owners

- Is distributed database-backed rate limiting required for an identified deployment topology?
- If yes, what scopes, retention/expiry, throughput, and failure behavior are required for `rate_limit_buckets`?
- If no, confirm that this object remains out of scope rather than being retained solely because a migration contains it.

### Migration/Prisma owners

- If history is deployed or remains unknown, what clean-install baseline/path can avoid the earlier failure while preserving existing ledgers and ensuring future schema convergence?
- How will future migrations be authored and applied across existing and fresh installations without maintaining conflicting paths or falsifying ledger state?
- What catalog, data-preservation, rollback, and release acceptance criteria will prove the design works?

## Strategy comparison — no strategy selected

| Strategy | Historical files/checksums | Fresh installation | Existing databases | Main prerequisite and risk |
|---|---|---|---|---|
| **A. Revise pending historical migrations** | Changes checksums for edited files. | Could create one coherent ordered chain if duplicate enum/table/column operations are corrected and final product requirements are settled. | Acceptable only if owners prove these exact files were never applied in any relevant environment. | Requires complete authoritative non-deployment evidence and approval to revise history. If any environment applied an edited file, checksum/history divergence results. Current prerequisite is unmet. |
| **B1. Append a forward-only bridge** | Preserves historical files/checksums. | Does not fix the current clean-install path: execution can fail earlier and never reach the bridge. | Could be evaluated only for an environment whose ledger and physical schema are understood and whose prior chain is complete. | Requires per-environment history and catalog evidence. Not a clean-install solution by itself. |
| **B2. Preserve existing history and design a separate clean baseline/path** | Preserves the existing historical path; the new path has its own artifact and operational rules. | Potentially succeeds if the baseline produces the canonical schema without executing the conflicting legacy sequence. | Existing environments follow their verified history; fresh installations use the separately governed path. | Requires Prisma-specific proof for migration-directory/config selection, ledger continuity, future migration governance, and convergence. Risks include split histories, double maintenance, wrong-path use, and schema divergence. Not designed or validated. |
| **B3. Skip or mark conflicting migrations applied** | Files can remain unchanged, but ledger records may no longer represent executed SQL. | May appear to bypass failure while creating misleading history. | Can conceal drift or partial application. | Not an acceptable default. Ledger resolution is not a substitute for a reviewed baseline or compatibility design. |

A forward-only migration is ordered after existing migrations. If a prior migration aborts on duplicate columns, enum, or table creation, later SQL cannot run to correct it. A future bridge therefore cannot make the current chain safe for empty databases without an approved mechanism that avoids that earlier failure.

**Safest default while evidence is missing:** preserve the historical files and checksums, keep statuses **UNKNOWN**, and do not execute the chain. This is a hold condition, not selection of B2 or approval to implement it.

## Approval stages

1. **Approval to design:** owners provide or explicitly mark unavailable the evidence above; product/security decisions are recorded; the project owner authorizes a written design comparison. No database access or mutation is implied.
2. **Approval to implement:** owners review the selected design, compatibility matrix, clean-install path, ledger rules, data preservation, rollback, and acceptance criteria, then explicitly authorize code/migration implementation. This does not authorize database rehearsal.
3. **Approval to execute rehearsal:** a separate, explicit approval names both new disposable targets and authorizes creation/restore. It must also approve backup provenance/checksum, cluster and target checks, exact guarded commands, expected results, stop conditions, redacted logs, rollback, and cleanup. It never authorizes using or changing `teamflow` or `teamflow_rehearsal_20261028`.

## Safest next action if evidence is unavailable

Record the inaccessible environment and its migration statuses as **UNKNOWN**, ask its authorized owner for the missing records, and keep historical files frozen. Do not choose Option A, use a forward bridge as a clean-install fix, create a database, or run migrations. Revisit the strategy only after owners provide evidence or explicitly accept the remaining unknowns and approve a design phase.
