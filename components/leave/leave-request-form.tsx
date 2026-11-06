"use client";

import { useActionState, useState } from "react";
import type { LeaveType } from "@prisma/client";
import { createLeaveRequest } from "@/actions/leave.actions";
import { Icon } from "@/components/ui/icons";
import type { FormState } from "@/lib/validations";

const initialState: FormState = {};

export function LeaveRequestForm({ organizationId, minDate, availableTypes }: { organizationId: string; minDate?: string; availableTypes: readonly LeaveType[] }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(createLeaveRequest, initialState);
  return <>
    <button type="button" onClick={() => setOpen(true)} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#2563eb] px-4 text-sm font-semibold text-white shadow-[0_8px_20px_rgba(37,99,235,0.2)] hover:bg-[#1d55c6]"><Icon name="plus" className="size-4" />Apply for leave</button>
    {!open && !pending && state.message ? <p role="status" className={`pointer-events-none fixed bottom-5 right-5 z-[70] max-w-sm rounded-xl border px-4 py-3 text-sm shadow-xl ${state.success ? "border-[#bfe8d6] bg-[#ecf9f3] text-[#147653]" : "border-[#f2c8c8] bg-white text-[#b33b3b]"}`}>{state.message}</p> : null}
    {open ? <div className="fixed inset-0 z-[60] flex justify-end bg-[#101828]/35 backdrop-blur-[2px]" role="dialog" aria-modal="true" aria-labelledby="leave-form-title"><button type="button" aria-label="Close leave form" className="absolute inset-0" onClick={() => setOpen(false)} /><div className="relative h-full w-full max-w-xl overflow-y-auto bg-white p-5 shadow-2xl sm:p-8"><div className="flex items-start justify-between"><div><p className="font-mono text-[11px] font-semibold uppercase tracking-[0.16em] text-[#2563eb]">New request</p><h2 id="leave-form-title" className="mt-2 text-2xl font-semibold tracking-[-0.035em] text-[#172033]">Plan time away</h2><p className="mt-2 text-sm leading-6 text-[#667085]">Duration is calculated from your organization&apos;s working days and configured holidays.</p></div><button type="button" onClick={() => setOpen(false)} className="grid size-10 place-items-center rounded-xl border border-[#e1e6ed] text-[#667085] hover:bg-[#f7f8fa]"><Icon name="x" className="size-4" /></button></div>
      <form action={action} className="mt-8 space-y-5"><input type="hidden" name="organizationId" value={organizationId} /><Field label="Leave type" error={state.errors?.type?.[0]}><select name="type" required defaultValue={availableTypes[0]} className={control}>{availableTypes.map((type) => <option key={type} value={type}>{type[0] + type.slice(1).toLowerCase()}</option>)}</select></Field><div className="grid gap-4 sm:grid-cols-2"><Field label="Start date" error={state.errors?.startDate?.[0]}><input name="startDate" type="date" min={minDate} required className={control} /></Field><Field label="End date" error={state.errors?.endDate?.[0]}><input name="endDate" type="date" min={minDate} required className={control} /></Field></div><Field label="Reason" error={state.errors?.reason?.[0]}><textarea name="reason" required minLength={10} rows={5} placeholder="Share enough context for your manager to review the dates." className={control} /></Field><Field label="Notes (optional)" error={state.errors?.notes?.[0]}><textarea name="notes" rows={3} placeholder="Handover or availability notes" className={control} /></Field>{!pending && state.message ? <p role="status" className={`rounded-xl border px-4 py-3 text-sm ${state.success ? "border-[#bfe8d6] bg-[#ecf9f3] text-[#147653]" : "border-[#f2c8c8] bg-[#fff7f6] text-[#b33b3b]"}`}>{state.message}</p> : null}<div className="flex flex-col-reverse gap-2 border-t border-[#edf0f4] pt-5 sm:flex-row sm:justify-end"><button type="button" onClick={() => setOpen(false)} className="h-11 rounded-xl border border-[#dfe4eb] px-5 text-sm font-semibold text-[#475467]">Cancel</button><button disabled={pending} className="h-11 rounded-xl bg-[#2563eb] px-5 text-sm font-semibold text-white disabled:opacity-60">{pending ? "Submitting…" : "Submit request"}</button></div></form>
    </div></div> : null}
  </>;
}

const control = "mt-2 min-h-11 w-full rounded-xl border border-[#dfe4eb] bg-white px-3 py-2.5 text-sm text-[#344054] outline-none focus:border-[#80a7f5] focus:ring-4 focus:ring-[#eef4ff]";
function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) { return <label className="block text-sm font-medium text-[#344054]">{label}{children}{error ? <span className="mt-1 block text-xs text-[#b33b3b]">{error}</span> : null}</label>; }
