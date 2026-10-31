import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { logout } from "@/actions/auth.actions";
import { requireUser } from "@/lib/dal/auth";
import { dashboardPathForRole } from "@/lib/permissions";
import { hasApprovedOrganizationAccess } from "@/lib/member-access";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = { title: "Workspace access pending" };

export default async function PendingAccessPage() {
  const user = await requireUser();
  const [memberships, ownedOrganizationCount] = await Promise.all([
    prisma.organizationMember.findMany({
      where: { userId: user.id },
      select: { status: true },
    }),
    user.role === "SUPER_ADMIN"
      ? prisma.organization.count({ where: { ownerId: user.id } })
      : Promise.resolve(0),
  ]);

  if (hasApprovedOrganizationAccess(memberships, ownedOrganizationCount > 0)) {
    redirect(dashboardPathForRole(user.role));
  }

  return (
    <main className="grid min-h-screen place-items-center bg-[#f5f7fb] px-5 py-12">
      <section className="w-full max-w-lg rounded-3xl border border-[#e6eaf0] bg-white p-8 shadow-[0_18px_50px_rgba(16,24,40,0.08)] sm:p-10">
        <p className="font-mono text-xs font-semibold uppercase tracking-[0.15em] text-[#2563eb]">
          Workspace access pending
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-[#172033]">
          Your account is signed in, but not assigned to a workspace yet.
        </h1>
        <p className="mt-4 text-sm leading-6 text-[#667085]">
          Ask an authorized TeamFlow administrator to add <span className="font-medium text-[#344054]">{user.email}</span> from the Employees page. Your role and organization access will only be granted through that approval process.
        </p>
        <p className="mt-3 text-sm leading-6 text-[#667085]">
          After an administrator adds you, refresh this page. TeamFlow rechecks your membership and role on each request. If access still appears pending, sign out and sign in again.
        </p>
        <form action={logout} className="mt-7">
          <button type="submit" className="inline-flex rounded-xl bg-[#2563eb] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#1d4ed8]">
            Sign out
          </button>
        </form>
      </section>
    </main>
  );
}
