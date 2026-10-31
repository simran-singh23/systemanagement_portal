import { serve } from "inngest/next";
import { inngest } from "@/inngest/client";
import { dailyEmailAutomation, dailyReportAutomation, dailyTeamSummaryAutomation } from "@/inngest/functions/daily-report";
import { lunchReminderAutomation } from "@/inngest/functions/lunch";
import { automationDispatcher, officeReminderAutomation, taskDeadlineAutomation } from "@/inngest/functions/reminders";

export const maxDuration = 60;

export const { GET, POST, PUT } = serve({ client: inngest, functions: [automationDispatcher, officeReminderAutomation, lunchReminderAutomation, taskDeadlineAutomation, dailyReportAutomation, dailyTeamSummaryAutomation, dailyEmailAutomation] });
