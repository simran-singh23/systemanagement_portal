import type { Metadata } from "next";
import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { Icon } from "@/components/ui/icons";
import { initials } from "@/components/people/people-badges";
import { requireCurrentOrganization } from "@/lib/dal/auth";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = { title: "Teams" };

export default async function TeamsPage({ searchParams }: { searchParams: Promise<{ q?: string; lead?: string }> }) {
  const [{ user, organization, membership }, filters] = await Promise.all([requireCurrentOrganization("teams:manage"), searchParams]);
  const role = membership?.role ?? user.role;
  const q = filters.q?.trim() || "";
  const where: Prisma.TeamWhereInput = {
    organizationId: organization.id,
    ...(role === "TEAM_LEAD" ? { managerId: user.id } : {}),
    ...(filters.lead ? { managerId: filters.lead } : {}),
    ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { description: { contains: q, mode: "insensitive" } }] } : {}),
  };
  const [teams, leads] = await Promise.all([
    prisma.team.findMany({
      where,
      include: {
        manager: { select: { id: true, name: true, email: true } },
        members: { include: { user: { select: { id: true, name: true } } }, orderBy: { joinedAt: "asc" }, take: 5 },
        _count: { select: { members: true, tasks: true } },
      },
      orderBy: { name: "asc" },
    }),
    prisma.team.findMany({ where: { organizationId: organization.id, managerId: { not: null } }, distinct: ["managerId"], select: { manager: { select: { id: true, name: true, email: true } } } }),
  ]);

  return (
    <div className="space-y-6">
      <section className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><p className="font-mono text-[11px] font-semibold uppercase tracking-[0.16em] text-[#2563eb]">Org structure</p><h1 className="mt-2 text-3xl font-semibold tracking-[-0.045em] text-[#172033]">Teams</h1><p className="mt-2 text-sm text-[#667085]">Shape focused groups, ownership, and clear team leadership.</p></div>{role !== "TEAM_LEAD" && <Link href="/dashboard/teams/new" className="inline-flex h-11 items-center justify-center gap-2 self-start rounded-xl bg-[#2563eb] px-4 text-sm font-semibold text-white shadow-[0_6px_16px_rgba(37,99,235,0.2)] hover:bg-[#1f58d2]"><Icon name="plus" className="size-4" /> Create team</Link>}</section>

      <form className="grid gap-3 rounded-2xl border border-[#e6eaf0] bg-white p-4 sm:grid-cols-[1fr_14rem_auto]">
        <label className="relative"><span className="sr-only">Search teams</span><Icon name="search" className="pointer-events-none absolute left-3.5 top-3.5 size-4 text-[#98a2b3]" /><input name="q" defaultValue={q} placeholder="Search teams or responsibilities" className="h-11 w-full rounded-xl border border-[#dfe4eb] pl-10 pr-3 text-sm outline-none focus:border-[#80a7f5] focus:ring-4 focus:ring-[#eef4ff]" /></label>
        {role !== "TEAM_LEAD" ? <select aria-label="Team lead" name="lead" defaultValue={filters.lead || ""} className="h-11 rounded-xl border border-[#dfe4eb] bg-white px-3 text-sm text-[#475467] outline-none"><option value="">All team leads</option>{leads.flatMap(({ manager }) => manager ? [<option key={manager.id} value={manager.id}>{manager.name || manager.email}</option>] : [])}</select> : <input type="hidden" name="lead" value={user.id} />}
        <div className="flex gap-2"><button className="h-11 rounded-xl bg-[#172033] px-5 text-sm font-semibold text-white">Apply</button><Link href="/dashboard/teams" aria-label="Clear filters" className="grid size-11 place-items-center rounded-xl border border-[#dfe4eb] text-[#667085]"><Icon name="x" className="size-4" /></Link></div>
      </form>

      <section className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
        {teams.map((team) => (
          <Link key={team.id} href={`/dashboard/teams/${team.id}`} className="group relative overflow-hidden rounded-2xl border border-[#e6eaf0] bg-white p-5 transition hover:-translate-y-0.5 hover:border-[#cddbf4] hover:shadow-[0_12px_30px_rgba(23,32,51,0.07)]">
            <span className="absolute inset-y-0 left-0 w-1" style={{ backgroundColor: team.color || "#2563eb" }} />
            <div className="flex items-start justify-between gap-4"><span className="grid size-11 place-items-center rounded-xl text-sm font-bold" style={{ color: team.color || "#2563eb", backgroundColor: `${team.color || "#2563eb"}12` }}>{team.name.split(" ").map((part) => part[0]).slice(0, 2).join("")}</span><Icon name="arrowRight" className="size-4 text-[#98a2b3] transition group-hover:translate-x-1 group-hover:text-[#2563eb]" /></div>
            <h2 className="mt-5 text-lg font-semibold tracking-[-0.025em] text-[#253047]">{team.name}</h2><p className="mt-2 min-h-10 text-sm leading-5 text-[#7c8799]">{team.description || "A focused team inside your workspace."}</p>
            <div className="mt-5 flex items-center justify-between border-t border-[#edf0f4] pt-4"><div><p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[#98a2b3]">Team lead</p><p className="mt-1 text-sm font-medium text-[#475467]">{team.manager?.name || "Unassigned"}</p></div><div className="flex -space-x-2">{team.members.slice(0, 4).map((member) => <span title={member.user.name || "Team member"} key={member.userId} className="grid size-8 place-items-center rounded-full border-2 border-white bg-[#eef4ff] text-[9px] font-bold text-[#2555a7]">{initials(member.user.name)}</span>)}{team._count.members > 4 && <span className="grid size-8 place-items-center rounded-full border-2 border-white bg-[#f2f4f7] text-[9px] font-bold text-[#667085]">+{team._count.members - 4}</span>}</div></div>
            <div className="mt-4 flex gap-4 text-xs text-[#7c8799]"><span><strong className="font-mono text-[#344054]">{team._count.members}</strong> members</span><span><strong className="font-mono text-[#344054]">{team._count.tasks}</strong> tasks</span></div>
          </Link>
        ))}
      </section>
      {!teams.length && <section className="rounded-2xl border border-dashed border-[#ccd6e5] bg-white px-6 py-16 text-center"><span className="mx-auto grid size-12 place-items-center rounded-2xl bg-[#eef4ff] text-[#2563eb]"><Icon name="sparkle" className="size-5" /></span><h2 className="mt-4 font-semibold text-[#253047]">No teams found</h2><p className="mt-1 text-sm text-[#7c8799]">Clear your search or create the first team.</p></section>}
    </div>
  );
}
