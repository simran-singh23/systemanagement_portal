import "server-only";

import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { aiResponseSchema, type AiResponse } from "./schemas";

export type AiProviderResult = {
  output: AiResponse;
  model: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
};

export class AiProviderConfigurationError extends Error {}

export async function createAiResponse(system: string, user: string): Promise<AiProviderResult> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  const model = process.env.OPENAI_MODEL?.trim();
  if (!apiKey || !model) throw new AiProviderConfigurationError("AI provider is not configured.");

  const client = new OpenAI({ apiKey, timeout: 20_000, maxRetries: 1 });
  const response = await client.responses.parse({
    model,
    store: false,
    max_output_tokens: 1_600,
    input: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    text: { format: zodTextFormat(aiResponseSchema, "teamflow_manager_insight") },
  }, { signal: AbortSignal.timeout(22_000) });

  if (!response.output_parsed) throw new Error("AI_RESPONSE_UNAVAILABLE");
  const output = aiResponseSchema.parse(response.output_parsed);
  return {
    output,
    model,
    inputTokens: response.usage?.input_tokens ?? 0,
    outputTokens: response.usage?.output_tokens ?? 0,
    totalTokens: response.usage?.total_tokens ?? 0,
  };
}
