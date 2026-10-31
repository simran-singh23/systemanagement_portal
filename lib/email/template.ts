export type DailyEmailEmployee = {
  name: string;
  attendance: string;
  checkIn: string | null;
  checkOut: string | null;
  netMinutes: number | null;
  taskMinutes: number | null;
  completedTasks: number;
  inProgressTasks: number;
  summary: string | null;
  pulse: string | null;
  blockers: string | null;
};

export type DailyEmailReport = {
  organizationName: string;
  workDate: string;
  timezone: string;
  provisional: boolean;
  totals: {
    expected: number;
    present: number;
    absent: number;
    onLeave: number;
    reportsSubmitted: number;
    reportsMissing: number;
    tasksCompleted: number;
    tasksBlocked: number;
    officeMinutes: number;
    breakMinutes: number;
    netMinutes: number;
    taskMinutes: number;
  };
  employees: DailyEmailEmployee[];
  dashboardUrl: string;
};

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char] ?? char);
const hours = (minutes: number | null) => minutes === null ? "Not recorded" : `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, "0")}m`;

export function renderDailyEmail(report: DailyEmailReport) {
  const t = report.totals;
  const status = report.provisional ? "Provisional — some work sessions or reports may still change." : "Recorded workday summary";
  const metrics = [
    ["Scheduled", t.expected], ["Checked in", t.present], ["Recorded absent", t.absent], ["Approved leave", t.onLeave],
    ["Reports submitted", t.reportsSubmitted], ["Reports missing", t.reportsMissing],
    ["Tasks completed", t.tasksCompleted], ["Blocked tasks", t.tasksBlocked],
    ["Office time", hours(t.officeMinutes)], ["Break time", hours(t.breakMinutes)],
    ["Net working", hours(t.netMinutes)], ["Task tracked", hours(t.taskMinutes)],
  ] as const;
  const row = (label: string, value: string | number) => `<tr><td style="padding:9px 12px;border-bottom:1px solid #edf1f6;color:#64748b">${escapeHtml(label)}</td><td style="padding:9px 12px;border-bottom:1px solid #edf1f6;text-align:right;font-weight:600;color:#172033">${escapeHtml(String(value))}</td></tr>`;
  const employeeHtml = report.employees.map((employee) => `<section style="margin-top:18px;padding:16px;border:1px solid #e6eaf0;border-radius:12px"><h3 style="margin:0 0 8px;font-size:16px;color:#172033">${escapeHtml(employee.name)}</h3><p style="margin:0;color:#64748b;font-size:13px">${escapeHtml(employee.attendance)} · ${escapeHtml(employee.checkIn ?? "No check-in")}–${escapeHtml(employee.checkOut ?? "No check-out")} · Net ${escapeHtml(hours(employee.netMinutes))} · Task ${escapeHtml(hours(employee.taskMinutes))}</p><p style="margin:8px 0 0;color:#475569;font-size:13px">${employee.completedTasks} completed · ${employee.inProgressTasks} in progress</p>${employee.summary ? `<p style="margin:8px 0 0;font-size:13px;white-space:pre-wrap">${escapeHtml(employee.summary)}</p>` : ""}${employee.pulse ? `<p style="margin:8px 0 0;font-size:13px">Pulse: ${escapeHtml(employee.pulse)}</p>` : ""}${employee.blockers ? `<p style="margin:8px 0 0;color:#a44b18;font-size:13px">Blocker: ${escapeHtml(employee.blockers)}</p>` : ""}</section>`).join("");
  const html = `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body style="margin:0;background:#f5f7fb;font-family:Arial,sans-serif;color:#172033"><div style="max-width:640px;margin:24px auto;padding:24px;background:#fff;border:1px solid #e6eaf0;border-radius:16px"><p style="color:#2563eb;font-size:11px;font-weight:700;letter-spacing:.12em">TEAMFLOW DAILY REPORT</p><h1 style="font-size:25px;margin:8px 0">${escapeHtml(report.organizationName)}</h1><p style="color:#64748b;margin:0 0 18px">${escapeHtml(report.workDate)} · ${escapeHtml(report.timezone)}</p><p style="padding:10px 12px;background:#eff5ff;color:#285594;border-radius:8px;font-size:13px">${escapeHtml(status)}</p><h2 style="font-size:17px;margin:22px 0 10px">Workday overview</h2><table style="width:100%;border-collapse:collapse;font-size:13px">${metrics.map(([label, value]) => row(label, value)).join("")}</table><h2 style="font-size:17px;margin:24px 0 10px">Employee updates</h2>${employeeHtml || `<p style="font-size:13px;color:#64748b">No eligible employee records were found.</p>`}<p style="margin:24px 0 0"><a href="${escapeHtml(report.dashboardUrl)}" style="color:#2563eb;font-weight:600">Open manager dashboard</a></p><p style="margin:24px 0 0;color:#94a3b8;font-size:11px">This message contains confidential team work information. Do not forward outside your organization.</p></div></body></html>`;
  const text = [`TeamFlow daily report — ${report.organizationName}`, `${report.workDate} · ${report.timezone}`, status, "", "Workday overview", ...metrics.map(([label, value]) => `${label}: ${value}`), "", "Employee updates", ...report.employees.flatMap((employee) => [employee.name, `${employee.attendance}; ${employee.checkIn ?? "No check-in"}–${employee.checkOut ?? "No check-out"}; net ${hours(employee.netMinutes)}; task ${hours(employee.taskMinutes)}; ${employee.completedTasks} completed; ${employee.inProgressTasks} in progress`, employee.summary ? `Summary: ${employee.summary}` : "", employee.pulse ? `Pulse: ${employee.pulse}` : "", employee.blockers ? `Blocker: ${employee.blockers}` : "", ""]), `Manager dashboard: ${report.dashboardUrl}`, "Confidential team work information. Do not forward outside your organization."].filter((line) => line !== undefined).join("\n");
  return { html, text };
}
