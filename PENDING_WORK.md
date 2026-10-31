# TeamFlow — pending work and intern handoff

Updated: 31 October 2026. Owner of the next development batches: Simran.

Start with **Teams**, then **Employee Management**. These sections already have implementation code; verify their real workflows and fix failures before adding more features. Work one batch at a time and keep the existing backend/task regressions passing.

## 1. Current baseline — already completed

- Local setup supports separate development/test databases, consistent environment loading, demo password login, migrations and seeding.
- The clean-install chain has **19 migrations**. PostgreSQL transaction locks now work with Prisma's pg adapter.
- Password login and role routing, the employee workday, leave approval, and deactivation closing sessions have automated coverage.
- Tasks now cover creation/editing, organization-timezone dates, assignment, discussion, pointer/keyboard Kanban moves, stale-edit protection, archive feedback and timer restrictions/order/queue selection.
- Email retry requests are saved before sending. Duplicate/concurrent sends, retries, early/out-of-order signed webhooks and terminal provider failures have local regression coverage.
- Latest verified baseline: **113 unit tests**, **18 database/email/automation checks** (20 reported tests including their parent groups), and **29 browser tests** passed. Two older storage-state-based browser smoke tests remain skipped. Lint, TypeScript, Prisma validation and production build passed.

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

- [ ] Verify team creation and editing by an administrator/product manager; names, description, color, leadership and membership must persist after reload.
- [ ] Verify duplicate names, invalid members and inactive/suspended users produce useful validation feedback without partial writes.
- [ ] Verify changing a team lead and adding/removing members keeps team membership, task-assignment options and permissions consistent.
- [ ] Verify a team lead can edit only their managed team and cannot change leadership or reach another team's settings through a modified request.
- [ ] Verify users/teams from another organization cannot be selected or submitted through forged IDs.
- [ ] Check what happens to existing assigned tasks and active timers when membership or leadership changes; preserve work history and make the intended behavior explicit.
- [ ] Add fixture-based manager/team-lead browser tests and check the database records, audit events and feedback.

Done when the ordinary workflow, invalid inputs and access restrictions pass through the actual UI/server actions and remain correct after reload.

## 4. Priority 1 — Employee Management and account lifecycle

Code to inspect: `actions/employee.actions.ts`, `actions/password.actions.ts`, `lib/password-account.ts`, `actions/team.actions.ts`, `components/people/employee-form.tsx`, `app/dashboard/employees/`, and `app/account/security/`.

- [ ] Verify inviting a new employee, normalized/duplicate email handling, team/department assignment and the initial invited status.
- [ ] Complete the invitation → one-time password setup → sign-in flow. Test expired/consumed links and repeated submissions. Local development can print setup links in the terminal when Resend is not configured.
- [ ] Verify profile edits, role/team changes and reactivation. Deactivation/session closure already has coverage; extend it to the rest of the lifecycle.
- [ ] Verify employee, team-lead, product-manager and administrator permissions on each mutation, including direct/modified requests and cross-organization IDs.
- [ ] Verify password change/reset, old-password rejection and invalidation of existing sessions.
- [ ] Test users with multiple organization memberships: changing one membership must not remove or grant access in another organization. Names/job titles are currently global user fields; decide the desired product behavior before changing that model.
- [ ] Check feedback after repeated timer, break and account actions so an earlier result is not shown as the latest result. This is a follow-up review item, not a verified remaining failure.
- [ ] Add independent fixtures and database assertions for these flows. Do not rely only on hiding controls or on route-access smoke tests.

## 5. Priority 2 — remaining section verification

These areas have existing code, but their complete manager/employee workflows still need focused verification and fixes where they fail.

| Section | Work still needed | Starting files |
| --- | --- | --- |
| Reports and Team Pulse | Draft/edit/submit rules, blocked-pulse validation, locked/revised reports, correct calculated task/time evidence, manager/team visibility, missing-report behavior | `actions/report.actions.ts`, `lib/reports.ts`, `app/dashboard/reports/`, `app/employee/reports/` |
| Leave | Rejection/cancellation, overlaps, notice rules, working days/holidays, attendance conflicts, team-lead restrictions and duplicate decisions; approval already has a core test | `actions/leave.actions.ts`, `lib/leave.ts`, leave pages/components |
| Attendance and timers | Overnight shifts, previous open sessions, duplicate/concurrent requests, timezone boundaries, holidays/approved leave and repeated break cycles; the basic workday already passes | `actions/attendance.actions.ts`, `actions/work-timer.actions.ts`, `lib/date-time.ts`, `lib/work-time.ts` |
| Analytics and CSV | Confirm displayed/exported values against known fixtures; filters, dates, pagination, empty states and employee/team/organization scope | `lib/analytics/`, `app/api/analytics/export/route.ts`, analytics pages |
| Search and notifications | Search result/link permissions, pagination, unread counts, mark-read actions and reassigned/archived targets; verify the task links already repaired | `lib/search/`, `actions/notification.actions.ts`, `lib/notification-routing.ts`, `app/notifications/` |
| Organization settings | Persistence, validation and actual enforcement of office, attendance, leave, report and automation policies; invalid calendar dates and overnight schedule combinations | `actions/settings.actions.ts`, `actions/automation.actions.ts`, `lib/organization-settings.ts`, `components/settings/` |
| Authenticated UI | Loading/error/empty states, accessibility and desktop/mobile use for real employee/manager pages; existing multi-viewport checks cover the public login page | `app/dashboard/`, `app/employee/`, `components/` |

## 6. Incomplete features and external-service work

- [ ] **Private attachments:** currently metadata/external links only. If uploads are required, choose object storage and implement authorized upload/download, size/type validation, persistence and deletion/retention behavior. Do not store large files in PostgreSQL or call a public URL a private download.
- [ ] **Audit browsing:** events are recorded, but a dedicated authorized browsing/filter/export section is absent. Confirm it is required, then implement and test its organization/team boundaries.
- [ ] **Google OAuth:** verify actual callback/login/logout, invitation matching, suspended-account denial, expiry/revocation and deployed cookie behavior with configured credentials.
- [ ] **Resend:** verify a real sender/domain, recipient allowlist, password emails and report delivery with signed provider webhooks. Confirm provider acceptance versus delivery, retries and failure history. Local tests did not send real messages.
- [ ] **Inngest:** run the local dev server (`npm run inngest:dev`) and verify discovery, organization schedules, summaries/reminders, retries and execution history. Hosted endpoint sync/keys and production behavior are still unverified.
- [ ] **Optional AI:** keep it disabled unless it is part of the agreed scope. If enabled, verify provider configuration, role/organization scope, limits, grounded outputs, retention and failure behavior. Do not add a key to source control.
- [ ] **Serverless rate limiting:** search currently uses a process-local limiter. Decide whether distributed enforcement is needed for the deployment topology; authentication has its own database-backed limiter.
- [ ] **Older smoke tests:** replace the two storage-state-dependent skipped checks with reliable fixture login, or document why they remain separate. Do not treat skipped tests as passed.
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
