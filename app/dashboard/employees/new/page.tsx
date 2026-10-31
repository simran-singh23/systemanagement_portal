import type { Metadata } from "next";
import Link from "next/link";
import { EmployeeForm } from "@/components/people/employee-form";
import { Icon } from "@/components/ui/icons";
import { requireCurrentOrganization } from "@/lib/dal/auth";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = { title: "Add employee" };

export default async function NewEmployeePage() {
  const { user, organization, membership } = await requireCurrentOrganization("members:manage");
  const teams = await prisma.team.findMany({ where: { organizationId: organization.id }, select: { id: true, name: true }, orderBy: { name: "asc" } });

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div><Link href="/dashboard/employees" className="inline-flex items-center gap-2 text-sm font-semibold text-[#667085] hover:text-[#2563eb]"><Icon name="arrowRight" className="size-4 rotate-180" /> Back to employees</Link><p className="mt-7 font-mono text-[11px] font-semibold uppercase tracking-[0.16em] text-[#2563eb]">New team member</p><h1 className="mt-2 text-3xl font-semibold tracking-[-0.045em] text-[#172033]">Add an employee</h1><p className="mt-2 text-sm leading-6 text-[#667085]">Create their workspace profile now. They&apos;ll become active after signing in with the same work email.</p></div>
      <section className="overflow-hidden rounded-2xl border border-[#e6eaf0] bg-white">
        <div className="border-b border-[#edf0f4] bg-[#fbfcff] px-5 py-4 sm:px-7"><h2 className="font-semibold text-[#253047]">Employee details</h2><p className="mt-1 text-xs text-[#7c8799]">Identity, access level, and placement</p></div>
        <div className="p-5 sm:p-7"><EmployeeForm organizationId={organization.id} actorRole={membership?.role ?? user.role} teams={teams} /></div>
      </section>
    </div>
  );
}
