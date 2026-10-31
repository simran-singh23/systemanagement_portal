import "server-only";

import type { Notification, NotificationType, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { safeNotificationDestination } from "@/lib/notification-routing";

export const NOTIFICATION_PAGE_SIZE = 12;
export const NOTIFICATION_PREVIEW_SIZE = 6;

export type NotificationDTO = {
  id: string;
  type: NotificationType;
  title: string;
  message: string | null;
  destination: string;
  readAt: string | null;
  createdAt: string;
};

export function notificationDTO(notification: Pick<Notification, "id" | "type" | "title" | "message" | "link" | "readAt" | "createdAt">): NotificationDTO {
  return { id: notification.id, type: notification.type, title: notification.title, message: notification.message, destination: safeNotificationDestination(notification.link), readAt: notification.readAt?.toISOString() ?? null, createdAt: notification.createdAt.toISOString() };
}

export type NotificationEvent = {
  organizationId: string;
  userId: string;
  actorId?: string | null;
  type: NotificationType;
  title: string;
  message?: string | null;
  link?: string | null;
  relatedEntityType?: string | null;
  relatedEntityId?: string | null;
  eventId: string;
  metadata?: Prisma.InputJsonValue;
};

export async function createNotification(tx: Prisma.TransactionClient, event: NotificationEvent) {
  return tx.notification.upsert({
    where: { userId_eventId: { userId: event.userId, eventId: event.eventId } },
    create: event,
    update: {},
  });
}

export async function createNotifications(tx: Prisma.TransactionClient, recipientIds: readonly string[], event: Omit<NotificationEvent, "userId">) {
  const uniqueRecipients = [...new Set(recipientIds)];
  if (!uniqueRecipients.length) return 0;
  const result = await tx.notification.createMany({ data: uniqueRecipients.map((userId) => ({ ...event, userId })), skipDuplicates: true });
  return result.count;
}

export async function getAuthorizedReviewerIds(tx: Prisma.TransactionClient, organizationId: string, subjectUserId: string) {
  const [organization, managers, managedTeams] = await Promise.all([
    tx.organization.findUnique({ where: { id: organizationId }, select: { ownerId: true } }),
    tx.organizationMember.findMany({ where: { organizationId, status: "ACTIVE", role: { in: ["SUPER_ADMIN", "PRODUCT_MANAGER"] } }, select: { userId: true } }),
    tx.teamMember.findMany({ where: { userId: subjectUserId, team: { organizationId, managerId: { not: null } } }, select: { team: { select: { managerId: true } } } }),
  ]);
  return [...new Set([organization?.ownerId, ...managers.map((item) => item.userId), ...managedTeams.map((item) => item.team.managerId)].filter((id): id is string => Boolean(id) && id !== subjectUserId))];
}

export async function notificationOrganizationIds(userId: string) {
  const [memberships, owned] = await Promise.all([
    prisma.organizationMember.findMany({ where: { userId, status: "ACTIVE" }, select: { organizationId: true } }),
    prisma.organization.findMany({ where: { ownerId: userId }, select: { id: true } }),
  ]);
  return [...new Set([...memberships.map((item) => item.organizationId), ...owned.map((item) => item.id)])];
}

export function notificationScope(userId: string, organizationIds: readonly string[]): Prisma.NotificationWhereInput {
  return { userId, OR: [{ organizationId: null }, { organizationId: { in: [...organizationIds] } }] };
}

export async function getNotificationPreview(userId: string) {
  const organizationIds = await notificationOrganizationIds(userId);
  const scope = notificationScope(userId, organizationIds);
  const [notifications, unreadCount] = await Promise.all([
    prisma.notification.findMany({ where: scope, orderBy: { createdAt: "desc" }, take: NOTIFICATION_PREVIEW_SIZE }),
    prisma.notification.count({ where: { AND: [scope, { readAt: null }] } }),
  ]);
  return { notifications: notifications.map(notificationDTO), unreadCount };
}

export const notificationCategories = {
  TASK: ["TASK_ASSIGNED", "TASK_UPDATED", "COMMENT_MENTION"],
  ATTENDANCE: ["ATTENDANCE", "BREAK"],
  LEAVE: ["LEAVE_REQUESTED", "LEAVE_UPDATED"],
  REPORT: ["REPORT_DUE", "REPORT_REVIEWED", "REPORT_SUBMITTED"],
  SYSTEM: ["SYSTEM"],
} as const satisfies Record<string, readonly NotificationType[]>;
