import type { Metadata } from "next";
import Link from "next/link";
import { BrainCircuit, LockKeyhole, ShieldCheck, Sparkles } from "lucide-react";
import { AIManagerChat } from "@/components/ai/ai-manager-chat";
import { AiUsageIndicator } from "@/components/ai/ai-usage-indicator";
import { getAiPageData } from "@/lib/ai/ai-service";

export const metadata: Metadata = { title: "AI Manager Assistant" };
export const dynamic = "force-dynamic";

export default async function AiAssistantPage() {
  const { state, usage, recent } = await getAiPageData();
  const blocked = !state.enabled || !state.authorized || !state.providerConfigured;
  return <div className="space-y-6">
    <header className="relative overflow-hidden rounded-[1.55rem] border border-[#d7e1ef] bg-white px-5 py-6 sm:px-7 sm:py-7"><div className="absolute inset-y-0 right-0 w-[42%] bg-[radial-gradient(circle_at_80%_10%,#dce9ff,transparent_68%)]" /><div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between"><div><div className="flex items-center gap-2 font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-[#2563eb]"><Sparkles className="size-3.5" />Evidence desk</div><h1 className="mt-2 text-3xl font-semibold tracking-[-0.045em] text-[#172033]">AI manager assistant</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-[#667085]">Generate cited summaries and planning signals from your organization’s current tasks and submitted reports—without autonomous actions or employee scoring.</p></div><div className="flex w-fit items-center gap-2 rounded-xl border border-[#d5e2f5] bg-[#f7faff] px-3 py-2 text-xs font-semibold text-[#365b9d]"><ShieldCheck className="size-4" />Read-only · source grounded</div></div></header>
    {blocked ? <section className="rounded-[1.35rem] border border-[#e0e5ec] bg-white p-6 sm:p-8"><div className="grid size-11 place-items-center rounded-xl bg-[#f0f4fa] text-[#536b8f]">{state.authorized ? <BrainCircuit className="size-5" /> : <LockKeyhole className="size-5" />}</div><h2 className="mt-4 text-lg font-semibold text-[#253047]">{!state.enabled ? "AI insights are off" : !state.authorized ? "This role is not authorized" : "Provider configuration is incomplete"}</h2><p className="mt-2 max-w-xl text-sm leading-6 text-[#667085]">{!state.enabled ? "An organization administrator must explicitly enable AI insights. No work data is sent to an AI provider while this setting is off." : !state.authorized ? "Your organization has not included this role in the AI access allowlist." : "OPENAI_API_KEY and OPENAI_MODEL must be configured on the server before the feature can run."}</p>{state.role === "SUPER_ADMIN" ? <Link href="/dashboard/settings?section=ai" className="mt-5 inline-flex h-10 items-center rounded-xl bg-[#172033] px-4 text-sm font-semibold text-white">Review AI settings</Link> : null}</section> : <><div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]"><section className="rounded-[1.2rem] border border-[#dfe5ed] bg-white p-4"><p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#7c8799]">Data boundary</p><p className="mt-2 text-sm leading-6 text-[#667085]">Up to seven days of submitted reports and active tasks are included. Personal identifiers, leave reasons and attendance durations are excluded. Generated records expire after {state.retentionDays} days.</p></section><AiUsageIndicator usage={usage} /></div><AIManagerChat recent={recent} summariesEnabled={state.summariesEnabled} assistantEnabled={state.assistantEnabled} /></>}
  </div>;
}
