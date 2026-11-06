import type { Metadata } from "next";
import Link from "next/link";
import type { AttendanceStatus, Prisma } from "@prisma/client";
import { AttendanceStatusBadge } from "@/components/attendance/attendance-status";
import { Icon } from "@/components/ui/icons";
import { ActiveFilterChips, PaginationControls, SortSelector } from "@/components/search/table-controls";
import { requireCurrentOrganization } from "@/lib/dal/auth";
import { attendanceWorkdayKey, databaseDate, durationMinutes, formatDuration, formatTimeInZone, isValidDateKey } from "@/lib/date-time";
import { ORGANIZATION_SETTINGS_DEFAULTS } from "@/lib/organization-settings";
import { prisma } from "@/lib/prisma";
import { allowedValue, boundedPage, parsePagination, safeQuery } from "@/lib/search/params";

export const metadata: Metadata = { title: "Team attendance" };
export const dynamic = "force-dynamic";

type Search = { date?: string; q?: string; status?: string; team?: string; sort?: string; page?: string; pageSize?: string };
const statusOptions = ["PRESENT", "LATE", "ABSENT", "HALF_DAY", "REMOTE", "ON_LEAVE"] as const;

export default async function AttendancePage({ searchParams }: { searchParams: Promise<Search> }) {
  const [{ user: actor, organization, membership }, filters] = await Promise.all([requireCurrentOrganization("attendance:read-all"), searchParams]);
  const settings = await prisma.organizationSettings.findUnique({
    where: { organizationId: organization.id },
    select: { timezone: true, workdayStart: true, workdayEnd: true, overnightShiftEnabled: true, workDays: true },
  }) ?? ORGANIZATION_SETTINGS_DEFAULTS;
  const timezone = settings.timezone;
  const todayKey = attendanceWorkdayKey(new Date(), timezone, settings.workdayStart, settings.workdayEnd, settings.overnightShiftEnabled);
  const requestedDate = filters.date && isValidDateKey(filters.date) ? filters.date : todayKey;
  const attendanceDate = databaseDate(requestedDate);
  const holiday = await prisma.organizationHoliday.findUnique({
    where: { organizationId_holidayDate: { organizationId: organization.id, holidayDate: attendanceDate } },
    select: { name: true },
  });
  const expected = !holiday && settings.workDays.includes(attendanceDate.getUTCDay());
  const unrecordedLabel = holiday ? "Holiday" : expected ? undefined : "Non-working day";
  const effectiveRole = membership?.role ?? actor.role;
  const userScope: Prisma.UserWhereInput = { status: "ACTIVE", organizationMembers: { some: { organizationId: organization.id, status: "ACTIVE" } }, ...(effectiveRole === "TEAM_LEAD" ? { teamMembers: { some: { team: { organizationId: organization.id, managerId: actor.id } } } } : {}) };
  const q = safeQuery(filters.q);
  const pagination = parsePagination(filters);
  const sort = allowedValue(filters.sort, ["name_asc", "name_desc", "newest"] as const) ?? "name_asc";
  const selectedStatus = statusOptions.includes(filters.status as AttendanceStatus) ? filters.status as AttendanceStatus : filters.status === "NOT_CHECKED_IN" ? "NOT_CHECKED_IN" : "";
  const userWhere: Prisma.UserWhereInput = { ...userScope, ...(filters.team ? { teamMembers: { some: { teamId: filters.team, team: { organizationId: organization.id, ...(effectiveRole === "TEAM_LEAD" ? { managerId: actor.id } : {}) } } } } : {}), ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { email: { contains: q, mode: "insensitive" } }, { organizationMembers: { some: { organizationId: organization.id, department: { contains: q, mode: "insensitive" } } } }] } : {}), ...(selectedStatus === "NOT_CHECKED_IN" ? expected ? { attendance: { none: { organizationId: organization.id, attendanceDate } } } : { id: { in: [] } } : selectedStatus ? { attendance: { some: { organizationId: organization.id, attendanceDate, status: selectedStatus } } } : {}) };
  const memberWhere: Prisma.OrganizationMemberWhereInput = { organizationId: organization.id, status: "ACTIVE", user: userWhere };
  const baseMemberWhere: Prisma.OrganizationMemberWhereInput = { organizationId: organization.id, status: "ACTIVE", user: userScope };
  const attendanceScope: Prisma.AttendanceWhereInput = { organizationId: organization.id, attendanceDate, user: userScope };
  const orderBy: Prisma.OrganizationMemberOrderByWithRelationInput[] = sort === "name_desc" ? [{ user: { name: "desc" } }, { id: "asc" }] : sort === "newest" ? [{ createdAt: "desc" }, { id: "asc" }] : [{ user: { name: "asc" } }, { id: "asc" }];

  const [initialMembers, teams, filteredCount, totalMembers, checkedIn, working, late, attendanceCount] = await Promise.all([
    prisma.organizationMember.findMany({
      where: memberWhere,
      include: { user: { include: { attendance: { where: { organizationId: organization.id, attendanceDate }, take: 1 }, teamMembers: { where: { team: { organizationId: organization.id, ...(effectiveRole === "TEAM_LEAD" ? { managerId: actor.id } : {}) } }, include: { team: { select: { id: true, name: true, color: true } } }, orderBy: { joinedAt: "asc" } } } } },
      orderBy, skip: pagination.skip, take: pagination.pageSize,
    }),
    prisma.team.findMany({ where: { organizationId: organization.id, ...(effectiveRole === "TEAM_LEAD" ? { managerId: actor.id } : {}) }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.organizationMember.count({ where: memberWhere }),
    prisma.organizationMember.count({ where: baseMemberWhere }),
    prisma.attendance.count({ where: { ...attendanceScope, checkInAt: { not: null } } }),
    prisma.attendance.count({ where: { ...attendanceScope, checkInAt: { not: null }, checkOutAt: null } }),
    prisma.attendance.count({ where: { ...attendanceScope, status: "LATE" } }),
    prisma.attendance.count({ where: attendanceScope }),
  ]);
  const pageInfo = boundedPage(pagination.page, filteredCount, pagination.pageSize);
  const rows = pageInfo.page === pagination.page ? initialMembers : await prisma.organizationMember.findMany({ where: memberWhere, include: { user: { include: { attendance: { where: { organizationId: organization.id, attendanceDate }, take: 1 }, teamMembers: { where: { team: { organizationId: organization.id, ...(effectiveRole === "TEAM_LEAD" ? { managerId: actor.id } : {}) } }, include: { team: { select: { id: true, name: true, color: true } } }, orderBy: { joinedAt: "asc" } } } } }, orderBy, skip: (pageInfo.page - 1) * pagination.pageSize, take: pagination.pageSize });
  const notCheckedIn = expected ? Math.max(0, totalMembers - attendanceCount) : 0;
  const isToday = requestedDate === todayKey;

  return <div className="space-y-6">
    <section className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><p className="font-mono text-[11px] font-semibold uppercase tracking-[0.16em] text-[#2563eb]">Manager workspace</p><h1 className="mt-2 text-3xl font-semibold tracking-[-0.045em] text-[#172033]">Team attendance</h1><p className="mt-2 text-sm text-[#667085]">Monitor verified check-ins and working hours across {organization.name}.</p></div><span className="inline-flex items-center gap-2 self-start rounded-full border border-[#dfe4eb] bg-white px-3 py-2 text-xs font-medium text-[#667085] sm:self-auto"><span className={`size-2 rounded-full ${isToday ? "animate-pulse bg-[#22a779]" : "bg-[#98a2b3]"}`} />{isToday ? "Live today" : "Historical view"}</span></section>

    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><Metric label="Active members" value={totalMembers} detail="In your scope" icon="users" tone="blue" /><Metric label="Checked in" value={checkedIn} detail={`${working} working now`} icon="check" tone="green" /><Metric label="Late arrivals" value={late} detail="Recorded for the day" icon="clock" tone="amber" /><Metric label="No record" value={notCheckedIn} detail={holiday ? holiday.name : expected ? "Not checked in" : "Non-working day"} icon="calendar" tone="slate" /></section>

    <section className="overflow-hidden rounded-2xl border border-[#e6eaf0] bg-white">
      <form className="grid gap-3 border-b border-[#edf0f4] p-4 sm:grid-cols-2 xl:grid-cols-[minmax(15rem,1fr)_repeat(4,minmax(9rem,0.45fr))_auto]">
        <input type="hidden" name="pageSize" value={pagination.pageSize} />
        <label className="relative sm:col-span-2 xl:col-span-1"><span className="sr-only">Search team attendance</span><Icon name="search" className="pointer-events-none absolute left-3.5 top-3.5 size-4 text-[#98a2b3]" /><input name="q" defaultValue={filters.q || ""} placeholder="Search employee or department" className="h-11 w-full rounded-xl border border-[#dfe4eb] pl-10 pr-3 text-sm outline-none focus:border-[#80a7f5] focus:ring-4 focus:ring-[#eef4ff]" /></label>
        <input aria-label="Attendance date" type="date" name="date" defaultValue={requestedDate} max={todayKey} className="h-11 rounded-xl border border-[#dfe4eb] bg-white px-3 text-sm text-[#475467] outline-none focus:border-[#80a7f5]" />
        <select aria-label="Attendance status" name="status" defaultValue={selectedStatus} className="h-11 rounded-xl border border-[#dfe4eb] bg-white px-3 text-sm text-[#475467]"><option value="">All statuses</option><option value="NOT_CHECKED_IN">Not checked in</option>{statusOptions.map((status) => <option key={status} value={status}>{status.replaceAll("_", " ").toLowerCase()}</option>)}</select>
        <select aria-label="Team" name="team" defaultValue={filters.team || ""} className="h-11 rounded-xl border border-[#dfe4eb] bg-white px-3 text-sm text-[#475467]"><option value="">All teams</option>{teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}</select>
        <SortSelector value={sort} options={[["name_asc", "Name A–Z"], ["name_desc", "Name Z–A"], ["newest", "Recently added"]]} />
        <div className="flex gap-2"><button className="h-11 rounded-xl bg-[#172033] px-4 text-sm font-semibold text-white hover:bg-[#26334b]">Apply</button><Link href="/dashboard/attendance" aria-label="Clear attendance filters" className="grid size-11 place-items-center rounded-xl border border-[#dfe4eb] text-[#667085] hover:bg-[#f7f8fa]"><Icon name="x" className="size-4" /></Link></div>
      </form>
      <ActiveFilterChips pathname="/dashboard/attendance" params={filters} filters={[{ key: "q", label: "Search", value: q }, { key: "status", label: "Status", value: selectedStatus || undefined }, { key: "team", label: "Team", value: teams.find((team) => team.id === filters.team)?.name }, { key: "date", label: "Date", value: requestedDate !== todayKey ? requestedDate : undefined }]} />

      <div className="flex flex-col gap-1 border-b border-[#edf0f4] px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6"><div><h2 className="font-semibold text-[#253047]">Daily register</h2><p className="mt-1 text-xs text-[#98a2b3]">{attendanceDate.toLocaleDateString("en-IN", { weekday: "long", day: "2-digit", month: "long", year: "numeric", timeZone: "UTC" })}</p></div><p className="text-xs text-[#7c8799]">{filteredCount} matching members</p></div>
      {rows.length ? <><div className="hidden overflow-x-auto md:block"><table className="w-full min-w-[800px] text-left"><thead><tr className="bg-[#fafbfc] text-[11px] font-semibold uppercase tracking-[0.1em] text-[#98a2b3]"><th className="px-6 py-3.5">Employee</th><th className="px-4 py-3.5">Team</th><th className="px-4 py-3.5">Status</th><th className="px-4 py-3.5">Check in</th><th className="px-4 py-3.5">Check out</th><th className="px-6 py-3.5 text-right">Duration</th></tr></thead><tbody className="divide-y divide-[#edf0f4]">{rows.map((member) => { const record = member.user.attendance[0] ?? null; const team = member.user.teamMembers[0]?.team; return <tr key={member.id} className="hover:bg-[#fbfcff]"><td className="px-6 py-4"><Person name={member.user.name} email={member.user.email} /></td><td className="px-4 py-4">{team ? <span className="inline-flex items-center gap-2 text-sm text-[#475467]"><span className="size-2 rounded-full" style={{ backgroundColor: team.color || "#2563eb" }} />{team.name}</span> : <span className="text-sm text-[#98a2b3]">Unassigned</span>}</td><td className="px-4 py-4"><AttendanceStatusBadge status={record?.status ?? null} emptyLabel={unrecordedLabel} /></td><td className="px-4 py-4 font-mono text-xs text-[#667085]">{formatTimeInZone(record?.checkInAt ?? null, timezone)}</td><td className="px-4 py-4 font-mono text-xs text-[#667085]">{formatTimeInZone(record?.checkOutAt ?? null, timezone)}</td><td className="px-6 py-4 text-right font-mono text-xs font-semibold text-[#344054]">{record?.checkInAt ? formatDuration(durationMinutes(record.checkInAt, record.checkOutAt, new Date())) : "—"}</td></tr>; })}</tbody></table></div>
      <div className="divide-y divide-[#edf0f4] md:hidden">{rows.map((member) => { const record = member.user.attendance[0] ?? null; const team = member.user.teamMembers[0]?.team; return <article key={member.id} className="p-4"><div className="flex items-start justify-between gap-3"><Person name={member.user.name} email={member.user.email} /><AttendanceStatusBadge status={record?.status ?? null} emptyLabel={unrecordedLabel} /></div><p className="mt-3 text-xs text-[#7c8799]">{team?.name || "Unassigned"} · {member.department || "No department"}</p><div className="mt-3 grid grid-cols-3 gap-2"><Fact label="Check in" value={formatTimeInZone(record?.checkInAt ?? null, timezone)} /><Fact label="Check out" value={formatTimeInZone(record?.checkOutAt ?? null, timezone)} /><Fact label="Duration" value={record?.checkInAt ? formatDuration(durationMinutes(record.checkInAt, record.checkOutAt, new Date())) : "—"} /></div></article>; })}</div></> : <div className="px-6 py-16 text-center"><span className="mx-auto grid size-12 place-items-center rounded-2xl bg-[#eef4ff] text-[#2563eb]"><Icon name="users" className="size-5" /></span><h3 className="mt-4 font-semibold text-[#253047]">No matching attendance</h3><p className="mt-1 text-sm text-[#7c8799]">Try another date or clear the active filters.</p></div>}
      <PaginationControls pathname="/dashboard/attendance" params={filters} page={pageInfo.page} pageSize={pagination.pageSize} total={filteredCount} pages={pageInfo.pages} />
    </section>
  </div>;
}

function Metric({ label, value, detail, icon, tone }: { label: string; value: number; detail: string; icon: "users" | "check" | "clock" | "calendar"; tone: "blue" | "green" | "amber" | "slate" }) { const colors = { blue: "bg-[#eef4ff] text-[#2563eb]", green: "bg-[#eaf8f2] text-[#16855b]", amber: "bg-[#fff6e5] text-[#b16a00]", slate: "bg-[#f2f4f7] text-[#667085]" }; return <article className="rounded-2xl border border-[#e6eaf0] bg-white p-5"><div className="flex items-start justify-between"><span className={`grid size-10 place-items-center rounded-xl ${colors[tone]}`}><Icon name={icon} className="size-5" /></span><span className="text-right text-[11px] text-[#98a2b3]">{detail}</span></div><p className="mt-4 text-xs text-[#667085]">{label}</p><p className="mt-1 font-mono text-2xl font-semibold text-[#172033]">{value}</p></article>; }
function Person({ name, email }: { name: string | null; email: string }) { const initials = (name || email).split(/\s|@/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join(""); return <div className="flex min-w-0 items-center gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#eef4ff] text-[11px] font-bold text-[#2555a7]">{initials}</span><div className="min-w-0"><p className="truncate text-sm font-semibold text-[#253047]">{name || "Unnamed member"}</p><p className="mt-0.5 truncate text-xs text-[#98a2b3]">{email}</p></div></div>; }
function Fact({ label, value }: { label: string; value: string }) { return <div><p className="text-[10px] uppercase tracking-[0.08em] text-[#98a2b3]">{label}</p><p className="mt-1 font-mono text-[11px] font-semibold text-[#475467]">{value}</p></div>; }
