import type { Metadata } from "next";
import Link from "next/link";
import { ForgotPasswordForm } from "@/components/auth/password-link-form";

export const metadata: Metadata = { title: "Forgot password", referrer: "no-referrer" };

export default function ForgotPasswordPage() {
  return <main className="flex min-h-screen items-center justify-center bg-[#fbfcfe] px-5 py-12">
    <section className="w-full max-w-md rounded-3xl border border-[#e5eaf1] bg-white p-6 shadow-[0_18px_60px_rgba(23,32,51,0.07)] sm:p-9">
      <Link href="/login" className="text-sm font-semibold text-[#2563eb]">← Back to sign in</Link>
      <p className="mb-3 mt-9 font-mono text-xs font-semibold uppercase tracking-[0.16em] text-[#2563eb]">Account recovery</p>
      <h1 className="text-3xl font-semibold tracking-[-0.045em] text-[#172033]">Reset your password</h1>
      <p className="mb-7 mt-2 text-sm leading-6 text-[#667085]">Enter your work email. If it belongs to an eligible account, we’ll send a one-time password link.</p>
      <ForgotPasswordForm />
    </section>
  </main>;
}
