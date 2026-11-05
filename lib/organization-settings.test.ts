import assert from "node:assert/strict";
import test from "node:test";
import { ORGANIZATION_SETTINGS_DEFAULTS, parsedPositiveHours, settingsImpactSummary, validateAutomationScheduleOrder, validateOfficeWindow, validateTimezone } from "./organization-settings";

test("AI transmission is disabled by default", () => {
  assert.equal(ORGANIZATION_SETTINGS_DEFAULTS.aiEnabled, false);
  assert.equal(ORGANIZATION_SETTINGS_DEFAULTS.aiSummaryEnabled, false);
  assert.equal(ORGANIZATION_SETTINGS_DEFAULTS.aiAssistantEnabled, false);
});

test("validates standard and overnight office windows", () => {
  assert.equal(validateOfficeWindow("09:00", "18:00", false), null);
  assert.match(validateOfficeWindow("22:00", "06:00", false) ?? "", /overnight/i);
  assert.equal(validateOfficeWindow("22:00", "06:00", true), null);
  assert.match(validateOfficeWindow("09:00", "09:00", false) ?? "", /cannot be the same/i);
});

test("automation schedules follow office and reporting order for standard and overnight shifts", () => {
  const standard = { workdayStart: "09:00", workdayEnd: "18:00", overnight: false, checkInReminderTime: "09:00", checkInCutoffTime: "09:30", dailyReportReminderTime: "17:30", dailyReportDueTime: "18:00", managerSummaryTime: "19:00", dailyEmailEnabled: true, dailyEmailTime: "19:30" };
  assert.equal(validateAutomationScheduleOrder(standard), null);
  assert.match(validateAutomationScheduleOrder({ ...standard, checkInCutoffTime: "08:30" }) ?? "", /check-in cutoff/i);
  assert.match(validateAutomationScheduleOrder({ ...standard, dailyReportDueTime: "17:00" }) ?? "", /report reminder/i);
  assert.match(validateAutomationScheduleOrder({ ...standard, managerSummaryTime: "17:45" }) ?? "", /manager summary/i);
  assert.match(validateAutomationScheduleOrder({ ...standard, workdayStart: "22:00", workdayEnd: "06:00", overnight: false }) ?? "", /overnight/i);
  const overnight = { ...standard, workdayStart: "22:00", workdayEnd: "06:00", overnight: true, checkInReminderTime: "22:00", checkInCutoffTime: "23:00", dailyReportReminderTime: "05:30", dailyReportDueTime: "07:00", managerSummaryTime: "08:00", dailyEmailTime: "19:00" };
  assert.equal(validateAutomationScheduleOrder(overnight), null);
  assert.match(validateAutomationScheduleOrder({ ...overnight, dailyEmailTime: "07:30" }) ?? "", /daily email/i);
});

test("accepts real IANA zones and normalizes reminder hours", () => {
  assert.equal(validateTimezone("Asia/Kolkata"), true);
  assert.equal(validateTimezone("Mars/Olympus"), false);
  assert.deepEqual(parsedPositiveHours("2, 24, 2, 0, 900"), [24, 2]);
});

test("summarizes affected systems", () => {
  assert.deepEqual(settingsImpactSummary(["workDays", "dailyReportDueTime"]), ["attendance", "analytics", "leave", "daily reports"]);
  assert.deepEqual(settingsImpactSummary(["aiEnabled"]), ["AI insights"]);
});
