import { Inngest, eventType } from "inngest";
import { automationPayloadSchema } from "@/lib/automation-schedule";

export const inngest = new Inngest({ id: "teamflow", name: "TeamFlow office automations" });

export const automationRunEvent = eventType("teamflow/automation.run", { schema: automationPayloadSchema });
