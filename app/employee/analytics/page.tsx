import type { Metadata } from "next";
import { AnalyticsFilterBar } from "@/components/analytics/analytics-filter-bar";
import { AnalyticsOverviewCards } from "@/components/analytics/analytics-overview-cards";
import { AnalyticsCharts } from "@/components/analytics/analytics-charts";
import { AnalyticsDataTable } from "@/components/analytics/analytics-data-table";
import { requireCurrentOrganization } from "@/lib/dal/auth";
import { getAnalyticsDashboard } from "@/lib/analytics/queries";
import type { AnalyticsSearch } from "@/lib/analytics/filters";

export const metadata: Metadata = { title: "My analytics" };
export const dynamic = "force-dynamic";
export default async function EmployeeAnalyticsPage({ searchParams }: { searchParams: Promise<AnalyticsSearch> }) { const [{ user, organization, membership }, raw] = await Promise.all([requireCurrentOrganization("organization:read"), searchParams]); const data = await getAnalyticsDashboard(organization.id, { id: user.id, role: membership?.role ?? user.role }, raw, true); const query = new URLSearchParams({ preset: data.filters.preset, start: data.filters.start, end: data.filters.end, personal: "1" }).toString(); return <div className="space-y-5"><header><h1 className="text-3xl font-semibold tracking-[-0.045em] text-[#172033]">My analytics</h1><p className="mt-2 text-sm text-[#667085]">Your attendance, task, tracked-time and report history for {data.periodLabel}.</p></header><AnalyticsFilterBar data={data} personal /><AnalyticsOverviewCards metrics={data.metrics} /><AnalyticsCharts data={data} personal /><AnalyticsDataTable data={data.tables} query={query} personal /></div>; }
