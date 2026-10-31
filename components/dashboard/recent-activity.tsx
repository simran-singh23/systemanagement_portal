import { Icon, type IconName } from "@/components/ui/icons";
import Link from "next/link";
import { EmptyState } from "@/components/ui/empty-state";

export type ActivityItem = {
  person: string;
  initials: string;
  action: string;
  subject: string;
  time: string;
  icon: IconName;
  tint?: "blue" | "green" | "amber" | "violet";
};

type RecentActivityProps = { items: ActivityItem[] };

const tints = {
  blue: "bg-[#eef4ff] text-[#2563eb]",
  green: "bg-[#eaf8f2] text-[#16855b]",
  amber: "bg-[#fff6e5] text-[#b16a00]",
  violet: "bg-[#f3efff] text-[#7251c9]",
};

export function RecentActivity({ items }: RecentActivityProps) {
  return (
    <section className="overflow-hidden rounded-2xl border border-[#e6eaf0] bg-white">
      <div className="flex items-center justify-between border-b border-[#eef1f5] px-5 py-4 sm:px-6">
        <div>
          <h2 className="text-base font-semibold tracking-[-0.02em] text-[#172033]">Recent activity</h2>
          <p className="mt-1 text-xs text-[#7c8799]">What moved across your workspace</p>
        </div>
        <Link href="/notifications" className="rounded-lg px-2 py-1 text-xs font-semibold text-[#2563eb] hover:bg-[#eef4ff] hover:text-[#1d4ed8]">View all</Link>
      </div>
      {items.length ? <div className="px-5 sm:px-6">
        {items.map((item, index) => (
          <div key={`${item.person}-${item.time}`} className="relative flex gap-3.5 border-b border-[#f0f2f6] py-4 last:border-0">
            {index < items.length - 1 && <span className="absolute left-[17px] top-10 h-[calc(100%-1rem)] w-px bg-[#e9edf3]" />}
            <span className="relative z-10 grid size-9 shrink-0 place-items-center rounded-xl bg-[#edf2f9] text-[11px] font-bold text-[#40516f]">{item.initials}</span>
            <div className="min-w-0 flex-1">
              <p className="text-sm leading-5 text-[#667085]"><span className="font-semibold text-[#253047]">{item.person}</span> {item.action} <span className="font-medium text-[#344054]">{item.subject}</span></p>
              <p className="mt-1 text-[11px] text-[#98a2b3]">{item.time}</p>
            </div>
            <span className={`grid size-8 shrink-0 place-items-center rounded-lg ${tints[item.tint ?? "blue"]}`}><Icon name={item.icon} className="size-4" /></span>
          </div>
        ))}
      </div> : <EmptyState title="No recent activity" description="Workspace updates will appear as your team works." icon="clock" />}
    </section>
  );
}
