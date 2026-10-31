# Phase 24 evidence-based audit

Assessment: 2026-10-23. The Phase 23 audit files were absent, so this inventory was built from source, schema, actions, routes, and executable tests. It does not claim unrun authenticated workflows pass.

| Priority | Verified issue and root cause | Phase 24 disposition |
| --- | --- | --- |
| P0 | Employee/team actions used a global account role inside one organization and wrote global role/status while changing one membership. This could elevate, demote, or suspend another tenant's access. | Fixed: membership role/status are authoritative; account access is reconciled from active memberships/ownership. |
| P0 | Kanban accepted client-provided column IDs and could change statuses of unrelated tasks. | Fixed: complete scoped snapshot validation, task locking, and conditional transactional persistence. |
| P0 | Manager overview and automation history used `organization:read`, which employees also have. Mixed-role accounts could reach team-wide data in an employee-scoped organization. | Fixed: manager-only organization permission for those routes and AI manager queries. |
| P1 | Task status/reassignment/archive and timer actions could race, leaving an active timer on a reassigned or archived task. | Fixed: task locks and active-session checks; deactivation closes that organization's sessions/breaks under a user lock. |
| P1 | Check-in used the local calendar date and minute comparison, assigning post-midnight overnight shifts to the wrong workday. | Fixed: organization workday key and UTC grace comparison, used in attendance views. |
| P1 | Consolidated email reporting had settings but no sender, templates, delivery log, retry, webhook, or history. | Implemented behind explicit Resend configuration. Migration and real provider behavior remain unverified without isolated DB/credentials. |
| P1 | Private attachment upload/download is absent; task attachments are metadata/external URLs. | Open launch blocker if private uploads are promised. Requires approved storage, malware/retention policy, and tests. |
| P1 | Authenticated workflows require approved sessions; DB integration requires `TEST_DATABASE_URL`. | Open test blocker. Tests skip instead of using application/production data. |
| P2 | Some organization UI controls used global rather than membership role. | Fixed in inspected employee/team management surfaces. Multi-organization switching remains limited. |
| P2 | Full npm audit reports five high advisories in lint-only transitive packages. | Not force-downgraded; runtime-only audit reports zero. Track a compatible upstream fix. |

No production database was reset, migrated, seeded, or queried for tests. No deployment or live infrastructure change was made.
