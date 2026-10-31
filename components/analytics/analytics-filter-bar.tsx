import Link from "next/link";
import type { AnalyticsDashboardData } from "@/lib/analytics/types";

export function AnalyticsFilterBar({ data, personal = false }: { data: AnalyticsDashboardData; personal?: boolean }) {
  const { filters, options } = data;
  return <form className="rounded-2xl border border-[#dce4ef] bg-white p-4" aria-label="Analytics filters">
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-7">
      <Select name="preset" value={filters.preset} label="Period" options={[["today", "Today"], ["7d", "Last 7 days"], ["30d", "Last 30 days"], ["month", "This month"], ["custom", "Custom range"]]} />
      <label className="text-xs font-medium text-[#667085]">Start<input type="date" name="start" defaultValue={filters.start} className={control} /></label>
      <label className="text-xs font-medium text-[#667085]">End<input type="date" name="end" defaultValue={filters.end} className={control} /></label>
      {!personal ? <Select name="team" value={filters.teamId} label="All teams" options={options.teams.map((item) => [item.id, item.name])} /> : null}
      {!personal ? <Select name="department" value={filters.department} label="All departments" options={options.departments.map((item) => [item, item])} /> : null}
      {!personal ? <Select name="employee" value={filters.employeeId} label="All employees" options={options.employees.map((item) => [item.id, item.name])} /> : null}
      <div className="flex items-end gap-2"><button className="h-10 flex-1 rounded-xl bg-[#172033] px-4 text-sm font-semibold text-white hover:bg-[#253047]">Apply</button><Link href={personal ? "/employee/analytics" : "/dashboard/analytics"} aria-label="Clear filters" className="grid h-10 place-items-center rounded-xl border border-[#dfe4eb] px-3 text-xs text-[#667085]">Clear</Link></div>
    </div>
    <p className="mt-3 text-xs text-[#98a2b3]">Custom dates apply when “Custom range” is selected. Ranges are limited to 366 days.</p>
  </form>;
}
const control = "mt-1.5 h-10 w-full rounded-xl border border-[#dfe4eb] bg-white px-3 text-sm text-[#344054] outline-none focus:border-[#80a7f5] focus:ring-2 focus:ring-[#dce8ff]";
function Select({ name, value, label, options }: { name: string; value?: string; label: string; options: string[][] }) { return <label className="text-xs font-medium text-[#667085]">{label}<select name={name} defaultValue={value || ""} className={control}>{name !== "preset" ? <option value="">{label}</option> : null}{options.map(([id, text]) => <option key={id} value={id}>{text}</option>)}</select></label>; }
