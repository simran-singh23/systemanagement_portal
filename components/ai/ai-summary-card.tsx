import { Sparkles } from "lucide-react";
import type { AiGenerationView } from "@/lib/ai/ai-service";
import { AIBlockerList } from "./ai-blocker-list";
import { AiFeedbackControls } from "./ai-feedback-controls";

const intentLabels = { DAILY_SUMMARY: "Daily summary", BLOCKERS: "Blocker insight", WORKLOAD: "Workload insight", ASSISTANT: "Assistant answer" } as const;
export function AiSummaryCard({ generation }: { generation: AiGenerationView }) {
  return <article className="overflow-hidden rounded-[1.35rem] border border-[#dce3ed] bg-white shadow-[0_12px_34px_rgba(24,39,75,0.05)]">
    <div className="border-b border-[#edf0f4] bg-[linear-gradient(120deg,#f8fbff_0%,#fff_62%)] px-5 py-5 sm:px-6"><div className="flex flex-wrap items-center gap-2"><span className="inline-flex items-center gap-1.5 rounded-full border border-[#cfe0fa] bg-white px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#3567b7]"><Sparkles className="size-3" />AI-generated</span><span className="text-xs font-semibold text-[#7c8799]">{intentLabels[generation.type]}</span>{generation.cached ? <span className="text-xs text-[#98a2b3]">· cached</span> : null}</div><h2 className="mt-3 text-xl font-semibold tracking-[-0.025em] text-[#172033]">{generation.output.headline}</h2><p className="mt-2 text-sm leading-6 text-[#667085]">{generation.output.summary}</p></div>
    <div className="space-y-3 px-5 py-5 sm:px-6"><AIBlockerList insights={generation.output.insights} sources={generation.sources} />
      {generation.output.followUps.length ? <div className="rounded-xl bg-[#f8f9fb] p-4"><p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#7c8799]">Questions worth asking next</p><ul className="mt-2 space-y-1.5 text-sm text-[#667085]">{generation.output.followUps.map((item) => <li key={item}>• {item}</li>)}</ul></div> : null}
      <p className="text-[11px] leading-5 text-[#98a2b3]">Generated from the linked TeamFlow records. Verify evidence and use human judgment before making decisions. {generation.totalTokens.toLocaleString()} tokens recorded.</p>
      <AiFeedbackControls generationId={generation.id} />
    </div>
  </article>;
}
