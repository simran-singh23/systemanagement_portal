import { z } from "zod";
import { requireCurrentOrganization } from "@/lib/dal/auth";
import { getAnalyticsDashboard } from "@/lib/analytics/queries";
import { analyticsTableColumns, serializeAnalyticsCsv } from "@/lib/analytics/csv";
import { AnalyticsFilterError, AnalyticsScopeError } from "@/lib/analytics/filters";

const datasetSchema = z.enum(["attendance", "tasks", "hours", "reports"]);
export async function GET(request: Request) {
  const url = new URL(request.url); const parsed = datasetSchema.safeParse(url.searchParams.get("dataset"));
  if (!parsed.success) return new Response("Invalid analytics dataset.", { status: 400 });
  const { user, organization, membership } = await requireCurrentOrganization("organization:read");
  const role = membership?.role ?? user.role; const personal = role === "EMPLOYEE" || url.searchParams.get("personal") === "1";
  try {
    const raw = Object.fromEntries(url.searchParams.entries());
    const data = await getAnalyticsDashboard(organization.id, { id: user.id, role }, raw, personal);
    const query = (url.searchParams.get("q") ?? "").slice(0, 120).toLowerCase();
    const sort = url.searchParams.get("sort") ?? "employee";
    const columns = analyticsTableColumns(parsed.data, personal);
    if (!columns.includes(sort)) return new Response("Invalid export sort column.", { status: 400, headers: { "cache-control": "no-store" } });
    const descending = url.searchParams.get("descending") === "1";
    const rows = data.tables[parsed.data].filter((row) => `${row.employee} ${row.team} ${row.department}`.toLowerCase().includes(query)).toSorted((a, b) => {
      const left = a[sort];
      const right = b[sort];
      const order = typeof left === "number" && typeof right === "number" ? left - right : String(left).localeCompare(String(right));
      return descending ? -order : order;
    });
    const csv = serializeAnalyticsCsv(parsed.data, rows, personal);
    return new Response(csv, { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="teamflow-${parsed.data}-${data.filters.start}-${data.filters.end}.csv"`, "cache-control": "private, no-store" } });
  } catch (error) {
    if (error instanceof AnalyticsScopeError) return new Response(error.message, { status: 403, headers: { "cache-control": "no-store" } });
    if (error instanceof AnalyticsFilterError) return new Response(error.message, { status: 400, headers: { "cache-control": "no-store" } });
    return new Response("The export could not be generated. Try again shortly.", { status: 500, headers: { "cache-control": "no-store" } });
  }
}
