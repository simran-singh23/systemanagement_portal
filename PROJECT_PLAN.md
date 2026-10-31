# Project Plan
# TEAMFLOW — Smart Team Management & Work Operations Portal

Build a modern, production-style full-stack Team Management Portal called **TeamFlow** using **Next.js, TypeScript, Tailwind CSS and PostgreSQL**.

The application should help a company manage employees, attendance, tasks, working sessions, lunch/breaks, daily reports, notifications, leave requests and automated manager reports.

The system must be transparent. Do not implement hidden screenshots, keystroke monitoring, webcam monitoring or secret employee tracking. Track only check-ins, check-outs, task timers, breaks, task activity and reports visible to employees.

---

# 1. TECHNOLOGY STACK

Use:

- Next.js with App Router
- TypeScript
- Tailwind CSS
- shadcn/ui 
- PostgreSQL
- Drizzle ORM. / prisma
- Zod validation
- Better Auth for authentication   / oAuth or firebase or supabase
- Inngest for scheduled/background jobs
- Resend for transactional email
- UploadThing or Cloudflare R2 for attachments 
- Recharts for dashboard analytics
- Lucide React for icons
- Vercel for deployment

Keep the architecture modular and scalable.

---

# 2. USER ROLES

Implement Role-Based Access Control.

Roles:

SUPER_ADMIN

PRODUCT_MANAGER

TEAM_LEAD

EMPLOYEE

## Super Admin

Can:
- manage the organization
- create managers
- manage users
- access all reports
- manage settings

## Product Manager

Can:
- create employees
- create teams
- assign tasks
- manage tasks
- view attendance
- view reports
- view analytics
- approve leave requests
- see team activity

## Team Lead

Can:
- view assigned team
- assign/manage team tasks where permitted
- see team progress
- review reports
- comment on tasks

## Employee

Can:
- check in/out
- view assigned tasks
- start/pause/complete tasks
- start/end breaks
- submit daily reports
- request leave
- see own attendance
- see own work history
- receive notifications

Employees must not have access to manager/admin functionality.

---

# 3. AUTHENTICATION

Create:

/login
/register
/forgot-password

Use secure sessions.

After login, redirect users according to role.

Manager → Manager Dashboard

Employee → Employee Dashboard

Protect private routes server-side.

Never depend only on hiding buttons in the frontend for authorization.

---

# 4. MANAGER DASHBOARD

Create a professional dashboard.

Show KPI cards:

Total Employees

Present Today

Absent Today

Currently Working

On Break

Tasks Completed

Tasks Pending

Tasks Overdue

Reports Submitted

Include charts for:

Weekly attendance

Task completion

Working hours

Task status distribution

Also create a Recent Activity section.

Example:

Simran checked in at 9:08 AM.

Aman completed “Homepage Design”.

Rahul submitted his daily report.

A new leave request was submitted.

---

# 5. EMPLOYEE DASHBOARD

Employee dashboard should display:

Greeting

Current date

Check-in status

Working timer

Current task

Today's assigned tasks

Completed tasks

Break status

Upcoming deadlines

Notifications

Daily report status

Team Pulse status

Main action:

CHECK IN

After check-in display:

Checked in: 09:07 AM

Current session: 02h 31m

At the end of the day allow:

CHECK OUT

---

# 6. EMPLOYEE MANAGEMENT

Manager should have an employee management section.

Manager can:

Create employee

Edit employee

Deactivate employee

Assign role

Assign department

Assign team

Assign manager/team lead

View employee profile

Employee profile can show:

Name

Email

Role

Department

Joining date

Attendance summary

Current tasks

Completed tasks

Recent reports

Leave history

Do not expose unnecessary private employee information.

---

# 7. TASK MANAGEMENT

Create a complete task management system.

Task properties:

Title

Description

Priority

Status

Assigned employee

Created by

Team

Start date

Deadline

Estimated hours

Attachments

Comments

Priority:

LOW

MEDIUM

HIGH

URGENT

Status:

TODO

IN_PROGRESS

BLOCKED

REVIEW

COMPLETED

Manager can create and assign tasks.

Employee can update permitted task statuses.

---

# 8. KANBAN BOARD

Create a Trello/Jira-style board.

Columns:

TODO

IN PROGRESS

BLOCKED

REVIEW

COMPLETED

Support drag and drop.

When task status changes, persist the change in PostgreSQL.

Record important changes in Activity Logs.

---

# 9. TASK TIMER

Employee can open a task and select:

START TASK

Create a work session.

Store:

userId

taskId

startedAt

endedAt

duration

status

Allow only valid timer transitions.

Prevent accidental multiple active work sessions for one employee.

Employee can:

Start

Pause

Resume

Finish

Calculate actual time spent on tasks from work-session records instead of trusting a client-side timer.

---

# 10. ATTENDANCE

Attendance system:

CHECK IN

CHECK OUT

Store:

employee

date

checkIn

checkOut

totalOfficeTime

workingTime

breakTime

attendanceStatus

Possible statuses:

PRESENT

ABSENT

LATE

ON_LEAVE

HALF_DAY

The server/database must remain the source of truth for timestamps.

---

# 11. BREAK / LUNCH MANAGEMENT

Employees should be able to select:

START BREAK

END BREAK

Break types:

LUNCH

TEA

PERSONAL

OTHER

Store break start/end time.

Calculate total break duration.

Example:

Check-in: 09:08 AM

Lunch: 02:01–02:42 PM

Check-out: 06:10 PM

Office time: 9h 02m

Break time: 41m

Working time: 8h 21m

---

# 12. AUTOMATION

Use Inngest for background workflows and scheduled jobs.

Possible workflow schedule:

9:00 AM — Check-in reminder

9:30 AM — Missing/late check-in check

1:55 PM — Lunch reminder

2:45 PM — Lunch return reminder where appropriate

5:30 PM — Pending task reminder

6:00 PM — Daily report reminder

6:30 PM — Missing report reminder

7:00 PM — Generate manager daily summary

Make schedules configurable in organization settings rather than hard-coding all office timings.

Use timezone-aware dates.

---

# 13. NOTIFICATION SYSTEM

Create an in-app notification center.

Notification examples:

New task assigned

Task deadline approaching

Task overdue

Manager commented

Lunch reminder

Daily report reminder

Leave approved

Leave rejected

Task moved to review

Notification table should include:

id

userId

type

title

message

read

createdAt

relatedEntityId where relevant

Add notification bell with unread count.

---

# 14. DAILY REPORT

At the end of the day employees submit a Daily Report.

Include:

What did you work on?

Tasks completed

Tasks still in progress

Blockers

Notes

Optional tomorrow plan

System should automatically attach useful calculated data such as:

Check-in

Check-out

Working time

Break time

Task sessions

Completed tasks

Employee should not need to manually type information already known by the system.

---

# 15. MANAGER DAILY EMAIL

After reports are submitted, generate a manager summary.

Example:

DAILY TEAM REPORT

Date: 28 September 2026

Team Members: 10

Present: 9

Absent: 1

Completed Tasks: 17

Pending Tasks: 8

Overdue Tasks: 2

Then show each employee's concise work summary.

Use Resend for email delivery.

Do not put manager email addresses directly inside application logic.

Create environment/configuration support for report recipients.

---

# 16. TEAM PULSE

Create a lightweight end-of-day Team Pulse.

Options:

SMOOTH

NORMAL

BLOCKED

If BLOCKED is selected, allow the employee to describe the work blocker.

Manager dashboard should show aggregated pulse information.

Do not use this feature to diagnose health, mood or employee personality. Keep it specifically about work progress/blockers.

---

# 17. LEAVE MANAGEMENT

Employee can submit leave requests.

Fields:

Leave type

Start date

End date

Reason

Status

Statuses:

PENDING

APPROVED

REJECTED

CANCELLED

Manager can approve/reject requests.

Approved leave should affect attendance calculations.

---

# 18. COMMENTS

Each task can have a discussion area.

Employees and managers can comment on tasks.

Store:

commentId

taskId

userId

content

createdAt

updatedAt

Support edit/delete permissions appropriately.

---

# 19. FILE ATTACHMENTS

Allow task attachments such as:

Images

PDFs

Documents

Design references

Do not store large uploaded files directly inside PostgreSQL.

Store files in object storage and save metadata/URLs in the database.

Validate file size and allowed types.

---

# 20. ACTIVITY LOG

Record important business events.

Examples:

Employee checked in.

Task assigned.

Task started.

Task moved to review.

Task completed.

Daily report submitted.

Leave request approved.

Store:

actor

action

entityType

entityId

metadata

timestamp

Do not create noisy logs for every harmless UI interaction.

---

# 21. ANALYTICS

Manager analytics should include:

Attendance trend

Working hours

Task completion trend

Overdue task count

Task status distribution

Team workload

Report submission rate

Use Recharts.

Avoid simplistic employee ranking or “productivity scores”. Present factual operational metrics instead.

---

# 22. SEARCH AND FILTERING

Provide search/filter functionality.

Employees:

Search by name

Filter by department

Filter by role

Tasks:

Search title

Filter employee

Filter priority

Filter status

Filter deadline

Reports:

Filter employee

Filter date

---

# 23. ORGANIZATION SETTINGS

Create Settings page.

Manager/Admin can configure:

Company name

Timezone

Office start time

Office end time

Lunch start time

Lunch duration

Late threshold

Daily report deadline

Working days

Notification preferences

Report recipient configuration

This is important because cron jobs should use organization configuration.

---

# 24. DATABASE DESIGN

Create appropriate relational tables including:

users

organizations

organization_members

teams

team_members

tasks

task_comments

task_attachments

attendance

work_sessions

breaks

daily_reports

daily_report_tasks

notifications

leave_requests

activity_logs

team_pulses

organization_settings

Use UUIDs where appropriate.

Include:

createdAt

updatedAt

indexes

foreign keys

unique constraints

appropriate delete behaviour

Do not duplicate data unnecessarily.

---

# 25. DATABASE RELATIONSHIPS

Examples:

Organization
→ many users/members

Team
→ many members

User
→ many tasks

User
→ many attendance records

User
→ many work sessions

User
→ many breaks

User
→ many reports

Task
→ many work sessions

Task
→ many comments

Task
→ many attachments

Daily Report
→ related task summaries

---

# 26. VALIDATION

Use Zod.

Validate all important server inputs.

Examples:

Login

Employee creation

Task creation

Task update

Attendance actions

Break actions

Daily report

Leave request

Comments

Settings

Never trust frontend validation alone.

---

# 27. SECURITY

Implement:

Authentication

Authorization

Role permissions

Server-side validation

Secure sessions

Environment variables

Safe file upload validation

Rate limiting where useful

Protected API/webhook endpoints

Safe error handling

Audit/activity logging for important operations

Never expose database credentials or email/API keys to client components.

---

# 28. UI DESIGN

Use a clean professional SaaS dashboard design.

Prefer:

White/light neutral backgrounds

Subtle blue accents

Clean cards

Rounded corners

Soft shadows

Good spacing

Responsive layout

Avoid excessive gradients and unnecessary animations.

Desktop sidebar:

Dashboard

Employees

Teams

Tasks

Attendance

Reports

Leave

Analytics

Activity

Settings

Topbar:

Search

Notifications

User Profile

Mobile should use responsive navigation.

---

# 29. COMPONENT ARCHITECTURE

Build reusable components.

Examples:

Sidebar

Topbar

StatCard

EmployeeCard

TaskCard

TaskForm

TaskTable

KanbanBoard

AttendanceCard

WorkTimer

BreakTimer

ReportForm

NotificationMenu

LeaveForm

ActivityFeed

AnalyticsChart

ConfirmDialog

EmptyState

LoadingSkeleton

Pagination

---

# 30. SERVER ARCHITECTURE

Use Server Components by default.

Use Client Components only when interactivity requires them.

Use Server Actions where they make sense for application mutations.

Use Route Handlers for:

webhooks

external integrations

background-job endpoints

public/internal APIs where required

Keep database operations on the server.

---

# 31. ERROR AND LOADING STATES

Every important page should have:

Loading state

Empty state

Error state

Success feedback

Forms should prevent duplicate submissions.

Use toast notifications for useful action feedback.

---

# 32. RESPONSIVE DESIGN

Support:

Desktop

Laptop

Tablet

Mobile

The employee interface especially should work well on mobile because check-in, tasks, breaks and reports may frequently be accessed there.

---

# 33. PROJECT STRUCTURE

Follow the existing project folder structure.

Organize code around:

app/

components/

actions/

db/

lib/

types/

inngest/

public/

Keep feature-specific code organized instead of putting everything inside one huge file.

---

# 34. DEVELOPMENT PHASES

Do NOT attempt to implement the entire system in one giant change.

PHASE 1

Next.js + TypeScript

Tailwind

shadcn/ui

Base layouts

Sidebar

Topbar

Login UI

Dashboard UI

PHASE 2

PostgreSQL

Drizzle ORM

Database schema

Migrations

Seed development data

PHASE 3

Better Auth

Login

Sessions

RBAC

Protected routes

PHASE 4

Employee management

Teams

Roles

PHASE 5

Task CRUD

Task assignment

Kanban

Comments

PHASE 6

Attendance

Check-in/out

Break tracking

Task work sessions

PHASE 7

Daily reports

Team Pulse

Leave management

PHASE 8

Notifications

Inngest workflows

Scheduled reminders

PHASE 9

Resend email integration

Individual report processing

Manager daily summary

PHASE 10

Analytics

Search

Filtering

Activity logs

PHASE 11

Security review

Error handling

Responsive testing

Performance optimization

PHASE 12

Production database

Vercel deployment

Environment variables

Production testing

---

# 35. IMPORTANT DEVELOPMENT RULE

Before writing code for each phase:

1. Inspect the existing project structure.
2. Reuse existing components where possible.
3. Explain which files will be created or modified.
4. Implement only the current phase.
5. Keep TypeScript strict and avoid `any`.
6. Validate server input.
7. Do not put secrets in source code.
8. Do not replace working functionality unnecessarily.
9. Run lint/type checks after meaningful changes.
10. Keep code modular and readable.

Do not build fake frontend-only functionality when the feature is expected to persist. Connect real features to the database when their implementation phase arrives.

The final result should feel like a real internal company operations product rather than a simple student CRUD dashboard.
