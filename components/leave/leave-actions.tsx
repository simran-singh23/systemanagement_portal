"use client";

import { useActionState } from "react";
import { approveLeaveRequest, cancelLeaveRequest, rejectLeaveRequest } from "@/actions/leave.actions";
import type { FormState } from "@/lib/validations";

const initialState: FormState = {};

export function CancelLeaveButton({ organizationId, leaveRequestId }: { organizationId: string; leaveRequestId: string }) {
  const [state, action, pending] = useActionState(cancelLeaveRequest, initialState);
  return <form action={action} onSubmit={(event) => { if (!window.confirm("Cancel this pending leave request?")) event.preventDefault(); }}><input type="hidden" name="organizationId" value={organizationId} /><input type="hidden" name="leaveRequestId" value={leaveRequestId} /><button disabled={pending} className="text-xs font-semibold text-[#b33b3b] hover:underline disabled:opacity-50">{pending ? "Cancelling…" : "Cancel request"}</button>{state.message && !state.success ? <p className="mt-1 text-xs text-[#b33b3b]">{state.message}</p> : null}</form>;
}

export function LeaveApprovalControls({ organizationId, leaveRequestId, disabled }: { organizationId: string; leaveRequestId: string; disabled?: boolean }) {
  const [approveState, approveAction, approving] = useActionState(approveLeaveRequest, initialState);
  const [rejectState, rejectAction, rejecting] = useActionState(rejectLeaveRequest, initialState);
  const state = approveState.message ? approveState : rejectState;
  return <div className="rounded-2xl border border-[#dce4ef] bg-[#f8faff] p-4"><h3 className="text-sm font-semibold text-[#253047]">Decision</h3><p className="mt-1 text-xs leading-5 text-[#7c8799]">Your server-verified decision is final for this workflow.</p><form className="mt-4" action={approveAction}><input type="hidden" name="organizationId" value={organizationId} /><input type="hidden" name="leaveRequestId" value={leaveRequestId} /><textarea name="decisionNotes" rows={3} placeholder="Optional decision notes" className="w-full rounded-xl border border-[#dfe4eb] bg-white px-3 py-2.5 text-sm outline-none focus:border-[#80a7f5]" /><div className="mt-3 grid grid-cols-2 gap-2"><button disabled={disabled || approving || rejecting} formAction={rejectAction} className="h-10 rounded-xl border border-[#efc7c7] bg-white text-sm font-semibold text-[#b33b3b] disabled:opacity-50">{rejecting ? "Rejecting…" : "Reject"}</button><button disabled={disabled || approving || rejecting} className="h-10 rounded-xl bg-[#16855b] text-sm font-semibold text-white disabled:opacity-50">{approving ? "Approving…" : "Approve"}</button></div></form>{state.message ? <p aria-live="polite" className={`mt-3 text-xs ${state.success ? "text-[#147653]" : "text-[#b33b3b]"}`}>{state.message}</p> : null}</div>;
}
