"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { markAllNotificationsAsRead } from "@/actions/notification.actions";

export function MarkAllReadButton({ unreadCount }: { unreadCount: number }) {
  const [count, setCount] = useState(unreadCount);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  if (!count) return <span className="text-xs font-medium text-[#98a2b3]">Everything is read</span>;
  return <button type="button" disabled={pending} onClick={() => startTransition(async () => { const result = await markAllNotificationsAsRead(); if (result.success) { setCount(0); router.refresh(); } })} className="h-10 rounded-xl border border-[#cbd9f2] bg-white px-4 text-sm font-semibold text-[#2555a7] hover:bg-[#f8faff] disabled:opacity-50">{pending ? "Updating…" : "Mark all as read"}</button>;
}
