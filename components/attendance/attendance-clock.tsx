"use client";

import { useActionState, useEffect, useState } from "react";
import { updateAttendance } from "@/actions/attendance.actions";
import { Icon } from "@/components/ui/icons";
import type { FormState } from "@/lib/validations";

type Props = {
  organizationId: string;
  timezone: string;
  initialNow: string;
  checkInAt: string | null;
  checkOutAt: string | null;
  status: string | null;
  sessionId?: string;
  workDate: string;
  previousSession: boolean;
  dayNote?: string;
  onLeave: boolean;
};

const initialState: FormState = {};

function elapsed(start: string | null, end: string | null, now: Date) {
  if (!start) return "0h 00m 00s";
  const seconds = Math.max(0, Math.floor(((end ? new Date(end) : now).getTime() - new Date(start).getTime()) / 1000));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return `${hours}h ${String(minutes).padStart(2, "0")}m ${String(seconds % 60).padStart(2, "0")}s`;
}

function timeLabel(value: string | null, timezone: string) {
  if (!value) return "Not recorded";
  return new Intl.DateTimeFormat("en-IN", { timeZone: timezone, hour: "2-digit", minute: "2-digit", hour12: true }).format(new Date(value));
}

export function AttendanceClock({ organizationId, timezone, initialNow, checkInAt, checkOutAt, status, sessionId, workDate, previousSession, dayNote, onLeave }: Props) {
  const [now, setNow] = useState(() => new Date(initialNow));
  const [result, action, pending] = useActionState(updateAttendance, initialState);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const active = Boolean(sessionId);
  const complete = Boolean(checkOutAt);
  const date = new Intl.DateTimeFormat("en-IN", { timeZone: timezone, weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(now);
  const clock = new Intl.DateTimeFormat("en-IN", { timeZone: timezone, hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true }).format(now);

  return (
    <section className="relative overflow-hidden rounded-[1.75rem] bg-[#172033] p-5 text-white shadow-[0_20px_50px_rgba(23,32,51,0.16)] sm:p-7">
      <div className="pointer-events-none absolute -right-20 -top-28 size-80 rounded-full border-[55px] border-[#2563eb]/20" />
      <div className="pointer-events-none absolute bottom-0 right-1/3 h-28 w-28 rounded-full bg-[#3b82f6]/10 blur-3xl" />
      <div className="relative grid gap-7 xl:grid-cols-[1fr_auto] xl:items-end">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] ${active ? "bg-[#23b982]/15 text-[#80e7c1]" : complete ? "bg-white/10 text-[#d0d5dd]" : "bg-[#3b82f6]/15 text-[#a9c5ff]"}`}>
              <span className={`size-1.5 rounded-full ${active ? "animate-pulse bg-[#55d8a9]" : "bg-current"}`} />
              {active ? "Working now" : complete ? "Day complete" : status ? status.replaceAll("_", " ") : "Ready to check in"}
            </span>
            <span className="text-xs text-[#98a6bd]">{timezone.replaceAll("_", " ")}</span>
          </div>
          <p className="mt-7 font-mono text-4xl font-semibold tracking-[-0.06em] sm:text-6xl">{clock}</p>
          <p className="mt-2 text-sm text-[#aeb8c9]">{date}</p>
          <p className="mt-2 text-sm text-[#dbe7ff]">Workday <time dateTime={workDate}>{workDate}</time></p>
          {previousSession ? <p className="mt-2 text-sm text-[#ffe3ad]">An earlier workday is still open. Check out to close it before starting a new one.</p> : null}
          {dayNote ? <p className="mt-2 text-sm text-[#dbe7ff]">{dayNote}</p> : null}
          <div className="mt-7 flex items-baseline gap-3">
            <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[#7f90ab]">Office timer</span>
            <strong className="font-mono text-xl tracking-[-0.03em] text-[#dbe7ff]">{elapsed(checkInAt, checkOutAt, now)}</strong>
          </div>
        </div>

        <div className="grid w-full gap-3 sm:w-auto sm:grid-cols-2 xl:min-w-[25rem]">
          <form action={action}>
            <input type="hidden" name="operation" value="check-in" />
            <input type="hidden" name="organizationId" value={organizationId} />
            <button disabled={Boolean(checkInAt) || active || onLeave || pending} className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-[#2563eb] px-6 text-sm font-semibold shadow-[0_8px_20px_rgba(37,99,235,0.28)] transition hover:bg-[#3974ef] disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-[#77849a] disabled:shadow-none">
              <Icon name="arrowRight" className="size-4" /> {pending && !active ? "Updating…" : "Check in"}
            </button>
          </form>
          <form action={action}>
            <input type="hidden" name="operation" value="check-out" />
            <input type="hidden" name="sessionId" value={sessionId ?? ""} />
            <input type="hidden" name="organizationId" value={organizationId} />
            <button disabled={!active || pending} className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl border border-white/15 bg-white/[0.07] px-6 text-sm font-semibold text-white transition hover:bg-white/[0.12] disabled:cursor-not-allowed disabled:text-[#66748b]">
              <Icon name="logout" className="size-4" /> {pending && active ? "Updating…" : "Check out"}
            </button>
          </form>
        </div>
      </div>

      <div className="relative mt-6 grid gap-px overflow-hidden rounded-2xl bg-white/10 sm:grid-cols-3">
        <ClockFact label="Workday check-in" value={timeLabel(checkInAt, timezone)} />
        <ClockFact label="Workday check-out" value={timeLabel(checkOutAt, timezone)} />
        <ClockFact label="Office duration" value={elapsed(checkInAt, checkOutAt, now).replace(/ \d+s$/, "")} />
      </div>
      {!pending && result.message ? <p role="status" className={`relative mt-4 rounded-xl px-4 py-3 text-sm ${result.success ? "bg-[#1d9b70]/15 text-[#8aebc8]" : "bg-[#d95c5c]/15 text-[#ffc3c3]"}`}>{result.message}</p> : null}
    </section>
  );
}

function ClockFact({ label, value }: { label: string; value: string }) {
  return <div className="bg-white/[0.055] px-4 py-4"><p className="text-[11px] font-medium uppercase tracking-[0.1em] text-[#b7c3d7]">{label}</p><p className="mt-1.5 font-mono text-sm font-semibold text-[#e5eaf2]">{value}</p></div>;
}
