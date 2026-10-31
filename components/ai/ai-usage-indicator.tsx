function Meter({ label, value, limit }: { label: string; value: number; limit: number }) {
  const percentage = Math.min(100, Math.round((value / Math.max(limit, 1)) * 100));
  return <div><div className="mb-1.5 flex items-center justify-between text-xs"><span className="font-medium text-[#667085]">{label}</span><span className="font-mono text-[#7c8799]">{value.toLocaleString()} / {limit.toLocaleString()}</span></div><div className="h-1.5 overflow-hidden rounded-full bg-[#e9edf3]"><div className={`h-full rounded-full ${percentage >= 90 ? "bg-[#d97706]" : "bg-[#3975d5]"}`} style={{ width: `${percentage}%` }} /></div></div>;
}

export function AiUsageIndicator({ usage }: { usage: { requests: number; tokens: number; requestLimit: number; tokenLimit: number } }) {
  return <section className="rounded-[1.2rem] border border-[#dfe5ed] bg-white p-4"><p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#7c8799]">Monthly usage guardrails</p><div className="mt-4 space-y-4"><Meter label="Requests" value={usage.requests} limit={usage.requestLimit} /><Meter label="Tokens" value={usage.tokens} limit={usage.tokenLimit} /></div></section>;
}
