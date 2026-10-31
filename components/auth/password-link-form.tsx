"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { requestPasswordLink, setPassword, type AuthFormState } from "@/actions/password.actions";

const initialState: AuthFormState = {};

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return <button disabled={pending} className="h-12 w-full rounded-xl bg-[#2563eb] px-4 text-sm font-semibold text-white transition hover:bg-[#1d4ed8] disabled:opacity-60">{pending ? "Please wait…" : label}</button>;
}

export function ForgotPasswordForm() {
  const [state, action] = useActionState(requestPasswordLink, initialState);
  return <form action={action} className="space-y-4">
    {state.message && <p role="status" className="rounded-xl border border-[#c8dbff] bg-[#f4f8ff] px-4 py-3 text-sm text-[#214c9b]">{state.message}</p>}
    <label className="block text-sm font-medium text-[#344054]">Work email<input name="email" type="email" required maxLength={254} autoComplete="email" className="mt-1.5 h-11 w-full rounded-xl border border-[#dfe4eb] bg-white px-3.5 text-sm outline-none focus:border-[#8eb2ff] focus:ring-4 focus:ring-[#2563eb]/10" placeholder="you@company.com" /></label>
    <Submit label="Send password link" />
  </form>;
}

export function SetPasswordForm({ token }: { token: string }) {
  const [state, action] = useActionState(setPassword, initialState);
  return <form action={action} className="space-y-4">
    <input type="hidden" name="token" value={token} />
    {state.message && <p role="alert" className="rounded-xl border border-[#f5c7c2] bg-[#fff5f4] px-4 py-3 text-sm text-[#a83931]">{state.message}</p>}
    <label className="block text-sm font-medium text-[#344054]">New password<input name="password" type="password" required minLength={12} maxLength={128} autoComplete="new-password" className="mt-1.5 h-11 w-full rounded-xl border border-[#dfe4eb] bg-white px-3.5 text-sm outline-none focus:border-[#8eb2ff] focus:ring-4 focus:ring-[#2563eb]/10" /></label>
    <label className="block text-sm font-medium text-[#344054]">Confirm password<input name="confirmation" type="password" required minLength={12} maxLength={128} autoComplete="new-password" className="mt-1.5 h-11 w-full rounded-xl border border-[#dfe4eb] bg-white px-3.5 text-sm outline-none focus:border-[#8eb2ff] focus:ring-4 focus:ring-[#2563eb]/10" /></label>
    <p className="text-xs text-[#667085]">Use at least 12 characters.</p>
    <Submit label="Save password" />
  </form>;
}
