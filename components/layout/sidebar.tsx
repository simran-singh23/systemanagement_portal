"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import type { UserRole } from "@prisma/client";
import { logout } from "@/actions/auth.actions";
import { Icon, type IconName } from "@/components/ui/icons";

type SidebarProps = { role: "manager" | "employee"; userRole: UserRole; pathname: string; mobileOpen: boolean; collapsed: boolean; onClose: () => void; onToggleCollapsed: () => void };
type NavItem = { label: string; href: string; icon: IconName; roles?: UserRole[] };
type NavGroup = { label: string; items: NavItem[] };

const managerGroups: NavGroup[] = [
  { label: "Workspace", items: [
    { label: "Overview", href: "/dashboard", icon: "dashboard" },
    { label: "Tasks", href: "/dashboard/tasks", icon: "tasks" },
    { label: "Attendance", href: "/dashboard/attendance", icon: "calendar" },
    { label: "Time tracking", href: "/dashboard/time-tracking", icon: "clock" },
    { label: "Daily reports", href: "/dashboard/reports", icon: "file" },
  ] },
  { label: "Team management", items: [
    { label: "Employees", href: "/dashboard/employees", icon: "users", roles: ["SUPER_ADMIN", "PRODUCT_MANAGER"] },
    { label: "Teams", href: "/dashboard/teams", icon: "sparkle" },
    { label: "Leave requests", href: "/dashboard/leave", icon: "calendar" },
  ] },
  { label: "Insights", items: [
    { label: "Analytics", href: "/dashboard/analytics", icon: "analytics" },
    { label: "AI assistant", href: "/dashboard/ai-assistant", icon: "sparkle" },
    { label: "Notifications", href: "/notifications", icon: "bell" },
  ] },
  { label: "Administration", items: [
    { label: "Automations", href: "/dashboard/automations", icon: "clock", roles: ["SUPER_ADMIN"] },
    { label: "Organization settings", href: "/dashboard/settings", icon: "settings", roles: ["SUPER_ADMIN"] },
  ] },
];

const employeeGroups: NavGroup[] = [
  { label: "Workspace", items: [
    { label: "Overview", href: "/employee", icon: "dashboard" },
    { label: "My tasks", href: "/employee/tasks", icon: "tasks" },
    { label: "Attendance", href: "/employee/attendance", icon: "calendar" },
    { label: "Daily reports", href: "/employee/reports", icon: "file" },
    { label: "My leave", href: "/employee/leave", icon: "calendar" },
  ] },
  { label: "Insights", items: [
    { label: "My analytics", href: "/employee/analytics", icon: "analytics" },
    { label: "Notifications", href: "/notifications", icon: "bell" },
  ] },
];

function isActive(pathname: string, href: string) {
  if (href === "/dashboard" || href === "/employee") return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function Sidebar({ role, userRole, pathname, mobileOpen, collapsed, onClose, onToggleCollapsed }: SidebarProps) {
  const panelRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  const groups = (role === "manager" ? managerGroups : employeeGroups).map((group) => ({ ...group, items: group.items.filter((item) => !item.roles || item.roles.includes(userRole)) })).filter((group) => group.items.length);

  useEffect(() => {
    if (!mobileOpen) return;
    previousFocus.current = document.activeElement as HTMLElement;
    closeRef.current?.focus();
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); onClose(); return; }
      if (event.key !== "Tab" || !panelRef.current) return;
      const focusable = [...panelRef.current.querySelectorAll<HTMLElement>('a[href], button:not([disabled])')];
      const first = focusable[0]; const last = focusable.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => { document.body.style.overflow = ""; document.removeEventListener("keydown", onKeyDown); previousFocus.current?.focus(); };
  }, [mobileOpen, onClose]);

  const compact = collapsed && !mobileOpen;
  return <>
    <button aria-label="Close navigation" aria-hidden={!mobileOpen} tabIndex={mobileOpen ? 0 : -1} className={`fixed inset-0 z-40 bg-[#101828]/45 transition-opacity duration-200 lg:hidden ${mobileOpen ? "opacity-100" : "pointer-events-none opacity-0"}`} onClick={onClose} type="button" />
    <aside ref={panelRef} role={mobileOpen ? "dialog" : undefined} aria-label="Primary navigation" aria-modal={mobileOpen ? true : undefined} className={`fixed inset-y-0 left-0 z-50 flex flex-col border-r border-[var(--line)] bg-[var(--surface)] px-3 py-4 shadow-[8px_0_30px_rgba(16,24,40,.04)] transition-[width,transform] duration-200 ease-out lg:translate-x-0 ${compact ? "lg:w-[5.25rem]" : "w-[17rem]"} ${mobileOpen ? "translate-x-0" : "-translate-x-full"}`}>
      <div className={`flex h-11 items-center ${compact ? "justify-center" : "justify-between px-1"}`}>
        <Link href={role === "manager" ? "/dashboard" : "/employee"} onClick={onClose} className="flex min-w-0 items-center gap-2.5 rounded-xl focus-visible:outline-offset-4" title="TeamFlow home">
          <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-[var(--blue)] text-white shadow-[0_6px_16px_rgba(37,99,235,.2)]"><span className="flex items-end gap-[3px]" aria-hidden="true"><span className="h-2 w-1 rounded-full bg-white/65" /><span className="h-4 w-1 rounded-full bg-white" /><span className="h-3 w-1 rounded-full bg-white/80" /></span></span>
          {!compact ? <span className="truncate text-[19px] font-bold tracking-[-0.035em] text-[var(--ink)]">TeamFlow</span> : null}
        </Link>
        <button ref={closeRef} onClick={onClose} type="button" aria-label="Close navigation" className="tf-icon-button lg:hidden"><Icon name="x" className="size-5" /></button>
      </div>

      <nav className="mt-5 flex-1 space-y-5 overflow-y-auto overscroll-contain pb-4" aria-label="Workspace navigation">
        {groups.map((group) => <section key={group.label} aria-labelledby={`nav-${group.label.replaceAll(" ", "-").toLowerCase()}`}>
          {!compact ? <h2 id={`nav-${group.label.replaceAll(" ", "-").toLowerCase()}`} className="mb-1.5 px-3 text-[11px] font-semibold text-[var(--muted-2)]">{group.label}</h2> : <span className="sr-only" id={`nav-${group.label.replaceAll(" ", "-").toLowerCase()}`}>{group.label}</span>}
          <div className="space-y-1">{group.items.map((item) => { const active = isActive(pathname, item.href); return <Link key={item.href} href={item.href} onClick={onClose} aria-current={active ? "page" : undefined} title={compact ? item.label : undefined} className={`group relative flex min-h-11 items-center rounded-xl text-sm font-medium transition-colors duration-150 ${compact ? "justify-center px-2" : "gap-3 px-3"} ${active ? "bg-[var(--blue-soft)] text-[var(--blue-strong)]" : "text-[var(--muted)] hover:bg-[var(--surface-subtle)] hover:text-[var(--ink)]"}`}>
            {active ? <span className="absolute inset-y-2 left-0 w-[3px] rounded-r-full bg-[var(--blue)]" /> : null}<Icon name={item.icon} className="size-[18px] shrink-0" />{!compact ? <span>{item.label}</span> : <span className="pointer-events-none absolute left-[calc(100%+.55rem)] z-50 hidden whitespace-nowrap rounded-lg bg-[var(--ink)] px-2.5 py-1.5 text-xs font-medium text-[var(--surface)] shadow-lg group-hover:block group-focus-visible:block">{item.label}</span>}
          </Link>; })}</div>
        </section>)}
      </nav>

      <div className="border-t border-[var(--line)] pt-3">
        <button type="button" onClick={onToggleCollapsed} className={`hidden min-h-11 w-full items-center rounded-xl text-sm font-medium text-[var(--muted)] hover:bg-[var(--surface-subtle)] hover:text-[var(--ink)] lg:flex ${compact ? "justify-center" : "gap-3 px-3"}`} title={compact ? "Expand sidebar" : "Collapse sidebar"}><Icon name="panelLeft" className={`size-[18px] transition-transform ${compact ? "rotate-180" : ""}`} />{!compact ? "Collapse sidebar" : <span className="sr-only">Expand sidebar</span>}</button>
        <form action={logout}><button type="submit" title={compact ? "Sign out" : undefined} className={`flex min-h-11 w-full items-center rounded-xl text-sm font-medium text-[var(--muted)] hover:bg-[var(--surface-subtle)] hover:text-[var(--ink)] ${compact ? "justify-center" : "gap-3 px-3"}`}><Icon name="logout" className="size-[18px]" />{!compact ? "Sign out" : <span className="sr-only">Sign out</span>}</button></form>
      </div>
    </aside>
  </>;
}
