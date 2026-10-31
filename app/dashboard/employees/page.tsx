import type { Metadata } from "next";
import Link from "next/link";
import type { Prisma, UserRole } from "@prisma/client";
import { Icon } from "@/components/ui/icons";
import { ActiveFilterChips, PaginationControls, SortSelector } from "@/components/search/table-controls";
import { initials, RoleBadge, StatusBadge } from "@/components/people/people-badges";
import { requireCurrentOrganization } from "@/lib/dal/auth";
import { prisma } from "@/lib/prisma";
import { allowedValue, boundedPage, parsePagination, safeQuery } from "@/lib/search/params";

export const metadata: Metadata = { title: "Employees" };

type Search = { q?: string; role?: string; status?: string; team?: string; department?: string; sort?: string; page?: string; pageSize?: string };
const allowedRoles = new Set(["PRODUCT_MANAGER", "TEAM_LEAD", "EMPLOYEE"]);
const allowedStatuses = new Set(["ACTIVE", "INVITED", "SUSPENDED"]);

export default async function EmployeesPage({ searchParams }: { searchParams: Promise<Search> }) {
  const [{ organization }, filters] = await Promise.all([requireCurrentOrganization("members:manage"), searchParams]);
  const q = safeQuery(filters.q);
  const pagination = parsePagination(filters);
  const sort = allowedValue(filters.sort, ["name_asc", "name_desc", "newest", "oldest", "status"] as const) ?? "name_asc";
  const role = allowedRoles.has(filters.role || "") ? filters.role as UserRole : undefined;
  const status = allowedStatuses.has(filters.status || "") ? filters.status as "ACTIVE" | "INVITED" | "SUSPENDED" : undefined;
  const where: Prisma.OrganizationMemberWhereInput = {
    organizationId: organization.id,
    role: role ?? { not: "SUPER_ADMIN" }, ...(status ? { status } : {}),
    ...(filters.department ? { department: filters.department } : {}),
    ...(filters.team ? { user: { teamMembers: { some: { teamId: filters.team } } } } : {}),
    ...(q ? { OR: [
      { user: { name: { contains: q, mode: "insensitive" } } },
      { user: { email: { contains: q, mode: "insensitive" } } },
      { user: { jobTitle: { contains: q, mode: "insensitive" } } },
      { department: { contains: q, mode: "insensitive" } },
    ] } : {}),
  };

  const orderBy: Prisma.OrganizationMemberOrderByWithRelationInput[] = sort === "name_desc" ? [{ user: { name: "desc" } }, { id: "asc" }] : sort === "newest" ? [{ createdAt: "desc" }, { id: "asc" }] : sort === "oldest" ? [{ createdAt: "asc" }, { id: "asc" }] : sort === "status" ? [{ status: "asc" }, { user: { name: "asc" } }, { id: "asc" }] : [{ user: { name: "asc" } }, { id: "asc" }];
  const [initialMembers, teams, departments, statusCounts, filteredCount] = await Promise.all([
    prisma.organizationMember.findMany({
      where,
      include: { user: { include: { teamMembers: { where: { team: { organizationId: organization.id } }, include: { team: { select: { id: true, name: true, color: true } } }, orderBy: { joinedAt: "asc" } } } } },
      orderBy, skip: pagination.skip, take: pagination.pageSize,
    }),
    prisma.team.findMany({ where: { organizationId: organization.id }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.organizationMember.findMany({ where: { organizationId: organization.id, department: { not: null } }, distinct: ["department"], select: { department: true }, orderBy: { department: "asc" } }),
    prisma.organizationMember.groupBy({ where: { organizationId: organization.id, role: { not: "SUPER_ADMIN" } }, by: ["status"], _count: { _all: true } }),
    prisma.organizationMember.count({ where }),
  ]);
  const pageInfo = boundedPage(pagination.page, filteredCount, pagination.pageSize);
  const members = pageInfo.page === pagination.page ? initialMembers : await prisma.organizationMember.findMany({ where, include: { user: { include: { teamMembers: { where: { team: { organizationId: organization.id } }, include: { team: { select: { id: true, name: true, color: true } } }, orderBy: { joinedAt: "asc" } } } } }, orderBy, skip: (pageInfo.page - 1) * pagination.pageSize, take: pagination.pageSize });
  const counts = Object.fromEntries(statusCounts.map((item) => [item.status, item._count._all]));
  const total = statusCounts.reduce((sum, item) => sum + item._count._all, 0);

  return (
    <div className="space-y-6">
      <section className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div><p className="font-mono text-[11px] font-semibold uppercase tracking-[0.16em] text-[#2563eb]">People directory</p><h1 className="mt-2 text-3xl font-semibold tracking-[-0.045em] text-[#172033]">Employees</h1><p className="mt-2 text-sm text-[#667085]">Manage access, roles, departments, and team placement for {organization.name}.</p></div>
        <Link href="/dashboard/employees/new" className="inline-flex h-11 items-center justify-center gap-2 self-start rounded-xl bg-[#2563eb] px-4 text-sm font-semibold text-white shadow-[0_6px_16px_rgba(37,99,235,0.2)] transition hover:bg-[#1f58d2] sm:self-auto"><Icon name="plus" className="size-4" /> Add employee</Link>
      </section>

      <section aria-label="Employee summary" className="grid gap-3 sm:grid-cols-3">
        {[{ label: "Total people", value: total, detail: "Across the workspace", color: "#2563eb" }, { label: "Active", value: counts.ACTIVE || 0, detail: "Ready to collaborate", color: "#1f9d74" }, { label: "Pending invites", value: counts.INVITED || 0, detail: "Waiting to join", color: "#e09a24" }].map(({ label, value, detail, color }) => (
          <div key={label} className="relative overflow-hidden rounded-2xl border border-[#e6eaf0] bg-white p-5"><span className="absolute inset-y-0 left-0 w-1" style={{ backgroundColor: color }} /><p className="text-xs font-medium text-[#7c8799]">{label}</p><div className="mt-2 flex items-end justify-between gap-3"><strong className="font-mono text-2xl text-[#172033]">{value}</strong><span className="text-xs text-[#98a2b3]">{detail}</span></div></div>
        ))}
      </section>

      <section className="overflow-hidden rounded-2xl border border-[#e6eaf0] bg-white">
        <form className="grid gap-3 border-b border-[#edf0f4] p-4 sm:grid-cols-2 xl:grid-cols-[minmax(14rem,1fr)_repeat(5,minmax(8rem,0.4fr))_auto]">
          <input type="hidden" name="pageSize" value={pagination.pageSize} />
          <label className="relative sm:col-span-2 xl:col-span-1"><span className="sr-only">Search employees</span><Icon name="search" className="pointer-events-none absolute left-3.5 top-3.5 size-4 text-[#98a2b3]" /><input name="q" defaultValue={q} placeholder="Search name, email, or title" className="h-11 w-full rounded-xl border border-[#dfe4eb] bg-white pl-10 pr-3 text-sm outline-none focus:border-[#80a7f5] focus:ring-4 focus:ring-[#eef4ff]" /></label>
          <FilterSelect name="role" defaultValue={role} label="All roles" options={[["PRODUCT_MANAGER", "Product manager"], ["TEAM_LEAD", "Team lead"], ["EMPLOYEE", "Employee"]]} />
          <FilterSelect name="status" defaultValue={status} label="All statuses" options={[["ACTIVE", "Active"], ["INVITED", "Invited"], ["SUSPENDED", "Deactivated"]]} />
          <FilterSelect name="team" defaultValue={filters.team} label="All teams" options={teams.map((team) => [team.id, team.name])} />
          <FilterSelect name="department" defaultValue={filters.department} label="All departments" options={departments.flatMap((item) => item.department ? [[item.department, item.department] as [string, string]] : [])} />
          <SortSelector value={sort} options={[["name_asc", "Name A–Z"], ["name_desc", "Name Z–A"], ["newest", "Newest first"], ["oldest", "Oldest first"], ["status", "Status"]]} />
          <div className="flex gap-2"><button className="h-11 rounded-xl bg-[#172033] px-4 text-sm font-semibold text-white hover:bg-[#26334b]">Apply</button><Link aria-label="Clear filters" href="/dashboard/employees" className="grid size-11 place-items-center rounded-xl border border-[#dfe4eb] text-[#667085] hover:bg-[#f7f8fa]"><Icon name="x" className="size-4" /></Link></div>
        </form>
        <ActiveFilterChips pathname="/dashboard/employees" params={filters} filters={[{ key: "q", label: "Search", value: q }, { key: "role", label: "Role", value: role?.replaceAll("_", " ") }, { key: "status", label: "Status", value: status }, { key: "team", label: "Team", value: teams.find((team) => team.id === filters.team)?.name }, { key: "department", label: "Department", value: filters.department }]} />

        <div className="hidden overflow-x-auto md:block">
          <table className="w-full min-w-[760px] text-left"><thead><tr className="bg-[#fafbfc] text-[11px] font-semibold uppercase tracking-[0.1em] text-[#98a2b3]"><th className="px-6 py-3.5">Employee</th><th className="px-4 py-3.5">Role</th><th className="px-4 py-3.5">Department</th><th className="px-4 py-3.5">Team</th><th className="px-4 py-3.5">Status</th><th className="px-6 py-3.5 text-right">Profile</th></tr></thead>
            <tbody className="divide-y divide-[#edf0f4]">{members.map((member) => { const team = member.user.teamMembers[0]?.team; return <tr key={member.id} className="group transition hover:bg-[#fbfcff]"><td className="px-6 py-4"><EmployeeIdentity name={member.user.name} email={member.user.email} /></td><td className="px-4 py-4"><RoleBadge role={member.role} /></td><td className="px-4 py-4 text-sm text-[#667085]">{member.department || "—"}</td><td className="px-4 py-4">{team ? <span className="inline-flex items-center gap-2 text-sm text-[#475467]"><span className="size-2 rounded-full" style={{ backgroundColor: team.color || "#2563eb" }} />{team.name}</span> : <span className="text-sm text-[#98a2b3]">Unassigned</span>}</td><td className="px-4 py-4"><StatusBadge status={member.status} /></td><td className="px-6 py-4 text-right"><Link href={`/dashboard/employees/${member.userId}`} className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#2563eb]">View <Icon name="arrowRight" className="size-3.5 transition group-hover:translate-x-0.5" /></Link></td></tr>; })}</tbody>
          </table>
        </div>

        <div className="divide-y divide-[#edf0f4] md:hidden">{members.map((member) => { const team = member.user.teamMembers[0]?.team; return <Link key={member.id} href={`/dashboard/employees/${member.userId}`} className="block p-4 active:bg-[#f7f9fc]"><div className="flex items-start justify-between gap-3"><EmployeeIdentity name={member.user.name} email={member.user.email} /><StatusBadge status={member.status} /></div><div className="mt-3 flex flex-wrap items-center gap-2"><RoleBadge role={member.role} /><span className="text-xs text-[#7c8799]">{member.department || "No department"}</span>{team && <span className="inline-flex items-center gap-1.5 text-xs text-[#7c8799]"><span className="size-1.5 rounded-full" style={{ backgroundColor: team.color || "#2563eb" }} />{team.name}</span>}</div></Link>; })}</div>
        {!members.length && <div className="px-6 py-16 text-center"><span className="mx-auto grid size-12 place-items-center rounded-2xl bg-[#eef4ff] text-[#2563eb]"><Icon name="users" className="size-5" /></span><h2 className="mt-4 font-semibold text-[#253047]">No employees found</h2><p className="mt-1 text-sm text-[#7c8799]">Try clearing a filter or invite a new employee.</p></div>}
        <PaginationControls pathname="/dashboard/employees" params={filters} page={pageInfo.page} pageSize={pagination.pageSize} total={filteredCount} pages={pageInfo.pages} />
      </section>
    </div>
  );
}

function FilterSelect({ name, defaultValue, label, options }: { name: string; defaultValue?: string; label: string; options: [string, string][] }) {
  return <select name={name} defaultValue={defaultValue || ""} className="h-11 min-w-0 rounded-xl border border-[#dfe4eb] bg-white px-3 text-sm text-[#475467] outline-none focus:border-[#80a7f5] focus:ring-4 focus:ring-[#eef4ff]"><option value="">{label}</option>{options.map(([value, text]) => <option key={value} value={value}>{text}</option>)}</select>;
}

function EmployeeIdentity({ name, email }: { name: string | null; email: string }) {
  return <div className="flex min-w-0 items-center gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#eef4ff] text-[11px] font-bold text-[#2555a7]">{initials(name)}</span><div className="min-w-0"><p className="truncate text-sm font-semibold text-[#253047]">{name || "Unnamed member"}</p><p className="mt-0.5 truncate text-xs text-[#98a2b3]">{email}</p></div></div>;
}
