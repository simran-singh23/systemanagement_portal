import { AppShell } from "@/components/layout/app-shell";
import type { ReactNode } from "react";
import { requireUser } from "@/lib/dal/auth";
import { getNotificationPreview } from "@/lib/notifications";
import { isManagerRole } from "@/lib/permissions";

export default async function NotificationsLayout({ children }: { children: ReactNode }) {
  const user = await requireUser();
  const notificationPreview = await getNotificationPreview(user.id);
  return <AppShell role={isManagerRole(user.role) ? "manager" : "employee"} user={user} notificationPreview={notificationPreview}>{children}</AppShell>;
}
