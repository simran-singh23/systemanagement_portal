import { AppShell } from "@/components/layout/app-shell";
import { MANAGER_ROLES } from "@/lib/permissions";
import { requireRole } from "@/lib/dal/auth";

export default async function ManagerLayout({ children }: LayoutProps<"/dashboard">) {
  const user = await requireRole(MANAGER_ROLES);
  return <AppShell role="manager" user={user}>{children}</AppShell>;
}
