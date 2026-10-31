import assert from "node:assert/strict";
import test from "node:test";
import { safeNotificationDestination } from "@/lib/notification-routing";
import { notificationFiltersSchema, notificationIdSchema } from "@/lib/validations";

test("notification destinations allow only known internal routes", () => {
  assert.equal(safeNotificationDestination("/employee/tasks?task=abc"), "/employee/tasks?task=abc");
  assert.equal(safeNotificationDestination("https://example.com/phish"), "/notifications");
  assert.equal(safeNotificationDestination("//example.com/phish"), "/notifications");
  assert.equal(safeNotificationDestination("/admin/secrets"), "/notifications");
});

test("notification filters reject unsupported categories and read states", () => {
  assert.equal(notificationFiltersSchema.safeParse({ category: "EMAIL", read: "MAYBE" }).success, false);
  assert.equal(notificationFiltersSchema.safeParse({ category: "TASK", read: "UNREAD", page: "2" }).success, true);
});

test("notification mutation requires a record identifier", () => {
  assert.equal(notificationIdSchema.safeParse({ notificationId: "" }).success, false);
  assert.equal(notificationIdSchema.safeParse({ notificationId: "notification_123" }).success, true);
});
