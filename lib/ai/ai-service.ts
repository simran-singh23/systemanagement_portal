import "server-only";

import type { AiFeedbackRating, Prisma, UserRole } from "@prisma/client";
import { requireCurrentOrganization } from "@/lib/dal/auth";
import { prisma } from "@/lib/prisma";
import { createAiResponse, AiProviderConfigurationError } from "./ai-client";
import { buildAiContext } from "./context-builder";
import { systemPrompt, userPrompt } from "./prompts";
import { consumeAiBurst } from "./rate-limit";
import { aiResponseSchema, type AiIntent, type AiResponse, type AiSource } from "./schemas";
import { filterGroundedResponse, isAiRoleAuthorized } from "./policy";

export type AiFeatureState = {
  enabled: boolean;
  assistantEnabled: boolean;
  summariesEnabled: boolean;
  authorized: boolean;
  providerConfigured: boolean;
  role: UserRole;
  requestLimit: number;
  tokenLimit: number;
  retentionDays: number;
};

export type AiGenerationView = {
  id: string;
  type: AiIntent;
  output: AiResponse;
  sources: AiSource[];
  createdAt: string;
  cached: boolean;
  totalTokens: number;
};

function monthStart() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

function featureEnabled(intent: AiIntent, settings: { aiSummaryEnabled: boolean; aiAssistantEnabled: boolean }) {
  return intent === "ASSISTANT" ? settings.aiAssistantEnabled : settings.aiSummaryEnabled;
}

async function accessContext() {
  const context = await requireCurrentOrganization("reports:read-all");
  const role = context.membership?.role ?? context.user.role;
  const settings = await prisma.organizationSettings.findUnique({ where: { organizationId: context.organization.id } });
  return { ...context, role, settings };
}

async function purgeExpiredGenerations(organizationId: string) {
  await prisma.aiGeneration.deleteMany({ where: { organizationId, expiresAt: { lte: new Date() } } });
}

export async function getAiFeatureState(): Promise<AiFeatureState> {
  const context = await accessContext();
  const settings = context.settings;
  return {
    enabled: settings?.aiEnabled ?? false,
    assistantEnabled: settings?.aiAssistantEnabled ?? false,
    summariesEnabled: settings?.aiSummaryEnabled ?? false,
    authorized: settings ? isAiRoleAuthorized(settings.aiAuthorizedRoles, context.role) : false,
    providerConfigured: Boolean(process.env.OPENAI_API_KEY && process.env.OPENAI_MODEL),
    role: context.role,
    requestLimit: settings?.aiMonthlyRequestLimit ?? 100,
    tokenLimit: settings?.aiMonthlyTokenLimit ?? 500_000,
    retentionDays: settings?.aiRetentionDays ?? 7,
  };
}

export async function getAiUsage() {
  const context = await accessContext();
  const usage = await prisma.aiGeneration.aggregate({ where: { organizationId: context.organization.id, createdAt: { gte: monthStart() } }, _count: { _all: true }, _sum: { totalTokens: true } });
  return { requests: usage._count._all, tokens: usage._sum.totalTokens ?? 0, requestLimit: context.settings?.aiMonthlyRequestLimit ?? 100, tokenLimit: context.settings?.aiMonthlyTokenLimit ?? 500_000 };
}

export async function getAiPageData() {
  const context = await accessContext();
  const settings = context.settings;
  const state: AiFeatureState = {
    enabled: settings?.aiEnabled ?? false,
    assistantEnabled: settings?.aiAssistantEnabled ?? false,
    summariesEnabled: settings?.aiSummaryEnabled ?? false,
    authorized: settings ? isAiRoleAuthorized(settings.aiAuthorizedRoles, context.role) : false,
    providerConfigured: Boolean(process.env.OPENAI_API_KEY && process.env.OPENAI_MODEL),
    role: context.role,
    requestLimit: settings?.aiMonthlyRequestLimit ?? 100,
    tokenLimit: settings?.aiMonthlyTokenLimit ?? 500_000,
    retentionDays: settings?.aiRetentionDays ?? 7,
  };

  if (!state.enabled || !state.authorized) {
    return { state, usage: { requests: 0, tokens: 0, requestLimit: state.requestLimit, tokenLimit: state.tokenLimit }, recent: [] as AiGenerationView[] };
  }

  await purgeExpiredGenerations(context.organization.id);

  const [usage, rows] = await Promise.all([
    prisma.aiGeneration.aggregate({ where: { organizationId: context.organization.id, createdAt: { gte: monthStart() } }, _count: { _all: true }, _sum: { totalTokens: true } }),
    prisma.aiGeneration.findMany({ where: { organizationId: context.organization.id, requestedById: context.user.id, status: "SUCCEEDED", expiresAt: { gt: new Date() } }, orderBy: { createdAt: "desc" }, take: 8 }),
  ]);
  const recent = rows.flatMap(toGenerationView);
  return { state, usage: { requests: usage._count._all, tokens: usage._sum.totalTokens ?? 0, requestLimit: state.requestLimit, tokenLimit: state.tokenLimit }, recent };
}

export async function generateAiInsight(intent: AiIntent, question?: string): Promise<AiGenerationView> {
  const context = await accessContext();
  const settings = context.settings;
  if (!settings?.aiEnabled || !featureEnabled(intent, settings)) throw new Error("AI_DISABLED");
  if (!isAiRoleAuthorized(settings.aiAuthorizedRoles, context.role)) throw new Error("AI_FORBIDDEN");
  if (!consumeAiBurst(`${context.organization.id}:${context.user.id}`)) throw new Error("AI_RATE_LIMITED");

  await purgeExpiredGenerations(context.organization.id);

  const usage = await prisma.aiGeneration.aggregate({ where: { organizationId: context.organization.id, createdAt: { gte: monthStart() } }, _count: { _all: true }, _sum: { totalTokens: true } });
  if (usage._count._all >= settings.aiMonthlyRequestLimit || (usage._sum.totalTokens ?? 0) >= settings.aiMonthlyTokenLimit) throw new Error("AI_USAGE_LIMIT");
  const recentRequests = await prisma.aiGeneration.count({ where: { organizationId: context.organization.id, requestedById: context.user.id, createdAt: { gte: new Date(Date.now() - 60_000) } } });
  if (recentRequests >= 5) throw new Error("AI_RATE_LIMITED");

  const built = await buildAiContext({ organizationId: context.organization.id, actor: { id: context.user.id, role: context.role }, intent, question, timezone: settings.timezone, maxChars: settings.aiContextMaxChars });
  const cached = await prisma.aiGeneration.findFirst({ where: { organizationId: context.organization.id, requestedById: context.user.id, type: intent, contextHash: built.contextHash, status: "SUCCEEDED", expiresAt: { gt: new Date() } }, orderBy: { createdAt: "desc" } });
  if (cached?.output) {
    return { id: cached.id, type: intent, output: aiResponseSchema.parse(cached.output), sources: built.sources, createdAt: cached.createdAt.toISOString(), cached: true, totalTokens: cached.totalTokens };
  }

  const model = process.env.OPENAI_MODEL?.trim() || "unconfigured";
  const expiresAt = new Date(Date.now() + settings.aiRetentionDays * 86_400_000);
  try {
    const provider = await createAiResponse(systemPrompt(intent), userPrompt(question, built.sourceCatalog, built.workRecords));
    const output = filterGroundedResponse(provider.output, built.sources);
    const record = await prisma.aiGeneration.create({ data: { organizationId: context.organization.id, requestedById: context.user.id, type: intent, status: "SUCCEEDED", question, output: JSON.parse(JSON.stringify(output)) as Prisma.InputJsonValue, sourceRefs: JSON.parse(JSON.stringify(built.sources)) as Prisma.InputJsonValue, contextHash: built.contextHash, provider: "OPENAI", model: provider.model, inputTokens: provider.inputTokens, outputTokens: provider.outputTokens, totalTokens: provider.totalTokens, expiresAt } });
    return { id: record.id, type: intent, output, sources: built.sources, createdAt: record.createdAt.toISOString(), cached: false, totalTokens: record.totalTokens };
  } catch (error) {
    const errorCode = error instanceof AiProviderConfigurationError ? "PROVIDER_NOT_CONFIGURED" : error instanceof Error && error.name === "AbortError" ? "PROVIDER_TIMEOUT" : "PROVIDER_ERROR";
    await prisma.aiGeneration.create({ data: { organizationId: context.organization.id, requestedById: context.user.id, type: intent, status: "FAILED", question, sourceRefs: JSON.parse(JSON.stringify(built.sources)) as Prisma.InputJsonValue, contextHash: built.contextHash, provider: "OPENAI", model, errorCode, expiresAt } });
    throw new Error(errorCode);
  }
}

export async function saveAiFeedback(generationId: string, rating: AiFeedbackRating) {
  const context = await accessContext();
  if (!context.settings?.aiEnabled || !isAiRoleAuthorized(context.settings.aiAuthorizedRoles, context.role)) throw new Error("AI_FORBIDDEN");
  const generation = await prisma.aiGeneration.findFirst({ where: { id: generationId, organizationId: context.organization.id }, select: { id: true } });
  if (!generation) throw new Error("AI_GENERATION_NOT_FOUND");
  await prisma.aiFeedback.upsert({ where: { generationId_userId: { generationId, userId: context.user.id } }, create: { organizationId: context.organization.id, generationId, userId: context.user.id, rating }, update: { rating } });
}

export async function getRecentAiGenerations(limit = 8) {
  const context = await accessContext();
  if (!context.settings?.aiEnabled || !isAiRoleAuthorized(context.settings.aiAuthorizedRoles, context.role)) return [];
  const rows = await prisma.aiGeneration.findMany({ where: { organizationId: context.organization.id, requestedById: context.user.id, status: "SUCCEEDED", expiresAt: { gt: new Date() } }, orderBy: { createdAt: "desc" }, take: Math.min(limit, 20) });
  return rows.flatMap(toGenerationView);
}

function toGenerationView(row: { id: string; type: AiIntent; output: Prisma.JsonValue | null; sourceRefs: Prisma.JsonValue; createdAt: Date; totalTokens: number }) {
  const output = aiResponseSchema.safeParse(row.output);
  const sources = aiSourceArray(row.sourceRefs);
  return output.success ? [{ id: row.id, type: row.type, output: output.data, sources, createdAt: row.createdAt.toISOString(), cached: true, totalTokens: row.totalTokens } satisfies AiGenerationView] : [];
}

function aiSourceArray(value: Prisma.JsonValue): AiSource[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const parsed = importSource(item);
    return parsed ? [parsed] : [];
  });
}

function importSource(value: unknown) {
  const parsed = (value && typeof value === "object") ? value as Record<string, unknown> : {};
  if (typeof parsed.id !== "string" || typeof parsed.label !== "string" || typeof parsed.href !== "string" || (parsed.type !== "TASK" && parsed.type !== "REPORT")) return null;
  if (!parsed.href.startsWith("/dashboard/")) return null;
  return { id: parsed.id, label: parsed.label, href: parsed.href, type: parsed.type } satisfies AiSource;
}
