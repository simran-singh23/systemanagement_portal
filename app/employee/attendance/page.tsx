import { ALL_BREAK_TYPES } from "@/lib/organization-settings";
import type { Metadata } from "next";
import { AttendanceClock } from "@/components/attendance/attendance-clock";
import { AttendanceStatusBadge } from "@/components/attendance/attendance-status";
import { BreakTimer } from "@/components/time-tracking/break-timer";
import { Icon } from "@/components/ui/icons";
import { requireCurrentOrganization } from "@/lib/dal/auth";
import { attendanceWorkdayKey, databaseDate, durationMinutes, formatDuration, formatTimeInZone, shiftDateKey } from "@/lib/date-time";
import { prisma } from "@/lib/prisma";
import { formatMilliseconds, workingSummary } from "@/lib/work-time";

export const metadata: Metadata = { title: "My attendance" };
export const dynamic = "force-dynamic";

const DEFAULTS = { timezone: "Asia/Kolkata", workdayStart: "09:00", workdayEnd: "18:00", overnightShiftEnabled: false, workDays: [1, 2, 3, 4, 5], lunchReminderTime: "14:00", allowedBreakTypes: ALL_BREAK_TYPES };

export default async function EmployeeAttendancePage() {
  const { user, organization } = await requireCurrentOrganization("attendance:update-own");
  const now = new Date();
  const settings = await prisma.organizationSettings.findUnique({ where: { organizationId: organization.id }, select: { timezone: true, workdayStart: true, workdayEnd: true, overnightShiftEnabled: true, workDays: true, lunchReminderTime: true, allowedBreakTypes: true } }) ?? DEFAULTS;
  const todayKey = attendanceWorkdayKey(now, settings.timezone, settings.workdayStart, settings.workdayEnd, settings.overnightShiftEnabled);
  const todayDate = databaseDate(todayKey);
  const weekStartKey = shiftDateKey(todayKey, -((todayDate.getUTCDay() + 6) % 7));
  const weekEndKey = shiftDateKey(weekStartKey, 6);
  const monthStartKey = `${todayKey.slice(0, 7)}-01`;

  const [today, openSession, weekRecords, monthRecords, holiday, approvedLeave] = await Promise.all([
    prisma.attendance.findUnique({ where: { organizationId_userId_attendanceDate: { organizationId: organization.id, userId: user.id, attendanceDate: todayDate } }, include: { breaks: { orderBy: { startedAt: "desc" } }, workSessions: { where: { taskId: { not: null } }, include: { task: { select: { title: true } } }, orderBy: { startedAt: "desc" } } } }),
    prisma.workSession.findFirst({ where: { userId: user.id, taskId: null, endedAt: null, attendance: { organizationId: organization.id } }, include: { attendance: { include: { breaks: { orderBy: { startedAt: "desc" } }, workSessions: { where: { taskId: { not: null } }, include: { task: { select: { title: true } } }, orderBy: { startedAt: "desc" } } } } }, orderBy: { startedAt: "desc" } }),
    prisma.attendance.findMany({ where: { organizationId: organization.id, userId: user.id, attendanceDate: { gte: databaseDate(weekStartKey), lte: databaseDate(weekEndKey) } }, orderBy: { attendanceDate: "asc" } }),
    prisma.attendance.findMany({ where: { organizationId: organization.id, userId: user.id, attendanceDate: { gte: databaseDate(monthStartKey), lte: todayDate } }, orderBy: { attendanceDate: "desc" } }),
    prisma.organizationHoliday.findUnique({ where: { organizationId_holidayDate: { organizationId: organization.id, holidayDate: todayDate } }, select: { name: true } }),
    prisma.leaveRequest.findFirst({ where: { organizationId: organization.id, userId: user.id, status: "APPROVED", startDate: { lte: todayDate }, endDate: { gte: todayDate } }, select: { id: true } }),
  ]);

  const weekByDate = new Map(weekRecords.map((record) => [record.attendanceDate.toISOString().slice(0, 10), record]));
  const weekDays = Array.from({ length: 7 }, (_, index) => { const key = shiftDateKey(weekStartKey, index); return { key, date: databaseDate(key), record: weekByDate.get(key) ?? null, isFuture: key > todayKey, isToday: key === todayKey }; });
  const weekMinutes = weekRecords.reduce((sum, record) => sum + durationMinutes(record.checkInAt, record.checkOutAt, now), 0);
  const presentDays = monthRecords.filter((record) => ["PRESENT", "LATE", "REMOTE", "HALF_DAY"].includes(record.status)).length;
  const lateDays = monthRecords.filter((record) => record.status === "LATE").length;

  const clockRecord = openSession?.attendance ?? today;
  const workDate = clockRecord?.attendanceDate.toISOString().slice(0, 10) ?? todayKey;
  const previousSession = Boolean(openSession && workDate !== todayKey);
  const onLeave = Boolean(approvedLeave);
  const dayNote = previousSession ? undefined : onLeave ? "You have approved leave for this workday." : holiday
    ? `${holiday.name} · Check-in is optional.`
    : settings.workDays.includes(todayDate.getUTCDay()) ? undefined : "Non-working day · Check-in is optional.";
  const timeSummary = clockRecord?.checkInAt ? workingSummary({ attendance: { startedAt: clockRecord.checkInAt, endedAt: clockRecord.checkOutAt }, breaks: clockRecord.breaks, tasks: clockRecord.workSessions, now }) : workingSummary({ attendance: null, breaks: [], tasks: [], now });
  const activeBreak = clockRecord?.breaks.find((item) => !item.endedAt) ?? null;

  return <div className="space-y-6">
    <section><p className="font-mono text-[11px] font-semibold uppercase tracking-[0.16em] text-[#2563eb]">My workspace</p><h1 className="mt-2 text-3xl font-semibold tracking-[-0.045em] text-[#172033]">Attendance</h1><p className="mt-2 text-sm text-[#667085]">Track your workday and review your attendance record at {organization.name}.</p></section>

    <AttendanceClock organizationId={organization.id} timezone={settings.timezone} initialNow={now.toISOString()} checkInAt={clockRecord?.checkInAt?.toISOString() ?? null} checkOutAt={clockRecord?.checkOutAt?.toISOString() ?? null} status={clockRecord?.status ?? null} sessionId={openSession?.id} workDate={workDate} previousSession={previousSession} onLeave={onLeave} dayNote={dayNote} />

    <BreakTimer organizationId={organization.id} initialNow={now.toISOString()} checkedIn={Boolean(openSession)} activeBreak={activeBreak ? { id: activeBreak.id, type: activeBreak.type, startedAt: activeBreak.startedAt.toISOString() } : null} lunchReminderTime={settings.lunchReminderTime} allowedBreakTypes={settings.allowedBreakTypes} />

    <section className="overflow-hidden rounded-2xl border border-[#e6eaf0] bg-white"><div className="border-b border-[#edf0f4] px-5 py-4 sm:px-6"><h2 className="font-semibold text-[#253047]">Working hours</h2><p className="mt-1 text-xs text-[#98a2b3]">Provisional totals use the current server time until checkout.</p></div><div className="grid sm:grid-cols-2 xl:grid-cols-5"><WorkMetric label="Office duration" value={formatMilliseconds(timeSummary.officeMs)} tone="#2563eb" /><WorkMetric label="Break time" value={formatMilliseconds(timeSummary.breakMs)} tone="#e09a24" /><WorkMetric label="Net working" value={formatMilliseconds(timeSummary.netMs)} tone="#16855b" /><WorkMetric label="Task tracked" value={formatMilliseconds(timeSummary.taskMs)} tone="#7251c9" /><WorkMetric label="Unallocated" value={formatMilliseconds(timeSummary.unallocatedMs)} tone="#667085" /></div></section>

    {clockRecord?.breaks.length ? <section className="overflow-hidden rounded-2xl border border-[#e6eaf0] bg-white"><div className="border-b border-[#edf0f4] px-5 py-4 sm:px-6"><h2 className="font-semibold text-[#253047]">Today’s break history</h2></div><div className="divide-y divide-[#edf0f4]">{clockRecord.breaks.map((item) => <div key={item.id} className="flex items-center justify-between gap-4 px-5 py-4 sm:px-6"><div><p className="text-sm font-semibold text-[#344054]">{item.type.replaceAll("_", " ").toLowerCase().replace(/^./, (letter) => letter.toUpperCase())}</p><p className="mt-1 text-xs text-[#98a2b3]">{formatTimeInZone(item.startedAt, settings.timezone)} – {formatTimeInZone(item.endedAt, settings.timezone)}</p></div><span className="font-mono text-xs font-semibold text-[#475467]">{formatMilliseconds(Math.max(0, (item.endedAt ?? now).getTime() - item.startedAt.getTime()))}</span></div>)}</div></section> : null}

    <section className="grid gap-4 sm:grid-cols-3"><SummaryCard icon="calendar" label="Days recorded" value={String(presentDays)} detail="This month" tone="blue" /><SummaryCard icon="clock" label="Weekly hours" value={formatDuration(weekMinutes)} detail={`${settings.workdayStart}–${settings.workdayEnd} schedule`} tone="green" /><SummaryCard icon="analytics" label="Late arrivals" value={String(lateDays)} detail="This month" tone="amber" /></section>

    <section className="rounded-2xl border border-[#e6eaf0] bg-white p-5 sm:p-6"><div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between"><div><h2 className="font-semibold text-[#253047]">Weekly summary</h2><p className="mt-1 text-xs text-[#98a2b3]">Your attendance at a glance</p></div><p className="font-mono text-xs font-semibold text-[#667085]">{formatDuration(weekMinutes)} recorded</p></div><div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">{weekDays.map((day) => { const scheduled = settings.workDays.includes(day.date.getUTCDay()); return <article key={day.key} className={`rounded-2xl border p-3 ${day.isToday ? "border-[#a9c5ff] bg-[#f7f9ff]" : "border-[#edf0f4] bg-[#fbfcfd]"}`}><div className="flex items-center justify-between"><p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#98a2b3]">{day.date.toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" })}</p>{day.isToday ? <span className="size-1.5 rounded-full bg-[#2563eb]" /> : null}</div><p className="mt-2 font-mono text-lg font-semibold text-[#253047]">{day.date.getUTCDate()}</p><div className="mt-3"><AttendanceStatusBadge status={day.record?.status ?? null} emptyLabel={day.isFuture ? "Upcoming" : scheduled ? "No record" : "Off day"} /></div><p className="mt-2 text-[11px] text-[#98a2b3]">{day.record ? formatDuration(durationMinutes(day.record.checkInAt, day.record.checkOutAt, now)) : "—"}</p></article>; })}</div></section>

    <section className="overflow-hidden rounded-2xl border border-[#e6eaf0] bg-white"><div className="border-b border-[#edf0f4] px-5 py-4 sm:px-6"><h2 className="font-semibold text-[#253047]">Monthly history</h2><p className="mt-1 text-xs text-[#98a2b3]">Verified records for {databaseDate(monthStartKey).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" })}</p></div>{monthRecords.length ? <><div className="hidden overflow-x-auto sm:block"><table className="w-full min-w-[640px] text-left"><thead><tr className="bg-[#fafbfc] text-[11px] font-semibold uppercase tracking-[0.1em] text-[#98a2b3]"><th className="px-6 py-3.5">Date</th><th className="px-4 py-3.5">Status</th><th className="px-4 py-3.5">Check in</th><th className="px-4 py-3.5">Check out</th><th className="px-6 py-3.5 text-right">Duration</th></tr></thead><tbody className="divide-y divide-[#edf0f4]">{monthRecords.map((record) => <tr key={record.id} className="hover:bg-[#fbfcff]"><td className="px-6 py-4 text-sm font-semibold text-[#344054]">{record.attendanceDate.toLocaleDateString("en-IN", { weekday: "short", day: "2-digit", month: "short", timeZone: "UTC" })}</td><td className="px-4 py-4"><AttendanceStatusBadge status={record.status} /></td><td className="px-4 py-4 font-mono text-xs text-[#667085]">{formatTimeInZone(record.checkInAt, settings.timezone)}</td><td className="px-4 py-4 font-mono text-xs text-[#667085]">{formatTimeInZone(record.checkOutAt, settings.timezone)}</td><td className="px-6 py-4 text-right font-mono text-xs font-semibold text-[#344054]">{formatDuration(durationMinutes(record.checkInAt, record.checkOutAt, now))}</td></tr>)}</tbody></table></div><div className="divide-y divide-[#edf0f4] sm:hidden">{monthRecords.map((record) => <article key={record.id} className="p-4"><div className="flex items-center justify-between gap-3"><p className="text-sm font-semibold text-[#344054]">{record.attendanceDate.toLocaleDateString("en-IN", { weekday: "short", day: "2-digit", month: "short", timeZone: "UTC" })}</p><AttendanceStatusBadge status={record.status} /></div><div className="mt-3 grid grid-cols-3 gap-2 text-xs"><HistoryFact label="In" value={formatTimeInZone(record.checkInAt, settings.timezone)} /><HistoryFact label="Out" value={formatTimeInZone(record.checkOutAt, settings.timezone)} /><HistoryFact label="Total" value={formatDuration(durationMinutes(record.checkInAt, record.checkOutAt, now))} /></div></article>)}</div></> : <EmptyHistory />}</section>
  </div>;
}

function SummaryCard({ icon, label, value, detail, tone }: { icon: "calendar" | "clock" | "analytics"; label: string; value: string; detail: string; tone: "blue" | "green" | "amber" }) { const colors = { blue: "bg-[#eef4ff] text-[#2563eb]", green: "bg-[#eaf8f2] text-[#16855b]", amber: "bg-[#fff6e5] text-[#b16a00]" }; return <article className="rounded-2xl border border-[#e6eaf0] bg-white p-5"><div className="flex items-start justify-between gap-4"><span className={`grid size-10 place-items-center rounded-xl ${colors[tone]}`}><Icon name={icon} className="size-5" /></span><span className="text-right text-[11px] text-[#98a2b3]">{detail}</span></div><p className="mt-4 text-xs font-medium text-[#667085]">{label}</p><p className="mt-1 font-mono text-2xl font-semibold tracking-[-0.04em] text-[#172033]">{value}</p></article>; }
function HistoryFact({ label, value }: { label: string; value: string }) { return <div><p className="text-[10px] uppercase tracking-[0.08em] text-[#98a2b3]">{label}</p><p className="mt-1 font-mono text-[11px] font-semibold text-[#475467]">{value}</p></div>; }
function EmptyHistory() { return <div className="px-6 py-14 text-center"><span className="mx-auto grid size-12 place-items-center rounded-2xl bg-[#eef4ff] text-[#2563eb]"><Icon name="calendar" className="size-5" /></span><h3 className="mt-4 font-semibold text-[#253047]">No attendance recorded yet</h3><p className="mt-1 text-sm text-[#7c8799]">Your verified check-ins will appear here.</p></div>; }
function WorkMetric({ label, value, tone }: { label: string; value: string; tone: string }) { return <div className="border-b border-[#edf0f4] p-5 last:border-b-0 sm:border-r xl:border-b-0"><span className="block h-1 w-8 rounded-full" style={{ backgroundColor: tone }} /><p className="mt-4 text-xs text-[#7c8799]">{label}</p><p className="mt-1 font-mono text-lg font-semibold text-[#253047]">{value}</p></div>; }
