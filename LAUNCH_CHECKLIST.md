# TeamFlow launch checklist

Status: **blocked — do not deploy**. Complete each gate in isolated Preview before production approval.

- [x] Source-level P0 tenant/board issues fixed; unit, lint, typecheck, schema validation, and build pass.
- [ ] Apply 17 reviewed Prisma migrations to isolated staging/restored PostgreSQL, including `20261023130000_daily_email_delivery`; verify constraints, backups, and restore. Never reset production.
- [ ] Run `npm run test:integration` with an explicit local `TEST_DATABASE_URL` whose database name contains `test`; verify employee/manager transitions persist.
- [ ] Capture approved manager/employee browser sessions against isolated test data and run complete authenticated Playwright workflows (current specs only check route access).
- [ ] Verify Google OAuth callback, login/logout, suspended account denial, role changes, session refresh, and multi-org boundaries.
- [ ] Exercise check-in → task timer → pause → break → resume → checkout → report, including duplicate requests and overnight/holiday cases.
- [ ] Exercise manager assignment/notification, reassign/archive with running timers, leave review, analytics scope, and team lead permissions.
- [ ] Configure verified Resend domain, `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `RESEND_WEBHOOK_SECRET`, canonical HTTPS `AUTH_URL`, and signed webhook. Use approved allowlisted test recipients until delivery/retry tests pass.
- [ ] Verify one report per authorized recipient/workday, failed/retried sends, provider acceptance versus delivered webhook state, duplicate events, and admin preview/history.
- [ ] Decide whether private task uploads are launch scope. If yes, implement approved object storage, signed authorization, MIME/size/malware/retention policy and tests; metadata links are not private uploads.
- [ ] Provision Preview/Production PostgreSQL, backups/PITR, Vercel/domain, Google OAuth client, Inngest, monitoring/alerts, and incident ownership.
- [ ] Resolve or accept lint-only dependency advisories with a compatible upstream update; runtime dependency audit currently reports zero vulnerabilities.
- [ ] Run `npm run qa`, `npm run test:e2e`, `npm run check:production-env` on the release commit and obtain release-owner approval. No automatic deployment.
