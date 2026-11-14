import { Icon, type IconName } from "@/components/ui/icons";

type StatCardProps = {
  label: string;
  value: string;
  detail: string;
  trend?: { value: string; direction: "up" | "down"; positive?: boolean };
  icon: IconName;
  accent?: "blue" | "green" | "amber" | "violet";
};

const accents = {
  blue: { icon: "bg-white/80 text-[#315f8a]", edge: "bg-[#315f8a]", surface: "bg-[#edf4fc]" },
  green: { icon: "bg-white/80 text-[#367455]", edge: "bg-[#367455]", surface: "bg-[#edf6ef]" },
  amber: { icon: "bg-white/80 text-[#9a641d]", edge: "bg-[#c08b3c]", surface: "bg-[#faf4e8]" },
  violet: { icon: "bg-white/80 text-[#655e79]", edge: "bg-[#8175a3]", surface: "bg-[#f2eff7]" },
};

export function StatCard({ label, value, detail, trend, icon, accent = "blue" }: StatCardProps) {
  const trendPositive = trend?.positive ?? trend?.direction === "up";

  return (
    <article className={`relative overflow-hidden rounded-xl border border-[var(--line)] p-4 sm:p-5 ${accents[accent].surface}`}>
      <span aria-hidden="true" className={`absolute inset-x-0 top-0 h-0.5 ${accents[accent].edge}`} />
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-[var(--muted)]">{label}</p>
        <span className={`grid size-9 shrink-0 place-items-center rounded-lg ${accents[accent].icon}`}><Icon name={icon} className="size-[18px]" /></span>
        {trend && (
          <span className={`flex items-center gap-1 rounded-full px-2 py-1 font-mono text-[11px] font-semibold ${trendPositive ? "bg-[var(--green-soft)] text-[var(--green)]" : "bg-[var(--danger-soft)] text-[var(--danger)]"}`}>
            <Icon name={trend.direction === "up" ? "arrowUp" : "arrowDown"} className="size-3" /> {trend.value}
          </span>
        )}
      </div>
      <div className="mt-3 flex items-end justify-between gap-3">
        <p className="font-mono text-3xl font-semibold tracking-[-0.05em] tabular-nums text-[var(--ink)]">{value}</p>
        <p className="pb-1 text-right text-xs text-[var(--muted-2)]">{detail}</p>
      </div>
    </article>
  );
}
