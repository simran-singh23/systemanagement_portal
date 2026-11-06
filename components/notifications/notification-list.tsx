"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { markNotificationAsRead } from "@/actions/notification.actions";
import { NotificationEmptyState } from "@/components/notifications/notification-empty-state";
import { NotificationItem } from "@/components/notifications/notification-item";
import type { NotificationDTO } from "@/lib/notifications";

export function NotificationList({ initialNotifications, filtered = false }: { initialNotifications: NotificationDTO[]; filtered?: boolean }) {
  const [, startTransition] = useTransition();
  const router = useRouter();
  if (!initialNotifications.length) return <NotificationEmptyState filtered={filtered} />;
  const activate = (notification: NotificationDTO) => {
    startTransition(async () => { if (!notification.readAt) await markNotificationAsRead(notification.id); router.push(notification.destination); router.refresh(); });
  };
  return <div className="divide-y divide-[#edf0f4]">{initialNotifications.map((notification) => <NotificationItem key={notification.id} notification={notification} onActivate={activate} />)}</div>;
}
