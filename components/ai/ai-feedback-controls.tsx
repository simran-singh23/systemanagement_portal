"use client";

import { useState, useTransition } from "react";
import { Check, ThumbsDown, ThumbsUp, TriangleAlert } from "lucide-react";
import { submitAiFeedback } from "@/actions/ai.actions";

const choices = [
  { rating: "HELPFUL" as const, label: "Helpful", Icon: ThumbsUp },
  { rating: "NOT_HELPFUL" as const, label: "Not helpful", Icon: ThumbsDown },
  { rating: "INCORRECT" as const, label: "Incorrect", Icon: TriangleAlert },
];

export function AiFeedbackControls({ generationId }: { generationId: string }) {
  const [selected, setSelected] = useState<string>();
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();
  return <div className="flex flex-wrap items-center gap-2 border-t border-[#edf0f4] pt-4">
    <span className="mr-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#98a2b3]">Was this useful?</span>
    {choices.map(({ rating, label, Icon }) => <button key={rating} type="button" disabled={pending} onClick={() => startTransition(async () => { const result = await submitAiFeedback({ generationId, rating }); setMessage(result.message); if (result.success) setSelected(rating); })} className={`inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-semibold transition ${selected === rating ? "border-[#9dbaf0] bg-[#eef4ff] text-[#1d55c6]" : "border-[#dfe4eb] text-[#667085] hover:bg-[#f8f9fb]"}`}><Icon className="size-3.5" />{label}</button>)}
    {message ? <span role="status" className="inline-flex items-center gap-1 text-xs text-[#667085]">{selected ? <Check className="size-3.5 text-[#16825f]" /> : null}{message}</span> : null}
  </div>;
}
