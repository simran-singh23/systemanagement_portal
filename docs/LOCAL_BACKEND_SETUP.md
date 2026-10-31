# Local backend setup

Use Node.js 20.9+ and a running PostgreSQL server. On a Mac, `npm run setup:local` defaults to the current macOS username, loopback port 5432, and the `postgres` maintenance database. Set `PGUSER`, `PGPASSWORD`, or `PGPORT` when the local server requires different connection details.

```bash
npm run setup:local
npm run dev
```

The setup command installs the locked dependencies, preserves existing `.env`/`.env.local` files, creates missing dedicated local databases, applies all 19 migrations to development and test, and seeds only development. A fresh checkout receives `.env.local` with random auth and demo-password values. It never drops or resets an existing database.

For existing environment files, configure:

```dotenv
DATABASE_URL="postgresql://YOUR_MAC_USER@127.0.0.1:5432/teamflow_dev?schema=public"
DIRECT_URL="postgresql://YOUR_MAC_USER@127.0.0.1:5432/teamflow_dev?schema=public"
TEST_DATABASE_URL="postgresql://YOUR_MAC_USER@127.0.0.1:5432/teamflow_test?schema=public"
AUTH_SECRET="a-random-secret-at-least-32-characters"
AUTH_URL="http://localhost:3000"
AUTH_TRUST_HOST="true"
SEED_DEV_PASSWORD="choose-a-local-development-password"
INNGEST_DEV="1"
```

Underscore suffixes are allowed on development/test database names. Prisma CLI commands and seeding load the same environment files in the same precedence as Next.js, including `.env.local`. Explicit shell variables take precedence. Under `NODE_ENV=test`, `.env.local` is ignored.

Demo users: `admin@teamflow.dev`, `manager@teamflow.dev`, `lead@teamflow.dev`, `employee@teamflow.dev`, and `noah@teamflow.dev`. The configured `SEED_DEV_PASSWORD` enables verified password login for these accounts. Without Resend in development, requested password setup/reset links appear in the dev server terminal. Google OAuth, real email delivery, and Inngest jobs need their own configuration.

## Existing migration history

The local fix to `20261014233000_daily_email_reporting` removes duplicate email objects that later migrations create. This fixes the clean-install chain. If an existing database already applied a different version of that historical file, its checksum/history needs a separate compatibility review. Do not reset a database, mark migrations applied, or edit its migration ledger to bypass a mismatch. Use a fresh dedicated development database for a clean-install check while retaining the original data.

## Verification

```bash
npm run lint
npm run typecheck
npm run test:unit
TEST_DATABASE_URL='postgresql://YOUR_MAC_USER@127.0.0.1:5432/teamflow_test?schema=public' npm run test:integration
npx playwright install chromium
TEST_DATABASE_URL='postgresql://YOUR_MAC_USER@127.0.0.1:5432/teamflow_test?schema=public' npm run test:e2e
npm run build
```

Integration tests require an already migrated test database. They check applied migration checksums, the canonical email schema, and PostgreSQL's duplicate office-session/task-timer/break protection. Their data fixture rolls back.

Attendance, timers, reports, leave and employee deactivation share a transaction-lock helper. PostgreSQL advisory locks return `void`, so the helper uses Prisma's `$executeRaw` rather than attempting to deserialize a `$queryRaw` result. Integration tests verify that the lock is held inside the transaction.

The backend browser tests create their own users, organization, team, and task, sign in with actual passwords, check role routing and employee restrictions, then exercise check-in → task start → break → resume → completion → checkout → daily report. They also cover employee leave submission, manager approval, leave attendance records, and deactivation closing an active session and blocking subsequent sign-in. Assertions check PostgreSQL records as well as rendered results. Fixtures are removed afterward. Missing `TEST_DATABASE_URL` skips these tests; a remote or unrelated URL fails validation. No external email is sent by the browser suite.

The email integration suite intercepts all provider network requests and uses fake credentials. It verifies stable retry payloads/keys, duplicate and concurrent sends, stale/expired attempts, permanent and temporary failures, early/duplicate/out-of-order signed webhooks, recipient scope, missing summaries, disabled delivery, holidays, and suspended-user exclusion. The webhook browser test also exercises the running HTTP route with a locally signed event and a tampered payload. No real email is sent.

The older `authenticated-workflows.spec.ts` page-access smoke checks still require separately supplied storage states. Google OAuth, live provider email delivery, hosted Inngest scheduling/retries, and production infrastructure are outside these local checks.

The task-specific suite also exercises real manager/employee forms, team-lead restrictions, pointer and keyboard board moves, stale edits and failed requests. See [Task workflow verification](TASK_WORKFLOW_VERIFICATION.md) for scope and the focused command.

## Email retry migration

Run `npm run db:deploy` with the intended database configuration before starting the updated app. The forward migration `20261031100000_email_retry_payload` adds a nullable `request_payload` JSONB column to `email_deliveries`. It stores the rendered message, sender and subject before the first send, so retries reuse the original content even if reports or settings change.

Existing accepted/delivered messages remain intact. An older ambiguous attempt without a saved request requires manual provider review; the app does not invent a replacement request under the old key. Bounces, complaints and other provider failures remain failed and cannot trigger automatic resends. A concurrent sender requests a delayed retry, while terminal failures surface as failed Inngest runs.

The app stops automatic retries after 23 hours, inside Resend's [24-hour idempotency window](https://resend.com/docs/dashboard/emails/idempotency-keys). Provider error handling follows the [Resend error definitions](https://resend.com/docs/api-reference/errors), and retryable failures throw as required by [Inngest error handling](https://www.inngest.com/docs/durable-execution/guides-and-advanced/error-handling).
