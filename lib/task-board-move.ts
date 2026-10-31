import type { TaskStatus } from "@prisma/client";

type Column = { status: TaskStatus; taskIds: string[] };
type TaskSnapshot = { id: string; status: TaskStatus };

export function validBoardSnapshot(input: { taskId: string; fromStatus: TaskStatus; toStatus: TaskStatus; columns: Column[] }, current: readonly TaskSnapshot[]) {
  const expectedStatuses = input.fromStatus === input.toStatus ? [input.fromStatus] : [input.fromStatus, input.toStatus];
  if (input.columns.length !== expectedStatuses.length || new Set(input.columns.map((column) => column.status)).size !== input.columns.length) return false;
  if (expectedStatuses.some((status) => !input.columns.some((column) => column.status === status))) return false;
  const ids = input.columns.flatMap((column) => column.taskIds);
  if (ids.length !== current.length || new Set(ids).size !== ids.length) return false;
  const original = new Map(current.map((task) => [task.id, task.status]));
  if (original.get(input.taskId) !== input.fromStatus) return false;
  if (!input.columns.find((column) => column.status === input.toStatus)?.taskIds.includes(input.taskId)) return false;
  return input.columns.every((column) => column.taskIds.every((id) => original.get(id) === (id === input.taskId ? input.fromStatus : column.status)));
}
