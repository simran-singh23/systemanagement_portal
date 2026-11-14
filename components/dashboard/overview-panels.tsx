import Link from "next/link";
import { Icon } from "@/components/ui/icons";
import { UserAvatar } from "@/components/ui/user-avatar";
import styles from "./overview.module.css";

type DistributionItem = { id: string; label: string; color: string; count: number; href?: string };

export function TaskDistribution({ items }: { items: DistributionItem[] }) {
  const total = items.reduce((sum, item) => sum + item.count, 0);
  let offset = 0;
  const stops = items.filter((item) => item.count > 0).map((item) => {
    const start = offset;
    offset += item.count / total * 100;
    return `${item.color} ${start}% ${offset}%`;
  });
  return <section className={styles.panel} aria-labelledby="status-title">
    <div className={styles.panelHeading}><div><h2 id="status-title">Task distribution</h2><p className={styles.description}>Active work by team</p></div></div>
    <div className={styles.statusBody}>
      <div className={styles.ring} role="img" aria-label={`${total} active tasks. ${items.map((item) => `${item.label}: ${item.count}`).join(", ")}`} style={{ background: total ? `conic-gradient(${stops.join(", ")})` : "var(--surface-subtle)" }}><div className={styles.ringCenter}><strong>{total}</strong><span>Active tasks</span></div></div>
      <div className={styles.statusLegend}>{items.map((item) => { const content = <><span className={styles.legendDot} style={{ background: item.color }} /><span>{item.label}</span><strong>{item.count} <small>({Math.round(item.count / total * 100)}%)</small></strong></>; return item.href ? <Link key={item.id} href={item.href}>{content}</Link> : <div key={item.id}>{content}</div>; })}</div>
    </div>
    {!total && <p className={styles.panelNote}>Create your first task to start tracking team workload.</p>}
  </section>;
}

type RecentTask = { id: string; title: string; status: string; updatedAt: Date; assignedTo: { name: string | null; email: string; image: string | null } | null; team: { name: string } | null };
const statusLabels: Record<string, string> = { TODO: "To do", IN_PROGRESS: "In progress", BLOCKED: "Blocked", REVIEW: "In review", COMPLETED: "Completed", CANCELLED: "Cancelled" };

export function TeamActivity({ items, timezone }: { items: RecentTask[]; timezone: string }) {
  return <section className={styles.panel} aria-labelledby="activity-title">
    <div className={styles.panelHeading}><div><h2 id="activity-title">Recent activity</h2><p className={styles.description}>Latest updates across your team</p></div><Link href="/dashboard/tasks" className={styles.panelLink}>All tasks <Icon name="arrowRight" className="size-3.5" /></Link></div>
    {items.length ? <ul className={styles.activity}>{items.map((task) => <li className={styles.activityItem} key={task.id}>
      {task.assignedTo ? <UserAvatar {...task.assignedTo} size="sm" /> : <span className={styles.metricIcon}><Icon name="tasks" className="size-4" /></span>}
      <div className={styles.activityContent}><Link className={styles.activityTitle} href={`/dashboard/tasks?task=${task.id}`}>{task.title}</Link><p className={styles.activityMeta}>{statusLabels[task.status] ?? task.status} · {task.assignedTo ? `Assigned to ${task.assignedTo.name || task.assignedTo.email}` : "Unassigned"}{task.team ? ` · ${task.team.name}` : ""}</p><time className={styles.activityTime} dateTime={task.updatedAt.toISOString()}>Updated {task.updatedAt.toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: timezone })} at {task.updatedAt.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", timeZone: timezone })}</time></div>
    </li>)}</ul> : <div className={styles.empty}>No team activity yet<p>Task updates will appear here as work gets moving.</p></div>}
  </section>;
}
