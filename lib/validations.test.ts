import assert from "node:assert/strict";
import test from "node:test";
import { employeeSchema, taskCommentSchema, taskSchema } from "./validations";

test("employee validation rejects invalid email and non-assignable role", () => {
  const result = employeeSchema.safeParse({
    organizationId: "org-1",
    name: "Alex Doe",
    email: "not-an-email",
    jobTitle: "Engineer",
    department: "Product",
    role: "SUPER_ADMIN",
    teamId: "",
  });

  assert.equal(result.success, false);
});

test("employee invitation normalizes email to match an existing Google user", () => {
  const result = employeeSchema.safeParse({
    organizationId: "org-1",
    name: "Alex Doe",
    email: "  Alex.Doe@Example.com  ",
    jobTitle: "Engineer",
    department: "Product",
    role: "EMPLOYEE",
    teamId: "",
  });

  assert.equal(result.success, true);
  if (result.success) assert.equal(result.data.email, "alex.doe@example.com");
});

test("task validation rejects a due date before its start date", () => {
  const result = taskSchema.safeParse({
    organizationId: "org-1",
    title: "Prepare launch notes",
    description: "",
    assignedToId: "",
    teamId: "",
    priority: "HIGH",
    status: "TODO",
    startDate: "2026-10-23T09:00:00.000Z",
    dueDate: "2026-10-22T09:00:00.000Z",
    estimatedHours: "4",
  });

  assert.equal(result.success, false);
  if (!result.success) assert.ok(result.error.issues.some((issue) => issue.path[0] === "dueDate"));
});

test("task validation normalizes optional values and numeric estimates", () => {
  const result = taskSchema.safeParse({
    organizationId: "org-1",
    title: "Prepare launch notes",
    description: "",
    assignedToId: "",
    teamId: "",
    priority: "MEDIUM",
    status: "IN_PROGRESS",
    startDate: "",
    dueDate: "",
    estimatedHours: "2.5",
  });

  assert.equal(result.success, true);
  if (result.success) {
    assert.equal(result.data.description, undefined);
    assert.equal(result.data.assignedToId, undefined);
    assert.equal(result.data.estimatedHours, 2.5);
  }
});

test("task comments enforce trimmed non-empty content and length limits", () => {
  assert.equal(taskCommentSchema.safeParse({ taskId: "task-1", body: "   " }).success, false);
  assert.equal(taskCommentSchema.safeParse({ taskId: "task-1", body: "x".repeat(3001) }).success, false);
  assert.equal(taskCommentSchema.safeParse({ taskId: "task-1", body: "  Looks good  " }).success, true);
});
