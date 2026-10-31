"use client";

import { useActionState, useEffect, useState } from "react";
import { pauseTaskTimer, resumeTaskTimer, startTaskTimer, stopTaskTimer } from "@/actions/work-timer.actions";
import { Icon } from "@/components/ui/icons";
import type { FormState } from "@/lib/validations";
import { formatMilliseconds } from "@/lib/work-time";

type TimerTask = { id: string; title: string; estimatedMins: number | null; totalMs: number; hasSessions: boolean };
type Active = { taskId: string; title: string; startedAt: string; totalMsAtServer: number } | null;
const initial: FormState = {};

export function ActiveTaskTimer({ organizationId, initialNow, active, tasks, checkedIn, onBreak }: { organizationId: string; initialNow: string; active: Active; tasks: TimerTask[]; checkedIn: boolean; onBreak: boolean }) {
  const [now, setNow] = useState(() => new Date(initialNow));
  const [selected, setSelected] = useState(tasks.find((task) => task.hasSessions && task.id !== active?.taskId)?.id ?? tasks[0]?.id ?? "");
  const [startState, startAction, starting] = useActionState(startTaskTimer, initial);
  const [resumeState, resumeAction, resuming] = useActionState(resumeTaskTimer, initial);
  const [pauseState, pauseAction, pausing] = useActionState(pauseTaskTimer, initial);
  const [stopState, stopAction, stopping] = useActionState(stopTaskTimer, initial);
  useEffect(() => { const id = window.setInterval(() => setNow(new Date()), 1000); return () => window.clearInterval(id); }, []);
  const selectedTaskId = tasks.some((task) => task.id === selected) ? selected : tasks.find((task) => task.hasSessions)?.id ?? tasks[0]?.id ?? "";
  const chosen = tasks.find((task) => task.id === selectedTaskId);
  const liveMs = active ? active.totalMsAtServer + Math.max(0, now.getTime() - new Date(initialNow).getTime()) : 0;
  const state = [stopState, pauseState, resumeState, startState].find((item) => item.message);
  const busy = starting || resuming || pausing || stopping;

  return <section className="overflow-hidden rounded-[1.5rem] border border-[#dbe4f2] bg-white shadow-[0_10px_35px_rgba(37,84,155,0.07)]">
    <div className="grid lg:grid-cols-[1.25fr_0.75fr]">
      <div className="relative overflow-hidden bg-[#172033] p-5 text-white sm:p-6">
        <div className="absolute -right-14 -top-14 size-44 rounded-full border-[34px] border-[#2563eb]/20" />
        <div className="relative flex items-center gap-2 text-xs text-[#9aa8bf]"><span className={`size-2 rounded-full ${active ? "animate-pulse bg-[#5ee0b1]" : "bg-[#66748b]"}`} />{active ? "Task timer running" : onBreak ? "Timer paused during break" : checkedIn ? "Ready to focus" : "Check in to track task time"}</div>
        <h2 className="relative mt-5 max-w-xl text-xl font-semibold tracking-[-0.025em]">{active?.title ?? "Choose the next task to work on"}</h2>
        <p className="relative mt-5 font-mono text-4xl font-semibold tracking-[-0.06em] text-[#dce7ff] sm:text-5xl">{formatMilliseconds(liveMs, true)}</p>
        {active ? <div className="relative mt-6 flex flex-col gap-2 min-[390px]:flex-row"><TimerForm action={pauseAction} organizationId={organizationId} taskId={active.taskId} disabled={busy} label={pausing ? "Pausing…" : "Pause"} style="primary" /><TimerForm action={stopAction} organizationId={organizationId} taskId={active.taskId} disabled={busy} label={stopping ? "Finishing…" : "Finish task"} style="secondary" /></div> : null}
      </div>
      <div className="p-5 sm:p-6">
        <p className="text-sm font-semibold text-[#253047]">Task queue</p><p className="mt-1 text-xs leading-5 text-[#7c8799]">One task can run at a time. A break pauses it automatically.</p>
        {!active && tasks.length ? <><label className="mt-5 block text-xs font-medium text-[#667085]">Assigned task<select value={selectedTaskId} onChange={(event) => setSelected(event.target.value)} className="mt-2 h-11 w-full rounded-xl border border-[#dfe4eb] bg-white px-3 text-sm text-[#344054] outline-none focus:border-[#80a7f5]">{tasks.map((task) => <option key={task.id} value={task.id}>{task.title}</option>)}</select></label><div className="mt-3 grid gap-2 min-[390px]:grid-cols-2"><TimerForm action={startAction} organizationId={organizationId} taskId={selectedTaskId} disabled={busy || !checkedIn || onBreak || Boolean(chosen?.hasSessions)} label={starting ? "Starting…" : "Start"} style="dark" /><TimerForm action={resumeAction} organizationId={organizationId} taskId={selectedTaskId} disabled={busy || !checkedIn || onBreak || !chosen?.hasSessions} label={resuming ? "Resuming…" : "Resume"} style="outline" /></div></> : null}
        {!tasks.length ? <div className="mt-5 rounded-xl border border-dashed border-[#d8dee8] px-4 py-8 text-center text-sm text-[#7c8799]">No active assigned tasks.</div> : null}
        {chosen && !active ? <div className="mt-4 flex items-center justify-between border-t border-[#edf0f4] pt-4 text-xs"><span className="text-[#7c8799]">Tracked / estimate</span><span className="font-mono font-semibold text-[#344054]">{formatMilliseconds(chosen.totalMs)} / {chosen.estimatedMins ? `${Math.floor(chosen.estimatedMins / 60)}h ${chosen.estimatedMins % 60}m` : "No estimate"}</span></div> : null}
      </div>
    </div>
    {state?.message ? <p role="status" className={`border-t px-5 py-3 text-sm ${state.success ? "border-[#cceadd] bg-[#f2fbf7] text-[#157357]" : "border-[#f2d4d1] bg-[#fff7f6] text-[#b42318]"}`}>{state.message}</p> : null}
  </section>;
}

function TimerForm({ action, organizationId, taskId, disabled, label, style }: { action: (formData: FormData) => void; organizationId: string; taskId: string; disabled: boolean; label: string; style: "primary" | "secondary" | "dark" | "outline" }) {
  const styles = { primary: "bg-[#2563eb] text-white", secondary: "border border-white/15 bg-white/[0.08] text-white", dark: "bg-[#172033] text-white", outline: "border border-[#dfe4eb] bg-white text-[#344054]" };
  return <form action={action} className="flex-1"><input type="hidden" name="organizationId" value={organizationId} /><input type="hidden" name="taskId" value={taskId} /><button disabled={disabled} className={`flex h-11 w-full items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-40 ${styles[style]}`}><Icon name={style === "secondary" ? "check" : "clock"} className="size-4" />{label}</button></form>;
}
