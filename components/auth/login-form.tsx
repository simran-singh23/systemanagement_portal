"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import { Eye, EyeOff } from "lucide-react";
import { loginWithPassword, type AuthFormState } from "@/actions/password.actions";

const initialState: AuthFormState = {};

function SubmitButton() {
  const { pending } = useFormStatus();
  return <button type="submit" disabled={pending} className="flex h-12 w-full items-center justify-center rounded-xl bg-[#2563eb] px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-[#1d4ed8] disabled:cursor-not-allowed disabled:opacity-65">{pending ? "Signing in…" : "Sign in"}</button>;
}

export function LoginForm() {
  const [state, action] = useActionState(loginWithPassword, initialState);
  const [showPassword, setShowPassword] = useState(false);
  return (
    <form action={action} className="space-y-4">
      {state.message && <p role="alert" className="rounded-xl border border-[#f5c7c2] bg-[#fff5f4] px-4 py-3 text-sm text-[#a83931]">{state.message}</p>}
      <label className="block text-sm font-medium text-[#344054]">Work email
        <input name="email" type="email" autoComplete="email" required maxLength={254} className="mt-1.5 h-11 w-full rounded-xl border border-[#dfe4eb] bg-white px-3.5 text-sm text-[#172033] outline-none transition placeholder:text-[#98a2b3] focus:border-[#8eb2ff] focus:ring-4 focus:ring-[#2563eb]/10" placeholder="you@company.com" />
      </label>
      <label className="block text-sm font-medium text-[#344054]">Password
        <span className="relative mt-1.5 block">
          <input name="password" type={showPassword ? "text" : "password"} autoComplete="current-password" required maxLength={256} className="h-11 w-full rounded-xl border border-[#dfe4eb] bg-white px-3.5 pr-11 text-sm text-[#172033] outline-none transition placeholder:text-[#98a2b3] focus:border-[#8eb2ff] focus:ring-4 focus:ring-[#2563eb]/10" placeholder="Enter your password" />
          <button type="button" onClick={() => setShowPassword((visible) => !visible)} aria-label={showPassword ? "Hide password" : "Show password"} className="absolute inset-y-0 right-0 grid w-11 place-items-center text-[#667085] hover:text-[#172033]">{showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}</button>
        </span>
      </label>
      <div className="flex justify-end"><Link href="/forgot-password" className="text-xs font-semibold text-[#2563eb] hover:text-[#1d4ed8]">Forgot password?</Link></div>
      <SubmitButton />
    </form>
  );
}

export function GoogleSubmitButton() {
  const { pending } = useFormStatus();
  return <button type="submit" disabled={pending} className="flex h-12 w-full items-center justify-center gap-3 rounded-xl border border-[#dfe4eb] bg-white text-sm font-semibold text-[#344054] shadow-sm transition hover:border-[#b8cdf7] hover:bg-[#f8faff] disabled:cursor-wait disabled:opacity-65">
    <svg aria-hidden="true" viewBox="0 0 24 24" className="size-[18px]">
      <path fill="#4285F4" d="M21.6 12.23c0-.71-.06-1.4-.18-2.07H12v3.92h5.38a4.6 4.6 0 0 1-2 3.02v2.55h3.24c1.9-1.75 2.98-4.33 2.98-7.42Z" />
      <path fill="#34A853" d="M12 22c2.7 0 4.98-.9 6.63-2.35l-3.24-2.55c-.9.6-2.05.96-3.39.96-2.61 0-4.82-1.76-5.61-4.13H3.04v2.63A10 10 0 0 0 12 22Z" />
      <path fill="#FBBC05" d="M6.39 13.93A6.02 6.02 0 0 1 6.08 12c0-.67.11-1.32.31-1.93V7.44H3.04A10 10 0 0 0 2 12c0 1.64.39 3.19 1.04 4.56l3.35-2.63Z" />
      <path fill="#EA4335" d="M12 5.94c1.47 0 2.79.5 3.82 1.5l2.88-2.88A9.65 9.65 0 0 0 12 2a10 10 0 0 0-8.96 5.44l3.35 2.63C7.18 7.7 9.39 5.94 12 5.94Z" />
    </svg>
    {pending ? "Connecting to Google…" : "Continue with Google"}
  </button>;
}
