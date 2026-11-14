"use client";

import { useState } from "react";
import Link from "next/link";
import type { TaskStatus } from "@prisma/client";
import { Icon } from "@/components/ui/icons";
import { StatusBadge } from "@/components/tasks/task-badges";
import styles from "./overview.module.css";

export type PriorityTask = { id: string; title: string; status: TaskStatus; team: string; assignee: string; deadline: string; overdue: boolean };
const filters = [{ value: "ALL", label: "All" }, { value: "IN_PROGRESS", label: "In progress" }, { value: "REVIEW", label: "Review" }, { value: "COMPLETED", label: "Done" }] as const;

export function PriorityTasks({ items }: { items: PriorityTask[] }) {
  const [filter, setFilter] = useState<string>("ALL");
  const visible = items.filter((item) => filter === "ALL" || item.status === filter);

  return <section className={styles.panel} aria-labelledby="priority-title">
    <div className={styles.panelHeading}><div><h2 id="priority-title">Priority tasks</h2><p className={styles.description}>Track assignments, deadlines, and reviews</p></div></div>
    <div className={`${styles.range} ${styles.taskFilters}`} role="group" aria-label="Filter priority tasks">
      {filters.map((item) => <button type="button" key={item.value} aria-pressed={filter === item.value} onClick={() => setFilter(item.value)}>{item.label} <span>({item.value === "ALL" ? items.length : items.filter((task) => task.status === item.value).length})</span></button>)}
    </div>
    <div className={styles.priorityList} aria-live="polite">
      {visible.length ? visible.map((task) => <article key={task.id} className={styles.priorityRow}>
        <Link className={styles.taskState} href={`/dashboard/tasks?task=${task.id}`} aria-label={`Open ${task.title}`}><Icon name={task.status === "COMPLETED" ? "check" : "arrowRight"} className="size-4" /></Link>
        <div className={styles.priorityContent}><Link className={styles.activityTitle} href={`/dashboard/tasks?task=${task.id}`}>{task.title}</Link><p className={styles.activityMeta}>{task.team} <span aria-hidden="true">·</span> <span className={task.overdue ? styles.overdue : undefined}>{task.deadline}</span></p></div>
        <span className={styles.assignee}>{task.assignee}</span><StatusBadge status={task.status} />
      </article>) : <div className={styles.empty}><Icon name="tasks" className="mx-auto size-7" /><strong>No {filter === "ALL" ? "priority" : filters.find((item) => item.value === filter)?.label.toLowerCase()} tasks</strong><p>Tasks matching this view will appear here.</p></div>}
    </div>
    <div className={styles.listFooter}><span>{visible.length} of {items.length} priority tasks shown</span><Link href="/dashboard/tasks">View all tasks <Icon name="arrowRight" className="size-3.5" /></Link></div>
  </section>;
}
