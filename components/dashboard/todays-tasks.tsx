import { Icon } from "@/components/ui/icons";
import Link from "next/link";
import { EmptyState } from "@/components/ui/empty-state";

export type TaskItem = {
  title: string;
  project: string;
  time: string;
  priority: "High" | "Medium" | "Low";
  done?: boolean;
};

type TodaysTasksProps = { items: TaskItem[]; title?: string; href?: string };

const priorityStyles = {
  High: "bg-[#fff0ee] text-[#c24136]",
  Medium: "bg-[#fff6e5] text-[#a86708]",
  Low: "bg-[#eef4ff] text-[#2563eb]",
};

export function TodaysTasks({ items, title = "Today’s tasks", href = "/dashboard/tasks" }: TodaysTasksProps) {
  const completeCount = items.filter((item) => item.done).length;
  const completion = items.length ? Math.round((completeCount / items.length) * 100) : 0;

  return (
    <section className="overflow-hidden rounded-2xl border border-[#e6eaf0] bg-white">
      <div className="border-b border-[#eef1f5] px-5 py-4 sm:px-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold tracking-[-0.02em] text-[#172033]">{title}</h2>
            <p className="mt-1 text-xs text-[#7c8799]">{completeCount} of {items.length} complete</p>
          </div>
          <span className="font-mono text-sm font-semibold text-[#2563eb]">{completion}%</span>
        </div>
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[#edf1f6]"><div className="h-full rounded-full bg-[#2563eb]" style={{ width: `${completion}%` }} /></div>
      </div>
      {items.length ? <div className="divide-y divide-[#f0f2f6] px-5 sm:px-6">
        {items.map((task) => (
          <div key={task.title} className="group flex items-start gap-3 py-4">
            <span aria-label={task.done ? "Completed" : "Not completed"} className={`mt-0.5 grid size-5 shrink-0 place-items-center rounded-md border ${task.done ? "border-[#2563eb] bg-[#2563eb] text-white" : "border-[#cfd6e2] bg-white text-transparent"}`}>
              <Icon name="check" className="size-3" />
            </span>
            <div className="min-w-0 flex-1">
              <p className={`text-sm font-medium ${task.done ? "text-[#98a2b3] line-through" : "text-[#344054]"}`}>{task.title}</p>
              <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px] text-[#98a2b3]">
                <span>{task.project}</span><span className="size-1 rounded-full bg-[#d0d5dd]" /><span className="flex items-center gap-1"><Icon name="clock" className="size-3" />{task.time}</span>
              </div>
            </div>
            <span className={`rounded-full px-2 py-1 font-mono text-[10px] font-semibold ${priorityStyles[task.priority]}`}>{task.priority}</span>
          </div>
        ))}
      </div> : <EmptyState title="No tasks due today" description="New assignments and deadlines will appear here." icon="tasks" />}
      <Link href={href} className="flex min-h-11 w-full items-center justify-center gap-1.5 border-t border-[#eef1f5] px-5 py-3 text-xs font-semibold text-[#2563eb] transition hover:bg-[#f8faff]">
        Open task board <Icon name="arrowRight" className="size-3.5" />
      </Link>
    </section>
  );
}
