import type { Metadata } from "next";
import { AnalyticsFilterBar } from "@/components/analytics/analytics-filter-bar";
import { AnalyticsOverviewCards } from "@/components/analytics/analytics-overview-cards";
import { AnalyticsCharts } from "@/components/analytics/analytics-charts";
import { AnalyticsDataTable } from "@/components/analytics/analytics-data-table";
import { requireCurrentOrganization } from "@/lib/dal/auth";
import { getAnalyticsDashboard } from "@/lib/analytics/queries";
import type { AnalyticsSearch } from "@/lib/analytics/filters";

export const metadata: Metadata = { title: "Analytics" };
export const dynamic = "force-dynamic";

export default async function AnalyticsPage({ searchParams }: { searchParams: Promise<AnalyticsSearch> }) {
  const [{ user, organization, membership }, raw] = await Promise.all([requireCurrentOrganization("reports:read-all"), searchParams]);
  const data = await getAnalyticsDashboard(organization.id, { id: user.id, role: membership?.role ?? user.role }, raw);
  const query = queryString(data.filters);
  return <div className="space-y-5">
    <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><h1 className="text-3xl font-semibold tracking-[-0.045em] text-[#172033]">Analytics</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-[#667085]">Operational trends for {data.organizationName}, calculated from attendance, work sessions, tasks and submitted reports.</p></div><div className="rounded-xl border border-[#dce4ef] bg-white px-3 py-2 text-right"><p className="text-[10px] text-[#98a2b3]">Organization timezone</p><p className="mt-0.5 font-mono text-xs font-semibold text-[#344054]">{data.timezone}</p></div></header>
    <AnalyticsFilterBar data={data} />
    <div className="rounded-2xl bg-[#172033] p-5 text-white"><div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-xs text-white/55">Selected reporting window</p><p className="mt-1 font-mono text-lg font-semibold">{data.periodLabel}</p></div><p className="max-w-xl text-xs leading-5 text-white/60">Metrics describe workload and operational coverage. They are not employee performance scores.</p></div></div>
    <AnalyticsOverviewCards metrics={data.metrics} />
    <AnalyticsCharts data={data} />
    <div><h2 className="text-lg font-semibold text-[#253047]">Detailed summaries</h2><p className="mb-3 mt-1 text-xs text-[#7c8799]">Search, sort, paginate or export the same authorized filter scope.</p><AnalyticsDataTable data={data.tables} query={query} /></div>
  </div>;
}

function queryString(filters: { preset: string; start: string; end: string; teamId?: string; department?: string; employeeId?: string }) { const params = new URLSearchParams({ preset: filters.preset, start: filters.start, end: filters.end }); if (filters.teamId) params.set("team", filters.teamId); if (filters.department) params.set("department", filters.department); if (filters.employeeId) params.set("employee", filters.employeeId); return params.toString(); }
