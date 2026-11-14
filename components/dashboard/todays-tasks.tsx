import { Icon } from "@/components/ui/icons";
import Link from "next/link";
import { EmptyState } from "@/components/ui/empty-state";

export type TaskItem = {
  id?: string;
  title: string;
  project: string;
  time: string;
  priority: "High" | "Medium" | "Low";
  done?: boolean;
};

type TodaysTasksProps = { items: TaskItem[]; title?: string; href?: string };

const priorityStyles = {
  High: "bg-[var(--danger-soft)] text-[var(--danger)]",
  Medium: "bg-[var(--amber-soft)] text-[var(--amber)]",
  Low: "bg-[var(--blue-soft)] text-[var(--blue)]",
};

export function TodaysTasks({ items, title = "Today’s tasks", href = "/dashboard/tasks" }: TodaysTasksProps) {
  const completeCount = items.filter((item) => item.done).length;
  const completion = items.length ? Math.round((completeCount / items.length) * 100) : 0;

  return (
    <section className="overflow-hidden rounded-[.875rem] border border-[var(--line)] bg-[var(--surface)]">
      <div className="border-b border-[var(--line)] px-5 py-4 sm:px-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold tracking-[-0.02em] text-[var(--ink)]">{title}</h2>
            <p className="mt-1 text-xs text-[var(--muted)]">{completeCount} of {items.length} complete</p>
          </div>
          {items.length > 0 && <span className="font-mono text-sm font-semibold text-[var(--blue)]">{completion}%</span>}
        </div>
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[var(--surface-subtle)]"><div className="h-full rounded-full bg-[var(--blue)]" style={{ width: `${completion}%` }} /></div>
      </div>
      {items.length ? <div className="divide-y divide-[var(--line)] px-5 sm:px-6">
        {items.map((task) => (
          <div key={task.id ?? task.title} className="group flex items-start gap-3 py-4">
            <span aria-label={task.done ? "Completed" : "Not completed"} className={`mt-0.5 grid size-5 shrink-0 place-items-center rounded-md border ${task.done ? "border-[var(--blue)] bg-[var(--blue)] text-white" : "border-[var(--line)] bg-[var(--surface)] text-transparent"}`}>
              <Icon name="check" className="size-3" />
            </span>
            <div className="min-w-0 flex-1">
              <p className={`text-sm font-medium ${task.done ? "text-[var(--muted-2)] line-through" : "text-[var(--ink)]"}`}>{task.id ? <Link href={`${href}?task=${task.id}`} className="hover:text-[var(--blue)]">{task.title}</Link> : task.title}</p>
              <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px] text-[var(--muted-2)]">
                <span>{task.project}</span><span className="size-1 rounded-full bg-[var(--line)]" /><span className="flex items-center gap-1"><Icon name="clock" className="size-3" />{task.time}</span>
              </div>
            </div>
            <span className={`rounded-full px-2 py-1 font-mono text-[10px] font-semibold ${priorityStyles[task.priority]}`}>{task.priority}</span>
          </div>
        ))}
      </div> : <EmptyState title="No tasks due today" description="New assignments and deadlines will appear here." icon="tasks" />}
      <Link href={href} className="flex min-h-11 w-full items-center justify-center gap-1.5 border-t border-[var(--line)] px-5 py-3 text-xs font-semibold text-[var(--blue)] transition hover:bg-[var(--surface-subtle)]">
        View all tasks <Icon name="arrowRight" className="size-3.5" />
      </Link>
    </section>
  );
}
