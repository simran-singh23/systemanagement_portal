# TeamFlow feature status after Phase 24

Next development work and acceptance checks: [PENDING_WORK.md](PENDING_WORK.md).

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
