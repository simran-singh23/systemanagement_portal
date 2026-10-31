import Link from "next/link";
import { logout } from "@/actions/auth.actions";
import { Icon } from "@/components/ui/icons";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { UserAvatar } from "@/components/ui/user-avatar";
import { NotificationBell } from "@/components/notifications/notification-bell";
import type { ShellUser } from "@/components/layout/app-shell";
import type { NotificationDTO } from "@/lib/notifications";
import { GlobalSearch } from "@/components/search/global-search";

type TopNavProps = { user: ShellUser; pathname: string; onMenuClick: () => void; notificationPreview: { notifications: NotificationDTO[]; unreadCount: number } };

const roleLabels: Record<ShellUser["role"], string> = { SUPER_ADMIN: "Super admin", PRODUCT_MANAGER: "Product manager", TEAM_LEAD: "Team lead", EMPLOYEE: "Employee" };
const pageLabels: Record<string, string> = {
  dashboard: "Overview", employee: "Overview", employees: "Employees", teams: "Teams", tasks: "Tasks", attendance: "Attendance", "time-tracking": "Time tracking", reports: "Daily reports", leave: "Leave", automations: "Automations", analytics: "Analytics", settings: "Settings", notifications: "Notifications", board: "Board",
};

function breadcrumb(pathname: string) {
  const parts = pathname.split("/").filter(Boolean);
  const root = parts[0] === "employee" ? "My workspace" : parts[0] === "dashboard" ? "Team workspace" : "Workspace";
  const current = pageLabels[parts.at(-1) ?? ""] ?? "Details";
  return { root, current };
}

export function TopNav({ user, pathname, notificationPreview, onMenuClick }: TopNavProps) {
  const displayName = user.name || user.email;
  const crumbs = breadcrumb(pathname);
  return <header className="sticky top-0 z-30 flex h-[4.5rem] items-center gap-2 border-b border-[var(--line)] bg-[color:var(--surface-translucent)] px-4 backdrop-blur-xl sm:gap-3 sm:px-6 lg:px-8">
    <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-3 focus:z-[100] focus:rounded-lg focus:bg-[var(--ink)] focus:px-3 focus:py-2 focus:text-sm focus:text-[var(--surface)]">Skip to content</a>
    <button type="button" aria-label="Open navigation" onClick={onMenuClick} className="tf-icon-button lg:hidden"><Icon name="menu" className="size-5" /></button>
    <div className="hidden min-w-40 lg:block"><p className="text-[11px] text-[var(--muted-2)]">{crumbs.root}</p><p className="mt-0.5 truncate text-sm font-semibold text-[var(--ink)]">{crumbs.current}</p></div>
    <GlobalSearch />
    <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
      <ThemeToggle />
      <NotificationBell initialPreview={notificationPreview} />
      <div className="mx-1 hidden h-7 w-px bg-[var(--line)] sm:block" />
      <details className="group relative">
        <summary aria-label="Open user menu" className="flex min-h-11 cursor-pointer list-none items-center gap-2.5 rounded-xl p-1.5 pr-2 text-left transition-colors hover:bg-[var(--surface-subtle)] [&::-webkit-details-marker]:hidden"><UserAvatar name={user.name} email={user.email} image={user.image} /><span className="hidden max-w-40 sm:block"><span className="block truncate text-sm font-semibold leading-4 text-[var(--ink)]">{displayName}</span><span className="mt-1 block text-[11px] text-[var(--muted-2)]">{roleLabels[user.role]}</span></span><Icon name="chevronDown" className="hidden size-4 text-[var(--muted-2)] transition-transform group-open:rotate-180 sm:block" /></summary>
        <div className="absolute right-0 top-12 z-50 w-64 overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-2 shadow-[0_18px_50px_rgba(16,24,40,.16)]"><div className="px-3 py-2"><p className="truncate text-sm font-semibold text-[var(--ink)]">{displayName}</p><p className="mt-1 truncate text-xs text-[var(--muted-2)]">{user.email}</p></div><div className="my-1 h-px bg-[var(--line)]" /><Link href="/notifications" className="flex min-h-10 items-center gap-3 rounded-lg px-3 text-sm text-[var(--muted)] hover:bg-[var(--surface-subtle)] hover:text-[var(--ink)]"><Icon name="bell" className="size-4" /> Notifications</Link><form action={logout}><button className="flex min-h-10 w-full items-center gap-3 rounded-lg px-3 text-sm text-[var(--muted)] hover:bg-[var(--surface-subtle)] hover:text-[var(--ink)]"><Icon name="logout" className="size-4" /> Sign out</button></form></div>
      </details>
    </div>
  </header>;
}
