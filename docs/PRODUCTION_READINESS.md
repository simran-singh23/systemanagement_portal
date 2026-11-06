Current local verification is recorded in [Local launch review](LOCAL_LAUNCH_REVIEW.md), updated 6 November 2026. The assessment below is historical.

# TeamFlow production readiness report

Assessment date: 2026-10-23  
Decision: **BLOCKED — do not deploy to production**

## Verified

- Actual stack identified: Next.js 16.4.2, TypeScript, Prisma 7/PostgreSQL, Auth.js v5 Google OAuth, Inngest 4, Recharts.
- Prisma schema validates and 17 migration directories are present; the Phase 24 email migration has not been applied.
- Production build succeeds.
- ESLint and TypeScript checks succeed.
- Phase 24 unit suite: 59/59 passed.
- Public Playwright suite: 10 passed, including login, unauthenticated redirects, unsigned Resend webhook rejection, security headers, WCAG axe scan, and 390/768/1024/1440 responsive checks. Two authenticated route checks were skipped without approved sessions.
- Runtime dependencies: `npm audit --omit=dev` reports 0 vulnerabilities.
- A final audit found `next@16.3.8` affected by newly published critical/high advisories; Next.js and its matching ESLint config were targeted-updated to 16.4.2, then re-audited and regression-tested.
- Baseline response headers are configured and the Next.js identifying header is disabled.
- Organization authorization no longer treats global `SUPER_ADMIN` as access to unrelated tenants; regression tests cover it.
- Test database guard refuses remote/non-test URLs and local integration testing skipped rather than falling back to development/production data.
- Production configuration now separates pooled runtime and direct migration database URLs, validates required variables, and blocks production seeding.

## Critical launch blockers

1. No managed Production or Preview PostgreSQL instances, credentials, migration rehearsal, backup policy verification, or isolated restore test were available.
2. Resend reporting code is now implemented but unverified end to end. No verified sender/domain, webhook secret, approved test recipients, or isolated database was available; settings remain unavailable until configured. Delivery/migration/retry tests and provider acceptance versus webhook confirmation are launch gates.
3. Object storage is not implemented. Attachment metadata/display exists, but upload authorization, private downloads, MIME/size enforcement, persistence, and malware policy do not.
4. No Vercel project is linked, no Git remote is configured, no production domain is selected, and no DNS/OAuth callback state can be verified.
5. No production monitoring/error tracking, alert routing, retention policy, or on-call ownership is configured.
6. Full Phase 20 authenticated employee/manager E2E workflows did not run because no isolated database fixtures and approved authenticated storage states were provided.
7. Google OAuth valid/invalid login, logout, session expiry/invalidation, and deployed secure-cookie behavior remain unverified.
8. Inngest production keys/environment, endpoint sync, controlled delivery, retry behavior, and failure alerts remain unverified.
9. Search rate limiting is process-local; it is not a distributed production control across serverless instances.
10. Audit events are written and appear in contextual timelines, but there is no dedicated authorized audit-log browsing/export surface promised by the production smoke checklist.

## Important non-runtime issue

Full `npm audit` reports five high-severity findings in the lint-only `eslint-config-next → fast-glob → micromatch → braces` chain. `npm audit --omit=dev` reports zero runtime vulnerabilities. The offered automatic fix downgrades `eslint-config-next` to Next 14 and is therefore not safe. Track the upstream compatible fix; do not use `npm audit fix --force`.

## Migration review

- Migration history: 17 SQL migrations; schema validation passes. The new email-delivery migration was compared with Prisma's generated schema diff but not applied to a database.
- No migration was applied to an external database during this phase.
- `20261022090000_global_search_indexes` requires permission to create `pg_trgm`.
- Work-session/break and daily-report migrations contain data backfills followed by `NOT NULL`; rehearse them against a restored data copy.
- Existing `DROP` statements replace an index or foreign-key constraint; they still require backup, staging rehearsal, lock/duration observation, and rollback review.
- Production seed is forbidden and now fails fast in production environments.

## Launch gate

Production approval requires all critical blockers above to be resolved, the CI workflow green on the exact release commit, a successful managed-database migration rehearsal and restore test, complete authenticated Preview smoke tests, no unresolved critical security issue, and stakeholder sign-off. The operator checklist and rollback plan are in [`DEPLOYMENT.md`](../DEPLOYMENT.md).
