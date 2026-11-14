"use client";

import { useActionState } from "react";
import { setInitialEmployeePassword } from "@/actions/employee.actions";
import { InitialPasswordFields } from "./initial-password-fields";
import { SubmitButton } from "./submit-button";
import type { FormState } from "@/lib/validations";

export function InitialPasswordForm({ organizationId, employeeId }: { organizationId: string; employeeId: string }) {
  const [state, action] = useActionState(setInitialEmployeePassword.bind(null, employeeId), {} as FormState);
  return <section className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-5 sm:p-7">
    <h2 className="font-semibold text-[var(--ink)]">Create employee login</h2>
    <p className="mt-2 text-sm leading-6 text-[var(--muted)]">Activate this pending account with an initial password. No invitation email is sent.</p>
    <form action={action} className="mt-5 space-y-4">
      <input type="hidden" name="organizationId" value={organizationId} />
      {state.message && <p role="alert" className="text-sm text-[var(--danger)]">{state.message}</p>}
      <InitialPasswordFields errors={state.errors} />
      <SubmitButton label="Create login and activate" pendingLabel="Creating login…" />
    </form>
  </section>;
}
