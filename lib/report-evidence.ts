import type { TaskStatus } from "@prisma/client";
import { unionMilliseconds, type TimeInterval } from "./work-time";

type TaskRecord = { id: string; title: string; status: TaskStatus };
type TaskSession = TimeInterval & { taskId: string | null; task: TaskRecord | null };
type EvidenceTask = TaskRecord & { milliseconds: number; completedToday: boolean };

export function buildReportTaskEvidence(input: {
  sessions: TaskSession[];
  completedTasks: (TaskRecord & { completedAt: Date | null })[];
  currentTasks: TaskRecord[];
  attendance: TimeInterval | null;
  reportDate: string;
  today: string;
  now: Date;
}): EvidenceTask[] {
  const sessionsByTask = new Map<string, { task: TaskRecord; intervals: TimeInterval[] }>();
  for (const session of input.sessions) {
    if (!session.taskId || !session.task) continue;
    const current = sessionsByTask.get(session.taskId) ?? { task: session.task, intervals: [] };
    current.intervals.push({ startedAt: session.startedAt, endedAt: session.endedAt });
    sessionsByTask.set(session.taskId, current);
  }

  const result = new Map<string, EvidenceTask>();
  for (const [id, item] of sessionsByTask) {
    result.set(id, { ...item.task, milliseconds: unionMilliseconds(item.intervals, input.now, input.attendance ?? undefined), completedToday: false });
  }
  for (const task of input.completedTasks) {
    result.set(task.id, { id: task.id, title: task.title, status: task.status, milliseconds: result.get(task.id)?.milliseconds ?? 0, completedToday: true });
  }
  if (input.reportDate === input.today) {
    for (const task of input.currentTasks) {
      if (!result.has(task.id)) result.set(task.id, { ...task, milliseconds: 0, completedToday: false });
    }
  }
  return [...result.values()];
}

export function isReportExpected(dateKey: string, workDays: readonly number[], holiday: boolean, required: boolean) {
  return required && !holiday && workDays.includes(new Date(`${dateKey}T00:00:00.000Z`).getUTCDay());
}
