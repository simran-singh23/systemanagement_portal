import Link from "next/link";

const categories = [
  { label: "All notifications", value: "" },
  { label: "Unread", value: "UNREAD" },
  { label: "Read", value: "READ" },
  { label: "Tasks", value: "TASK" },
  { label: "Attendance", value: "ATTENDANCE" },
  { label: "Leave", value: "LEAVE" },
  { label: "Reports", value: "REPORT" },
] as const;

export function NotificationFilters({ filters, unreadCount }: { filters: { q?: string; category?: string; type?: string; read?: string; date?: string }; unreadCount: number }) {
  const active = filters.read === "UNREAD" ? "UNREAD" : filters.read === "READ" ? "READ" : filters.category ?? "";
  const href = (value: string) => value === "UNREAD" || value === "READ" ? `?read=${value}` : value ? `?category=${value}` : "/notifications";
  return <><nav aria-label="Notification categories" className="overflow-x-auto border-b border-[#edf0f4]"><div className="flex min-w-max px-3 sm:px-5">{categories.map((item) => <Link key={item.label} href={href(item.value)} className={`relative px-3 py-3.5 text-sm font-medium ${active === item.value ? "text-[#1d55c6]" : "text-[#667085] hover:text-[#344054]"}`}>{item.label}{item.value === "UNREAD" && unreadCount ? <span className="ml-1.5 rounded-full bg-[#eef4ff] px-1.5 py-0.5 text-[10px] font-bold text-[#2563eb]">{unreadCount > 99 ? "99+" : unreadCount}</span> : null}{active === item.value ? <span className="absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-[#2563eb]" /> : null}</Link>)}</div></nav><form className="grid gap-2 border-b border-[#edf0f4] bg-[#fafbfc] p-4 sm:grid-cols-2 xl:grid-cols-[minmax(14rem,1fr)_minmax(10rem,.5fr)_minmax(10rem,.5fr)_minmax(10rem,.5fr)_auto]"><input type="hidden" name="category" value={filters.category ?? ""} /><label className="block"><span className="sr-only">Search notifications</span><input name="q" defaultValue={filters.q ?? ""} placeholder="Search title or message" className={control} /></label><select name="type" aria-label="Notification type" defaultValue={filters.type ?? ""} className={control}><option value="">All event types</option><optgroup label="Tasks"><option value="TASK_ASSIGNED">Task assigned</option><option value="TASK_UPDATED">Task updated</option><option value="COMMENT_MENTION">Task comment</option></optgroup><optgroup label="Attendance"><option value="ATTENDANCE">Attendance</option><option value="BREAK">Break</option></optgroup><optgroup label="Reports"><option value="REPORT_SUBMITTED">Report submitted</option><option value="REPORT_REVIEWED">Report reviewed</option><option value="REPORT_DUE">Report due</option></optgroup><optgroup label="Leave"><option value="LEAVE_REQUESTED">Leave requested</option><option value="LEAVE_UPDATED">Leave updated</option></optgroup><option value="SYSTEM">System</option></select><select name="read" aria-label="Read status" defaultValue={filters.read ?? ""} className={control}><option value="">Any read state</option><option value="UNREAD">Unread</option><option value="READ">Read</option></select><input name="date" aria-label="Notification date" type="date" defaultValue={filters.date ?? ""} className={control} /><div className="flex gap-2"><button className="h-10 flex-1 rounded-xl bg-[#172033] px-4 text-sm font-semibold text-white">Apply</button><Link href="/notifications" aria-label="Clear notification filters" className="grid size-10 place-items-center rounded-xl border border-[#dfe4eb] bg-white text-[#667085]">×</Link></div></form></>;
}

const control = "h-10 w-full min-w-0 rounded-xl border border-[#dfe4eb] bg-white px-3 text-sm text-[#475467] outline-none focus:border-[#80a7f5] focus:ring-4 focus:ring-[#eef4ff]";
