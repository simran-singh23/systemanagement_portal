import type { Metadata } from "next";
import Link from "next/link";
import type { Prisma, PulseMood, ReportStatus } from "@prisma/client";
import { ReportStatusBadge } from "@/components/reports/report-status";
import { ActiveFilterChips, FilterDropdown, PaginationControls, SortSelector } from "@/components/search/table-controls";
import { requireCurrentOrganization } from "@/lib/dal/auth";
import { databaseDate, dateKeyInZone, isValidDateKey } from "@/lib/date-time";
import { prisma } from "@/lib/prisma";
import { formatMilliseconds } from "@/lib/work-time";
import { allowedValue, boundedPage, parsePagination, safeQuery } from "@/lib/search/params";
import { isReportExpected } from "@/lib/report-evidence";

export const metadata: Metadata = { title: "Daily reports" };
export const dynamic = "force-dynamic";
type Search = { date?: string; from?: string; to?: string; employee?: string; status?: string; pulse?: string; q?: string; sort?: string; page?: string; pageSize?: string };

export default async function ReportsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const [{ user: actor, organization, membership }, filters] = await Promise.all([requireCurrentOrganization("reports:read-all"), searchParams]);
  const settings = await prisma.organizationSettings.findUnique({ where: { organizationId: organization.id }, select: { timezone: true, workDays: true, requireDailyReports: true } });
  const timezone = settings?.timezone ?? "Asia/Kolkata";
  const today = dateKeyInZone(new Date(), timezone);
  const dateKey = filters.date && isValidDateKey(filters.date) ? filters.date : today;
  const date = databaseDate(dateKey);
  const validDate = (value?: string) => value && isValidDateKey(value) ? value : undefined;
  const from = validDate(filters.from);
  const to = validDate(filters.to);
  const range = from && to && from > to ? undefined : { ...(from ? { gte: databaseDate(from) } : {}), ...(to ? { lte: databaseDate(to) } : {}) };
  const role = membership?.role ?? actor.role;
  const leadUserScope = role === "TEAM_LEAD" ? { teamMembers: { some: { team: { organizationId: organization.id, managerId: actor.id } } } } : {};
  const memberScope: Prisma.OrganizationMemberWhereInput = { organizationId: organization.id, status: "ACTIVE", user: leadUserScope };
  const status = ["DRAFT", "SUBMITTED", "REVIEWED"].includes(filters.status || "") ? filters.status as ReportStatus : undefined;
  const pulse = allowedValue(filters.pulse, ["SMOOTH", "NORMAL", "BLOCKED"] as const) as PulseMood | undefined;
  const q = safeQuery(filters.q);
  const pagination = parsePagination(filters);
  const sort = allowedValue(filters.sort, ["newest", "oldest", "name_asc", "name_desc", "status"] as const) ?? "newest";
  const reportScope: Prisma.DailyReportWhereInput = { organizationId: organization.id, reportDate: date, user: leadUserScope };
  const filtered: Prisma.DailyReportWhereInput = { organizationId: organization.id, reportDate: range && Object.keys(range).length ? range : date, user: leadUserScope, ...(filters.employee ? { userId: filters.employee } : {}), ...(status ? { status } : {}), ...(pulse ? { pulse: { mood: pulse } } : {}), ...(q ? { OR: [{ summary: { contains: q, mode: "insensitive" } }, { user: { name: { contains: q, mode: "insensitive" } } }, { user: { email: { contains: q, mode: "insensitive" } } }] } : {}) };
  const orderBy: Prisma.DailyReportOrderByWithRelationInput[] = sort === "oldest" ? [{ reportDate: "asc" }, { id: "asc" }] : sort === "name_asc" ? [{ user: { name: "asc" } }, { id: "asc" }] : sort === "name_desc" ? [{ user: { name: "desc" } }, { id: "asc" }] : sort === "status" ? [{ status: "asc" }, { updatedAt: "desc" }, { id: "asc" }] : [{ submittedAt: "desc" }, { updatedAt: "desc" }, { id: "asc" }];
  const [members, approvedLeave, holiday, allReports, initialReports, count] = await Promise.all([
    prisma.organizationMember.findMany({ where: memberScope, include: { user: { select: { id: true, name: true, email: true } } }, orderBy: { user: { name: "asc" } } }),
    prisma.leaveRequest.findMany({ where: { organizationId: organization.id, status: "APPROVED", startDate: { lte: date }, endDate: { gte: date }, user: leadUserScope }, select: { userId: true } }),
    prisma.organizationHoliday.findUnique({ where: { organizationId_holidayDate: { organizationId: organization.id, holidayDate: date } }, select: { id: true } }),
    prisma.dailyReport.findMany({ where: reportScope, include: { pulse: true, tasks: true } }),
    prisma.dailyReport.findMany({ where: filtered, include: { user: { select: { name: true, email: true } }, pulse: true, tasks: true }, orderBy, skip: pagination.skip, take: pagination.pageSize }),
    prisma.dailyReport.count({ where: filtered }),
  ]);
  const pageInfo = boundedPage(pagination.page, count, pagination.pageSize);
  const reports = pageInfo.page === pagination.page ? initialReports : await prisma.dailyReport.findMany({ where: filtered, include: { user: { select: { name: true, email: true } }, pulse: true, tasks: true }, orderBy, skip: (pageInfo.page - 1) * pagination.pageSize, take: pagination.pageSize });
  const workDays = settings?.workDays ?? [1, 2, 3, 4, 5];
  const shouldExpectReports = isReportExpected(dateKey, workDays, Boolean(holiday), settings?.requireDailyReports !== false);
  const leaveIds = new Set(approvedLeave.map((item) => item.userId));
  const expected = shouldExpectReports ? members.filter((item) => !leaveIds.has(item.userId)).length : 0;
  const submitted = allReports.filter((item) => item.status === "SUBMITTED" || item.status === "REVIEWED").length;
  const drafts = allReports.filter((item) => item.status === "DRAFT").length;
  const missing = Math.max(0, expected - allReports.length);
  const blockers = allReports.filter((item) => item.pulse?.mood === "BLOCKED" || item.blockers).length;
  const completedTasks = allReports.reduce((sum, item) => sum + item.tasks.filter((task) => task.completedToday).length, 0);
  const workingMs = allReports.reduce((sum, item) => sum + snapshotNumber(item.snapshot, "netMs"), 0);

  return <div className="space-y-6"><section><p className="font-mono text-[11px] font-semibold uppercase tracking-[0.16em] text-[#2563eb]">Manager workspace</p><h1 className="mt-2 text-3xl font-semibold tracking-[-0.045em] text-[#172033]">Daily reports</h1><p className="mt-2 text-sm text-[#667085]">Factual work summaries and team blockers for {organization.name}.</p></section>
    <section className="overflow-hidden rounded-2xl border border-[#dce4ef] bg-white"><div className="border-b border-[#edf0f4] px-5 py-4"><h2 className="font-semibold text-[#253047]">Daily team overview</h2><p className="mt-1 text-xs text-[#98a2b3]">{date.toLocaleDateString("en-IN", { weekday: "long", day: "2-digit", month: "long", year: "numeric", timeZone: "UTC" })}</p></div><div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6"><Overview label="Expected" value={String(expected)} /><Overview label="Submitted" value={String(submitted)} /><Overview label="Drafts" value={String(drafts)} /><Overview label="Missing" value={String(missing)} /><Overview label="Tasks completed" value={String(completedTasks)} /><Overview label="Recorded work" value={formatMilliseconds(workingMs)} /></div>{blockers ? <div className="border-t border-[#f2dfbd] bg-[#fffaf0] px-5 py-3 text-sm text-[#8a5709]">{blockers} employee{blockers === 1 ? "" : "s"} reported work blockers.</div> : null}</section>
    <section className="overflow-hidden rounded-2xl border border-[#e6eaf0] bg-white"><form className="grid gap-2 border-b border-[#edf0f4] p-4 sm:grid-cols-2 xl:grid-cols-5"><input type="hidden" name="pageSize" value={pagination.pageSize} /><input name="q" defaultValue={q} placeholder="Search employee or summary" className="h-10 rounded-xl border border-[#dfe4eb] px-3 text-sm" /><input aria-label="Overview date" type="date" name="date" defaultValue={dateKey} className="h-10 rounded-xl border border-[#dfe4eb] px-3 text-sm" /><input aria-label="Reports from date" type="date" name="from" defaultValue={from ?? ""} className="h-10 rounded-xl border border-[#dfe4eb] px-3 text-sm" /><input aria-label="Reports to date" type="date" name="to" defaultValue={to ?? ""} className="h-10 rounded-xl border border-[#dfe4eb] px-3 text-sm" /><select name="employee" aria-label="Employee" defaultValue={filters.employee || ""} className="h-10 rounded-xl border border-[#dfe4eb] bg-white px-3 text-sm"><option value="">All employees</option>{members.map((item) => <option key={item.userId} value={item.userId}>{item.user.name || item.user.email}</option>)}</select><select name="status" aria-label="Status" defaultValue={status || ""} className="h-10 rounded-xl border border-[#dfe4eb] bg-white px-3 text-sm"><option value="">All statuses</option><option value="DRAFT">Draft</option><option value="SUBMITTED">Submitted</option><option value="REVIEWED">Reviewed</option></select><FilterDropdown name="pulse" label="All pulses" value={pulse} options={[["SMOOTH", "Smooth"], ["NORMAL", "Normal"], ["BLOCKED", "Blocked"]]} /><SortSelector value={sort} options={[["newest", "Newest first"], ["oldest", "Oldest first"], ["name_asc", "Name A–Z"], ["name_desc", "Name Z–A"], ["status", "Status"]]} /><div className="flex gap-2"><button className="h-10 rounded-xl bg-[#172033] px-4 text-sm font-semibold text-white">Apply</button><Link href="/dashboard/reports" className="grid h-10 place-items-center rounded-xl border px-3 text-xs text-[#667085]">Clear</Link></div></form>
      <ActiveFilterChips pathname="/dashboard/reports" params={filters} filters={[{ key: "q", label: "Search", value: q }, { key: "from", label: "From", value: from }, { key: "to", label: "To", value: to }, { key: "employee", label: "Employee", value: members.find((item) => item.userId === filters.employee)?.user.name ?? undefined }, { key: "status", label: "Status", value: status }, { key: "pulse", label: "Pulse", value: pulse }]} />
      {reports.length ? <><div className="hidden overflow-x-auto md:block"><table className="w-full min-w-[820px] text-left"><thead><tr className="bg-[#fafbfc] text-[11px] font-semibold uppercase tracking-[0.1em] text-[#98a2b3]"><th className="px-6 py-3.5">Employee</th><th className="px-4 py-3.5">Date</th><th className="px-4 py-3.5">Working hours</th><th className="px-4 py-3.5">Completed</th><th className="px-4 py-3.5">Pulse</th><th className="px-4 py-3.5">Status</th><th className="px-6 py-3.5 text-right">Submitted</th></tr></thead><tbody className="divide-y divide-[#edf0f4]">{reports.map((item) => <tr key={item.id} className="hover:bg-[#fbfcff]"><td className="px-6 py-4"><Link href={`/dashboard/reports/${item.id}`} className="text-sm font-semibold text-[#2555a7]">{item.user.name || item.user.email}</Link></td><td className="px-4 py-4 font-mono text-xs text-[#667085]">{item.reportDate.toISOString().slice(0, 10)}</td><td className="px-4 py-4 font-mono text-xs text-[#344054]">{formatMilliseconds(snapshotNumber(item.snapshot, "netMs"))}</td><td className="px-4 py-4 text-sm text-[#475467]">{item.tasks.filter((task) => task.completedToday).length}</td><td className="px-4 py-4"><Pulse mood={item.pulse?.mood} /></td><td className="px-4 py-4"><ReportStatusBadge status={item.status} /></td><td className="px-6 py-4 text-right text-xs text-[#7c8799]">{item.submittedAt?.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", timeZone: timezone }) ?? "—"}</td></tr>)}</tbody></table></div><div className="divide-y divide-[#edf0f4] md:hidden">{reports.map((item) => <Link href={`/dashboard/reports/${item.id}`} key={item.id} className="block p-4"><div className="flex items-start justify-between gap-3"><div><p className="text-sm font-semibold text-[#344054]">{item.user.name || item.user.email}</p><p className="mt-1 text-xs text-[#98a2b3]">{formatMilliseconds(snapshotNumber(item.snapshot, "netMs"))} · {item.tasks.filter((task) => task.completedToday).length} completed</p></div><ReportStatusBadge status={item.status} /></div><div className="mt-3"><Pulse mood={item.pulse?.mood} /></div></Link>)}</div></> : <div className="px-6 py-14 text-center text-sm text-[#7c8799]">No reports match these filters.</div>}<PaginationControls pathname="/dashboard/reports" params={filters} page={pageInfo.page} pageSize={pagination.pageSize} total={count} pages={pageInfo.pages} /></section>
  </div>;
}

function snapshotNumber(snapshot: Prisma.JsonValue | null, key: string) { if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) return 0; const hours = snapshot.hours; if (!hours || typeof hours !== "object" || Array.isArray(hours)) return 0; const value = hours[key]; return typeof value === "number" ? value : 0; }
function Overview({ label, value }: { label: string; value: string }) { return <div className="border-r border-b border-[#edf0f4] p-4"><p className="text-[11px] text-[#7c8799]">{label}</p><p className="mt-1 font-mono text-xl font-semibold text-[#253047]">{value}</p></div>; }
function Pulse({ mood }: { mood?: string }) { if (!mood) return <span className="text-xs text-[#98a2b3]">—</span>; const tone = mood === "BLOCKED" ? "bg-[#fff1f0] text-[#a43b32]" : mood === "SMOOTH" ? "bg-[#eaf8f2] text-[#157357]" : "bg-[#eef4ff] text-[#2555a7]"; return <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${tone}`}>{mood.toLowerCase()}</span>; }
