import type { TaskPriority, TaskStatus } from "@prisma/client";

export const statusLabels: Record<TaskStatus, string> = {
  TODO: "To do",
  IN_PROGRESS: "In progress",
  BLOCKED: "Blocked",
  REVIEW: "In review",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
};

export const priorityLabels: Record<TaskPriority, string> = {
  LOW: "Low",
  MEDIUM: "Medium",
  HIGH: "High",
  URGENT: "Urgent",
};

export function StatusBadge({ status }: { status: TaskStatus }) {
  const tone: Record<TaskStatus, string> = {
    TODO: "bg-[var(--surface-subtle)] text-[var(--muted)]",
    IN_PROGRESS: "bg-[var(--amber-soft)] text-[var(--amber)]",
    BLOCKED: "bg-[var(--danger-soft)] text-[var(--danger)]",
    REVIEW: "bg-[var(--blue-soft)] text-[var(--blue)]",
    COMPLETED: "bg-[var(--green-soft)] text-[var(--green)]",
    CANCELLED: "bg-[var(--surface-subtle)] text-[var(--muted)]",
  };
  return <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-semibold ${tone[status]}`}><span aria-hidden="true" className="size-1.5 rounded-full bg-current" />{statusLabels[status]}</span>;
}

export function PriorityBadge({ priority }: { priority: TaskPriority }) {
  const tone: Record<TaskPriority, string> = {
    LOW: "text-[#667085] bg-[#f5f7fa]",
    MEDIUM: "text-[#2563eb] bg-[#eef4ff]",
    HIGH: "text-[#b66b18] bg-[#fff7e8]",
    URGENT: "text-[#b42318] bg-[#fff0ef]",
  };
  return <span className={`inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-[11px] font-semibold ${tone[priority]}`}><span className={`size-1.5 rounded-full ${priority === "URGENT" ? "bg-[#d92d20]" : priority === "HIGH" ? "bg-[#e59a2f]" : priority === "MEDIUM" ? "bg-[#5283e8]" : "bg-[#98a2b3]"}`} />{priorityLabels[priority]}</span>;
}

export function isOverdue(dueAt: Date | string | null, status: TaskStatus) {
  return Boolean(dueAt && status !== "COMPLETED" && status !== "CANCELLED" && new Date(dueAt) < new Date());
}

export function formatTaskDate(value: Date | string | null, timeZone = "Asia/Kolkata") {
  if (!value) return "No deadline";
  return new Intl.DateTimeFormat("en-IN", { timeZone, day: "numeric", month: "short", year: "numeric" }).format(new Date(value));
}
