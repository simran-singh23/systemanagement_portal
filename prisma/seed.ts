import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

if (process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production") {
  throw new Error("Development seed data must never run against a production environment.");
}

const connectionString =
  process.env.DATABASE_URL ??
  "postgresql://postgres:postgres@127.0.0.1:5432/teamflow?schema=public";
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

const ids = {
  organization: "org_northstar",
  settings: "settings_northstar",
  superAdmin: "user_super_admin",
  manager: "user_product_manager",
  lead: "user_team_lead",
  employee: "user_employee_maya",
  employeeTwo: "user_employee_noah",
  teamDesign: "team_product_design",
  teamGrowth: "team_growth",
  taskOne: "task_onboarding_states",
  taskTwo: "task_mobile_handoff",
  attendance: "attendance_maya_today",
  workSession: "work_session_maya_today",
  break: "break_maya_lunch",
  report: "report_maya_today",
  reportTask: "report_task_onboarding",
  notification: "notification_task_assigned",
  leave: "leave_noah_sick",
  holiday: "holiday_northstar_diwali",
  comment: "comment_handoff",
  attachment: "attachment_handoff",
  activity: "activity_task_created",
  pulse: "pulse_maya_today",
};

const startOfToday = new Date();
startOfToday.setUTCHours(0, 0, 0, 0);
const atTime = (hours: number, minutes = 0) => {
  const date = new Date(startOfToday);
  date.setUTCHours(hours, minutes, 0, 0);
  return date;
};
const plusDays = (days: number) => {
  const date = new Date(startOfToday);
  date.setUTCDate(date.getUTCDate() + days);
  return date;
};

async function main() {
  await prisma.$transaction(async (tx) => {
    const users = [
      { id: ids.superAdmin, name: "Riya Sharma", email: "admin@teamflow.dev", role: "SUPER_ADMIN" as const, jobTitle: "Platform administrator" },
      { id: ids.manager, name: "Aarav Mehta", email: "manager@teamflow.dev", role: "PRODUCT_MANAGER" as const, jobTitle: "Product manager" },
      { id: ids.lead, name: "Priya Kapoor", email: "lead@teamflow.dev", role: "TEAM_LEAD" as const, jobTitle: "Design lead" },
      { id: ids.employee, name: "Maya Singh", email: "employee@teamflow.dev", role: "EMPLOYEE" as const, jobTitle: "Product designer" },
      { id: ids.employeeTwo, name: "Noah Williams", email: "noah@teamflow.dev", role: "EMPLOYEE" as const, jobTitle: "Content strategist" },
    ];

    for (const user of users) {
      await tx.user.upsert({
        where: { email: user.email },
        update: { id: user.id, name: user.name, role: user.role, status: "ACTIVE", jobTitle: user.jobTitle, emailVerified: startOfToday },
        create: { ...user, status: "ACTIVE", emailVerified: startOfToday },
      });
    }

    await tx.organization.upsert({
      where: { slug: "northstar-studio" },
      update: { id: ids.organization, name: "Northstar Studio", ownerId: ids.superAdmin, contactEmail: "hello@northstar.example", description: "A product studio running its team operations with TeamFlow." },
      create: { id: ids.organization, name: "Northstar Studio", slug: "northstar-studio", ownerId: ids.superAdmin, contactEmail: "hello@northstar.example", description: "A product studio running its team operations with TeamFlow." },
    });

    await tx.organizationSettings.upsert({
      where: { organizationId: ids.organization },
      update: { timezone: "Asia/Kolkata", workdayStart: "09:00", workdayEnd: "18:00", workDays: [1, 2, 3, 4, 5], lateGraceMins: 15, expectedDailyMinutes: 480, checkInReminderTime: "09:00", checkInCutoffTime: "09:30", lunchReminderTime: "14:00", dailyReportReminderTime: "17:30", dailyReportDueTime: "18:00", managerSummaryTime: "19:00", taskDeadlineReminderHours: [24, 2], enableCheckInReminders: true, enableMissingCheckInAlerts: true, notifyManagersMissingCheckIn: true, enableLunchReminders: true, enableTaskDeadlineReminders: true, notifyManagersOverdueTasks: true, enableDailyReportReminders: true, enableMissingReportAlerts: true, notifyManagersMissingReports: true, enableDailyTeamSummary: true, allowReportBeforeCheckout: true },
      create: { id: ids.settings, organizationId: ids.organization, timezone: "Asia/Kolkata", workdayStart: "09:00", workdayEnd: "18:00", workDays: [1, 2, 3, 4, 5], lateGraceMins: 15, taskDeadlineReminderHours: [24, 2] },
    });
    await tx.organizationHoliday.upsert({
      where: { organizationId_holidayDate: { organizationId: ids.organization, holidayDate: new Date("2026-11-09T00:00:00.000Z") } },
      update: { name: "Diwali" },
      create: { id: ids.holiday, organizationId: ids.organization, holidayDate: new Date("2026-11-09T00:00:00.000Z"), name: "Diwali" },
    });

    for (const user of users) {
      const department = user.role === "SUPER_ADMIN"
        ? "Operations"
        : user.role === "PRODUCT_MANAGER"
          ? "Product"
          : user.jobTitle.toLowerCase().includes("design")
            ? "Design"
            : "Growth";
      await tx.organizationMember.upsert({
        where: { organizationId_userId: { organizationId: ids.organization, userId: user.id } },
        update: { role: user.role, status: "ACTIVE", department },
        create: { organizationId: ids.organization, userId: user.id, role: user.role, status: "ACTIVE", department, joinedAt: plusDays(-90) },
      });
    }

    await tx.team.upsert({
      where: { id: ids.teamDesign },
      update: { name: "Product Design", managerId: ids.lead },
      create: { id: ids.teamDesign, organizationId: ids.organization, name: "Product Design", description: "Product experience and design systems", managerId: ids.lead, color: "#7251C9" },
    });
    await tx.team.upsert({
      where: { id: ids.teamGrowth },
      update: { name: "Growth", managerId: ids.manager },
      create: { id: ids.teamGrowth, organizationId: ids.organization, name: "Growth", description: "Acquisition, content, and launch programs", managerId: ids.manager, color: "#16855B" },
    });

    for (const member of [
      { teamId: ids.teamDesign, userId: ids.lead, role: "LEAD" as const },
      { teamId: ids.teamDesign, userId: ids.employee, role: "MEMBER" as const },
      { teamId: ids.teamGrowth, userId: ids.manager, role: "LEAD" as const },
      { teamId: ids.teamGrowth, userId: ids.employeeTwo, role: "MEMBER" as const },
    ]) {
      await tx.teamMember.upsert({
        where: { teamId_userId: { teamId: member.teamId, userId: member.userId } },
        update: { role: member.role },
        create: member,
      });
    }

    await tx.task.upsert({
      where: { id: ids.taskOne },
      update: { status: "COMPLETED", assignedToId: ids.employee, startAt: atTime(9, 15) },
      create: { id: ids.taskOne, organizationId: ids.organization, teamId: ids.teamDesign, title: "Polish onboarding empty states", description: "Finalize copy and illustration direction for all empty states.", status: "COMPLETED", priority: "HIGH", createdById: ids.lead, assignedToId: ids.employee, startAt: atTime(9, 15), dueAt: atTime(11), completedAt: atTime(10, 20), estimatedMins: 180 },
    });
    await tx.task.upsert({
      where: { id: ids.taskTwo },
      update: { status: "IN_PROGRESS", assignedToId: ids.employee, startAt: atTime(10, 30) },
      create: { id: ids.taskTwo, organizationId: ids.organization, teamId: ids.teamDesign, title: "Prepare mobile handoff notes", description: "Document states, spacing tokens, and interaction notes for engineering.", status: "IN_PROGRESS", priority: "HIGH", createdById: ids.lead, assignedToId: ids.employee, startAt: atTime(10, 30), dueAt: atTime(13, 30), estimatedMins: 120 },
    });

    await tx.attendance.upsert({
      where: { id: ids.attendance },
      update: { status: "PRESENT", checkInAt: atTime(9, 6) },
      create: { id: ids.attendance, organizationId: ids.organization, userId: ids.employee, attendanceDate: startOfToday, status: "PRESENT", checkInAt: atTime(9, 6) },
    });
    await tx.workSession.upsert({
      where: { id: ids.workSession },
      update: { startedAt: atTime(9, 6), endedAt: atTime(17, 36), durationMins: 480 },
      create: { id: ids.workSession, organizationId: ids.organization, attendanceId: ids.attendance, userId: ids.employee, startedAt: atTime(9, 6), endedAt: atTime(17, 36), durationMins: 480 },
    });
    await tx.break.upsert({
      where: { id: ids.break },
      update: { startedAt: atTime(13), endedAt: atTime(13, 30), durationMins: 30 },
      create: { id: ids.break, organizationId: ids.organization, userId: ids.employee, attendanceId: ids.attendance, workSessionId: ids.workSession, type: "LUNCH", startedAt: atTime(13), endedAt: atTime(13, 30), durationMins: 30 },
    });

    await tx.dailyReport.upsert({
      where: { id: ids.report },
      update: { summary: "Completed onboarding empty states and prepared the mobile handoff." },
      create: { id: ids.report, organizationId: ids.organization, userId: ids.employee, attendanceId: ids.attendance, reportDate: startOfToday, status: "SUBMITTED", summary: "Completed onboarding empty states and prepared the mobile handoff.", blockers: "Waiting for final content review.", nextPlan: "Review research highlights and update the weekly design report.", submittedAt: atTime(17, 40) },
    });
    await tx.dailyReportTask.upsert({
      where: { dailyReportId_taskId: { dailyReportId: ids.report, taskId: ids.taskOne } },
      update: { minutesSpent: 165 },
      create: { id: ids.reportTask, dailyReportId: ids.report, taskId: ids.taskOne, minutesSpent: 165, note: "Finalized all desktop and mobile variants.", titleSnapshot: "Polish onboarding empty states", statusSnapshot: "COMPLETED", completedToday: true },
    });

    await tx.notification.upsert({
      where: { id: ids.notification },
      update: { title: "New task assigned", eventId: `seed.task-assigned:${ids.taskTwo}:${ids.employee}` },
      create: { id: ids.notification, organizationId: ids.organization, userId: ids.employee, actorId: ids.lead, type: "TASK_ASSIGNED", title: "New task assigned", message: "Prepare mobile handoff notes", link: `/employee/tasks?task=${ids.taskTwo}`, relatedEntityType: "task", relatedEntityId: ids.taskTwo, eventId: `seed.task-assigned:${ids.taskTwo}:${ids.employee}` },
    });
    await tx.leaveRequest.upsert({
      where: { id: ids.leave },
      update: { status: "PENDING", workingDays: 1 },
      create: { id: ids.leave, organizationId: ids.organization, userId: ids.employeeTwo, type: "SICK", status: "PENDING", startDate: plusDays(3), endDate: plusDays(3), reason: "Medical appointment and recovery.", workingDays: 1 },
    });
    await tx.taskComment.upsert({
      where: { id: ids.comment },
      update: { body: "Please include the loading and error states in the handoff." },
      create: { id: ids.comment, taskId: ids.taskTwo, authorId: ids.lead, body: "Please include the loading and error states in the handoff." },
    });
    await tx.taskAttachment.upsert({
      where: { id: ids.attachment },
      update: { fileName: "mobile-handoff-checklist.pdf" },
      create: { id: ids.attachment, taskId: ids.taskTwo, uploaderId: ids.lead, fileName: "mobile-handoff-checklist.pdf", fileUrl: "https://example.invalid/teamflow/mobile-handoff-checklist.pdf", mimeType: "application/pdf", sizeBytes: 248320 },
    });
    await tx.activityLog.upsert({
      where: { id: ids.activity },
      update: { action: "task.created" },
      create: { id: ids.activity, organizationId: ids.organization, actorId: ids.lead, action: "task.created", entityType: "task", entityId: ids.taskTwo, metadata: { title: "Prepare mobile handoff notes", assigneeId: ids.employee } },
    });
    await tx.teamPulse.upsert({
      where: { id: ids.pulse },
      update: { score: 4, mood: "GOOD" },
      create: { id: ids.pulse, organizationId: ids.organization, teamId: ids.teamDesign, userId: ids.employee, pulseDate: startOfToday, score: 4, mood: "GOOD", note: "Clear priorities and good momentum." },
    });
  });

  console.log("TeamFlow development seed completed.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
