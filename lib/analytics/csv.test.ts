import assert from "node:assert/strict";
import test from "node:test";
import { analyticsTableColumns, serializeAnalyticsCsv } from "./csv";

test("CSV columns match the visible analytics table and omit internal IDs", () => {
  const row = { id: "internal-123", employee: "Asha Singh", team: "Design", department: "Product", expected: 5, present: 4, late: 1, leave: 0, absent: 0 };
  assert.deepEqual(analyticsTableColumns("attendance"), ["employee", "team", "department", "expected", "present", "late", "leave", "absent"]);
  assert.deepEqual(analyticsTableColumns("attendance", true), ["employee", "expected", "present", "late", "leave", "absent"]);
  assert.equal(serializeAnalyticsCsv("attendance", [row], true), '"employee","expected","present","late","leave","absent"\r\n"Asha Singh","5","4","1","0","0"');
});

test("CSV escapes cells and neutralizes spreadsheet formulas", () => {
  const row = { id: "internal", employee: "=HYPERLINK(\"https://bad.invalid\")", team: "Research, \"North\"", department: "@cmd", expected: 1, present: 1, late: 0, leave: 0, absent: 0 };
  const csv = serializeAnalyticsCsv("attendance", [row]);
  assert.match(csv, /"'=HYPERLINK\(""https:\/\/bad\.invalid""\)"/);
  assert.match(csv, /"Research, ""North"""/);
  assert.match(csv, /"'@cmd"/);
  assert.equal(csv.includes("internal"), false);
});
