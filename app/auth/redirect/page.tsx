import { redirect } from "next/navigation";
import { requireUser } from "@/lib/dal/auth";
import { dashboardPathForRole } from "@/lib/permissions";

export default async function AuthRedirectPage() {
  const user = await requireUser();
  redirect(dashboardPathForRole(user.role));
}
