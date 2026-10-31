import { getCurrentUser } from "@/lib/dal/auth";
import { getNotificationPreview } from "@/lib/notifications";

export const dynamic = "force-dynamic";
export async function GET() { const user = await getCurrentUser(); if (!user || user.status !== "ACTIVE") return Response.json({ message: "Unauthorized" }, { status: 401, headers: { "Cache-Control": "no-store" } }); const preview = await getNotificationPreview(user.id); return Response.json(preview, { headers: { "Cache-Control": "private, no-store, max-age=0" } }); }
