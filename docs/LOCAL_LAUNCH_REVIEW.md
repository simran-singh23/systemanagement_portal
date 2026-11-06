# Local launch review

Updated 6 November 2026.

The current scope is local fixes and verification. Hosting, credentials and deployed checks will be planned afterward.

| Launch essential | Local result | Work when deployment is planned |
| --- | --- | --- |
| Core employee and manager workflows | Verified through password login, check-in, task timers, breaks, checkout, leave decisions, report submission, revision and review. The core suite also passes with `next start` using the production build. | Repeat the role workflows on the chosen preview URL with its actual database and cookies. |
| Permissions and desktop/mobile usability | Checked forged employee/team filters, private task/report links and notification actions. Checked 17 employee/manager routes at 390px and 1440px, mobile navigation and focus recovery. Main-content accessibility scans found no critical or serious WCAG A/AA violations. | Repeat on the deployed build and approved target devices. |
| Configuration, migrations and recovery | Production configuration validation has regression coverage. A clean local migration chain and backup/restore rehearsal passed with representative records. | Supply real environment values, configure TLS, backup retention and recovery ownership, and review existing database history if existing data is retained. |
| Features available to users | Verified task, attendance, reports, leave, employee/team management, analytics/CSV, search and notification workflows. | Verify configured integrations before enabling their production behavior. Confirm first-release scope for optional features. |

## Verification recorded

- 65 browser regressions against the local development server.
- 18 core browser checks against the production build served locally with `next start`.
- 128 unit tests and 21 integration checks, with no skips.
- Lint, typecheck, Prisma validation, production build and `git diff --check`.
- Runtime dependency audit reported zero vulnerabilities after the dependency updates.
- Recovery rehearsal restored 32 tables and compared row counts, row values, schema, check constraints, indexes, migration checksums, password verification and active membership. Reapplying migrations preserved the restored records. The last measured restore took 171 milliseconds on the disposable local fixture. This measurement does not establish recovery time for a production database.

## Fixes in this pass

- Task-tracked time excludes office sessions in analytics and the employee overview. Suspended accounts are excluded from analytics and the active attendance register.
- CSV output follows the selected table search and sort. Invalid scopes return 403 and invalid date filters return 400. Formula-like values with leading whitespace are escaped.
- Search results open task details and the selected employee report date.
- Notification filters retain their read-state selection when unused fields are blank. The inbox and mark-all control render fresh server results. Ordering remains stable when notifications share a timestamp.
- Shared filters and pagination links have accessible names. Muted text and attendance labels have stronger contrast. The leave calendar can receive keyboard focus for scrolling.
- Production validation rejects local database targets, conflicting TLS parameters and noncanonical authentication URLs.
- Locked dependency versions update Zod, systeminformation and fast-uri. The Inngest override uses Zod's maintained `zod/v3` compatibility entrypoint. The gcp-metadata override selects the compatible gaxios 7.1.4 patch, removing its older filesystem dependencies. Clean installation, typecheck, integrations and the production workflows passed with these resolutions.

The dependency findings were checked against the published advisories for [Zod](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5), [systeminformation](https://github.com/advisories/GHSA-3f7j-7jwc-fxfj) and [minimatch](https://github.com/advisories/GHSA-g3hv-75wg-m249).

## Reproduce locally

Use a dedicated local test database. Set `DATABASE_URL` and `DIRECT_URL` to the same test database for building the local production test server. Keep provider credentials disabled or synthetic for local tests.

```bash
npm ci
npm run db:deploy
npm run lint
npm run typecheck
npm run test:unit
npm run test:integration
npm run test:e2e -- --workers=1
npm run build
E2E_PRODUCTION=1 npm run test:e2e -- tests/e2e/launch-readiness.spec.ts tests/e2e/backend-workflows.spec.ts tests/e2e/reports.spec.ts tests/e2e/attendance-timers.spec.ts tests/e2e/leave-decisions.spec.ts --workers=1
npm run test:recovery
npm audit --omit=dev
```

`TEST_DATABASE_URL` must be explicitly set to a loopback database named `teamflow_test` or a permitted test suffix. The recovery command creates two uniquely named local databases, applies the complete migrations, builds a fixture, dumps and restores it, verifies the result, and removes only the databases and archive it created. The local PostgreSQL role must be able to create and drop these disposable databases. If PostgreSQL client binaries are outside PATH, set `PG_BIN` to their directory. Use matching PostgreSQL client/server versions.

The production configuration validator is a separate check for actual deployment values. Its unit tests use synthetic configuration without contacting any service. This checkout has no configured production environment, so a real `npm run check:production-env` fails on missing values.

## Deployment handoff

- Choose the hosting project, preview domain and isolated preview/production database targets.
- Decide which optional integrations are enabled. Google login, real email delivery and hosted jobs need configured credentials and verification if offered.
- Confirm the migration ledger and checksums of any existing database. A fresh local migration and restore rehearsal do not verify an existing installation with a different historical migration checksum.
- Configure managed backups, retention, recovery ownership, logs and alerts on the chosen infrastructure.
- Deploy a reviewed revision to preview, verify the real environment and role workflows, then prepare the production release decision.

The verified implementation is included in the launch-readiness commit. Deployment planning follows the rollout checklist in [tasks/todo.md](../tasks/todo.md).
