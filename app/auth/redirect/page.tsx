import { redirect } from "next/navigation";
import { requireSignedInUser } from "@/lib/dal/auth";
import { dashboardPathForRole } from "@/lib/permissions";

export default async function AuthRedirectPage() {
  const user = await requireSignedInUser();
  if (user.status === "INVITED") redirect("/pending-access");
  redirect(dashboardPathForRole(user.role));
}
