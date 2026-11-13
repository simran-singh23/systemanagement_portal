import { AppShell } from "@/components/layout/app-shell";
import type { ReactNode } from "react";
import { requireUser } from "@/lib/dal/auth";
import { isManagerRole } from "@/lib/permissions";

export default async function NotificationsLayout({ children }: { children: ReactNode }) {
  const user = await requireUser();
  return <AppShell role={isManagerRole(user.role) ? "manager" : "employee"} user={user}>{children}</AppShell>;
}
