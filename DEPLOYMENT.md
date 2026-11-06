# TeamFlow production deployment

Local verification updated 6 November 2026. See [Local launch review](docs/LOCAL_LAUNCH_REVIEW.md) for current checks and the deployment handoff.

Status: **prepared, not deployed**. Production launch is blocked until the items in [the readiness report](docs/PRODUCTION_READINESS.md) are resolved and an authorized person approves the launch.

## Architecture

- Application: Next.js 16 App Router on Vercel, including Server Components, Server Actions, Route Handlers, and the Auth.js proxy.
- Database: managed PostgreSQL with Prisma ORM 7. Runtime traffic uses a pooled `DATABASE_URL`; Prisma CLI operations use a direct `DIRECT_URL`.
- Authentication: Auth.js v5 with Google OAuth and Prisma adapter. This repository does **not** use Better Auth.
- Jobs: Inngest v4 served at `/api/inngest`, with a 60-second route maximum.
- Email: Resend delivery, templates, per-recipient tracking, and signed webhook are implemented but inactive until verified sender/domain credentials, the Phase 24 migration, and isolated delivery tests are complete.
- Files: attachment metadata can be displayed, but there is no upload/download object-storage integration.
- Monitoring: provider logs only until a reviewed error-monitoring/alerting integration is added.

Keep the Vercel functions and PostgreSQL database in the same or nearest available region. Do not use Vercel's temporary filesystem for uploaded files.

## Environment variables

Configure secrets in Vercel Project Settings, separately for Development, Preview, and Production. Do not paste them into source files or `NEXT_PUBLIC_*` variables. Environment changes require a redeploy.

| Variable | Required | Scope | Purpose |
| --- | --- | --- | --- |
| `DATABASE_URL` | Yes | Server only | Pooled, TLS-enabled PostgreSQL URL for runtime traffic |
| `DIRECT_URL` | Yes | CI/release only | Direct, TLS-enabled PostgreSQL URL for migrations and backup tools |
| `AUTH_SECRET` | Yes | Server only | Random value of at least 32 characters for Auth.js tokens/cookies |
| `AUTH_URL` | Yes by TeamFlow policy | Server only | Canonical HTTPS production origin |
| `AUTH_TRUST_HOST` | Yes | Server only | `true` behind Vercel's trusted reverse proxy |
| `AUTH_GOOGLE_ID` | Yes | Server only | Production Google OAuth client ID |
| `AUTH_GOOGLE_SECRET` | Yes | Server only | Production Google OAuth client secret |
| `INNGEST_EVENT_KEY` | Yes | Server only | Sends events to the correct Inngest environment |
| `INNGEST_SIGNING_KEY` | Yes | Server only | Verifies calls to the served Inngest endpoint |
| `INNGEST_DEV` | No in production | Local only | Keep `1` locally; it must be unset in Preview/Production |
| `RESEND_API_KEY` | If daily email enabled | Server only | Resend sending API credential |
| `RESEND_FROM_EMAIL` | If daily email enabled | Server only | Address on a verified sending domain; optional display name |
| `RESEND_WEBHOOK_SECRET` | If daily email enabled | Server only | Signature verification for `/api/webhooks/resend` |
| `RESEND_TEST_RECIPIENTS` | Development/Preview sends | Server only | Comma-separated allowlist for approved non-production recipients |

Run the non-secret validator after injecting the intended production environment:

```bash
npm run check:production-env
```

It checks presence, obvious placeholders, HTTPS, PostgreSQL/TLS URLs, proxy trust, and accidental Inngest development mode. It never prints secret values.

The production environment validator checks Resend variables as a group if any are supplied. Email enablement in Organization Settings also checks sender/webhook configuration. Private object-storage variables are not active because upload/download is not implemented.

## Managed PostgreSQL

1. Create a new managed PostgreSQL project; do not reuse local or preview databases.
2. Choose a region close to the Vercel function region.
3. Create dedicated production credentials and enable TLS.
4. Put the provider's pooled URL in `DATABASE_URL` and direct URL in `DIRECT_URL`.
5. Confirm connection and transaction limits for expected Vercel concurrency.
6. Enable point-in-time recovery or provider backups and record retention/restore limits.
7. Restrict console and credential access to release operators; rotate credentials after personnel or incident changes.

Prisma's current guidance is to use pooled connections for application traffic and direct connections for migrations/admin work: <https://www.prisma.io/docs/postgres/database/connecting-to-your-database>.

## Migration procedure

There are 19 migration directories. The complete chain and backup/restore have passed on disposable local databases. Existing installation history and hosted database compatibility still need verification before release.

Preflight:

```bash
npm ci
npm run db:generate
npm run db:validate
```

Before the first production migration:

1. Restore the newest backup into an isolated database and rehearse the full migration chain.
2. Confirm the provider permits `CREATE EXTENSION pg_trgm` (required by `20261022090000_global_search_indexes`).
3. Review data backfills in the work-session/break and daily-report migrations; their subsequent `NOT NULL` constraints can fail if legacy rows cannot be backfilled.
4. Take and identify a production backup immediately before applying changes.
5. Use the direct connection and run only:

```bash
DIRECT_URL="$DIRECT_URL" npm run db:deploy
```

Never run `prisma migrate reset`, `prisma db push`, or `npm run db:seed` in production. The seed script now refuses to run when `NODE_ENV=production` or `VERCEL_ENV=production`.

`prisma migrate deploy` applies pending migrations but does not detect drift. Compare migration status and validate a restored copy before release: <https://docs.prisma.io/docs/cli/migrate/deploy>.

## Vercel setup

No Vercel project is linked. The checkout has a GitHub remote, and local changes need review and a commit before deployment. An authorized operator must:

1. Push the reviewed repository to the approved Git provider.
2. Import it once into Vercel; avoid creating a duplicate project.
3. Set the project root to the repository root (`team-management-portal`).
4. Confirm Framework Preset `Next.js`, install command `npm ci`, and build command `npm run build`. `vercel.json` records the framework/build intent.
5. Configure independent Preview and Production variables. Preview must use its own database, OAuth client or redirect policy, and Inngest environment.
6. Keep production promotion manual until the launch checklist is signed off.

Vercel creates Preview deployments from non-production branches and supports environment-specific variables; see <https://vercel.com/docs/deployments/environments> and <https://vercel.com/docs/environment-variables>.

## Authentication

1. Generate a unique production `AUTH_SECRET` (`npm exec auth secret`).
2. Create a production Google OAuth client.
3. Add exactly `https://<approved-domain>/api/auth/callback/google` as an authorized redirect URI.
4. Configure the OAuth consent screen, approved users/domain policy, and canonical `AUTH_URL`.
5. Keep HTTPS and secure cookies; do not add an authentication bypass for smoke tests.
6. Test valid/invalid sign-in, logout, expired/revoked sessions, suspended users, role redirects, and cross-organization rejection with approved test accounts.

Auth.js requires a 32+ character secret and documents proxy trust/URL handling here: <https://authjs.dev/getting-started/deployment>. Google callback format: <https://authjs.dev/getting-started/providers/google>.

## Inngest

1. Create separate Preview and Production Inngest environments.
2. Prefer the official Vercel integration or manually configure `INNGEST_EVENT_KEY` and `INNGEST_SIGNING_KEY`.
3. Sync `https://<domain>/api/inngest`; verify all seven registered functions appear, including daily email delivery.
4. Confirm signature validation and ensure `INNGEST_DEV` is absent.
5. Send controlled test events to one test organization. Disable reminders/email settings for real organizations during validation.
6. Verify timezone routing, idempotency records, retries, failure records, and the 60-second route budget.

Official Vercel integration guidance: <https://www.inngest.com/docs/durable-execution/deploying-functions/platforms/vercel>.

## Resend and email

The code path is implemented, but delivery is a launch blocker until an authorized operator applies the migration, verifies a dedicated sending domain (SPF/DKIM and preferably DMARC), configures the three server-only Resend variables, and registers `https://<domain>/api/webhooks/resend` for delivery/failure events. Enable email in Organization Settings only after setting a verified primary manager recipient and delivery time after the report deadline and summary. Preview real data at `/dashboard/email-reports/preview?date=YYYY-MM-DD`; review provider acceptance/delivery state at `/dashboard/email-reports`.

Use `RESEND_TEST_RECIPIENTS` to restrict all development/Preview sends to approved addresses. Rehearse temporary and permanent failure, retry/idempotency within the provider's 24-hour window, duplicate webhook events, and webhook signature rejection on an isolated organization. A `SENT` record means Resend accepted the email; only a verified `email.delivered` webhook marks `DELIVERED`. Never enable production sends based on a successful build alone.

Resend requires a verified owned domain (<https://resend.com/docs/dashboard/domains/introduction>) and signed webhook verification (<https://resend.com/docs/webhooks/verify-webhooks-requests>).

## Optional AI insights

Phase 22 is disabled for every organization by default. To enable it, obtain the organization owner’s data-processing approval, configure server-only `OPENAI_API_KEY` and an approved `OPENAI_MODEL`, deploy, then enable the organization and selected manager roles under **Organization settings → AI insights**. Do not expose the key through `NEXT_PUBLIC_*` variables.

The implementation sends bounded task and submitted-report context through the Responses API with provider application-state storage disabled (`store: false`). It excludes names, emails, leave reasons and attendance durations; retains TeamFlow generation metadata for the configured 1–90 day window; applies request/token limits; and provides no mutation tools. Confirm the selected provider/model’s contractual retention and regional processing terms before enabling production use. Rotating or removing the provider key safely disables new generations without affecting core TeamFlow workflows.

## File storage

This is a launch blocker if task uploads are part of the promised production scope. Select the existing approved private object-storage provider and implement signed upload/download flows, organization/task authorization, MIME allowlisting, server-verified size limits, malware handling policy, retention, and deletion. Never trust a client-provided public URL or persist binary files in PostgreSQL/serverless disk.

## Custom domain and HTTPS

Do not modify live DNS without approval.

1. Add the approved domain to the existing Vercel project.
2. Run `vercel domains inspect <domain>` and use the exact DNS records it reports.
3. Have the DNS owner apply the records; do not use `--force` to take a domain from another project.
4. Verify Vercel's certificate, HTTPS redirect, canonical host, and both apex/`www` behavior.
5. Update `AUTH_URL`, Google OAuth callback, Inngest endpoint, and future email links to the canonical HTTPS origin, then redeploy.

Vercel provisions SSL after DNS verification: <https://vercel.com/docs/domains/set-up-custom-domain>.

## Monitoring and logging

Before launch, configure an approved monitoring/error-tracking product and alerts for application 5xx errors, authentication failures, database exhaustion/timeouts, Inngest failures, future email failures, and unexpected process crashes. Use structured event names and correlation IDs. Redact cookies, authorization headers, OAuth tokens, database URLs, email content, and sensitive employee metadata.

Vercel logs are useful for initial diagnosis but are not the complete alerting/retention plan. Record owners and escalation contacts in the incident runbook.

## Backups and disaster recovery

Minimum policy to approve with the database owner:

- Automated daily backups plus point-in-time recovery where available.
- At least 7 days retention for Preview and 30 days for Production, adjusted to company policy.
- Monthly restore rehearsal into an isolated account/project.
- Restore evidence: backup identifier, timestamps, row-count/integrity checks, migration version, tester, and cleanup record.
- Named database owner and incident contact.

Recovery sequence: stop writes/automations, identify incident boundary, preserve evidence, restore to an isolated database, validate schema/data, rotate credentials if needed, repoint a Preview deployment, run smoke tests, obtain approval, then promote/repoint Production. Document the recovery point objective and recovery time objective after the first measured rehearsal.

## Release workflow

`Development → Pull request → CI → Preview → QA approval → backup/migration approval → Production promotion`

The `Quality` GitHub workflow provisions isolated PostgreSQL, applies committed migrations, and runs lint, typecheck, unit/integration tests, build, and public Playwright tests. Branch protection must require it. Preview uses separate credentials and test accounts. Production deploys originate only from the approved branch and must remain traceable to a reviewed commit.

## Rollback

1. Disable Inngest automation/event sending if continuing execution could cause harm.
2. Promote the last known-good Vercel deployment; do not rebuild an unknown revision.
3. Do **not** assume application rollback reverses a database migration.
4. If the previous application is incompatible with the migrated schema, deploy a reviewed forward-fix or restore the pre-migration backup during a write freeze.
5. Rotate compromised credentials and revoke affected OAuth/Inngest keys when relevant.
6. Verify login, tenant isolation, core mutations, scheduled jobs, and logs before ending the incident.

Every migration must be backward-compatible with the previous application release or carry an explicit database recovery plan.

## Production smoke test

After explicit deployment approval, use dedicated test organizations/accounts and execute the 22 checks from Phase 21: public load, login/logout, route protection, both dashboards, task/attendance/timer/report/leave/notification/search/analytics/settings flows, authorized audit access, controlled Inngest event, approved test email, mobile layout, HTTPS, and error logs. Do not send reminders or emails to real employee lists.

## Troubleshooting

- `DATABASE_URL is required in production`: configure the pooled runtime URL in the affected Vercel environment and redeploy.
- Migration locking/session error: confirm Prisma CLI received `DIRECT_URL`, not the pooled runtime URL.
- `pg_trgm` permission failure: ask the managed database provider to enable the extension; do not remove indexes silently.
- Google `invalid_request`/missing client ID: verify `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`, the canonical callback URI, and redeploy after variable changes.
- Repeated Inngest signature failures: verify the signing key belongs to the same environment and `INNGEST_DEV` is absent.
- Too many database connections: verify the pooled host is used at runtime and check provider/Vercel concurrency limits.
- A variable was changed but behavior did not change: Vercel environment changes apply only to new deployments.
