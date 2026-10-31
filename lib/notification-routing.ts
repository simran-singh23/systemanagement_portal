const allowedDestinations = [
  "/notifications",
  "/employee/tasks",
  "/dashboard/tasks",
  "/employee/attendance",
  "/dashboard/attendance",
  "/employee/reports",
  "/dashboard/reports",
  "/employee/leave",
  "/dashboard/leave",
] as const;

export function safeNotificationDestination(link: string | null | undefined) {
  if (!link?.startsWith("/") || link.startsWith("//")) return "/notifications";
  try {
    const url = new URL(link, "https://teamflow.local");
    if (url.origin !== "https://teamflow.local") return "/notifications";
    const allowed = allowedDestinations.some((path) => url.pathname === path || url.pathname.startsWith(`${path}/`));
    return allowed ? `${url.pathname}${url.search}` : "/notifications";
  } catch {
    return "/notifications";
  }
}
