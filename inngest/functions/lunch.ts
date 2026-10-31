import { automationRunEvent, inngest } from "@/inngest/client";
import { executeAutomation } from "@/lib/automation";

export const lunchReminderAutomation = inngest.createFunction(
  { id: "teamflow-lunch-reminders", name: "Lunch break reminders", retries: 4, idempotency: "event.data.runKey", triggers: [{ event: automationRunEvent, if: 'event.data.automation == "LUNCH_REMINDER"' }] },
  async ({ event, step, logger }) => {
    const result = await step.run("execute-lunch-reminder", () => executeAutomation(event.data));
    logger.info("Lunch reminder completed", { organizationId: event.data.organizationId, status: result.status, notificationsCreated: result.notificationsCreated });
    return result;
  },
);
