import { AppShell } from "@/components/layout/app-shell";
import { MANAGER_ROLES } from "@/lib/permissions";
import { requireRole } from "@/lib/dal/auth";
import { getNotificationPreview } from "@/lib/notifications";

export default async function ManagerLayout({ children }: LayoutProps<"/dashboard">) {
  const user = await requireRole(MANAGER_ROLES);
  const notificationPreview = await getNotificationPreview(user.id);
  return <AppShell role="manager" user={user} notificationPreview={notificationPreview}>{children}</AppShell>;
}
