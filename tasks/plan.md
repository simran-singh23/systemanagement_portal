# TeamFlow completion plan

Prepared 6 November 2026 against remote `main` at `2c2e8cd`. The [handoff](../PENDING_WORK.md) defines the scope. The [implementation checklist](todo.md) gives each batch a completion test.

The latest commit adds hardening for report evidence, leave and check-in conflicts, date and schedule validation, analytics CSV and search. GitHub's Quality run passed lint, typecheck, unit tests, integration, fresh migration and build. Playwright reported 31 passed, 12 failed and 2 skipped, with all failures in the Teams and Employee specs. The earlier local review on `3070977` confirmed the team-lead deactivation bug and identified locator and timing problems in those specs. Reproduce those on the current head before editing. [Quality run](https://github.com/simran-singh23/systemanagement_portal/actions/runs/41993906459)

## Delivery order

1. **Restore a reliable baseline.** Branch from the latest remote `main`, set up a disposable PostgreSQL test database and reproduce the CI failures. Repair test interactions so they wait for saved state and assert the actual form feedback or server rejection. Track any application failure separately.
2. **Finish Teams and Employee Management.** Fix team-lead deactivation through the employee profile, verify session closure and reactivation, and prove role and organization boundaries. Verify real invite-to-sign-in and password reset/change paths. Keep existing task assignments and work history intact when the roster changes.
3. **Verify operational workflows.** Start with settings because schedules, holidays and policy values feed the workday and reports. Then verify attendance and leave together, reports and Team Pulse, analytics and CSV, and search and notifications. Use known fixtures so counts, dates, scope and persisted state can be checked end to end. Exercise an authenticated workday from check-in and task work through checkout and report review.
4. **Check authenticated screens.** Once workflows are stable, cover loading, empty, validation and error states, keyboard access, and representative desktop and mobile employee and manager routes.
5. **Finish the release requirements.** Settle the scope for private attachments, audit browsing, AI and shared search rate limiting. Verify Google OAuth, Resend and Inngest in a controlled environment. Rehearse the database upgrade against a disposable copy before applying an upgrade to any existing environment. Finish with preview acceptance, backup/restore and a release decision.

## Decisions and dependencies

- Keep the current stack and improve the existing workflows in small branches. Read `AGENTS.md` and the installed Next.js guide before each implementation batch. Use the existing password fixtures and isolated database setup for local verification.
- Leave global names and job titles in place until the product defines how profiles should work across organizations. Treat role, status, department and team membership as organization-scoped and prove the separation with two-organization fixtures.
- Confirm the policy for approving requests that overlap another pending request, and the intended behavior for a team lead's role and team ownership after deactivation and reactivation. Verify both supported deactivation entry points against that policy.
- Confirm which environments exist and obtain the applied migration checksums and schema evidence from their owners. The repaired fresh-install chain and the upgrade path for existing data require separate verification. Preserve existing data and migration ledgers while designing the upgrade.
- Settle storage and retention for attachments, access and export scope for audit browsing, and whether AI and distributed search limiting are required for the first release. Record those decisions before building their respective slices. Provider and deployment work depends on the target environment and its credentials.

## Completion checks

Each batch needs a passing focused check that exercises its normal entry point, a failure or permission case where relevant, and evidence of what persists after reload. For shared policies, test the downstream workflow that consumes the setting. At the checkpoints, run `npm run lint`, `npm run typecheck`, `npm run test:unit`, `npm run db:validate`, `npm run test:integration`, `npm run test:e2e -- --workers=1`, `npm run build` and `git diff --check`. Point the database checks at a dedicated migrated `TEST_DATABASE_URL` using the [local setup guide](../docs/LOCAL_BACKEND_SETUP.md).

Record the verified result and any open edge cases in [feature status](../FEATURE_STATUS.md). Close items in the handoff when their acceptance checks pass. Record provider and deployment evidence separately from local checks.
