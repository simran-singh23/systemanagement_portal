import Link from "next/link";
import { requireUser } from "@/lib/dal/auth";
import { dashboardPathForRole } from "@/lib/permissions";

export default async function UnauthorizedPage() {
  const user = await requireUser();

  return (
    <main className="grid min-h-screen place-items-center bg-[#f5f7fb] px-5">
      <div className="max-w-md rounded-3xl border border-[#e6eaf0] bg-white p-10 text-center shadow-[0_18px_50px_rgba(16,24,40,0.08)]">
        <p className="font-mono text-xs font-semibold uppercase tracking-[0.15em] text-[#2563eb]">Access restricted</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-[#172033]">You don&apos;t have permission to view this page.</h1>
        <p className="mt-3 text-sm leading-6 text-[#667085]">Your TeamFlow role is {user.role.replaceAll("_", " ").toLowerCase()}.</p>
        <Link href={dashboardPathForRole(user.role)} className="mt-7 inline-flex rounded-xl bg-[#2563eb] px-5 py-3 text-sm font-semibold text-white">Return to dashboard</Link>
      </div>
    </main>
  );
}
