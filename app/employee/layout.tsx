import { AppShell } from "@/components/layout/app-shell";
import { requireRole } from "@/lib/dal/auth";

export default async function EmployeeLayout({ children }: LayoutProps<"/employee">) {
  const user = await requireRole(["EMPLOYEE"]);
  return <AppShell role="employee" user={user}>{children}</AppShell>;
}
