import { AlertTriangle, BookOpen, Lightbulb } from "lucide-react";
import type { AiResponse, AiSource } from "@/lib/ai/schemas";
import { AIResponseSources } from "./ai-response-sources";

const kindStyle = {
  FACT: { label: "Observed", Icon: BookOpen, className: "bg-[#eef4ff] text-[#2555a7]" },
  SUGGESTION: { label: "Suggestion", Icon: Lightbulb, className: "bg-[#fff7e8] text-[#97611b]" },
  MISSING_INFORMATION: { label: "Missing information", Icon: AlertTriangle, className: "bg-[#f7f3ff] text-[#7155a7]" },
} as const;

export function AIBlockerList({ insights, sources }: { insights: AiResponse["insights"]; sources: AiSource[] }) {
  return <div className="space-y-3">{insights.map((insight, index) => { const style = kindStyle[insight.kind]; return <section key={`${insight.title}-${index}`} className="rounded-xl border border-[#e5e9ef] p-4"><div className="flex flex-wrap items-center gap-2"><span className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] ${style.className}`}><style.Icon className="size-3" />{style.label}</span><h3 className="text-sm font-semibold text-[#344054]">{insight.title}</h3></div><p className="mt-2 text-sm leading-6 text-[#667085]">{insight.detail}</p>{insight.sourceIds.length ? <AIResponseSources sourceIds={insight.sourceIds} sources={sources} /> : null}</section>; })}</div>;
}
