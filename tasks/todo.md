# TeamFlow implementation checklist

The numbers show dependency order. Acceptance checks below describe what to observe through the UI, server or database for each task. See the [plan](plan.md) for scope and release decisions.

Current priority follows the four launch essentials in the [Local launch review](../docs/LOCAL_LAUNCH_REVIEW.md). Local verification is complete through item 11. Hosting, actual production configuration and deployed verification are deferred until deployment planning. Items 12–14 remain conditional scope decisions.

## 1–4. Restore the baseline and finish access workflows

- [x] **1. Reproduce the browser failures.** On a branch from current `main`, repair the existing specs in `tests/e2e/teams.spec.ts` and `tests/e2e/employee-lifecycle.spec.ts`. Use the right dropdown and form-feedback locators, submit modified hidden IDs through the actual action, and wait for the destination or persisted result. Run both focused specs and record any product failures they expose. Replace the two manual storage-state smokes with fixtures if they cover an otherwise untested path.
- [x] **2. Fix team-lead deactivation.** In `actions/employee.actions.ts`, make the profile status control and the dedicated deactivation action apply the same access and session rules. Verify deactivation and reactivation with an active timer, existing login and second organization membership. Check the database for the intended role and leadership state, preserved work history and closed sessions. Depends on 1.
- [x] **3. Verify team management.** Check admin/manager creation and editing, duplicate and inactive member feedback, cross-organization IDs and the team lead's permitted edits. Assert saved roster, audit events, assignment options and preserved active work after leadership or membership changes. Run `tests/e2e/teams.spec.ts`. Depends on 1–2.
- [x] **4. Verify account lifecycle.** From the employee form, complete an invite, use its setup link and sign in. Check duplicates, expired or reused links, password change/reset, session revocation, profile edits and forged role or organization requests. Compare both organizations' records and check feedback across repeated saves. Run `tests/e2e/employee-lifecycle.spec.ts`. Depends on 1–2.

Checkpoint: Teams and Employee specs pass against isolated fixtures. Existing browser and backend regressions pass. Any remaining smoke skip has an explicit reason and equivalent coverage where needed.

## 5–11. Verify the daily operations workflows

- [x] **5. Enforce organization policies.** Exercise settings and automation forms. Verify persisted office hours, timezone, overnight schedules, holidays, leave and report rules in their consuming workflows. Cover invalid dates, schedule order and policy options that the UI actually supports. Depends on 3–4.
- [x] **6. Verify attendance, timers and breaks.** Cover overnight shifts, an older open session, duplicate/concurrent mutations, holidays, approved leave and repeated break/timer cycles. Assert correct attendance date, session counts, duration and latest action feedback. Depends on 5.
- [x] **7. Verify leave decisions.** Check notice, working days, overlapping requests, rejection/cancellation, scoped reviewer access and duplicate decisions. Exercise simultaneous approvals and check-in against the same employee and assert consistent persisted state. Depends on 5–6.
- [x] **8. Verify reports and Team Pulse.** Exercise drafts, submission, blocked-pulse validation, review and locked/revised reports. Compare report evidence with known work sessions and task completion dates. Verify the report date and evidence follow overnight attendance across midnight. Verify missing-report and manager visibility rules for holidays and different teams. Depends on 5–7.
- [x] **9. Verify analytics and CSV.** Compare fixture totals across the table and exported file. Cover filters, pagination, empty ranges, quoting and formula-like input. Verify an employee or team lead cannot export data outside their scope. Depends on 6–8.
- [x] **10. Verify search and notifications.** Exercise results, unread counts, pagination, mark-read and links to reassigned or archived tasks. Verify results and direct links respect organization and team access. Depends on 3–4 and 8.
- [x] **11. Verify authenticated UI.** Check representative employee and manager routes on desktop and mobile, including loading/empty/error states, keyboard navigation and focus. Run the authenticated workday through checkout and report review. Depends on 5–10.

Checkpoint: fixture data matches attendance, reports and exports. The complete authenticated workday passes and the quality suite is green.

## 12–18. Complete release requirements

- [ ] **12. Private attachments.** If required, add private upload/download and deletion against the selected storage provider. Check size/type, tenant boundaries, denied downloads, cleanup and retention. Depends on 3–4 and the storage decision.
- [ ] **13. Audit browsing.** If required, add scoped filters, pagination and export as agreed. Verify ordinary and unauthorized requests against two organizations. Depends on 3–4 and the audit scope decision.
- [ ] **14. AI and search limiting.** Record first-release scope for each. Verify disabled AI behavior or test configured role scope, retention and failure handling. If the topology requires a shared search limit, verify it across instances. Depends on 10 and the deployment decision.
- [ ] **15. Google OAuth.** Verify sign-in and logout, invite matching, suspended-account denial and session revocation on the target test domain. Depends on 4 and test credentials.
- [ ] **16. Resend and Inngest.** Verify approved test-recipient delivery, signed webhooks and retry behavior. Exercise local jobs and hosted discovery, schedules, reminders and summaries in preview. Compare provider delivery and job history against application state. Depends on 5, 8 and provider configuration.
- [ ] **17. Verify database upgrade.** Compare ledgers and schema against each existing environment. With a suitable disposable copy, rehearse upgrade and restore, then compare records and schema with the intended result. Run a separate fresh migration check. Depends on owner evidence and a reviewed upgrade strategy.
- [ ] **18. Verify preview and prepare release.** Run the production environment validator, current dependency checks, role-based preview smoke flows and operational checks for backups, monitoring and rollback. Record sign-off and any explicitly deferred features before release. Depends on 11–17 as applicable.

Checkpoint: preview passes, existing-data upgrade evidence is recorded where applicable, and required provider flows are verified.
