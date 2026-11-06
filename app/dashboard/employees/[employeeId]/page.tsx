import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { deactivateEmployee } from "@/actions/employee.actions";
import { EmployeeForm } from "@/components/people/employee-form";
import { initials, RoleBadge, StatusBadge } from "@/components/people/people-badges";
import { Icon } from "@/components/ui/icons";
import { requireCurrentOrganization } from "@/lib/dal/auth";
import { employeeTeamOrder } from "@/lib/employee-policy";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = { title: "Employee profile" };

export default async function EmployeeProfilePage({ params }: PageProps<"/dashboard/employees/[employeeId]">) {
  const [{ employeeId }, { user: actor, organization, membership: actorMembership }] = await Promise.all([params, requireCurrentOrganization("members:manage")]);
  const [membership, teams, taskCount, completedCount, reportCount, attendanceCount] = await Promise.all([
    prisma.organizationMember.findUnique({
      where: { organizationId_userId: { organizationId: organization.id, userId: employeeId } },
      include: { user: { include: { teamMembers: { where: { team: { organizationId: organization.id } }, include: { team: true }, orderBy: employeeTeamOrder, take: 1 } } } },
    }),
    prisma.team.findMany({ where: { organizationId: organization.id }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.task.count({ where: { organizationId: organization.id, assignedToId: employeeId } }),
    prisma.task.count({ where: { organizationId: organization.id, assignedToId: employeeId, status: "COMPLETED" } }),
    prisma.dailyReport.count({ where: { organizationId: organization.id, userId: employeeId, status: { in: ["SUBMITTED", "REVIEWED"] } } }),
    prisma.attendance.count({ where: { organizationId: organization.id, userId: employeeId, status: { in: ["PRESENT", "REMOTE", "LATE"] } } }),
  ]);
  if (!membership || membership.role === "SUPER_ADMIN") notFound();

  const person = membership.user;
  const primaryTeam = person.teamMembers[0]?.team;
  const deactivate = deactivateEmployee.bind(null, organization.id, employeeId);
  const joined = membership.joinedAt || membership.createdAt;

  return (
    <div className="space-y-6">
      <Link href="/dashboard/employees" className="inline-flex items-center gap-2 text-sm font-semibold text-[#667085] hover:text-[#2563eb]"><Icon name="arrowRight" className="size-4 rotate-180" /> Back to employees</Link>
      <section className="relative overflow-hidden rounded-2xl border border-[#dfe6f3] bg-white p-5 sm:p-7">
        <span className="absolute inset-x-0 top-0 h-1" style={{ backgroundColor: primaryTeam?.color || "#2563eb" }} />
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4"><span className="grid size-16 shrink-0 place-items-center rounded-2xl bg-[#eef4ff] text-lg font-bold text-[#2555a7]">{initials(person.name)}</span><div><div className="flex flex-wrap items-center gap-2"><h1 className="text-2xl font-semibold tracking-[-0.04em] text-[#172033]">{person.name || "Unnamed member"}</h1><StatusBadge status={membership.status} /></div><p className="mt-1 text-sm text-[#667085]">{person.jobTitle || "Team member"} · {membership.department || "No department"}</p><p className="mt-1 text-xs text-[#98a2b3]">{person.email}</p></div></div>
          <div className="flex flex-wrap items-center gap-2"><RoleBadge role={membership.role} />{primaryTeam && <span className="rounded-lg bg-[#f5f7fa] px-2.5 py-1 text-[11px] font-semibold text-[#596579]">{primaryTeam.name}</span>}</div>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[['Assigned tasks', taskCount], ['Completed', completedCount], ['Reports sent', reportCount], ['Days present', attendanceCount]].map(([label, value]) => <div key={label} className="rounded-2xl border border-[#e6eaf0] bg-white p-5"><p className="text-xs font-medium text-[#7c8799]">{label}</p><p className="mt-2 font-mono text-2xl font-semibold text-[#172033]">{value}</p></div>)}
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="overflow-hidden rounded-2xl border border-[#e6eaf0] bg-white"><div className="border-b border-[#edf0f4] bg-[#fbfcff] px-5 py-4 sm:px-7"><h2 className="font-semibold text-[#253047]">Profile and access</h2><p className="mt-1 text-xs text-[#7c8799]">Update role, department, team, or account state</p></div><div className="p-5 sm:p-7"><EmployeeForm organizationId={organization.id} actorRole={actorMembership?.role ?? actor.role} teams={teams} initial={{ id: person.id, name: person.name || "", email: person.email, jobTitle: person.jobTitle || "", department: membership.department || "", role: membership.role, status: membership.status, teamId: primaryTeam?.id || "" }} /></div></div>
        <aside className="space-y-4"><div className="rounded-2xl border border-[#e6eaf0] bg-white p-5"><p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#98a2b3]">Membership</p><dl className="mt-4 space-y-4 text-sm"><div><dt className="text-xs text-[#98a2b3]">Joined</dt><dd className="mt-1 font-medium text-[#344054]">{joined.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</dd></div><div><dt className="text-xs text-[#98a2b3]">Primary team</dt><dd className="mt-1 font-medium text-[#344054]">{primaryTeam?.name || "Not assigned"}</dd></div><div><dt className="text-xs text-[#98a2b3]">Department</dt><dd className="mt-1 font-medium text-[#344054]">{membership.department || "Not assigned"}</dd></div></dl></div>
          {membership.status !== "SUSPENDED" && actor.id !== employeeId && <div className="rounded-2xl border border-[#f0d7d4] bg-[#fffafa] p-5"><h2 className="text-sm font-semibold text-[#8e332d]">Deactivate employee</h2><p className="mt-2 text-xs leading-5 text-[#9f625d]">Blocks sign-in while preserving work history and reports.</p><form action={deactivate}><button className="mt-4 w-full rounded-xl border border-[#e4aaa4] bg-white px-3 py-2.5 text-sm font-semibold text-[#a83931] hover:bg-[#fff3f2]">Deactivate account</button></form></div>}
        </aside>
      </section>
    </div>
  );
}
