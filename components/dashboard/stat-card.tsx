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
  blue: "bg-[#eef4ff] text-[#2563eb]",
  green: "bg-[#eaf8f2] text-[#16855b]",
  amber: "bg-[#fff6e5] text-[#b16a00]",
  violet: "bg-[#f3efff] text-[#7251c9]",
};

export function StatCard({ label, value, detail, trend, icon, accent = "blue" }: StatCardProps) {
  const trendPositive = trend?.positive ?? trend?.direction === "up";

  return (
    <article className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5 shadow-[0_1px_2px_rgba(16,24,40,0.025)]">
      <div className="flex items-start justify-between">
        <span className={`grid size-10 place-items-center rounded-xl ${accents[accent]}`}><Icon name={icon} className="size-5" /></span>
        {trend && (
          <span className={`flex items-center gap-1 rounded-full px-2 py-1 font-mono text-[11px] font-semibold ${trendPositive ? "bg-[#ecfdf3] text-[#16855b]" : "bg-[#fff1f0] text-[#c33b32]"}`}>
            <Icon name={trend.direction === "up" ? "arrowUp" : "arrowDown"} className="size-3" /> {trend.value}
          </span>
        )}
      </div>
      <p className="mt-5 text-[13px] font-medium text-[var(--muted)]">{label}</p>
      <div className="mt-1 flex items-end justify-between gap-3">
        <p className="font-mono text-[1.8rem] font-semibold tracking-[-0.05em] text-[var(--ink)]">{value}</p>
        <p className="pb-1 text-right text-[11px] text-[var(--muted-2)]">{detail}</p>
      </div>
    </article>
  );
}
