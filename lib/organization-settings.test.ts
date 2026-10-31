import assert from "node:assert/strict";
import test from "node:test";
import { ORGANIZATION_SETTINGS_DEFAULTS, parsedPositiveHours, settingsImpactSummary, validateOfficeWindow, validateTimezone } from "./organization-settings";

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

test("accepts real IANA zones and normalizes reminder hours", () => {
  assert.equal(validateTimezone("Asia/Kolkata"), true);
  assert.equal(validateTimezone("Mars/Olympus"), false);
  assert.deepEqual(parsedPositiveHours("2, 24, 2, 0, 900"), [24, 2]);
});

test("summarizes affected systems", () => {
  assert.deepEqual(settingsImpactSummary(["workDays", "dailyReportDueTime"]), ["attendance", "analytics", "leave", "daily reports"]);
  assert.deepEqual(settingsImpactSummary(["aiEnabled"]), ["AI insights"]);
});
