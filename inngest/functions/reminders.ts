import { cron } from "inngest";
import { automationRunEvent, inngest } from "@/inngest/client";
import { buildDueAutomationEvents, executeAutomation } from "@/lib/automation";

export const automationDispatcher = inngest.createFunction(
  { id: "teamflow-automation-dispatcher", name: "Dispatch organization automations", retries: 3, triggers: [cron("*/5 * * * *")] },
  async ({ step, logger }) => {
    const due = await step.run("find-due-organization-automations", () => buildDueAutomationEvents(new Date()));
    for (const error of due.configurationErrors) logger.error("Invalid organization automation configuration", error);
    if (!due.events.length) return { queued: 0, configurationErrors: due.configurationErrors.length };
    const result = await step.sendEvent("enqueue-organization-automations", due.events.map((data) => ({ id: data.runKey, name: "teamflow/automation.run", data })));
    logger.info("Organization automations queued", { count: due.events.length });
    return { queued: due.events.length, eventIds: result.ids, configurationErrors: due.configurationErrors.length };
  },
);

export const officeReminderAutomation = inngest.createFunction(
  { id: "teamflow-office-reminders", name: "Check-in and office reminders", retries: 4, idempotency: "event.data.runKey", triggers: [{ event: automationRunEvent, if: 'event.data.automation == "CHECK_IN_REMINDER" || event.data.automation == "MISSING_CHECK_IN"' }] },
  async ({ event, step, logger }) => {
    const result = await step.run("execute-office-reminder", () => executeAutomation(event.data));
    logger.info("Office reminder completed", { organizationId: event.data.organizationId, automation: event.data.automation, status: result.status, notificationsCreated: result.notificationsCreated });
    return result;
  },
);

export const taskDeadlineAutomation = inngest.createFunction(
  { id: "teamflow-task-deadline-reminders", name: "Task deadline reminders", retries: 4, idempotency: "event.data.runKey", triggers: [{ event: automationRunEvent, if: 'event.data.automation == "TASK_DEADLINE"' }] },
  async ({ event, step, logger }) => {
    const result = await step.run("execute-task-deadline-reminders", () => executeAutomation(event.data));
    logger.info("Task deadline scan completed", { organizationId: event.data.organizationId, status: result.status, notificationsCreated: result.notificationsCreated });
    return result;
  },
);
