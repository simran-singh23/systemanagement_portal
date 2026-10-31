import Link from "next/link";
import type { AiSource } from "@/lib/ai/schemas";

export function AIResponseSources({ sourceIds, sources }: { sourceIds: string[]; sources: AiSource[] }) {
  const byId = new Map(sources.map((source) => [source.id, source]));
  return <div className="mt-3 flex flex-wrap gap-2">{sourceIds.flatMap((id) => { const source = byId.get(id); return source ? [<Link key={id} href={source.href} className="rounded-lg border border-[#dce6f7] bg-[#f7faff] px-2.5 py-1.5 text-xs font-medium text-[#3567b7] hover:border-[#abc2eb]">{source.label}</Link>] : []; })}</div>;
}
