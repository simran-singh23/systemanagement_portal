# TeamFlow — pending work and intern handoff

Updated 6 November 2026.

The **local launch-readiness pass is complete**. Next, plan the hosting target, deployment environment and preview verification. The user deferred deployment until after local fixes. See [Local launch review](docs/LOCAL_LAUNCH_REVIEW.md) for the four launch essentials, recorded checks and the infrastructure handoff. Optional features below are separate scope decisions.

## 1. Current baseline — already completed
- Local setup supports separate development/test databases, consistent environment loading, demo password login, migrations and seeding.
- The clean-install chain has **19 migrations**. PostgreSQL transaction locks now work with Prisma's pg adapter.
- Password login and role routing, the employee workday, leave approval, and deactivation closing sessions have automated coverage.
- Tasks now cover creation/editing, organization-timezone dates, assignment, discussion, pointer/keyboard Kanban moves, stale-edit protection, archive feedback and timer restrictions/order/queue selection.
- Email retry requests are saved before sending. Duplicate/concurrent sends, retries, early/out-of-order signed webhooks and terminal provider failures have local regression coverage.
- Latest local verification passed **128 unit tests**, **21 integration checks**, **65 development-server browser tests** and **18 production-build browser checks** with no skips. Lint, typecheck, Prisma validation and the production build also passed. The runtime dependency audit reported zero vulnerabilities.
- A disposable local backup/restore rehearsal verified 32 tables, row values, schema, migration checksums, restored password/membership data and safe migration retry. Hosted backup policy and any existing database upgrade remain part of deployment planning.

These results use isolated local databases, fake email credentials and intercepted provider calls. They do not establish that Google OAuth, real Resend delivery, hosted Inngest jobs or a production deployment work.

Detailed references: [Local setup](docs/LOCAL_BACKEND_SETUP.md), [task verification](docs/TASK_WORKFLOW_VERIFICATION.md), [current feature status](FEATURE_STATUS.md). Older Phase 24 audit/readiness files describe an earlier snapshot; use the dated updates above when they conflict with those historical results.

## 2. Get the updated project running

1. Check `git status` and preserve any uncommitted work before updating the checkout. Pull `main` with `git pull --ff-only origin main` when the checkout is ready.
2. Use Node.js 20.9+ and a running local PostgreSQL server. This project uses **npm**, **Prisma/PostgreSQL**, **Auth.js**, **Inngest** and **Resend**; older planning prompts mention alternative libraries that are not the implementation.
3. For a fresh local development/test setup, follow [LOCAL_BACKEND_SETUP.md](docs/LOCAL_BACKEND_SETUP.md), then run:

   ```bash
   npm run setup:local
   npm run dev
   ```

4. Sign in with a seeded account, such as `admin@teamflow.dev`, `manager@teamflow.dev`, `lead@teamflow.dev` or `employee@teamflow.dev`, using `SEED_DEV_PASSWORD` from the local environment file. Do not commit environment files or passwords.
5. Keep the application database separate from `TEST_DATABASE_URL`. Tests require a loopback host and a dedicated `teamflow_test` database, optionally with an underscore suffix. The setup command migrates the test database but seeds only development.

### Existing database: check history before applying migrations

The historical file `prisma/migrations/20261014233000_daily_email_reporting/migration.sql` was repaired locally to remove duplicate email objects created by later migrations. Fresh installations now succeed. A database that applied a different version of that file may have a checksum/schema mismatch.

- Preserve the existing database and take a backup before planning an upgrade. Compare the migration ledger/checksums with the repository; a successful fresh install does not prove an existing database is compatible.
- Do not use `prisma migrate reset`, `db push`, delete migration records, or mark migrations applied to hide a mismatch.
- The easiest development route is to retain the original database and use fresh dedicated `teamflow_dev` and `teamflow_test` databases for this checkout. Existing environment files are preserved by setup, so update their target configuration deliberately.
- After history is reconciled, the new forward migration `20261031100000_email_retry_payload` must be applied before running the updated email code. It adds the nullable `email_deliveries.request_payload` column.
- Keep changes to an existing/shared database separate from ordinary feature testing. Background on the historical conflict is in [MIGRATION_OWNER_REVIEW.md](docs/MIGRATION_OWNER_REVIEW.md).

## 3. Priority 1 — Teams

Code to inspect: `actions/team.actions.ts`, `components/people/team-form.tsx`, and `app/dashboard/teams/`.

- [x] Verified team creation and edits with a product manager and owner, including saved color, leadership, roster and clearing a description.
- [x] Verified rejection of duplicate names, inactive members and forged cross-organization members without partial writes.
- [x] Verified permitted team-lead edits, denial of another team's settings and rejection of a forged leadership change.
- [x] Verified that roster changes update assignment options while preserving existing task assignments and active timers.
- [x] Verified database records and audit events in fixture-based browser tests. Replacing a suspended lead removes their former leadership role when they lead no other team, and their membership stays suspended.

Done when the ordinary workflow, invalid inputs and access restrictions pass through the actual UI/server actions and remain correct after reload.

## 4. Priority 1 — Employee Management and account lifecycle

Code to inspect: `actions/employee.actions.ts`, `actions/password.actions.ts`, `lib/password-account.ts`, `actions/team.actions.ts`, `components/people/employee-form.tsx`, `app/dashboard/employees/`, and `app/account/security/`.

- [x] Verified normalized invitations, duplicate handling, initial invited status and team and department placement.
- [x] Completed invitation, password setup and sign-in with the actual link emitted by the local dev server. Fixture tests cover expired and consumed links and password reset/change, including old-password rejection and session invalidation.
- [x] Verified profile saves, role and team changes, deactivation and reactivation. Profile-only saves preserve existing roster records. Blank job titles and departments clear saved values.
- [x] Verified forged roles and organization IDs, and replayed an owner's save request as a team lead and employee to confirm neither could mutate the record.
- [x] Verified that membership changes preserve access in the second organization. Repeated account saves show the current result, including during submission.
- [ ] Names and job titles are still global user fields. Confirm the desired product behavior before changing that model.
- [x] Verified that repeated check-in, timer and break actions show the latest result in the attendance batch.

## 5. Priority 2 — remaining section verification

These areas have existing code, but their complete manager/employee workflows still need focused verification and fixes where they fail.

| Section | Work still needed | Starting files |
| --- | --- | --- |
| Reports and Team Pulse | Local verification complete. Covered drafts, blocked-pulse validation, submission and revision, scoped review and stale reviews, overnight evidence, missing submissions, holidays and team visibility. | `tests/e2e/reports.spec.ts`, `actions/report.actions.ts`, `lib/reports.ts` |
| Leave | Local verification complete. Covered notice and working-day rules, cancellation and rejection, overlap policy, reviewer scope, replayed decisions and approval racing with check-in. | `tests/e2e/leave-decisions.spec.ts`, `tests/e2e/organization-settings.spec.ts` |
| Attendance and timers | Local verification complete. Covered overnight work dates, older open sessions, duplicate check-ins, replayed stop requests, optional holidays, approved leave and repeated timer and break cycles. | `tests/e2e/attendance-timers.spec.ts`, `tests/e2e/organization-settings.spec.ts` |
| Analytics and CSV | Local launch checks passed for known attendance/task time, displayed and exported totals, search/sort, pagination, empty results, CSV escaping and forged scope filters. | `tests/e2e/launch-readiness.spec.ts`, `lib/analytics/`, export route |
| Search and notifications | Local launch checks passed for private task scope, task detail links, read filters, pagination, unread counts, mark-all and a forged mark-read request. Existing task regressions cover reassignment and archive access. | `tests/e2e/launch-readiness.spec.ts`, `tests/e2e/tasks.spec.ts` |
| Organization settings | Local policy verification complete. Tested invalid dates and schedule order, draft retention, overnight attendance, allowed breaks, leave calendar rules, checkout before reports and local scheduler behavior. | `tests/e2e/organization-settings.spec.ts`, `lib/organization-settings.ts` |
| Authenticated UI | Local launch checks passed on 17 employee/manager routes at 390px and 1440px. Main-content scans have no critical/serious WCAG A/AA violations. Verified mobile menu focus and actual workday/report review. Deployed checks follow hosting selection. | `tests/e2e/launch-readiness.spec.ts`, authenticated workflow specs |

## 6. Incomplete features and external-service work

- [ ] **Private attachments:** currently metadata/external links only. If uploads are required, choose object storage and implement authorized upload/download, size/type validation, persistence and deletion/retention behavior. Do not store large files in PostgreSQL or call a public URL a private download.
- [ ] **Audit browsing:** events are recorded, but a dedicated authorized browsing/filter/export section is absent. Confirm it is required, then implement and test its organization/team boundaries.
- [ ] **Google OAuth:** verify actual callback/login/logout, invitation matching, suspended-account denial, expiry/revocation and deployed cookie behavior with configured credentials.
- [ ] **Resend:** verify a real sender/domain, recipient allowlist, password emails and report delivery with signed provider webhooks. Confirm provider acceptance versus delivery, retries and failure history. Local tests did not send real messages.
- [ ] **Inngest:** run the local dev server (`npm run inngest:dev`) and verify discovery, organization schedules, summaries/reminders, retries and execution history. Hosted endpoint sync/keys and production behavior are still unverified.
- [ ] **Optional AI:** keep it disabled unless it is part of the agreed scope. If enabled, verify provider configuration, role/organization scope, limits, grounded outputs, retention and failure behavior. Do not add a key to source control.
- [ ] **Serverless rate limiting:** search currently uses a process-local limiter. Decide whether distributed enforcement is needed for the deployment topology; authentication has its own database-backed limiter.
- [x] **Older smoke tests:** replaced manual storage states with fixture login for the manager, owner and employee routes. Both smoke tests passed in the full local browser run on 6 November 2026.
- [ ] **Release:** configure Preview/Production databases, backup/restore, domain/OAuth callbacks, provider keys and monitoring/alerts. Recheck dependency advisories and run the production environment validator. Local green checks are not production sign-off; use [DEPLOYMENT.md](DEPLOYMENT.md) after reconciling its older checklist with this handoff.

## 7. Workflow and completion checks

Use a separate feature branch per batch, for example `codex/team-management`. Read `AGENTS.md` and the relevant installed Next.js guides before edits. Reuse working components and server-side permission checks. Do not rebuild completed sections wholesale.

Before calling a batch finished:

```bash
npm run lint
npm run typecheck
npm run test:unit
npm run db:validate
TEST_DATABASE_URL='postgresql://YOUR_MAC_USER@127.0.0.1:5432/teamflow_test?schema=public' npm run test:integration
TEST_DATABASE_URL='postgresql://YOUR_MAC_USER@127.0.0.1:5432/teamflow_test?schema=public' npm run test:e2e -- --workers=1
npm run build
git diff --check
```

Run `npx playwright install chromium` once when the browser binary is missing. The test database must already be migrated. Build/runtime commands need the configured local environment. Production configuration is checked separately with `npm run check:production-env` against the intended environment.

For each completed batch, include the reproduction, changed behavior, tests run, remaining limitations and any required migration/setup step in its review notes. Update this checklist and `FEATURE_STATUS.md` with the new evidence. Never claim provider delivery, deployment, or workflows that were not exercised.
