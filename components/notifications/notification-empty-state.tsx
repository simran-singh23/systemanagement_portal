import { Icon } from "@/components/ui/icons";

export function NotificationEmptyState({ filtered = false }: { filtered?: boolean }) {
  return <div className="px-6 py-14 text-center"><span className="mx-auto grid size-12 place-items-center rounded-2xl bg-[#eef4ff] text-[#2563eb]"><Icon name="bell" className="size-5" /></span><h3 className="mt-4 font-semibold text-[#253047]">{filtered ? "No matching notifications" : "You’re all caught up"}</h3><p className="mx-auto mt-1 max-w-sm text-sm leading-6 text-[#7c8799]">{filtered ? "Try another category, date, or read status." : "Workflow updates and alerts will appear here."}</p></div>;
}
