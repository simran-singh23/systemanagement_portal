import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { TeamForm } from "@/components/people/team-form";
import { Icon } from "@/components/ui/icons";
import { requireCurrentOrganization } from "@/lib/dal/auth";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = { title: "Create team" };

export default async function NewTeamPage() {
  const { user, organization, membership } = await requireCurrentOrganization("teams:manage");
  if ((membership?.role ?? user.role) === "TEAM_LEAD") redirect("/dashboard/teams");
  const memberships = await prisma.organizationMember.findMany({ where: { organizationId: organization.id, status: "ACTIVE" }, include: { user: { select: { id: true, name: true, email: true } } }, orderBy: { user: { name: "asc" } } });
  const members = memberships.map((membership) => ({ id: membership.userId, name: membership.user.name || membership.user.email, email: membership.user.email, role: membership.role, department: membership.department }));

  return <div className="mx-auto max-w-4xl space-y-6"><div><Link href="/dashboard/teams" className="inline-flex items-center gap-2 text-sm font-semibold text-[#667085] hover:text-[#2563eb]"><Icon name="arrowRight" className="size-4 rotate-180" /> Back to teams</Link><p className="mt-7 font-mono text-[11px] font-semibold uppercase tracking-[0.16em] text-[#2563eb]">New group</p><h1 className="mt-2 text-3xl font-semibold tracking-[-0.045em] text-[#172033]">Create a team</h1><p className="mt-2 text-sm text-[#667085]">Define ownership, nominate a lead, and assemble the team.</p></div><section className="overflow-hidden rounded-2xl border border-[#e6eaf0] bg-white"><div className="border-b border-[#edf0f4] bg-[#fbfcff] px-5 py-4 sm:px-7"><h2 className="font-semibold text-[#253047]">Team setup</h2><p className="mt-1 text-xs text-[#7c8799]">Structure and member access</p></div><div className="p-5 sm:p-7"><TeamForm organizationId={organization.id} members={members} /></div></section></div>;
}
