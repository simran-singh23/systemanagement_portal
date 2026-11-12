# Proposed deployment API boundary

Status: **inventory and first contract draft**. No API extraction has happened yet. The current implementation remains a Next.js application with Server Actions, Route Handlers, Server Components, and direct Prisma access.

## Boundary rules

- Treat the Vercel application as a UI/BFF client and the AWS service as the owner of domain operations and PostgreSQL access. Pages and Server Components must stop importing Prisma after extraction.
- Derive the user and active organization from a verified session. Never accept a caller-selected user, role, or organization as authority. Verify resource organization on every read and write.
- Preserve current Zod validation, permission scopes, audit events, transaction boundaries, idempotency keys, and user-level transaction locks. In particular, attendance, leave decisions, timers, and break cycles share per-user serialization rules.
- Use cursor pagination for new collection endpoints. During migration, preserve existing page/pageSize, ordering, and filter semantics so UI behavior does not change.
- Keep provider callbacks and scheduled jobs as separately authenticated machine-to-machine entry points. They do not use browser sessions.
- Do not return Prisma records directly. Define response DTOs that contain only the fields each screen needs.

## Resource contract draft

All `/v1` endpoints are scoped to the authenticated user's active organization unless explicitly marked account-scoped. `{id}` values identify resources; they do not grant access. Mutations require authenticated authorization and server-side validation.

| Domain | Proposed endpoints | Existing implementation to migrate |
| --- | --- | --- |
| Account and session | `POST /v1/auth/login`, `POST /v1/auth/logout`, `GET /v1/me`, `POST /v1/password/reset-requests`, `POST /v1/password/resets`, `POST /v1/invitations`, `POST /v1/invitations/accept` | `actions/auth.actions.ts`, `actions/password.actions.ts`, Auth.js routes, `lib/password-account.ts`; account identity is not organization-selected |
| Employees and memberships | `GET/POST /v1/employees`, `GET/PATCH /v1/employees/{id}`, `POST /v1/employees/{id}/deactivation`, `POST /v1/employees/{id}/reactivation` | `actions/employee.actions.ts`; preserve owner/manager/team-lead scope and account lifecycle rules |
| Teams | `GET/POST /v1/teams`, `GET/PATCH /v1/teams/{id}`, `PUT /v1/teams/{id}/members` | `actions/team.actions.ts`; preserve manager rights, roster reconciliation, and assignment/timer history |
| Tasks and discussion | `GET/POST /v1/tasks`, `GET/PATCH /v1/tasks/{id}`, `POST /v1/tasks/{id}/archive`, `POST /v1/tasks/{id}/status`, `POST /v1/tasks/{id}/moves`, `GET/POST /v1/tasks/{id}/comments`, `PATCH/DELETE /v1/tasks/{id}/comments/{commentId}` | `actions/task.actions.ts`, `actions/task-comment.actions.ts`; keep assignment and team visibility checks on every operation |
| Attendance | `GET /v1/attendance`, `GET /v1/attendance/me`, `POST /v1/attendance/check-in`, `POST /v1/attendance/check-out` | `actions/attendance.actions.ts`; serialize by user, retain organization timezone/work-date and leave/holiday checks |
| Timers and breaks | `GET /v1/timers/active`, `GET /v1/attendance/{id}/time-summary`, `POST /v1/timers/task/start`, `POST /v1/timers/task/stop`, `POST /v1/timers/breaks/start`, `POST /v1/timers/breaks/stop` | `actions/work-timer.actions.ts`; preserve one-open-session constraints and per-user transaction lock |
| Leave | `GET/POST /v1/leave-requests`, `GET /v1/leave-requests/{id}`, `POST /v1/leave-requests/{id}/cancel`, `POST /v1/leave-requests/{id}/decision`, `GET /v1/leave-calendar`, `GET /v1/leave-summary` | `actions/leave.actions.ts`, `lib/leave.ts`; employee self-scope, reviewer/team-lead scope, overlap checks, duplicate-decision handling and approval/check-in serialization |
| Reports and pulse | `GET/POST /v1/reports`, `GET/PATCH /v1/reports/{id}`, `POST /v1/reports/{id}/submit`, `POST /v1/reports/{id}/review`, `GET/PUT /v1/team-pulses/me`, `GET /v1/reports/team-summary` | `actions/report.actions.ts`, `lib/reports.ts`; preserve draft/locked/revision rules, evidence calculation, reviewer scope and missing-report behavior |
| Analytics and export | `GET /v1/analytics/overview`, `GET /v1/analytics/attendance`, `GET /v1/analytics/tasks`, `GET /v1/analytics/export.csv` | `lib/analytics/`, `app/api/analytics/export/route.ts`; same validated filters, dates, pagination, employee/team/organization scopes and displayed/exported values |
| Search | `GET /v1/search?q=...` | `app/api/search/route.ts`, `lib/search/`; permission-filter before pagination and re-check permissions at the linked resource |
| Notifications | `GET /v1/notifications`, `GET /v1/notifications/summary`, `POST /v1/notifications/{id}/read`, `POST /v1/notifications/read-all` | `actions/notification.actions.ts`, `app/api/notifications/summary/route.ts`, `lib/notification-routing.ts`; unread count and mark-read must be user scoped |
| Organization settings | `GET/PATCH /v1/organization/settings`, `GET/POST /v1/organization/holidays`, `PATCH/DELETE /v1/organization/holidays/{id}`, `GET/PATCH /v1/organization/automations` | `actions/settings.actions.ts`, `actions/automation.actions.ts`, `lib/organization-settings.ts`; organization admin-only and validate dates/schedule combinations |

## Machine endpoints kept separate

- `POST /v1/webhooks/resend`: verify the provider signature against the raw body, deduplicate provider event IDs, and persist delivery state.
- Inngest function endpoint: retain the Inngest signing verification, registered function list, schedule/timezone semantics, idempotency, and retry behavior. Do not expose it as a browser-authenticated domain endpoint.
- Future object storage upload/download: short-lived signed URL flow after attachment scope and provider choice are approved; every URL request must be authorized against the task and organization.

## Extraction order

1. Add typed API DTOs and contract tests for one vertical slice at a time, starting with account/session and read-only employee/team data.
2. Move domain services and Prisma access into the backend without changing validation or database transaction behavior.
3. Migrate employee/team and task workflows, then attendance/timers/leave, then reports/analytics/search/notifications/settings.
4. Switch Next.js pages to server-side API calls and Server Actions to authenticated API mutations. Keep cookies and API credentials server-only.
5. Remove Prisma from the Vercel runtime only after all page, action, route, auth-adapter, and job accesses have moved or been explicitly replaced.

The API host, AWS service choice, session ownership, browser cookie/proxy design, and CORS policy remain deployment decisions. Before implementing auth endpoints, decide whether the AWS API owns sessions or Next.js remains the BFF session owner; do not allow both systems to mint unrelated identities.
