"use client";

import { useActionState, useEffect, useState } from "react";
import { endBreak, startBreak } from "@/actions/work-timer.actions";
import { Icon } from "@/components/ui/icons";
import type { FormState } from "@/lib/validations";
import { formatMilliseconds } from "@/lib/work-time";

const initial: FormState = {};

export function BreakTimer({ organizationId, initialNow, checkedIn, activeBreak, lunchReminderTime }: { organizationId: string; initialNow: string; checkedIn: boolean; activeBreak: { type: string; startedAt: string } | null; lunchReminderTime: string }) {
  const [now, setNow] = useState(() => new Date(initialNow));
  const [type, setType] = useState("LUNCH");
  const [startState, startAction, starting] = useActionState(startBreak, initial);
  const [endState, endAction, ending] = useActionState(endBreak, initial);
  useEffect(() => { const id = window.setInterval(() => setNow(new Date()), 1000); return () => window.clearInterval(id); }, []);
  const elapsed = activeBreak ? Math.max(0, now.getTime() - new Date(activeBreak.startedAt).getTime()) : 0;
  const state = endState.message ? endState : startState;
  return <section className="rounded-2xl border border-[#e6eaf0] bg-white p-5 sm:p-6"><div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between"><div className="flex items-start gap-4"><span className={`grid size-11 shrink-0 place-items-center rounded-2xl ${activeBreak ? "bg-[#fff3dd] text-[#a35f00]" : "bg-[#f2f4f7] text-[#667085]"}`}><Icon name="coffee" className="size-5" /></span><div><div className="flex flex-wrap items-center gap-2"><h2 className="font-semibold text-[#253047]">{activeBreak ? `${activeBreak.type.replaceAll("_", " ")} break` : "Take a break"}</h2>{activeBreak ? <span className="rounded-full bg-[#fff6e5] px-2.5 py-1 text-[10px] font-semibold text-[#a35f00]">On break</span> : null}</div><p className="mt-1 text-xs text-[#7c8799]">Lunch reminder {lunchReminderTime} · timers resume manually</p>{activeBreak ? <p className="mt-3 font-mono text-2xl font-semibold tracking-[-0.04em] text-[#172033]">{formatMilliseconds(elapsed, true)}</p> : null}</div></div>{activeBreak ? <form action={endAction}><input type="hidden" name="organizationId" value={organizationId} /><button disabled={ending} className="h-11 w-full rounded-xl bg-[#172033] px-5 text-sm font-semibold text-white disabled:opacity-50 lg:w-auto">{ending ? "Ending…" : "End break"}</button></form> : <form action={startAction} className="flex flex-col gap-2 min-[390px]:flex-row"><input type="hidden" name="organizationId" value={organizationId} /><select name="type" value={type} onChange={(event) => setType(event.target.value)} className="h-11 rounded-xl border border-[#dfe4eb] bg-white px-3 text-sm text-[#344054]"><option value="LUNCH">Lunch</option><option value="TEA">Tea</option><option value="PERSONAL">Personal</option><option value="OTHER">Other</option></select><button disabled={!checkedIn || starting} className="h-11 rounded-xl bg-[#2563eb] px-5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40">{starting ? "Starting…" : "Start break"}</button></form>}</div>{state.message ? <p role="status" className={`mt-4 rounded-xl px-4 py-3 text-sm ${state.success ? "bg-[#f2fbf7] text-[#157357]" : "bg-[#fff7f6] text-[#b42318]"}`}>{state.message}</p> : null}</section>;
}
