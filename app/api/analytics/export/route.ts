import { z } from "zod";
import { requireCurrentOrganization } from "@/lib/dal/auth";
import { getAnalyticsDashboard } from "@/lib/analytics/queries";

const datasetSchema = z.enum(["attendance", "tasks", "hours", "reports"]);
export async function GET(request: Request) {
  const url = new URL(request.url); const parsed = datasetSchema.safeParse(url.searchParams.get("dataset"));
  if (!parsed.success) return new Response("Invalid analytics dataset.", { status: 400 });
  const { user, organization, membership } = await requireCurrentOrganization("organization:read");
  const role = membership?.role ?? user.role; const personal = role === "EMPLOYEE" || url.searchParams.get("personal") === "1";
  const raw = Object.fromEntries(url.searchParams.entries()); const data = await getAnalyticsDashboard(organization.id, { id: user.id, role }, raw, personal);
  const rows = data.tables[parsed.data]; const columns = rows.length ? Object.keys(rows[0]) : ["employee", "team", "department"];
  const csv = [columns, ...rows.map((row) => columns.map((column) => safeCsv(row[column])))].map((row) => row.map(csvCell).join(",")).join("\r\n");
  return new Response(csv, { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="teamflow-${parsed.data}-${data.filters.start}-${data.filters.end}.csv"`, "cache-control": "private, no-store" } });
}
function safeCsv(value: string | number | undefined) { const text = String(value ?? ""); return /^[=+\-@]/.test(text) ? `'${text}` : text; }
function csvCell(value: string | number) { const text = String(value); return `"${text.replaceAll('"', '""')}"`; }
