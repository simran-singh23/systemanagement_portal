import { AppShell } from "@/components/layout/app-shell";
import { requireRole } from "@/lib/dal/auth";
import { getNotificationPreview } from "@/lib/notifications";

export default async function EmployeeLayout({ children }: LayoutProps<"/employee">) {
  const user = await requireRole(["EMPLOYEE"]);
  const notificationPreview = await getNotificationPreview(user.id);
  return <AppShell role="employee" user={user} notificationPreview={notificationPreview}>{children}</AppShell>;
}
