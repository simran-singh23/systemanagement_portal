"use client";

import { useActionState } from "react";
import type { TaskStatus } from "@prisma/client";
import { updateMyTaskStatus } from "@/actions/task.actions";
import type { FormState } from "@/lib/validations";

export function EmployeeStatusForm({ taskId, status }: { taskId: string; status: TaskStatus }) {
  const [state, action, pending] = useActionState(updateMyTaskStatus, {} as FormState);
  const labels: Partial<Record<TaskStatus, string>> = { TODO: "To do", IN_PROGRESS: "In progress", BLOCKED: "Blocked", REVIEW: "In review", COMPLETED: "Completed" };
  const transitions: Partial<Record<TaskStatus, TaskStatus[]>> = { TODO: ["IN_PROGRESS", "BLOCKED"], IN_PROGRESS: ["BLOCKED", "REVIEW", "COMPLETED"], BLOCKED: ["IN_PROGRESS", "REVIEW"], REVIEW: ["IN_PROGRESS", "COMPLETED"] };
  const options = [status, ...(transitions[status] || [])];
  return <form action={action} className="flex flex-wrap items-center gap-2"><input type="hidden" name="taskId" value={taskId} /><select name="status" defaultValue={status} aria-label="Task status" className="h-9 rounded-lg border border-[#dfe4eb] bg-white px-2.5 text-xs font-semibold text-[#475467] outline-none focus:border-[#80a7f5]">{options.map((option) => <option key={option} value={option}>{labels[option]}</option>)}</select><button disabled={pending} className="h-9 rounded-lg bg-[#172033] px-3 text-xs font-semibold text-white disabled:opacity-60">{pending ? "Saving…" : "Update"}</button>{state.message && <span role="status" className={`w-full text-xs ${state.success ? "text-[#157357]" : "text-[#b42318]"}`}>{state.message}</span>}</form>;
}
