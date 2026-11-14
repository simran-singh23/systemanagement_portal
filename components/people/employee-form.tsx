"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import type { UserRole, UserStatus } from "@prisma/client";
import { createEmployee, updateEmployee } from "@/actions/employee.actions";
import { SubmitButton } from "@/components/people/submit-button";
import type { FormState } from "@/lib/validations";
import { InitialPasswordFields } from "./initial-password-fields";

type TeamOption = { id: string; name: string };
type EmployeeInitial = {
  id: string;
  name: string;
  email: string;
  jobTitle: string;
  department: string;
  role: "PRODUCT_MANAGER" | "TEAM_LEAD" | "EMPLOYEE";
  status: UserStatus;
  teamId: string;
};

type EmployeeFormProps = {
  organizationId: string;
  actorRole: UserRole;
  teams: TeamOption[];
  initial?: EmployeeInitial;
};

const inputClass = "mt-2 h-11 w-full rounded-xl border border-[#dfe4eb] bg-white px-3.5 text-sm text-[#253047] outline-none transition placeholder:text-[#a7afbd] focus:border-[#80a7f5] focus:ring-4 focus:ring-[#eef4ff]";
const initialState: FormState = {};

export function EmployeeForm({ organizationId, actorRole, teams, initial }: EmployeeFormProps) {
  const action = initial ? updateEmployee.bind(null, initial.id) : createEmployee;
  const [result, formAction, pending] = useActionState(action, initialState);
  const state = pending ? initialState : result;
  const [loginMethod, setLoginMethod] = useState(actorRole === "SUPER_ADMIN" ? "ADMIN_PASSWORD" : "EMAIL_INVITE");
  const roles = actorRole === "SUPER_ADMIN"
    ? ["PRODUCT_MANAGER", "TEAM_LEAD", "EMPLOYEE"] as const
    : ["TEAM_LEAD", "EMPLOYEE"] as const;

  return (
    <form action={formAction} className="space-y-6">
      <input type="hidden" name="organizationId" value={organizationId} />

      {(state.message || state.success) && (
        <p role="status" className={`rounded-xl border px-4 py-3 text-sm ${state.success ? "border-[#b9e7d2] bg-[#effaf5] text-[#147252]" : "border-[#f2c6c1] bg-[#fff5f4] text-[#a83931]"}`}>
          {state.message}
        </p>
      )}

      <div className="grid gap-5 sm:grid-cols-2">
        <label className="text-sm font-medium text-[#344054]">
          Full name
          <input className={inputClass} name="name" required defaultValue={initial?.name} placeholder="e.g. Maya Singh" />
          {state.errors?.name && <span className="mt-1.5 block text-xs text-[#b42318]">{state.errors.name[0]}</span>}
        </label>
        <label className="text-sm font-medium text-[#344054]">
          Work email
          <input className={`${inputClass} disabled:bg-[#f5f7fa] disabled:text-[#7c8799]`} name="email" type="email" required={!initial} disabled={Boolean(initial)} defaultValue={initial?.email} placeholder="name@company.com" />
          {state.errors?.email && <span className="mt-1.5 block text-xs text-[#b42318]">{state.errors.email[0]}</span>}
        </label>
        <label className="text-sm font-medium text-[#344054]">
          Job title
          <input className={inputClass} name="jobTitle" defaultValue={initial?.jobTitle} placeholder="Product designer" />
        </label>
        <label className="text-sm font-medium text-[#344054]">
          Department
          <input className={inputClass} name="department" list="department-options" defaultValue={initial?.department} placeholder="Design" />
          <datalist id="department-options"><option value="Product" /><option value="Design" /><option value="Engineering" /><option value="Growth" /><option value="Operations" /><option value="People" /></datalist>
        </label>
        <label className="text-sm font-medium text-[#344054]">
          Role
          <select className={inputClass} name="role" defaultValue={initial?.role ?? "EMPLOYEE"}>
            {roles.map((role) => <option key={role} value={role}>{role.replaceAll("_", " ").toLowerCase()}</option>)}
          </select>
          {state.errors?.role && <span className="mt-1.5 block text-xs text-[#b42318]">{state.errors.role[0]}</span>}
        </label>
        <label className="text-sm font-medium text-[#344054]">
          Primary team
          <select className={inputClass} name="teamId" defaultValue={initial?.teamId ?? ""}>
            <option value="">No team assigned</option>
            {teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}
          </select>
          {state.errors?.teamId && <span className="mt-1.5 block text-xs text-[#b42318]">{state.errors.teamId[0]}</span>}
        </label>
        {initial && (
          <label className="text-sm font-medium text-[#344054]">
            Account status
            <select className={inputClass} name="status" defaultValue={initial.status}>
              <option value="ACTIVE">Active</option>
              <option value="INVITED">Invited</option>
              <option value="SUSPENDED">Deactivated</option>
            </select>
            {state.errors?.status && <span className="mt-1.5 block text-xs text-[#b42318]">{state.errors.status[0]}</span>}
          </label>
        )}
      </div>

      {!initial && (actorRole === "SUPER_ADMIN" ? <fieldset className="space-y-4 rounded-xl border border-[var(--line)] p-4 sm:p-5">
        <legend className="px-2 text-sm font-semibold text-[var(--ink)]">Login setup</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex items-start gap-3 rounded-lg border border-[var(--line)] p-3 text-sm text-[var(--ink)]"><input type="radio" name="loginMethod" value="ADMIN_PASSWORD" checked={loginMethod === "ADMIN_PASSWORD"} onChange={() => setLoginMethod("ADMIN_PASSWORD")} className="mt-1" /><span><span className="font-semibold">Create login with password</span><span className="mt-1 block text-xs leading-5 text-[var(--muted)]">Active immediately. No email or Google account required.</span></span></label>
          <label className="flex items-start gap-3 rounded-lg border border-[var(--line)] p-3 text-sm text-[var(--ink)]"><input type="radio" name="loginMethod" value="EMAIL_INVITE" checked={loginMethod === "EMAIL_INVITE"} onChange={() => setLoginMethod("EMAIL_INVITE")} className="mt-1" /><span><span className="font-semibold">Send email invitation</span><span className="mt-1 block text-xs leading-5 text-[var(--muted)]">Employee sets their own password. Requires email delivery.</span></span></label>
        </div>
        {loginMethod === "ADMIN_PASSWORD" && <InitialPasswordFields errors={state.errors} />}
      </fieldset> : <input type="hidden" name="loginMethod" value="EMAIL_INVITE" />)}

      <div className="flex flex-wrap items-center justify-end gap-3 border-t border-[#edf0f4] pt-5">
        <Link href="/dashboard/employees" className="inline-flex h-11 items-center rounded-xl border border-[#dfe4eb] bg-white px-5 text-sm font-semibold text-[#475467] hover:bg-[#f8faff]">Cancel</Link>
        <SubmitButton label={initial ? "Save employee" : loginMethod === "ADMIN_PASSWORD" ? "Create employee" : "Invite employee"} pendingLabel={initial ? "Saving…" : loginMethod === "ADMIN_PASSWORD" ? "Creating…" : "Inviting…"} />
      </div>
    </form>
  );
}
