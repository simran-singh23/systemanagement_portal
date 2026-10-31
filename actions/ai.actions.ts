"use server";

import { revalidatePath } from "next/cache";
import { generateAiInsight, saveAiFeedback, type AiGenerationView } from "@/lib/ai/ai-service";
import { aiFeedbackSchema, aiRequestSchema } from "@/lib/ai/schemas";

export type AiActionState = { success?: boolean; message?: string; generation?: AiGenerationView };

const messages: Record<string, string> = {
  AI_DISABLED: "AI insights are not enabled for this organization or insight type.",
  AI_FORBIDDEN: "Your current organization role cannot use AI insights.",
  AI_RATE_LIMITED: "Too many requests were sent. Wait a minute and try again.",
  AI_USAGE_LIMIT: "This organization's monthly AI usage limit has been reached.",
  PROVIDER_NOT_CONFIGURED: "The AI provider is not configured.",
  PROVIDER_TIMEOUT: "The AI provider took too long to respond. Try again.",
  PROVIDER_ERROR: "The AI provider could not complete this request. No raw provider details were stored.",
};

export async function requestAiInsight(_state: AiActionState, formData: FormData): Promise<AiActionState> {
  const parsed = aiRequestSchema.safeParse({ intent: formData.get("intent"), question: String(formData.get("question") ?? "").trim() || undefined });
  if (!parsed.success) return { message: parsed.error.issues[0]?.message ?? "Review the request." };
  try {
    const generation = await generateAiInsight(parsed.data.intent, parsed.data.question);
    revalidatePath("/dashboard/ai-assistant");
    return { success: true, message: generation.cached ? "A current cached insight was reused." : "Insight generated. Review its linked evidence before acting.", generation };
  } catch (error) {
    const code = error instanceof Error ? error.message : "PROVIDER_ERROR";
    return { message: messages[code] ?? "The insight could not be generated safely." };
  }
}

export async function submitAiFeedback(input: unknown) {
  const parsed = aiFeedbackSchema.safeParse(input);
  if (!parsed.success) return { success: false, message: "The feedback could not be verified." };
  try {
    await saveAiFeedback(parsed.data.generationId, parsed.data.rating);
    revalidatePath("/dashboard/ai-assistant");
    return { success: true, message: "Feedback saved." };
  } catch {
    return { success: false, message: "Feedback could not be saved." };
  }
}
