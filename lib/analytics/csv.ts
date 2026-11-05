import type { TableRow } from "./types";

export type AnalyticsDataset = "attendance" | "tasks" | "hours" | "reports";

const datasetColumns: Record<AnalyticsDataset, readonly string[]> = {
  attendance: ["expected", "present", "late", "leave", "absent"],
  tasks: ["open", "completed", "blocked", "review"],
  hours: ["officeHours", "netHours", "trackedHours", "unallocatedHours"],
  reports: ["expected", "submitted", "drafts", "missing"],
};

export function analyticsTableColumns(dataset: AnalyticsDataset, personal = false) {
  return ["employee", ...(personal ? [] : ["team", "department"]), ...datasetColumns[dataset]];
}

export function serializeAnalyticsCsv(dataset: AnalyticsDataset, rows: TableRow[], personal = false) {
  const columns = analyticsTableColumns(dataset, personal);
  return [columns, ...rows.map((row) => columns.map((column) => safeCsv(row[column])))].map((row) => row.map(csvCell).join(",")).join("\r\n");
}

function safeCsv(value: string | number | undefined) {
  const text = String(value ?? "");
  return /^[=+\-@]/.test(text) ? `'${text}` : text;
}

function csvCell(value: string | number) {
  return `"${String(value).replaceAll('"', '""')}"`;
}
