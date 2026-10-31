export type AnalyticsFilters = { preset: "today" | "7d" | "30d" | "month" | "custom"; start: string; end: string; teamId?: string; department?: string; employeeId?: string };
export type Metric = { label: string; value: number; unit?: string; comparison?: number; icon: "users" | "attendance" | "complete" | "progress" | "overdue" | "net" | "tracked" | "reports" };
export type AttendanceTrend = { date: string; expected: number; present: number; late: number; leave: number; absent: number };
export type TaskTrend = { date: string; created: number; completed: number; reopened: number; overdue: number };
export type HoursTrend = { date: string; office: number; break: number; net: number; tracked: number; unallocated: number };
export type ReportTrend = { date: string; expected: number; submitted: number; missing: number; late: number; rate: number | null };
export type TableRow = { id: string; employee: string; team: string; department: string; [key: string]: string | number };
export type AnalyticsDashboardData = {
  filters: AnalyticsFilters; organizationName: string; timezone: string; periodLabel: string;
  metrics: Metric[]; attendance: AttendanceTrend[]; tasks: TaskTrend[]; taskStatus: { name: string; value: number }[];
  hours: HoursTrend[]; workload: { name: string; open: number; inProgress: number; blocked: number; estimatedHours: number | null }[];
  reports: ReportTrend[]; pulse: { name: string; value: number }[];
  tables: { attendance: TableRow[]; tasks: TableRow[]; hours: TableRow[]; reports: TableRow[] };
  options: { teams: { id: string; name: string }[]; departments: string[]; employees: { id: string; name: string }[] };
};
