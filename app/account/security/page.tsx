import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/dal/auth";
import { ChangePasswordForm } from "@/components/auth/change-password-form";

export const metadata: Metadata = { title: "Account security" };

export default async function AccountSecurityPage() {
  const user = await requireUser();
  return <main className="min-h-screen bg-[#f7f9fc] px-5 py-10 sm:px-8">
    <div className="mx-auto max-w-4xl">
      <Link href={user.role === "EMPLOYEE" ? "/employee" : "/dashboard"} className="text-sm font-semibold text-[#2563eb]">← Back to workspace</Link>
      <p className="mb-2 mt-8 font-mono text-xs font-semibold uppercase tracking-[0.16em] text-[#2563eb]">Your account</p>
      <h1 className="text-3xl font-semibold tracking-[-0.045em] text-[#172033]">Password & security</h1>
      <p className="mb-7 mt-2 text-sm leading-6 text-[#667085]">Changing your password revokes existing JWT sessions. Sign in again on this and other devices.</p>
      <ChangePasswordForm />
    </div>
  </main>;
}
