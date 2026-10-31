import assert from "node:assert/strict";
import test from "node:test";
import { renderDailyEmail, type DailyEmailReport } from "./template";

test("daily email renders real values and escapes employee-provided text", () => {
  const report: DailyEmailReport = { organizationName: "Acme & Co", workDate: "2026-10-22", timezone: "Asia/Kolkata", provisional: true, totals: { expected: 1, present: 1, absent: 0, onLeave: 0, reportsSubmitted: 1, reportsMissing: 0, tasksCompleted: 2, tasksBlocked: 0, officeMinutes: 480, breakMinutes: 60, netMinutes: 420, taskMinutes: 300 }, employees: [{ name: "A <script>alert(1)</script>", attendance: "PRESENT", checkIn: "09:00", checkOut: "18:00", netMinutes: 420, taskMinutes: 300, completedTasks: 2, inProgressTasks: 1, summary: "Shipped <feature>", pulse: "GOOD", blockers: null }], dashboardUrl: "https://teamflow.example.com/dashboard/reports" };
  const result = renderDailyEmail(report);
  assert.match(result.html, /Acme &amp; Co/);
  assert.doesNotMatch(result.html, /<script>/);
  assert.match(result.html, /Shipped &lt;feature&gt;/);
  assert.match(result.text, /Net working: 7h 00m/);
  assert.doesNotMatch(result.text, /<html>/);
});
