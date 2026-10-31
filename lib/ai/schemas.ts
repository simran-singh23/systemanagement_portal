import { z } from "zod";

export const aiIntentSchema = z.enum(["DAILY_SUMMARY", "BLOCKERS", "WORKLOAD", "ASSISTANT"]);

export const aiRequestSchema = z.object({
  intent: aiIntentSchema,
  question: z.string().trim().min(4, "Ask a more specific question.").max(500).optional(),
}).superRefine((value, context) => {
  if (value.intent === "ASSISTANT" && !value.question) {
    context.addIssue({ code: "custom", path: ["question"], message: "Enter a question for the assistant." });
  }
});

export const aiSourceSchema = z.object({
  id: z.string().min(1).max(120),
  type: z.enum(["TASK", "REPORT"]),
  label: z.string().min(1).max(180),
  href: z.string().startsWith("/dashboard/"),
});

export const aiInsightSchema = z.object({
  title: z.string().min(1).max(140),
  detail: z.string().min(1).max(700),
  kind: z.enum(["FACT", "SUGGESTION", "MISSING_INFORMATION"]),
  sourceIds: z.array(z.string().max(120)).max(8),
});

export const aiResponseSchema = z.object({
  headline: z.string().min(1).max(180),
  summary: z.string().min(1).max(1200),
  insights: z.array(aiInsightSchema).max(8),
  followUps: z.array(z.string().min(1).max(220)).max(5),
});

export const aiFeedbackSchema = z.object({
  generationId: z.string().min(1),
  rating: z.enum(["HELPFUL", "NOT_HELPFUL", "INCORRECT"]),
});

export type AiIntent = z.infer<typeof aiIntentSchema>;
export type AiSource = z.infer<typeof aiSourceSchema>;
export type AiResponse = z.infer<typeof aiResponseSchema>;
