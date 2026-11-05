import { z } from "zod";
import { requireCurrentOrganization } from "@/lib/dal/auth";
import { getAnalyticsDashboard } from "@/lib/analytics/queries";
import { serializeAnalyticsCsv } from "@/lib/analytics/csv";

const datasetSchema = z.enum(["attendance", "tasks", "hours", "reports"]);
export async function GET(request: Request) {
  const url = new URL(request.url); const parsed = datasetSchema.safeParse(url.searchParams.get("dataset"));
  if (!parsed.success) return new Response("Invalid analytics dataset.", { status: 400 });
  const { user, organization, membership } = await requireCurrentOrganization("organization:read");
  const role = membership?.role ?? user.role; const personal = role === "EMPLOYEE" || url.searchParams.get("personal") === "1";
  const raw = Object.fromEntries(url.searchParams.entries()); const data = await getAnalyticsDashboard(organization.id, { id: user.id, role }, raw, personal);
  const csv = serializeAnalyticsCsv(parsed.data, data.tables[parsed.data], personal);
  return new Response(csv, { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="teamflow-${parsed.data}-${data.filters.start}-${data.filters.end}.csv"`, "cache-control": "private, no-store" } });
}
