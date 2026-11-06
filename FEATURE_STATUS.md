# TeamFlow feature status after Phase 24

Next development work and acceptance checks: [PENDING_WORK.md](PENDING_WORK.md).

## Local launch-readiness pass — 2026-11-06

- Corrected analytics and employee overview task-time totals, CSV search/sort and escaping, search destinations, notification refresh/filter behavior and inactive-account attendance counts.
- Fixed shared control labels, pagination link names, calendar keyboard scrolling and muted-text contrast. Checked 17 authenticated routes at 390px and 1440px, with no critical or serious WCAG A/AA findings in their main content.
- Passed 65 browser regressions, 18 core browser checks against the production build, 128 unit tests, 21 integration checks, lint, typecheck, Prisma validation and the production build. The runtime dependency audit reported zero vulnerabilities after compatible dependency updates.
- Passed a fresh migration and backup/restore rehearsal over 32 tables on disposable local databases. Production environment validation has regression coverage, and actual deployment values remain to be configured.
- The current scope is local fixes. Hosting, live integration checks, managed backups and any existing database upgrade will be planned next. See [Local launch review](docs/LOCAL_LAUNCH_REVIEW.md).

## Reports and Team Pulse — 2026-11-06

- Drafts retain edits after validation, including the selected pulse. A blocked pulse requires a description. Clearing optional text clears the saved value.
- The employee report and manager overview follow the configured overnight workday. Report evidence attaches attendance, breaks and task sessions to that date and counts task completions in the overnight window. Employees can reopen earlier workdays from the date selector or report history.
- Submitted reports are read-only unless revisions are enabled. Revisions preserve the original submission time and pulse record. An authorized reviewer can mark a submitted report reviewed after reading its latest revision, which locks it against further edits.
- The manager overview counts eligible employees without a submission as missing, including those with a draft. Holidays, approved leave and inactive accounts are excluded from expectations. Team-lead access to lists, report details and review actions stays within teams they lead in the current organization.
- Local verification passed 60 browser tests, 125 unit tests, 21 integration checks, lint, typecheck, Prisma validation and the production build.

## Leave decisions — 2026-11-06

- Team leads see and review requests only for employees on teams they lead in the same organization. Decision actions recheck reviewer access before saving.
- Rejection and cancellation are final. Duplicate decisions leave the saved outcome, audit entry and notification intact. Reviewer notes survive a rejected submission and appear in the employee’s history after the decision is saved.
- If overlapping leave is disabled, only one of two overlapping requests can be approved. With overlaps enabled, the original attendance projection remains attached to its approved request. A request with no remaining working days cannot be approved.
- Approval and check-in share the employee lock. When check-in happens first, the approval flags the conflict and preserves actual attendance. When approval happens first, check-in is blocked and the leave projection remains intact.
- Local verification passed 57 browser tests, 125 unit tests, 21 integration checks, lint, typecheck, Prisma validation and the production build.

## Attendance, timers and breaks — 2026-11-06

- Overnight shifts and older open sessions retain their attendance date. Checkout ends the office session and any linked task or break at the same timestamp. Half-day status uses net time after overlapping breaks are counted once.
- Concurrent check-ins create one office session. Replayed checkout, pause and end-break requests cannot close a newer session. Each widget shows the latest result when employees repeat an action.
- Holidays and non-working days allow optional check-in without a late or half-day penalty. Approved leave blocks check-in in both the employee form and the server action.
- Local verification passed 53 browser tests, 125 unit tests, 21 integration checks, lint, typecheck, Prisma validation and the production build.

## Organization settings and automation policies — 2026-11-06

- Rejected settings saves retain the draft. Validation aligns pre-shift and overnight reminders with the scheduler. Saved timezone and office hours drive the attendance work date.
- Employee forms use the saved break and leave types. Leave applies working days, holidays and notice rules, and permits historical requests when enabled. Inline feedback keeps the form usable for retries.
- Verified the saved checkout requirement at report submission, holiday exclusions in the manager overview, and scheduler execution against the saved overnight and holiday policy.
- Local verification passed 50 browser tests, 125 unit tests, 21 reported integration tests, lint, typecheck, Prisma validation and the production build.

## Teams and Employee Management — 2026-11-06

- Profile-only saves preserve existing roster entries and use the same team order as the employee directory. Blank job titles, departments and team descriptions clear the saved value. Team and employee forms show feedback for the current submission.
- Replacing a suspended lead demotes the former lead if they lead no other team. Their membership stays suspended. Browser tests also verify roster and assignment changes, work history, audit events and rejected forged requests.
- The invitation from the manager form completed through the actual development setup link and a fresh employee sign-in. Browser tests also verified password reset and change, account reactivation, session revocation and membership isolation across two organizations.
- Local checks passed with 47 browser tests, 125 unit tests, 20 reported integration tests, lint, typecheck, Prisma validation and the production build.

## Browser baseline and team-lead deactivation — 2026-11-06

- The full local browser suite passed all 45 tests against a fresh test database. The two authenticated smoke tests now sign in with fixtures.
- Saving a team lead as deactivated closes their open office session and task timers and revokes existing logins. Their roster, task assignments and membership in another organization are preserved. The browser regression covers deactivation and reactivation.
- Lint, typecheck, Prisma validation, the production build, 125 unit tests and 20 reported integration tests passed.

## Local backend verification — 2026-10-31

- Preserved the existing local migration repair and verified the initial 18 migrations on fresh, isolated development and test databases; rerunning setup succeeds without pending migrations. The follow-up forward migration for saved email requests brings the current total to 19, also verified on a fresh test database.
- Fixed PostgreSQL advisory-lock result handling shared by attendance, timers, reports, leave and employee deactivation.
- Prisma and seeding now load Next.js environment files consistently; local setup migrates both databases and rejects remote/unrelated targets.
- Current checks: 113 unit tests, 18 database/email/automation regression checks, and 29 browser tests pass. Two older browser smoke checks still require manually supplied storage states and skip without them. New password-authenticated workflows run with their own database fixtures.
- Task workflows now verify real creation/editing, organization-timezone deadlines, discussion, reassignment, pointer/keyboard board moves, stale-edit protection, recoverable archive/move errors, timer ordering and team/employee permission restrictions. See [Task workflow verification](docs/TASK_WORKFLOW_VERIFICATION.md). Team management and employee invitation remain the next separate batches.
- Email retries preserve the original request and key, busy sends retry later, terminal provider failures cannot cause automatic resends, and early/duplicate/out-of-order signed webhooks preserve the delivery outcome. Suspended accounts are excluded from expected-user reminders and report summaries. Provider calls are intercepted in integration tests; a locally signed event also passes through the actual HTTP route.
- Verified actual employee workday persistence, role routing, leave approval, and session closure/sign-in rejection after deactivation. Google OAuth, real provider email/hosted Inngest jobs, private uploads and production deployment remain outside this local verification.
- Existing databases with a different checksum for the edited historical email migration still need a compatibility review; no existing database history was rewritten.

Setup and test commands: [Local backend setup](docs/LOCAL_BACKEND_SETUP.md).

## Earlier assessment

Assessment: 2026-10-23. “Implemented” means source and local static/unit checks pass; it does not mean production infrastructure or authenticated workflows have been verified.

| Area | Status | Verification / caveat |
| --- | --- | --- |
| Google OAuth, sessions, RBAC | Implemented; live verification pending | Organization membership checks and account reconciliation added. Real Google login/logout, session revocation, and multi-org role routing need isolated authenticated tests. |
| Employees and teams | Implemented; DB test pending | Phase 24 fixed tenant-specific role/status changes and deactivation session closure. Name/title remain global user attributes across organizations. |
| Tasks, Kanban, comments | Implemented; DB test pending | Board snapshot and timer mutation regressions fixed. Authenticated drag/drop behavior remains unverified. |
| Attendance, timers, breaks | Implemented; DB test pending | Overnight workday and permission rechecks fixed. The full transition chain needs an isolated database. |
| Daily reports, leave, notifications | Implemented; DB test pending | Existing actions and automation reviewed. Provider-job behavior needs controlled Inngest/database tests. |
| Consolidated email | Code implemented; inactive | Resend sender/domain/webhook and approved test recipients are not configured. Migration not applied; no send/delivery webhook exercised. |
| Analytics and search | Implemented; authenticated test pending | Queries use database records; search rate limiting is process-local, not distributed. |
| Settings and audit trail | Settings implemented; audit browsing incomplete | Activity logs are written; dedicated authorized audit-log browsing/export is absent. |
| Task attachments | Metadata only | Private upload/download, MIME/size enforcement, malware workflow, and retention need approved object storage. |
| Responsive UI and accessibility | Public login verified | Chromium public checks and axe pass; authenticated mobile screens were not browser-tested. |
| Production deployment | Not done | Managed DB, backups, OAuth domain, Inngest, Resend, monitoring, and release sign-off remain external gates. |

Actual stack: Next.js 16.4.2, TypeScript, Tailwind, Prisma 7/PostgreSQL, Auth.js v5 Google OAuth, Inngest 4, Resend, Zod, Recharts, and Lucide. Older phase prompts name Drizzle/Better Auth, but those are not the installed implementation.
