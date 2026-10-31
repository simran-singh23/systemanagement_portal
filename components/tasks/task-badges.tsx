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
    TODO: "bg-[#f2f4f7] text-[#536071] ring-[#e0e4e9]",
    IN_PROGRESS: "bg-[#eef4ff] text-[#2555a7] ring-[#d5e2fb]",
    BLOCKED: "bg-[#fff1f0] text-[#a43b32] ring-[#f4d0cc]",
    REVIEW: "bg-[#f5f0ff] text-[#6846a5] ring-[#e4d8fb]",
    COMPLETED: "bg-[#ecfdf3] text-[#157357] ring-[#c8ebda]",
    CANCELLED: "bg-[#f2f4f7] text-[#7c8799] ring-[#e0e4e9]",
  };
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ring-inset ${tone[status]}`}>{statusLabels[status]}</span>;
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

export function formatTaskDate(value: Date | string | null) {
  if (!value) return "No deadline";
  return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric" }).format(new Date(value));
}
