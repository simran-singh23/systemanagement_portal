import { z } from "zod";
import { taskDateSchema } from "./task-dates";
import { isValidDateKey } from "./date-time";

export const assignableRoles = [
  "PRODUCT_MANAGER",
  "TEAM_LEAD",
  "EMPLOYEE",
] as const;

const optionalText = z
  .string()
  .trim()
  .max(120)
  .transform((value) => value || undefined);

export const employeeSchema = z.object({
  organizationId: z.string().min(1),
  name: z.string().trim().min(2, "Name must be at least 2 characters.").max(100),
  email: z.string().trim().toLowerCase().email("Enter a valid work email."),
  jobTitle: optionalText,
  department: optionalText,
  role: z.enum(assignableRoles),
  teamId: z.string().optional().transform((value) => value || undefined),
});

export const employeeUpdateSchema = employeeSchema.omit({ email: true }).extend({
  status: z.enum(["ACTIVE", "INVITED", "SUSPENDED"]),
});

export const teamSchema = z.object({
  organizationId: z.string().min(1),
  name: z.string().trim().min(2, "Team name must be at least 2 characters.").max(80),
  description: z.string().trim().max(500).transform((value) => value || undefined),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Choose a valid team color."),
  managerId: z.string().optional().transform((value) => value || undefined),
  memberIds: z.array(z.string()).max(100),
});

export const taskStatuses = ["TODO", "IN_PROGRESS", "BLOCKED", "REVIEW", "COMPLETED"] as const;
export const taskPriorities = ["LOW", "MEDIUM", "HIGH", "URGENT"] as const;

const optionalId = z.string().trim().optional().transform((value) => value || undefined);
const optionalDate = z.string().trim().optional().transform((value) => value || undefined).refine(
  (value) => !value || taskDateSchema.safeParse(value).success,
  "Enter a valid date and time.",
);

export const taskSchema = z.object({
  organizationId: z.string().min(1),
  title: z.string().trim().min(3, "Task title must be at least 3 characters.").max(160),
  description: z.string().trim().max(5000, "Description is too long.").transform((value) => value || undefined),
  assignedToId: optionalId,
  teamId: optionalId,
  priority: z.enum(taskPriorities),
  status: z.enum(taskStatuses),
  startDate: optionalDate,
  dueDate: optionalDate,
  estimatedHours: z.preprocess(
    (value) => value === "" ? undefined : value,
    z.coerce.number().min(0.25, "Estimate must be at least 15 minutes.").max(1000).optional(),
  ),
}).superRefine((data, context) => {
  if (data.startDate && data.dueDate && new Date(data.dueDate) < new Date(data.startDate)) {
    context.addIssue({ code: "custom", path: ["dueDate"], message: "Due date must be after the start date." });
  }
});

export const employeeTaskStatusSchema = z.object({
  taskId: z.string().min(1),
  status: z.enum(taskStatuses),
});

export const boardMoveSchema = z.object({
  taskId: z.string().min(1),
  fromStatus: z.enum(taskStatuses),
  toStatus: z.enum(taskStatuses),
  columns: z.array(z.object({
    status: z.enum(taskStatuses),
    taskIds: z.array(z.string().min(1)).max(500),
  })).min(1).max(2),
});

export const taskCommentSchema = z.object({
  taskId: z.string().min(1),
  body: z.string().trim().min(1, "Write a comment before posting.").max(3000, "Comment is too long."),
});

export const taskCommentUpdateSchema = taskCommentSchema.extend({ commentId: z.string().min(1) });

export const attendanceActionSchema = z.object({ organizationId: z.string().min(1) });

export const taskTimerSchema = z.object({
  organizationId: z.string().min(1),
  taskId: z.string().min(1),
});

export const breakActionSchema = z.object({
  organizationId: z.string().min(1),
  type: z.enum(["LUNCH", "TEA", "PERSONAL", "OTHER"]),
});

export const dailyReportSchema = z.object({
  organizationId: z.string().min(1),
  reportDate: z.string().refine(isValidDateKey, "Choose a valid report date."),
  summary: z.string().trim().min(10, "Describe today’s work in at least 10 characters.").max(5000),
  completedWork: z.string().trim().max(3000).transform((value) => value || undefined),
  progress: z.string().trim().max(3000).transform((value) => value || undefined),
  blockers: z.string().trim().max(3000).transform((value) => value || undefined),
  nextPlan: z.string().trim().max(3000).transform((value) => value || undefined),
  additionalNotes: z.string().trim().max(3000).transform((value) => value || undefined),
  pulse: z.enum(["SMOOTH", "NORMAL", "BLOCKED"]),
  pulseBlocker: z.string().trim().max(2000).transform((value) => value || undefined),
}).superRefine((data, context) => {
  if (data.pulse === "BLOCKED" && !data.pulseBlocker) context.addIssue({ code: "custom", path: ["pulseBlocker"], message: "Describe the work blocker when pulse is blocked." });
});

export const leaveTypes = ["CASUAL", "SICK", "EARNED", "UNPAID", "OTHER"] as const;
export const leaveStatuses = ["PENDING", "APPROVED", "REJECTED", "CANCELLED"] as const;
const dateKey = z.string().refine(isValidDateKey, "Choose a valid date.");

export const leaveRequestSchema = z.object({
  organizationId: z.string().min(1),
  type: z.enum(leaveTypes),
  startDate: dateKey,
  endDate: dateKey,
  reason: z.string().trim().min(10, "Explain the leave request in at least 10 characters.").max(3000),
  notes: z.string().trim().max(3000).transform((value) => value || undefined),
}).superRefine((data, context) => {
  if (data.startDate > data.endDate) context.addIssue({ code: "custom", path: ["endDate"], message: "End date cannot be before the start date." });
});

export const leaveCancelSchema = z.object({ organizationId: z.string().min(1), leaveRequestId: z.string().min(1) });
export const leaveDecisionSchema = leaveCancelSchema.extend({
  decisionNotes: z.string().trim().max(3000).transform((value) => value || undefined),
});

export const notificationIdSchema = z.object({ notificationId: z.string().min(1) });
export const notificationFiltersSchema = z.object({
  q: z.string().trim().max(120).optional(),
  category: z.enum(["TASK", "ATTENDANCE", "LEAVE", "REPORT", "SYSTEM"]).optional(),
  type: z.enum(["TASK_ASSIGNED", "TASK_UPDATED", "COMMENT_MENTION", "BREAK", "REPORT_DUE", "REPORT_REVIEWED", "REPORT_SUBMITTED", "LEAVE_REQUESTED", "LEAVE_UPDATED", "ATTENDANCE", "SYSTEM"]).optional(),
  read: z.enum(["UNREAD", "READ"]).optional(),
  date: z.string().refine(isValidDateKey).optional(),
  page: z.coerce.number().int().min(1).max(10000).default(1),
});

export type FormState = {
  success?: boolean;
  message?: string;
  errors?: Record<string, string[]>;
};
