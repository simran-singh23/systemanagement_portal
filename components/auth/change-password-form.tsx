"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { changePassword, type AuthFormState } from "@/actions/password.actions";

const initialState: AuthFormState = {};

function Submit() {
  const { pending } = useFormStatus();
  return <button disabled={pending} className="h-11 rounded-xl bg-[#2563eb] px-5 text-sm font-semibold text-white hover:bg-[#1d4ed8] disabled:opacity-60">{pending ? "Saving…" : "Update password"}</button>;
}

export function ChangePasswordForm() {
  const [state, action] = useActionState(changePassword, initialState);
  return <form action={action} className="max-w-lg space-y-4 rounded-2xl border border-[#e5eaf1] bg-white p-5 shadow-sm sm:p-6">
    {state.message && <p role={state.success ? "status" : "alert"} className={`rounded-xl px-4 py-3 text-sm ${state.success ? "border border-[#b8e4d0] bg-[#f2fbf6] text-[#176b45]" : "border border-[#f5c7c2] bg-[#fff5f4] text-[#a83931]"}`}>{state.message}</p>}
    <label className="block text-sm font-medium text-[#344054]">Current password<input name="currentPassword" type="password" required autoComplete="current-password" className="mt-1.5 h-11 w-full rounded-xl border border-[#dfe4eb] px-3.5 text-sm outline-none focus:border-[#8eb2ff] focus:ring-4 focus:ring-[#2563eb]/10" /></label>
    <label className="block text-sm font-medium text-[#344054]">New password<input name="password" type="password" required minLength={12} maxLength={128} autoComplete="new-password" className="mt-1.5 h-11 w-full rounded-xl border border-[#dfe4eb] px-3.5 text-sm outline-none focus:border-[#8eb2ff] focus:ring-4 focus:ring-[#2563eb]/10" /></label>
    <label className="block text-sm font-medium text-[#344054]">Confirm new password<input name="confirmation" type="password" required minLength={12} maxLength={128} autoComplete="new-password" className="mt-1.5 h-11 w-full rounded-xl border border-[#dfe4eb] px-3.5 text-sm outline-none focus:border-[#8eb2ff] focus:ring-4 focus:ring-[#2563eb]/10" /></label>
    <Submit />
  </form>;
}
