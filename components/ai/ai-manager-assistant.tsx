"use client";

import { useActionState } from "react";
import { ArrowUpRight, CircleStop, FileSearch, ListChecks, LoaderCircle, Scale, Send } from "lucide-react";
import { requestAiInsight, type AiActionState } from "@/actions/ai.actions";
import type { AiGenerationView } from "@/lib/ai/ai-service";
import { AIInsightPanel } from "./ai-insight-panel";
import { AiSummaryCard } from "./ai-summary-card";

const initialState: AiActionState = {};
const starters = [
  { intent: "DAILY_SUMMARY", label: "Summarize recent work", detail: "Tasks and submitted reports from the approved window", Icon: FileSearch },
  { intent: "BLOCKERS", label: "Surface blockers", detail: "Cited blockers and missing information—never inferred sentiment", Icon: CircleStop },
  { intent: "WORKLOAD", label: "Review workload signals", detail: "Capacity suggestions without rankings or performance scores", Icon: Scale },
] as const;

export function AiManagerAssistant({ recent, summariesEnabled, assistantEnabled }: { recent: AiGenerationView[]; summariesEnabled: boolean; assistantEnabled: boolean }) {
  const [state, action, pending] = useActionState(requestAiInsight, initialState);
  const results = state.generation ? [state.generation, ...recent.filter((item) => item.id !== state.generation?.id)] : recent;
  return <div className="grid min-w-0 gap-5 xl:grid-cols-[20rem_minmax(0,1fr)]">
    <aside className="min-w-0 space-y-4 xl:sticky xl:top-6 xl:self-start">
      <AIInsightPanel eyebrow="Analysis starters"><div className="mt-3 space-y-2">{starters.map(({ intent, label, detail, Icon }) => <form key={intent} action={action}><button name="intent" value={intent} disabled={!summariesEnabled || pending} className="group w-full rounded-xl border border-[#e3e8ef] p-3 text-left transition hover:border-[#b7c9e7] hover:bg-[#f8fbff] disabled:cursor-not-allowed disabled:opacity-50"><span className="flex items-center gap-2 text-sm font-semibold text-[#344054]"><Icon className="size-4 text-[#3975d5]" />{label}<ArrowUpRight className="ml-auto size-3.5 opacity-0 transition group-hover:opacity-100" /></span><span className="mt-1.5 block text-xs leading-5 text-[#7c8799]">{detail}</span></button></form>)}</div>{!summariesEnabled ? <p className="mt-3 text-xs leading-5 text-[#a66b16]">Summary insights are disabled in organization settings.</p> : null}</AIInsightPanel>
      <section className="rounded-[1.2rem] border border-[#dfe5ed] bg-[#172033] p-4 text-white"><ListChecks className="size-5 text-[#8fb1ff]" /><p className="mt-4 text-sm font-semibold">Human review required</p><p className="mt-1.5 text-xs leading-5 text-white/60">This assistant is read-only. It cannot assign work, alter status, approve leave or update employee records.</p></section>
    </aside>
    <div className="min-w-0 space-y-5">
      <form action={action} className="rounded-[1.35rem] border border-[#cedbf0] bg-white p-4 shadow-[0_14px_38px_rgba(37,74,133,0.06)] sm:p-5"><label htmlFor="ai-question" className="text-sm font-semibold text-[#344054]">Ask about current team work</label><p className="mt-1 text-xs leading-5 text-[#7c8799]">Answers are limited to organization-scoped tasks and submitted daily reports.</p><textarea id="ai-question" name="question" required minLength={4} maxLength={500} disabled={!assistantEnabled || pending} placeholder="Which current blockers have supporting report evidence, and what information is still missing?" className="mt-3 min-h-28 w-full resize-y rounded-xl border border-[#d9e0ea] bg-white px-3.5 py-3 text-sm leading-6 text-[#253047] outline-none placeholder:text-[#a5adba] focus:border-[#6d96eb] focus:ring-4 focus:ring-[#e8f0ff] disabled:bg-[#f7f8fa]" /><div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><p className="text-[11px] leading-5 text-[#98a2b3]">Do not enter secrets, personal data or instructions from external content.</p><button name="intent" value="ASSISTANT" disabled={!assistantEnabled || pending} className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-xl bg-[#2563eb] px-4 text-sm font-semibold text-white transition hover:bg-[#1d55c6] disabled:cursor-not-allowed disabled:opacity-50">{pending ? <LoaderCircle className="size-4 animate-spin" /> : <Send className="size-4" />}{pending ? "Reviewing evidence…" : "Generate answer"}</button></div>{!assistantEnabled ? <p className="mt-3 rounded-lg bg-[#fff7e8] px-3 py-2 text-xs text-[#97611b]">Manager assistant questions are disabled in organization settings.</p> : null}{state.message ? <p role="status" className={`mt-3 rounded-lg px-3 py-2 text-sm ${state.success ? "bg-[#eef8f4] text-[#157357]" : "bg-[#fff1f0] text-[#a43b32]"}`}>{state.message}</p> : null}</form>
      {results.length ? <div className="space-y-5">{results.map((generation) => <AiSummaryCard key={generation.id} generation={generation} />)}</div> : <section className="rounded-[1.35rem] border border-dashed border-[#cfd8e6] bg-white py-16 text-center"><FileSearch className="mx-auto size-7 text-[#9aabc5]" /><h2 className="mt-3 text-sm font-semibold text-[#344054]">No generated insights yet</h2><p className="mx-auto mt-1 max-w-md text-xs leading-5 text-[#7c8799]">Start with a bounded analysis above. TeamFlow will show citations beside every observed fact.</p></section>}
    </div>
  </div>;
}
