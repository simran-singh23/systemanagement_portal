import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/dal/auth";
import { dashboardPathForRole } from "@/lib/permissions";

export default async function Home() {
  const user = await getCurrentUser();
  if (user?.status === "ACTIVE") redirect(dashboardPathForRole(user.role));
  redirect("/login");
}
