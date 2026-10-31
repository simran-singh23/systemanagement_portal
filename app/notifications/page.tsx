import type { Metadata } from "next";
import Link from "next/link";
import { getMyNotifications } from "@/actions/notification.actions";
import { MarkAllReadButton } from "@/components/notifications/mark-all-read-button";
import { NotificationFilters } from "@/components/notifications/notification-filters";
import { NotificationList } from "@/components/notifications/notification-list";
import { requireUser } from "@/lib/dal/auth";

export const metadata: Metadata = { title: "Notifications" };
export const dynamic = "force-dynamic";
type Search = { q?: string; category?: string; type?: string; read?: string; date?: string; page?: string };
const categories = new Set(["TASK", "ATTENDANCE", "LEAVE", "REPORT", "SYSTEM"]);
const readStates = new Set(["UNREAD", "READ"]);

export default async function NotificationsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const [user, raw] = await Promise.all([requireUser(), searchParams]);
  const filters = { q: raw.q, category: categories.has(raw.category ?? "") ? raw.category as "TASK" | "ATTENDANCE" | "LEAVE" | "REPORT" | "SYSTEM" : undefined, type: raw.type, read: readStates.has(raw.read ?? "") ? raw.read as "UNREAD" | "READ" : undefined, date: raw.date, page: Math.max(1, Number(raw.page) || 1) };
  const result = await getMyNotifications(filters);
  const hasFilters = Boolean(filters.q || filters.category || filters.type || filters.read || filters.date);
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) if (value && key !== "page") params.set(key, String(value));
  const pageHref = (page: number) => { const next = new URLSearchParams(params); next.set("page", String(page)); return `?${next}`; };
  return <div className="space-y-6"><section className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><h1 className="text-3xl font-semibold tracking-[-0.045em] text-[#172033]">Notifications</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-[#667085]">A chronological inbox for task, attendance, report and leave updates that need your attention.</p></div><MarkAllReadButton unreadCount={result.unread} /></section><section className="overflow-hidden rounded-2xl border border-[#dce4ef] bg-white"><div className="flex items-center justify-between gap-4 border-b border-[#edf0f4] px-5 py-4 sm:px-6"><div><h2 className="font-semibold text-[#253047]">{hasFilters ? "Filtered inbox" : "All notifications"}</h2><p className="mt-1 text-xs text-[#98a2b3]">{result.total} result{result.total === 1 ? "" : "s"} for {user.name || user.email}</p></div><div className="text-right"><p className="font-mono text-xl font-semibold text-[#172033]">{result.unread}</p><p className="text-[10px] text-[#98a2b3]">Unread</p></div></div><NotificationFilters filters={filters} unreadCount={result.unread} /><NotificationList initialNotifications={result.notifications} filtered={hasFilters} /><div className="flex items-center justify-between border-t border-[#edf0f4] px-5 py-3 text-xs text-[#7c8799]"><span>Page {result.page} of {result.pages}</span><div className="flex gap-2">{result.page > 1 ? <Link href={pageHref(result.page - 1)} className="rounded-lg border border-[#dfe4eb] px-3 py-1.5">Previous</Link> : null}{result.page < result.pages ? <Link href={pageHref(result.page + 1)} className="rounded-lg border border-[#dfe4eb] px-3 py-1.5">Next</Link> : null}</div></div></section><p className="text-center text-xs text-[#98a2b3]">Updates refresh every 30 seconds while this tab is active, and whenever you return to it.</p></div>;
}
