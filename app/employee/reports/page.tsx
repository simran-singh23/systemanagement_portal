import type { Metadata } from "next";
import Link from "next/link";
import type { Prisma, ReportStatus } from "@prisma/client";
import { DailyReportForm } from "@/components/reports/daily-report-form";
import { ReportStatusBadge } from "@/components/reports/report-status";
import { StatusBadge } from "@/components/tasks/task-badges";
import { requireCurrentOrganization } from "@/lib/dal/auth";
import { databaseDate, formatTimeInZone, isValidDateKey } from "@/lib/date-time";
import { prisma } from "@/lib/prisma";
import { getReportDayData, getReportSettings, reportWorkday } from "@/lib/reports";
import { formatMilliseconds } from "@/lib/work-time";

export const metadata: Metadata = { title: "Daily reports" };
export const dynamic = "force-dynamic";
type Search = { date?: string; from?: string; to?: string; status?: string; page?: string };

export default async function EmployeeReportsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const [{ user, organization }, filters] = await Promise.all([requireCurrentOrganization("reports:manage-own"), searchParams]);
  const now = new Date();
  const [settings, openOffice] = await Promise.all([
    getReportSettings(organization.id),
    prisma.workSession.findFirst({ where: { organizationId: organization.id, userId: user.id, taskId: null, endedAt: null }, orderBy: { startedAt: "desc" }, select: { attendance: { select: { attendanceDate: true } } } }),
  ]);
  const { timezone } = settings;
  const todayKey = reportWorkday(now, settings);
  const defaultDate = openOffice?.attendance.attendanceDate.toISOString().slice(0, 10) ?? todayKey;
  const selectedDate = filters.date && isValidDateKey(filters.date) && filters.date <= todayKey ? filters.date : defaultDate;
  const reportDate = databaseDate(selectedDate);
  const status = ["DRAFT", "SUBMITTED", "REVIEWED"].includes(filters.status || "") ? filters.status as ReportStatus : undefined;
  const page = Math.max(1, Number.parseInt(filters.page ?? "", 10) || 1);
  const from = filters.from && isValidDateKey(filters.from) ? filters.from : undefined;
  const to = filters.to && isValidDateKey(filters.to) ? filters.to : undefined;
  const historyWhere: Prisma.DailyReportWhereInput = { organizationId: organization.id, userId: user.id, ...(status ? { status } : {}), ...(from || to ? { reportDate: { ...(from ? { gte: databaseDate(from) } : {}), ...(to ? { lte: databaseDate(to) } : {}) } } : {}) };
  const [dayData, report, history, historyCount] = await Promise.all([
    getReportDayData(organization.id, user.id, selectedDate, settings, now),
    prisma.dailyReport.findUnique({ where: { organizationId_userId_reportDate: { organizationId: organization.id, userId: user.id, reportDate } }, include: { pulse: true } }),
    prisma.dailyReport.findMany({ where: historyWhere, include: { pulse: true, tasks: true }, orderBy: { reportDate: "desc" }, skip: (page - 1) * 8, take: 8 }),
    prisma.dailyReport.count({ where: historyWhere }),
  ]);
  const completed = dayData.tasks.filter((task) => task.completedToday);
  const progress = dayData.tasks.filter((task) => task.status === "IN_PROGRESS");
  const blocked = dayData.tasks.filter((task) => task.status === "BLOCKED");
  const pages = Math.max(1, Math.ceil(historyCount / 8));

  return <div className="space-y-6"><section className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><p className="font-mono text-[11px] font-semibold uppercase tracking-[0.16em] text-[#2563eb]">My workspace</p><h1 className="mt-2 text-3xl font-semibold tracking-[-0.045em] text-[#172033]">Daily work report</h1><p className="mt-2 text-sm text-[#667085]">{user.name || user.email} · {reportDate.toLocaleDateString("en-IN", { weekday: "long", day: "2-digit", month: "long", year: "numeric", timeZone: "UTC" })}</p></div><div className="flex items-center gap-2">{report ? <ReportStatusBadge status={report.status} /> : <span className="rounded-full bg-[#f2f4f7] px-3 py-1.5 text-xs text-[#667085]">Not started</span>}<span className="text-xs text-[#98a2b3]">Due {settings.dailyReportDueTime}</span></div></section>
    <form className="flex flex-wrap items-end gap-2">
      <label className="text-sm font-medium text-[#344054]">Report workday<input type="date" name="date" max={todayKey} defaultValue={selectedDate} required className="ml-2 h-10 rounded-xl border border-[#dfe4eb] px-3 text-sm" /></label>
      <button className="h-10 rounded-xl border border-[#dfe4eb] bg-white px-4 text-sm font-semibold text-[#344054]">Open workday</button>
    </form>
    <section className="overflow-hidden rounded-2xl border border-[#dce4ef] bg-white"><div className="grid grid-cols-2 lg:grid-cols-4"><Metric label="Check-in" value={formatTimeInZone(dayData.attendance?.checkInAt ?? null, timezone)} /><Metric label="Check-out" value={formatTimeInZone(dayData.attendance?.checkOutAt ?? null, timezone)} provisional={dayData.provisional} /><Metric label="Net working" value={formatMilliseconds(dayData.hours.netMs)} /><Metric label="Task tracked" value={formatMilliseconds(dayData.hours.taskMs)} /></div><div className="grid grid-cols-2 border-t border-[#edf0f4] lg:grid-cols-4"><Metric label="Office duration" value={formatMilliseconds(dayData.hours.officeMs)} /><Metric label="Break time" value={formatMilliseconds(dayData.hours.breakMs)} /><Metric label="Unallocated" value={formatMilliseconds(dayData.hours.unallocatedMs)} /><Metric label="Totals" value={dayData.provisional ? "Provisional" : dayData.attendance?.checkOutAt ? "Final" : "No attendance"} /></div></section>
    <section className="grid gap-4 lg:grid-cols-3"><TaskEvidence title="Completed this workday" tasks={completed} empty="No tasks completed this workday." /><TaskEvidence title="In progress" tasks={progress} empty="No tasks currently in progress." /><TaskEvidence title="Blocked" tasks={blocked} empty="No blocked tasks." /></section>
    <DailyReportForm key={selectedDate} organizationId={organization.id} reportDate={selectedDate} allowEditAfterSubmission={settings.allowReportEditingAfterSubmission} report={report ? { summary: report.summary, completedWork: report.completedWork, progress: report.progress, blockers: report.blockers, nextPlan: report.nextPlan, additionalNotes: report.additionalNotes, status: report.status, updatedAt: report.updatedAt.toISOString(), pulse: report.pulse ? { mood: report.pulse.mood, note: report.pulse.note } : null } : null} />
    <section className="overflow-hidden rounded-2xl border border-[#e6eaf0] bg-white"><div className="border-b border-[#edf0f4] px-5 py-4 sm:px-6"><h2 className="font-semibold text-[#253047]">Report history</h2></div><form className="grid gap-2 border-b border-[#edf0f4] p-4 sm:grid-cols-4"><input type="hidden" name="date" value={selectedDate} /><input aria-label="From date" type="date" name="from" defaultValue={from ?? ""} className="h-10 rounded-xl border border-[#dfe4eb] px-3 text-sm" /><input aria-label="To date" type="date" name="to" defaultValue={to ?? ""} className="h-10 rounded-xl border border-[#dfe4eb] px-3 text-sm" /><select aria-label="Report status" name="status" defaultValue={status || ""} className="h-10 rounded-xl border border-[#dfe4eb] bg-white px-3 text-sm"><option value="">All statuses</option><option value="DRAFT">Draft</option><option value="SUBMITTED">Submitted</option><option value="REVIEWED">Reviewed</option></select><button className="h-10 rounded-xl bg-[#172033] px-4 text-sm font-semibold text-white">Filter</button></form>{history.length ? <div className="divide-y divide-[#edf0f4]">{history.map((item) => <article key={item.id} className="grid gap-3 px-5 py-4 sm:grid-cols-[auto_1fr_auto_auto] sm:items-center sm:px-6"><Link href={`?date=${item.reportDate.toISOString().slice(0, 10)}`} className="font-mono text-xs font-semibold text-[#2555a7] hover:underline">{item.reportDate.toISOString().slice(0, 10)}</Link><p className="truncate text-sm text-[#667085]">{item.summary}</p><span className="text-xs text-[#7c8799]">{item.tasks.length} tasks · {item.pulse?.mood.toLowerCase() ?? "no pulse"}</span><ReportStatusBadge status={item.status} /></article>)}</div> : <div className="px-6 py-12 text-center text-sm text-[#7c8799]">No reports match these filters.</div>}<div className="flex items-center justify-between border-t border-[#edf0f4] px-5 py-3 text-xs text-[#7c8799]"><span>Page {page} of {pages}</span><div className="flex gap-2">{page > 1 ? <Link className="rounded-lg border px-3 py-1.5" href={`?date=${selectedDate}&page=${page - 1}&status=${status ?? ""}&from=${from ?? ""}&to=${to ?? ""}`}>Previous</Link> : null}{page < pages ? <Link className="rounded-lg border px-3 py-1.5" href={`?date=${selectedDate}&page=${page + 1}&status=${status ?? ""}&from=${from ?? ""}&to=${to ?? ""}`}>Next</Link> : null}</div></div></section>
  </div>;
}

function Metric({ label, value, provisional }: { label: string; value: string; provisional?: boolean }) { return <div className="border-r border-b border-[#edf0f4] p-4 last:border-r-0 sm:p-5"><p className="text-[11px] text-[#7c8799]">{label}{provisional ? " · provisional" : ""}</p><p className="mt-1 font-mono text-sm font-semibold text-[#253047]">{value}</p></div>; }
function TaskEvidence({ title, tasks, empty }: { title: string; tasks: { id: string; title: string; status: string; milliseconds: number }[]; empty: string }) { return <article className="rounded-2xl border border-[#e6eaf0] bg-white p-5"><div className="flex items-center justify-between"><h2 className="text-sm font-semibold text-[#344054]">{title}</h2><span className="font-mono text-xs text-[#98a2b3]">{tasks.length}</span></div><div className="mt-4 space-y-3">{tasks.length ? tasks.map((task) => <div key={task.id}><div className="flex items-start justify-between gap-2"><p className="text-sm text-[#475467]">{task.title}</p><StatusBadge status={task.status as "TODO" | "IN_PROGRESS" | "BLOCKED" | "REVIEW" | "COMPLETED" | "CANCELLED"} /></div><p className="mt-1 font-mono text-[11px] text-[#98a2b3]">{formatMilliseconds(task.milliseconds)} tracked</p></div>) : <p className="text-sm text-[#98a2b3]">{empty}</p>}</div></article>; }
