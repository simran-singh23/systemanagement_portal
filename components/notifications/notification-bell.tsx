"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { markAllNotificationsAsRead, markNotificationAsRead } from "@/actions/notification.actions";
import { NotificationEmptyState } from "@/components/notifications/notification-empty-state";
import { NotificationItem } from "@/components/notifications/notification-item";
import { UnreadCountBadge } from "@/components/notifications/unread-count-badge";
import { Icon } from "@/components/ui/icons";
import type { NotificationDTO } from "@/lib/notifications";

type Preview = { notifications: NotificationDTO[]; unreadCount: number };
const POLL_INTERVAL_MS = 30_000;

export function NotificationBell({ initialPreview }: { initialPreview: Preview }) {
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState(initialPreview);
  const [, startTransition] = useTransition();
  const menuRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const refreshPreview = useCallback(async (signal?: AbortSignal) => {
    if (document.visibilityState !== "visible") return;
    const response = await fetch("/api/notifications/summary", { cache: "no-store", signal });
    if (response.ok) setPreview(await response.json() as Preview);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const interval = window.setInterval(() => { void refreshPreview(controller.signal); }, POLL_INTERVAL_MS);
    const onFocus = () => { void refreshPreview(controller.signal); };
    const onVisibility = () => { if (document.visibilityState === "visible") void refreshPreview(controller.signal); };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    return () => { controller.abort(); window.clearInterval(interval); window.removeEventListener("focus", onFocus); document.removeEventListener("visibilitychange", onVisibility); };
  }, [refreshPreview]);

  useEffect(() => {
    const closeOnOutside = (event: MouseEvent) => { if (!menuRef.current?.contains(event.target as Node)) setOpen(false); };
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", closeOnOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => { document.removeEventListener("mousedown", closeOnOutside); document.removeEventListener("keydown", closeOnEscape); };
  }, []);

  const markAll = () => startTransition(async () => { const result = await markAllNotificationsAsRead(); if (result.success) setPreview((current) => ({ unreadCount: 0, notifications: current.notifications.map((item) => ({ ...item, readAt: item.readAt ?? new Date().toISOString() })) })); });
  const activate = (notification: NotificationDTO) => {
    if (!notification.readAt) setPreview((current) => ({ unreadCount: Math.max(0, current.unreadCount - 1), notifications: current.notifications.map((item) => item.id === notification.id ? { ...item, readAt: new Date().toISOString() } : item) }));
    setOpen(false);
    startTransition(async () => { if (!notification.readAt) await markNotificationAsRead(notification.id); router.push(notification.destination); router.refresh(); });
  };

  return <div className="relative" ref={menuRef}><button type="button" aria-label={`Notifications${preview.unreadCount ? `, ${preview.unreadCount} unread` : ""}`} aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen((value) => !value)} className="relative grid size-10 place-items-center rounded-xl border border-[#e6eaf0] bg-white text-[#475467] transition hover:border-[#cdd8eb] hover:bg-[#f8faff] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#80a7f5]"><Icon name="bell" className="size-[19px]" />{preview.unreadCount ? <span className="absolute -right-1.5 -top-1.5"><UnreadCountBadge count={preview.unreadCount} /></span> : null}</button>{open ? <div role="dialog" aria-label="Latest notifications" className="absolute right-0 top-12 z-50 w-[min(24rem,calc(100vw-1.5rem))] overflow-hidden rounded-2xl border border-[#dfe4eb] bg-white shadow-[0_22px_60px_rgba(29,41,57,0.18)]"><div className="flex items-center justify-between border-b border-[#edf0f4] px-4 py-3.5"><div><p className="text-sm font-semibold text-[#172033]">Notifications</p><p className="mt-0.5 text-xs text-[#7c8799]">{preview.unreadCount ? `${preview.unreadCount} need${preview.unreadCount === 1 ? "s" : ""} your attention` : "No unread updates"}</p></div>{preview.unreadCount ? <button type="button" onClick={markAll} className="text-xs font-semibold text-[#2563eb] hover:text-[#1d4ed8]">Mark all read</button> : null}</div>{preview.notifications.length ? <div className="max-h-[26rem] divide-y divide-[#edf0f4] overflow-y-auto">{preview.notifications.map((notification) => <NotificationItem key={notification.id} notification={notification} compact onActivate={activate} />)}</div> : <NotificationEmptyState />}<Link href="/notifications" onClick={() => setOpen(false)} className="block border-t border-[#edf0f4] px-4 py-3 text-center text-sm font-semibold text-[#2563eb] transition hover:bg-[#f8faff]">View all notifications</Link></div> : null}</div>;
}
