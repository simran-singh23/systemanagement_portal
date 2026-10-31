import type { Metadata } from "next";
import Link from "next/link";
import { SetPasswordForm } from "@/components/auth/password-link-form";

export const metadata: Metadata = { title: "Set password", referrer: "no-referrer" };

export default async function SetPasswordPage({ searchParams }: PageProps<"/set-password">) {
  const { token } = await searchParams;
  const safeToken = typeof token === "string" && token.length <= 128 ? token : "";
  return <main className="flex min-h-screen items-center justify-center bg-[#fbfcfe] px-5 py-12">
    <section className="w-full max-w-md rounded-3xl border border-[#e5eaf1] bg-white p-6 shadow-[0_18px_60px_rgba(23,32,51,0.07)] sm:p-9">
      <Link href="/login" className="text-sm font-semibold text-[#2563eb]">← Back to sign in</Link>
      <p className="mb-3 mt-9 font-mono text-xs font-semibold uppercase tracking-[0.16em] text-[#2563eb]">First-time setup</p>
      <h1 className="text-3xl font-semibold tracking-[-0.045em] text-[#172033]">Create your password</h1>
      <p className="mb-7 mt-2 text-sm leading-6 text-[#667085]">Choose a strong password to activate your invited workspace access.</p>
      {safeToken ? <SetPasswordForm token={safeToken} /> : <p role="alert" className="rounded-xl border border-[#f5c7c2] bg-[#fff5f4] px-4 py-3 text-sm text-[#a83931]">This password link is missing or invalid. Request another from the sign-in page.</p>}
    </section>
  </main>;
}
