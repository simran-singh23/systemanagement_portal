import type { ReactNode } from "react";

export function AIInsightPanel({ eyebrow, children }: { eyebrow: string; children: ReactNode }) {
  return <section className="rounded-[1.2rem] border border-[#dce3ed] bg-white p-4"><p className="font-mono text-[10px] font-semibold uppercase tracking-[0.15em] text-[#3975d5]">{eyebrow}</p>{children}</section>;
}
