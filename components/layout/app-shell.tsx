"use client";

import { useCallback, useState, useSyncExternalStore, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { Sidebar } from "@/components/layout/sidebar";
import { TopNav } from "@/components/layout/top-nav";
import type { NotificationDTO } from "@/lib/notifications";

export type ShellUser = {
  name: string | null;
  email: string;
  image: string | null;
  role: "SUPER_ADMIN" | "PRODUCT_MANAGER" | "TEAM_LEAD" | "EMPLOYEE";
};

const sidebarEvent = "teamflow-sidebar-change";
function subscribeSidebar(callback: () => void) { window.addEventListener(sidebarEvent, callback); window.addEventListener("storage", callback); return () => { window.removeEventListener(sidebarEvent, callback); window.removeEventListener("storage", callback); }; }
function sidebarSnapshot() { return localStorage.getItem("teamflow-sidebar") === "collapsed"; }
function serverSidebarSnapshot() { return false; }

type AppShellProps = {
  children: ReactNode;
  role: "manager" | "employee";
  user: ShellUser;
  notificationPreview: { notifications: NotificationDTO[]; unreadCount: number };
};

export function AppShell({ children, role, user, notificationPreview }: AppShellProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const collapsed = useSyncExternalStore(subscribeSidebar, sidebarSnapshot, serverSidebarSnapshot);
  const pathname = usePathname();
  const closeMobile = useCallback(() => setMobileOpen(false), []);

  function toggleCollapsed() {
    localStorage.setItem("teamflow-sidebar", collapsed ? "expanded" : "collapsed");
    window.dispatchEvent(new Event(sidebarEvent));
  }

  return (
    <div className="min-h-screen bg-[var(--canvas)]">
      <Sidebar role={role} userRole={user.role} pathname={pathname} mobileOpen={mobileOpen} collapsed={collapsed} onToggleCollapsed={toggleCollapsed} onClose={closeMobile} />
      <div className={`transition-[padding] duration-200 ease-out ${collapsed ? "lg:pl-[5.25rem]" : "lg:pl-[17rem]"}`}>
        <TopNav user={user} pathname={pathname} notificationPreview={notificationPreview} onMenuClick={() => setMobileOpen(true)} />
        <main id="main-content" className="mx-auto w-full max-w-[1480px] overflow-x-clip p-4 sm:p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
