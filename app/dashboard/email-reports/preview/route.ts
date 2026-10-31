import { requireCurrentOrganization } from "@/lib/dal/auth";
import { buildDailyEmailReport } from "@/lib/email/report";
import { renderDailyEmail } from "@/lib/email/template";

export async function GET(request: Request) {
  const { organization } = await requireCurrentOrganization("organization:manage");
  const date = new URL(request.url).searchParams.get("date");
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(new Date(`${date}T00:00:00Z`).getTime())) return new Response("A valid report date is required.", { status: 400 });
  const report = await buildDailyEmailReport(organization.id, date);
  if (!report) return new Response("No generated daily summary is available for this date.", { status: 404 });
  const { html } = renderDailyEmail(report);
  return new Response(html, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "private, no-store", "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; img-src https: data:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'", "x-content-type-options": "nosniff" } });
}
