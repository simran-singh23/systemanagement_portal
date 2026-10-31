# Task workflow fixes — 2026-10-31

This batch covers the Tasks section. It preserves the earlier local database/email changes. Team-management and employee-invitation workflows are the next separate batches.

## Fixed behavior

- Task list links and manager notifications using `/dashboard/tasks?task=<id>` open the authorized detail drawer, including discussion and activity. Task titles open details; editing remains a separate action.
- Task creation and editing interpret local date/time inputs in the organization's configured timezone. The editor, list, board, details and deadline notifications use the same timezone. Calendar overflow and nonexistent daylight-saving times are rejected.
- Editing forms carry the task version they loaded. A stale form cannot silently overwrite newer task changes.
- Assignees must have both an active account and an active organization membership. The picker excludes suspended accounts, and forged form values are rejected on the server.
- Actor permissions and task relations are checked again inside save transactions. Team-lead access stays within managed teams.
- Archiving a task with a running timer returns inline feedback and keeps the task page usable. Reassignment, team changes and status changes also require the active task timer to be paused.
- The board refreshes from changed server data, serializes pending moves, restores the previous state after a failed request, and uses stable drag-and-drop accessibility IDs. The drag overlay is excluded from keyboard focus and the accessibility tree.
- Task creation, manager edits, employee status changes and timer-driven status changes coordinate board ordering. Timer start/completion append the task to its destination column.
- After a task is completed or removed from the queue, the timer submits the next available task selected on screen instead of retaining the previous task ID.

## Verification

Fifteen new browser workflows use their own isolated organizations, users and tasks. They cover creation/editing with a timezone different from the development machine, discussion edits/deletion, stale-board refresh, running-timer restrictions, suspended assignees, modified team-lead requests, employee workflow/comment restrictions, reassignment, keyboard ordering, failed/overlapping moves, stale editors, pointer drag, comment authorship, timer-driven ordering and continuing to the next queued task without a reload.

```bash
TEST_DATABASE_URL='postgresql://YOUR_MAC_USER@127.0.0.1:5432/teamflow_test?schema=public' npx playwright test tests/e2e/tasks.spec.ts --workers=1
```

The complete browser suite passes 29 tests; two older storage-state-based smoke checks remain skipped without their supplied sessions. All 113 unit tests and the 18 database/email/automation regression checks pass. Lint and TypeScript pass. Fixtures are deleted from the dedicated test database afterward; no existing application database is used.

Private attachment upload remains outside this task batch. Existing attachment metadata/links are preserved. No new database migration is required by these task fixes.
