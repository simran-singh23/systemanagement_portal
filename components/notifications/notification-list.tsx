"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { markNotificationAsRead } from "@/actions/notification.actions";
import { NotificationEmptyState } from "@/components/notifications/notification-empty-state";
import { NotificationItem } from "@/components/notifications/notification-item";
import type { NotificationDTO } from "@/lib/notifications";

export function NotificationList({ initialNotifications, filtered = false }: { initialNotifications: NotificationDTO[]; filtered?: boolean }) {
  const [notifications, setNotifications] = useState(initialNotifications);
  const [, startTransition] = useTransition();
  const router = useRouter();
  if (!notifications.length) return <NotificationEmptyState filtered={filtered} />;
  const activate = (notification: NotificationDTO) => {
    if (!notification.readAt) setNotifications((items) => items.map((item) => item.id === notification.id ? { ...item, readAt: new Date().toISOString() } : item));
    startTransition(async () => { if (!notification.readAt) await markNotificationAsRead(notification.id); router.push(notification.destination); router.refresh(); });
  };
  return <div className="divide-y divide-[#edf0f4]">{notifications.map((notification) => <NotificationItem key={notification.id} notification={notification} onActivate={activate} />)}</div>;
}
