import { automationRunEvent, inngest } from "@/inngest/client";
import { executeAutomation } from "@/lib/automation";
import { deliverDailyEmail } from "@/lib/email/delivery";

export const dailyReportAutomation = inngest.createFunction(
  { id: "teamflow-daily-report-reminders", name: "Daily report reminders and alerts", retries: 4, idempotency: "event.data.runKey", triggers: [{ event: automationRunEvent, if: 'event.data.automation == "DAILY_REPORT_REMINDER" || event.data.automation == "MISSING_DAILY_REPORT"' }] },
  async ({ event, step, logger }) => {
    const result = await step.run("execute-daily-report-automation", () => executeAutomation(event.data));
    logger.info("Daily report automation completed", { organizationId: event.data.organizationId, automation: event.data.automation, status: result.status, notificationsCreated: result.notificationsCreated });
    return result;
  },
);

export const dailyTeamSummaryAutomation = inngest.createFunction(
  { id: "teamflow-daily-team-summary", name: "Prepare daily team summary", retries: 4, idempotency: "event.data.runKey", triggers: [{ event: automationRunEvent, if: 'event.data.automation == "DAILY_TEAM_SUMMARY"' }] },
  async ({ event, step, logger }) => {
    const result = await step.run("prepare-daily-team-summary", () => executeAutomation(event.data));
    logger.info("Daily team summary prepared", { organizationId: event.data.organizationId, workDate: event.data.workDate, status: result.status });
    return result;
  },
);

export const dailyEmailAutomation = inngest.createFunction(
  { id: "teamflow-daily-email-report", name: "Deliver daily team report email", retries: 4, idempotency: "event.data.runKey", triggers: [{ event: automationRunEvent, if: 'event.data.automation == "DAILY_EMAIL_REPORT"' }] },
  async ({ event, step, logger }) => {
    const result = await step.run("deliver-daily-team-email", () => deliverDailyEmail(event.data.organizationId, event.data.workDate, event.data.scheduledFor, event.data.runKey));
    logger.info("Daily team email delivery processed", { organizationId: event.data.organizationId, workDate: event.data.workDate, status: result.status, acceptedByProvider: result.deliveredToProvider });
    return result;
  },
);
