"use client";

import type { NotificationType } from "@prisma/client";
import { Icon, type IconName } from "@/components/ui/icons";
import type { NotificationDTO } from "@/lib/notifications";

const visuals: Record<NotificationType, { icon: IconName; style: string }> = {
  TASK_ASSIGNED: { icon: "tasks", style: "bg-[#eef4ff] text-[#2563eb]" },
  TASK_UPDATED: { icon: "tasks", style: "bg-[#eef4ff] text-[#2563eb]" },
  COMMENT_MENTION: { icon: "mail", style: "bg-[#f1edff] text-[#7251c9]" },
  ATTENDANCE: { icon: "clock", style: "bg-[#fff6e5] text-[#a86505]" },
  BREAK: { icon: "coffee", style: "bg-[#fff6e5] text-[#a86505]" },
  REPORT_DUE: { icon: "file", style: "bg-[#f2f4f7] text-[#667085]" },
  REPORT_REVIEWED: { icon: "file", style: "bg-[#eaf8f2] text-[#16855b]" },
  REPORT_SUBMITTED: { icon: "file", style: "bg-[#eaf8f2] text-[#16855b]" },
  LEAVE_REQUESTED: { icon: "calendar", style: "bg-[#f1edff] text-[#7251c9]" },
  LEAVE_UPDATED: { icon: "calendar", style: "bg-[#f1edff] text-[#7251c9]" },
  SYSTEM: { icon: "bell", style: "bg-[#f2f4f7] text-[#667085]" },
};

export function relativeNotificationTime(value: string, now = Date.now()) {
  const seconds = Math.max(0, Math.floor((now - new Date(value).getTime()) / 1000));
  if (seconds < 60) return "Now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return days < 7 ? `${days}d` : new Date(value).toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
}

export function NotificationItem({ notification, compact = false, onActivate }: { notification: NotificationDTO; compact?: boolean; onActivate: (notification: NotificationDTO) => void }) {
  const visual = visuals[notification.type];
  return <button type="button" onClick={() => onActivate(notification)} className={`group relative flex w-full gap-3 text-left outline-none transition focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#80a7f5] ${compact ? "px-4 py-3.5" : "px-5 py-4 sm:px-6"} ${notification.readAt ? "bg-white hover:bg-[#fafbfc]" : "bg-[#f7f9ff] hover:bg-[#f1f5ff]"}`}><span className={`grid shrink-0 place-items-center rounded-xl ${compact ? "size-9" : "size-10"} ${visual.style}`}><Icon name={visual.icon} className="size-[18px]" /></span><span className="min-w-0 flex-1"><span className="flex items-start gap-2"><span className={`block flex-1 text-sm text-[#253047] ${notification.readAt ? "font-medium" : "font-semibold"}`}>{notification.title}</span><span className="shrink-0 text-[11px] font-medium text-[#98a2b3]">{relativeNotificationTime(notification.createdAt)}</span></span>{notification.message ? <span className={`mt-1 block text-xs leading-5 text-[#7c8799] ${compact ? "truncate" : "line-clamp-2"}`}>{notification.message}</span> : null}</span>{notification.readAt ? null : <span aria-label="Unread" className="absolute left-0 top-3 bottom-3 w-[3px] rounded-r-full bg-[#2563eb]" />}</button>;
}
