import type { UserRole } from "@prisma/client";
import { aiResponseSchema, type AiResponse, type AiSource } from "./schemas";

export function isAiRoleAuthorized(roles: readonly UserRole[], role: UserRole) {
  return roles.includes(role);
}

export function filterGroundedResponse(output: AiResponse, sources: AiSource[]) {
  const allowed = new Set(sources.map((source) => source.id));
  return aiResponseSchema.parse({
    ...output,
    insights: output.insights.flatMap((insight) => {
      const sourceIds = [...new Set(insight.sourceIds.filter((id) => allowed.has(id)))];
      if (insight.kind === "FACT" && !sourceIds.length) return [];
      return [{ ...insight, sourceIds }];
    }),
  });
}
