import "server-only";

import { createHash } from "node:crypto";
import type { Prisma, UserRole } from "@prisma/client";
import { databaseDate, dateKeyInZone, shiftDateKey } from "@/lib/date-time";
import { prisma } from "@/lib/prisma";
import type { AiIntent, AiSource } from "./schemas";

type ContextActor = { id: string; role: UserRole };

function clip(value: string | null, max: number) {
  return value?.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, " ").slice(0, max) || null;
}

export async function buildAiContext(input: {
  organizationId: string;
  actor: ContextActor;
  intent: AiIntent;
  question?: string;
  timezone: string;
  maxChars: number;
}) {
  const today = dateKeyInZone(new Date(), input.timezone);
  const from = databaseDate(shiftDateKey(today, -6));
  const teamTaskScope: Prisma.TaskWhereInput = input.actor.role === "TEAM_LEAD" ? { team: { managerId: input.actor.id } } : {};
  const reportUserScope: Prisma.UserWhereInput = input.actor.role === "TEAM_LEAD" ? { teamMembers: { some: { team: { organizationId: input.organizationId, managerId: input.actor.id } } } } : {};

  const [tasks, reports] = await Promise.all([
    prisma.task.findMany({
      where: { organizationId: input.organizationId, archivedAt: null, ...teamTaskScope },
      select: { id: true, title: true, description: true, status: true, priority: true, dueAt: true, completedAt: true, estimatedMins: true, team: { select: { name: true } } },
      orderBy: [{ status: "asc" }, { dueAt: "asc" }],
      take: 120,
    }),
    prisma.dailyReport.findMany({
      where: { organizationId: input.organizationId, reportDate: { gte: from }, status: { in: ["SUBMITTED", "REVIEWED"] }, user: reportUserScope },
      select: { id: true, reportDate: true, summary: true, completedWork: true, progress: true, blockers: true, nextPlan: true, tasks: { select: { taskId: true, titleSnapshot: true, statusSnapshot: true, completedToday: true } } },
      orderBy: { reportDate: "desc" },
      take: 60,
    }),
  ]);

  const sources: AiSource[] = [
    ...tasks.map((task) => ({ id: `task:${task.id}`, type: "TASK" as const, label: task.title, href: `/dashboard/tasks/board?task=${task.id}` })),
    ...reports.map((report) => ({ id: `report:${report.id}`, type: "REPORT" as const, label: `Daily report · ${report.reportDate.toISOString().slice(0, 10)}`, href: `/dashboard/reports/${report.id}` })),
  ];
  const sourceCatalog = sources.map((source) => `${source.id} | ${source.type} | ${source.label}`).join("\n") || "No source records are available.";
  const records = {
    scope: { date: today, window: `${shiftDateKey(today, -6)} to ${today}`, taskCount: tasks.length, reportCount: reports.length },
    tasks: tasks.map((task) => ({ sourceId: `task:${task.id}`, title: clip(task.title, 160), description: clip(task.description, 500), status: task.status, priority: task.priority, dueAt: task.dueAt?.toISOString() ?? null, completedAt: task.completedAt?.toISOString() ?? null, estimatedHours: task.estimatedMins ? task.estimatedMins / 60 : null, team: task.team?.name ?? "Unassigned" })),
    reports: reports.map((report) => ({ sourceId: `report:${report.id}`, date: report.reportDate.toISOString().slice(0, 10), summary: clip(report.summary, 900), completedWork: clip(report.completedWork, 700), progress: clip(report.progress, 700), blockers: clip(report.blockers, 700), nextPlan: clip(report.nextPlan, 500), tasks: report.tasks.slice(0, 20).map((task) => ({ sourceId: `task:${task.taskId}`, title: clip(task.titleSnapshot, 160), status: task.statusSnapshot, completedToday: task.completedToday })) })),
  };
  const serialized = JSON.stringify(records);
  const workRecords = serialized.length <= input.maxChars ? serialized : `${serialized.slice(0, input.maxChars)}\n[CONTEXT TRUNCATED AT APPROVED LIMIT]`;
  const contextHash = createHash("sha256").update(JSON.stringify({ actorId: input.actor.id, intent: input.intent, question: input.question ?? null, workRecords })).digest("hex");
  return { sources, sourceCatalog, workRecords, contextHash };
}
