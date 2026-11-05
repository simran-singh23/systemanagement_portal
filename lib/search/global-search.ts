import "server-only";

import type { Prisma, UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { GlobalSearchResponse, SearchResult } from "@/lib/search/types";
import { searchAccessScopes } from "@/lib/search/access";
import { databaseDate, isValidDateKey } from "@/lib/date-time";

type SearchActor = { id: string; role: UserRole };
const LIMIT = 5;

function enumMatches<T extends string>(query: string, values: readonly T[]) {
  const normalized = query.toUpperCase().replace(/[\s-]+/g, "_");
  return values.filter((value) => value.includes(normalized));
}

export async function globalSearch(actor: SearchActor, query: string): Promise<GlobalSearchResponse | null> {
  const membership = await prisma.organizationMember.findFirst({
    where: { userId: actor.id, status: "ACTIVE" },
    select: { organizationId: true, role: true, organization: { select: { ownerId: true } } },
    orderBy: { createdAt: "asc" },
  });
  const owned = membership ? null : actor.role === "SUPER_ADMIN" ? await prisma.organization.findFirst({ where: { ownerId: actor.id }, select: { id: true }, orderBy: { createdAt: "asc" } }) : null;
  const organizationId = membership?.organizationId ?? owned?.id;
  if (!organizationId) return null;
  const role = membership?.role ?? actor.role;
  const { manager, taskScope, userScope } = searchAccessScopes(role, actor.id, organizationId);
  const leadUserScope = role === "TEAM_LEAD" ? userScope : {};
  const dateQuery = isValidDateKey(query) ? databaseDate(query) : null;
  const taskStatuses = enumMatches(query, ["TODO", "IN_PROGRESS", "BLOCKED", "REVIEW", "COMPLETED"] as const);
  const employeeRoles = enumMatches(query, ["SUPER_ADMIN", "PRODUCT_MANAGER", "TEAM_LEAD", "EMPLOYEE"] as const);
  const attendanceStatuses = enumMatches(query, ["PRESENT", "ABSENT", "LATE", "HALF_DAY", "REMOTE", "ON_LEAVE"] as const);
  const leaveTypes = enumMatches(query, ["CASUAL", "SICK", "EARNED", "UNPAID", "OTHER"] as const);
  const leaveStatuses = enumMatches(query, ["PENDING", "APPROVED", "REJECTED", "CANCELLED"] as const);

  const employeePromise = manager ? prisma.organizationMember.findMany({
    where: { organizationId, status: "ACTIVE", ...(role === "TEAM_LEAD" ? { user: leadUserScope } : {}), OR: [{ user: { name: { contains: query, mode: "insensitive" } } }, { user: { email: { contains: query, mode: "insensitive" } } }, { user: { jobTitle: { contains: query, mode: "insensitive" } } }, { department: { contains: query, mode: "insensitive" } }, { user: { teamMembers: { some: { team: { organizationId, name: { contains: query, mode: "insensitive" } } } } } }, ...(employeeRoles.length ? [{ role: { in: employeeRoles } }] : [])] },
    select: { userId: true, department: true, role: true, user: { select: { name: true, email: true, jobTitle: true, teamMembers: { where: { team: { organizationId } }, select: { team: { select: { name: true } } }, take: 1 } } } },
    orderBy: { user: { name: "asc" } }, take: LIMIT,
  }) : Promise.resolve([]);
  const taskWhere: Prisma.TaskWhereInput = { organizationId, archivedAt: null, ...taskScope, OR: [{ id: { contains: query, mode: "insensitive" } }, { title: { contains: query, mode: "insensitive" } }, { description: { contains: query, mode: "insensitive" } }, { assignedTo: { name: { contains: query, mode: "insensitive" } } }, { assignedTo: { email: { contains: query, mode: "insensitive" } } }, ...(taskStatuses.length ? [{ status: { in: taskStatuses } } as Prisma.TaskWhereInput] : [])] };
  const reportWhere: Prisma.DailyReportWhereInput = { organizationId, user: userScope, OR: [{ user: { name: { contains: query, mode: "insensitive" } } }, { user: { email: { contains: query, mode: "insensitive" } } }, ...(manager ? [{ summary: { contains: query, mode: "insensitive" } } as Prisma.DailyReportWhereInput] : []), ...(dateQuery ? [{ reportDate: dateQuery }] : [])] };
  const attendanceWhere: Prisma.AttendanceWhereInput = { organizationId, user: userScope, OR: [{ user: { name: { contains: query, mode: "insensitive" } } }, { user: { email: { contains: query, mode: "insensitive" } } }, ...(dateQuery ? [{ attendanceDate: dateQuery }] : []), ...(attendanceStatuses.length ? [{ status: { in: attendanceStatuses } } as Prisma.AttendanceWhereInput] : [])] };
  const leaveWhere: Prisma.LeaveRequestWhereInput = { organizationId, user: userScope, OR: [{ user: { name: { contains: query, mode: "insensitive" } } }, { user: { email: { contains: query, mode: "insensitive" } } }, ...(leaveTypes.length ? [{ type: { in: leaveTypes } } as Prisma.LeaveRequestWhereInput] : []), ...(leaveStatuses.length ? [{ status: { in: leaveStatuses } } as Prisma.LeaveRequestWhereInput] : []), ...(dateQuery ? [{ startDate: { lte: dateQuery }, endDate: { gte: dateQuery } }] : [])] };

  const [employees, tasks, reports, attendance, leave] = await Promise.all([
    employeePromise,
    prisma.task.findMany({ where: taskWhere, select: { id: true, title: true, status: true, assignedTo: { select: { name: true, email: true } }, team: { select: { name: true } } }, orderBy: [{ updatedAt: "desc" }, { id: "asc" }], take: LIMIT }),
    prisma.dailyReport.findMany({ where: reportWhere, select: { id: true, reportDate: true, status: true, summary: true, user: { select: { name: true, email: true } } }, orderBy: [{ reportDate: "desc" }, { id: "asc" }], take: LIMIT }),
    prisma.attendance.findMany({ where: attendanceWhere, select: { id: true, attendanceDate: true, status: true, user: { select: { name: true, email: true } } }, orderBy: [{ attendanceDate: "desc" }, { id: "asc" }], take: LIMIT }),
    prisma.leaveRequest.findMany({ where: leaveWhere, select: { id: true, startDate: true, endDate: true, type: true, status: true, user: { select: { name: true, email: true } } }, orderBy: [{ createdAt: "desc" }, { id: "asc" }], take: LIMIT }),
  ]);

  const groups: GlobalSearchResponse["groups"] = [
    { category: "employees", label: "Employees", results: employees.map((item): SearchResult => ({ id: item.userId, category: "employees", title: item.user.name || item.user.email, description: [item.user.jobTitle, item.department, item.user.teamMembers[0]?.team.name, item.role.replaceAll("_", " ")].filter(Boolean).join(" · "), href: `/dashboard/employees/${item.userId}` })) },
    { category: "tasks", label: "Tasks", results: tasks.map((item): SearchResult => ({ id: item.id, category: "tasks", title: item.title, description: `${item.status.replaceAll("_", " ")} · ${item.assignedTo?.name || item.assignedTo?.email || item.team?.name || "Unassigned"}`, href: manager ? `/dashboard/tasks?edit=${item.id}` : `/employee/tasks?task=${item.id}` })) },
    { category: "reports", label: "Daily reports", results: reports.map((item): SearchResult => ({ id: item.id, category: "reports", title: `Daily report — ${item.reportDate.toISOString().slice(0, 10)}`, description: manager ? `${item.user.name || item.user.email} · ${item.status}` : item.status, href: manager ? `/dashboard/reports/${item.id}` : "/employee/reports" })) },
    { category: "attendance", label: "Attendance", results: attendance.map((item): SearchResult => ({ id: item.id, category: "attendance", title: `${item.user.name || item.user.email} — ${item.attendanceDate.toISOString().slice(0, 10)}`, description: item.status.replaceAll("_", " "), href: manager ? `/dashboard/attendance?date=${item.attendanceDate.toISOString().slice(0, 10)}&q=${encodeURIComponent(item.user.email)}` : "/employee/attendance" })) },
    { category: "leave", label: "Leave requests", results: leave.map((item): SearchResult => ({ id: item.id, category: "leave", title: `${item.user.name || item.user.email} — ${item.type.replaceAll("_", " ")}`, description: `${item.startDate.toISOString().slice(0, 10)} to ${item.endDate.toISOString().slice(0, 10)} · ${item.status}`, href: manager ? `/dashboard/leave?request=${item.id}` : "/employee/leave" })) },
  ];
  return { query, groups: groups.filter((group) => group.results.length) };
}
