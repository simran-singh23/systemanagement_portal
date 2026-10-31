# TeamFlow

TeamFlow is a Next.js team operations portal with PostgreSQL, Prisma ORM, Google OAuth through Auth.js, and server-side role-based authorization.

## Local setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Copy `.env.example` to `.env.local` and configure:

   - `DATABASE_URL`: PostgreSQL connection string.
   - `AUTH_SECRET`: random 32-byte secret.
   - `AUTH_GOOGLE_ID` and `AUTH_GOOGLE_SECRET`: Google OAuth credentials.
- `RESEND_API_KEY` and `RESEND_FROM_EMAIL`: verified Resend sender used for password setup and reset links (along with `AUTH_URL`).

3. In Google Cloud Console, add this authorized redirect URI:

   ```text
   http://localhost:3000/api/auth/callback/google
   ```

4. Apply the database migration and seed development data:

   ```bash
   npm run db:deploy
   npm run db:seed
   ```

5. Start the application:

   ```bash
   npm run dev
   ```

6. In a second terminal, start the Inngest Dev Server:

   ```bash
   npm run inngest:dev
   ```

   The Dev Server discovers the SDK handler at `http://localhost:3000/api/inngest`. Keep `INNGEST_DEV=1` locally; production must remove it and provide `INNGEST_EVENT_KEY` and `INNGEST_SIGNING_KEY` so requests use Inngest signature verification.

Open [http://localhost:3000](http://localhost:3000).

## Database commands

```bash
npm run db:validate   # validate Prisma schema
npm run db:generate   # regenerate Prisma Client
npm run db:migrate    # create/apply a development migration
npm run db:deploy     # apply committed migrations
npm run db:seed       # load repeatable development data
npm run db:studio     # inspect data in Prisma Studio
```

## Authorization

Roles are `SUPER_ADMIN`, `PRODUCT_MANAGER`, `TEAM_LEAD`, and `EMPLOYEE`.

- Admin, product manager, and team lead accounts use `/dashboard`.
- Employee accounts use `/employee`.
- `proxy.ts` performs fast session/route checks.
- `lib/dal/auth.ts` re-checks the current database role and account status for secure server-side authorization.
- Product managers and super admins can manage employees, roles, departments, teams, and account status from `/dashboard/employees`.
- Team management lives at `/dashboard/teams`; team leads can update only the team they lead, while product managers and super admins can create teams and change leadership.
- Task management lives at `/dashboard/tasks` with database-backed search, filters, assignment, editing, deadlines, soft archiving, notifications, and activity logs. Employees manage only their assigned work at `/employee/tasks` through validated workflow transitions.
- The advanced board at `/dashboard/tasks/board` supports keyboard-accessible drag-and-drop, persistent ordering, status-menu fallback, task details, comments, attachments metadata, and recent activity.
- Smart office automations are served from `/api/inngest`. Authorized managers can inspect execution history and daily summaries at `/dashboard/automations`; organization administrators can configure schedules and reminder preferences there.
- Analytics at `/dashboard/analytics` provides organization- and team-scoped attendance, task, working-time, report, workload and Team Pulse trends. Employees have a self-only view at `/employee/analytics`; authorized CSV exports use the same validated URL filters.
- Optional AI insights at `/dashboard/ai-assistant` provide source-linked daily summaries, blocker/workload signals and a read-only manager assistant. The organization switch is off by default; enabling it requires server-only `OPENAI_API_KEY` and `OPENAI_MODEL` values plus an explicit role allowlist in Organization Settings.
- New Google users default to `EMPLOYEE`. Pre-created invited employees are activated automatically when they first sign in with the matching work email.

## Password sign-in and administrator onboarding

Approved users can sign in with either Google or an emailed password setup link followed by email/password. Passwords are Argon2id hashes; setup/reset links are single-use, expire after 30 minutes, and are never stored in plaintext. Password sign-in requires an active account and verified email. `POST`/browser access does not create accounts; employees are invited by an authorized organization manager from `/dashboard/employees`.

To prepare a first organization and its invited owner, configure `DATABASE_URL`, `AUTH_URL`, `RESEND_API_KEY`, and `RESEND_FROM_EMAIL` (plus the recipient in `RESEND_TEST_RECIPIENTS` outside production), then run the operator CLI with an explicit authorization reference:

```bash
npm run org:bootstrap-admin -- --admin-email owner@example.com --organization-name "Example Studio" --organization-slug example-studio --approval-reference APPROVED-CHANGE-123
```

The CLI prints the proposed mapping and requires typing `CREATE <slug> FOR <email>`. It refuses existing users or organizations, writes an audit event transactionally, and creates only an `INVITED` account/membership. The intended owner must control the mailbox and complete the one-time emailed password setup before access becomes active. Do not use sample seed organizations or substitute an email address for approval. This CLI has not been run by this change.

Password changes are available under `/account/security`; changing a password increments the JWT auth version and requires signing in again on other devices. Existing Auth.js session and organization-membership checks remain authoritative.
