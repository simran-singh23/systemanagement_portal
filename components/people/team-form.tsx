"use client";

import Link from "next/link";
import { useActionState } from "react";
import { createTeam, updateTeam } from "@/actions/team.actions";
import { SubmitButton } from "@/components/people/submit-button";
import type { FormState } from "@/lib/validations";

type MemberOption = { id: string; name: string; email: string; role: string; department: string | null; status: "ACTIVE" | "INACTIVE" };
type TeamInitial = { id: string; name: string; description: string; color: string; managerId: string; memberIds: string[] };

const inputClass = "mt-2 h-11 w-full rounded-xl border border-[#dfe4eb] bg-white px-3.5 text-sm text-[#253047] outline-none transition placeholder:text-[#a7afbd] focus:border-[#80a7f5] focus:ring-4 focus:ring-[#eef4ff]";
const initialState: FormState = {};

export function TeamForm({ organizationId, members, initial, canAssignLead = true }: { organizationId: string; members: MemberOption[]; initial?: TeamInitial; canAssignLead?: boolean }) {
  const action = initial ? updateTeam.bind(null, initial.id) : createTeam;
  const [state, formAction] = useActionState(action, initialState);

  return (
    <form action={formAction} className="space-y-6">
      <input type="hidden" name="organizationId" value={organizationId} />
      {(state.message || state.success) && <p role="status" className={`rounded-xl border px-4 py-3 text-sm ${state.success ? "border-[#b9e7d2] bg-[#effaf5] text-[#147252]" : "border-[#f2c6c1] bg-[#fff5f4] text-[#a83931]"}`}>{state.message}</p>}

      <div className="grid gap-5 sm:grid-cols-[1fr_9rem]">
        <label className="text-sm font-medium text-[#344054]">Team name<input className={inputClass} name="name" required defaultValue={initial?.name} placeholder="Product Design" />{state.errors?.name && <span className="mt-1.5 block text-xs text-[#b42318]">{state.errors.name[0]}</span>}</label>
        <label className="text-sm font-medium text-[#344054]">Team color<input className={`${inputClass} px-2`} name="color" type="color" defaultValue={initial?.color ?? "#2563EB"} /></label>
      </div>
      <label className="block text-sm font-medium text-[#344054]">Description<textarea name="description" rows={3} defaultValue={initial?.description} placeholder="What this team owns and how it works." className="mt-2 w-full resize-none rounded-xl border border-[#dfe4eb] bg-white px-3.5 py-3 text-sm text-[#253047] outline-none transition focus:border-[#80a7f5] focus:ring-4 focus:ring-[#eef4ff]" /></label>
      {canAssignLead ? <label className="block text-sm font-medium text-[#344054]">Team lead<select className={inputClass} name="managerId" defaultValue={initial?.managerId ?? ""}><option value="">No lead assigned</option>{members.map((member) => <option key={member.id} value={member.id}>{member.name} · {member.status === "ACTIVE" ? member.role.replaceAll("_", " ").toLowerCase() : "inactive — remove assignment to save"}</option>)}</select>{state.errors?.managerId && <span role="alert" className="mt-1.5 block text-xs text-[#b42318]">{state.errors.managerId[0]}</span>}</label> : <div><input type="hidden" name="managerId" value={initial?.managerId ?? ""} /><p className="text-sm font-medium text-[#344054]">Team lead</p><div className={`${inputClass} flex items-center bg-[#f5f7fa] text-[#667085]`}>{members.find((member) => member.id === initial?.managerId)?.name || "No lead assigned"}</div><p className="mt-1.5 text-xs text-[#98a2b3]">A product manager can change team leadership.</p>{state.errors?.managerId && <p role="alert" className="mt-1.5 text-xs text-[#b42318]">{state.errors.managerId[0]}</p>}</div>}

      <fieldset>
        <legend className="text-sm font-medium text-[#344054]">Members</legend>
        <p className="mt-1 text-xs text-[#7c8799]">Choose everyone who should have access to this team&apos;s work.</p>
        <div className="mt-3 grid max-h-80 gap-2 overflow-y-auto rounded-2xl border border-[#e3e8ef] bg-[#fafbfc] p-3 sm:grid-cols-2">
          {members.map((member) => (
            <label key={member.id} className="flex cursor-pointer items-center gap-3 rounded-xl border border-transparent bg-white p-3 transition hover:border-[#c9d8f6]">
              <input type="checkbox" name="memberIds" value={member.id} defaultChecked={initial?.memberIds.includes(member.id)} className="size-4 rounded accent-[#2563eb]" />
              <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-[#eef4ff] text-[10px] font-bold text-[#2555a7]">{member.name.split(" ").map((part) => part[0]).slice(0, 2).join("")}</span>
              <span className="min-w-0"><span className="block truncate text-sm font-medium text-[#344054]">{member.name}</span><span className="block truncate text-[11px] text-[#98a2b3]">{member.status === "ACTIVE" ? member.department || "No department" : "Inactive account or organization membership — remove this selection to save"}</span></span>
            </label>
          ))}
          {!members.length && <p className="p-4 text-sm text-[#7c8799]">Add active employees before assigning team members.</p>}
        </div>
        {state.errors?.memberIds && <p role="alert" className="mt-2 text-xs text-[#b42318]">{state.errors.memberIds[0]}</p>}
      </fieldset>

      <div className="flex flex-wrap items-center justify-end gap-3 border-t border-[#edf0f4] pt-5">
        <Link href="/dashboard/teams" className="inline-flex h-11 items-center rounded-xl border border-[#dfe4eb] bg-white px-5 text-sm font-semibold text-[#475467] hover:bg-[#f8faff]">Cancel</Link>
        <SubmitButton label={initial ? "Save team" : "Create team"} pendingLabel="Saving…" />
      </div>
    </form>
  );
}
