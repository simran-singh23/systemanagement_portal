"use client";

import Link from "next/link";
import { useActionState, useMemo, useState } from "react";
import type { TaskPriority, TaskStatus } from "@prisma/client";
import { createTask, updateTask } from "@/actions/task.actions";
import { SubmitButton } from "@/components/people/submit-button";
import { Icon } from "@/components/ui/icons";
import type { FormState } from "@/lib/validations";

type EmployeeOption = { id: string; name: string; email: string; teamIds: string[] };
type TeamOption = { id: string; name: string };
export type TaskFormInitial = {
  id: string;
  updatedAt: string;
  title: string;
  description: string;
  assignedToId: string;
  teamId: string;
  priority: TaskPriority;
  status: TaskStatus;
  startDate: string;
  dueDate: string;
  estimatedHours: string;
};

const inputClass = "mt-2 h-11 w-full rounded-xl border border-[#dfe4eb] bg-white px-3.5 text-sm text-[#253047] outline-none transition focus:border-[#80a7f5] focus:ring-4 focus:ring-[#eef4ff]";
const initialState: FormState = {};

export function TaskDrawer({ organizationId, employees, teams, initial, timezone }: { organizationId: string; employees: EmployeeOption[]; teams: TeamOption[]; initial?: TaskFormInitial; timezone: string }) {
  const action = initial ? updateTask.bind(null, initial.id) : createTask;
  const [state, formAction] = useActionState(action, initialState);
  const [teamId, setTeamId] = useState(initial?.teamId || "");
  const availableEmployees = useMemo(() => {
    const available = teamId ? employees.filter((employee) => employee.teamIds.includes(teamId)) : employees;
    if (initial && teamId === initial.teamId && initial.assignedToId && !available.some((employee) => employee.id === initial.assignedToId)) {
      const previousAssignee = employees.find((employee) => employee.id === initial.assignedToId);
      if (previousAssignee) return [...available, previousAssignee];
    }
    return available;
  }, [employees, initial, teamId]);

  return (
    <div className="fixed inset-0 z-[70] flex justify-end bg-[#101828]/35 backdrop-blur-[2px]" role="dialog" aria-modal="true" aria-labelledby="task-form-title">
      <Link href="/dashboard/tasks" aria-label="Close task form" className="absolute inset-0" />
      <aside className="relative z-10 flex h-full w-full max-w-[42rem] flex-col overflow-hidden bg-[#fbfcfe] shadow-[-20px_0_60px_rgba(23,32,51,0.15)]">
        <header className="flex items-start justify-between border-b border-[#e6eaf0] bg-white px-5 py-5 sm:px-7"><div><p className="text-xs font-semibold text-[#2563eb]">{initial ? "Edit work item" : "New work item"}</p><h2 id="task-form-title" className="mt-1 text-2xl font-semibold tracking-[-0.04em] text-[#172033]">{initial ? "Update task" : "Create task"}</h2><p className="mt-1 text-sm text-[#7c8799]">Set ownership, timing, and a clear delivery state.</p></div><Link href="/dashboard/tasks" aria-label="Close" className="grid size-10 place-items-center rounded-xl border border-[#e3e8ef] text-[#667085] hover:bg-[#f5f7fa]"><Icon name="x" className="size-4" /></Link></header>
        <form action={formAction} className="flex min-h-0 flex-1 flex-col">
          <input type="hidden" name="organizationId" value={organizationId} />
          {initial ? <input type="hidden" name="expectedUpdatedAt" value={initial.updatedAt} /> : null}
          <div className="flex-1 space-y-6 overflow-y-auto p-5 sm:p-7">
            <p className="text-xs text-[#667085]">Task dates use {timezone.replaceAll("_", " ")}.</p>
            {(state.message || state.success) && <p role="status" className={`rounded-xl border px-4 py-3 text-sm ${state.success ? "border-[#b9e7d2] bg-[#effaf5] text-[#147252]" : "border-[#f2c6c1] bg-[#fff5f4] text-[#a83931]"}`}>{state.message}</p>}
            <label className="block text-sm font-medium text-[#344054]">Task title<input name="title" required defaultValue={initial?.title} placeholder="e.g. Review onboarding handoff" className={inputClass} />{state.errors?.title && <span className="mt-1.5 block text-xs text-[#b42318]">{state.errors.title[0]}</span>}</label>
            <label className="block text-sm font-medium text-[#344054]">Description<textarea name="description" rows={5} defaultValue={initial?.description} placeholder="Add context, acceptance criteria, or useful links." className="mt-2 w-full resize-y rounded-xl border border-[#dfe4eb] bg-white px-3.5 py-3 text-sm text-[#253047] outline-none focus:border-[#80a7f5] focus:ring-4 focus:ring-[#eef4ff]" /></label>
            <div className="grid gap-5 sm:grid-cols-2">
              <label className="text-sm font-medium text-[#344054]">Team<select name="teamId" value={teamId} onChange={(event) => setTeamId(event.target.value)} className={inputClass}><option value="">No team</option>{teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}</select></label>
              <label className="text-sm font-medium text-[#344054]">Assigned employee<select name="assignedToId" defaultValue={initial?.assignedToId || ""} className={inputClass}><option value="">Unassigned</option>{availableEmployees.map((employee) => <option key={employee.id} value={employee.id}>{employee.name} · {employee.email}{initial?.assignedToId === employee.id && teamId === initial.teamId && !employee.teamIds.includes(teamId) ? " · existing assignment" : ""}</option>)}</select></label>
              <label className="text-sm font-medium text-[#344054]">Priority<select name="priority" defaultValue={initial?.priority || "MEDIUM"} className={inputClass}><option value="LOW">Low</option><option value="MEDIUM">Medium</option><option value="HIGH">High</option><option value="URGENT">Urgent</option></select></label>
              <label className="text-sm font-medium text-[#344054]">Status<select name="status" defaultValue={initial?.status || "TODO"} className={inputClass}><option value="TODO">To do</option><option value="IN_PROGRESS">In progress</option><option value="BLOCKED">Blocked</option><option value="REVIEW">In review</option><option value="COMPLETED">Completed</option></select></label>
              <label className="text-sm font-medium text-[#344054]">Start date<input name="startDate" type="datetime-local" defaultValue={initial?.startDate} className={inputClass} />{state.errors?.startDate ? <span className="mt-1.5 block text-xs text-[#b42318]">{state.errors.startDate[0]}</span> : null}</label>
              <label className="text-sm font-medium text-[#344054]">Due date<input name="dueDate" type="datetime-local" defaultValue={initial?.dueDate} className={inputClass} />{state.errors?.dueDate && <span className="mt-1.5 block text-xs text-[#b42318]">{state.errors.dueDate[0]}</span>}</label>
              <label className="text-sm font-medium text-[#344054]">Estimated hours<input name="estimatedHours" type="number" min="0.25" step="0.25" defaultValue={initial?.estimatedHours} placeholder="2.5" className={inputClass} />{state.errors?.estimatedHours && <span className="mt-1.5 block text-xs text-[#b42318]">{state.errors.estimatedHours[0]}</span>}</label>
            </div>
          </div>
          <footer className="flex items-center justify-end gap-3 border-t border-[#e6eaf0] bg-white px-5 py-4 sm:px-7"><Link href="/dashboard/tasks" className="inline-flex h-11 items-center rounded-xl border border-[#dfe4eb] px-5 text-sm font-semibold text-[#475467] hover:bg-[#f7f8fa]">Cancel</Link><SubmitButton label={initial ? "Save changes" : "Create task"} pendingLabel={initial ? "Saving…" : "Creating…"} /></footer>
        </form>
      </aside>
    </div>
  );
}
