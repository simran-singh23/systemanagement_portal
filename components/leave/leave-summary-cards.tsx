import { Icon, type IconName } from "@/components/ui/icons";

export function LeaveSummaryCards({ items }: { items: { label: string; value: number; detail: string; icon: IconName; tone?: "blue" | "green" | "amber" | "red" | "slate" }[] }) {
  const tones = { blue: "bg-[#eef4ff] text-[#2563eb]", green: "bg-[#eaf8f2] text-[#16855b]", amber: "bg-[#fff6e5] text-[#b16a00]", red: "bg-[#fff1f1] text-[#b33b3b]", slate: "bg-[#f2f4f7] text-[#667085]" };
  return <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">{items.map((item) => <article key={item.label} className="rounded-2xl border border-[#e6eaf0] bg-white p-5"><div className="flex items-start justify-between"><span className={`grid size-10 place-items-center rounded-xl ${tones[item.tone ?? "blue"]}`}><Icon name={item.icon} className="size-5" /></span><span className="text-right text-[11px] text-[#98a2b3]">{item.detail}</span></div><p className="mt-4 text-xs text-[#667085]">{item.label}</p><p className="mt-1 font-mono text-2xl font-semibold text-[#172033]">{item.value}</p></article>)}</section>;
}
