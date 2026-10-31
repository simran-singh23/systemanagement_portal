"use server";

import { revalidatePath } from "next/cache";
import type { NotificationType, Prisma } from "@prisma/client";
import { requireUser } from "@/lib/dal/auth";
import { databaseDate, shiftDateKey } from "@/lib/date-time";
import { NOTIFICATION_PAGE_SIZE, notificationCategories, notificationDTO, notificationOrganizationIds, notificationScope } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";
import { notificationFiltersSchema, notificationIdSchema, type FormState } from "@/lib/validations";

export async function getMyNotifications(input: unknown = {}) {
  const user = await requireUser();
  const parsed = notificationFiltersSchema.safeParse(input);
  const filters = parsed.success ? parsed.data : notificationFiltersSchema.parse({});
  const organizationIds = await notificationOrganizationIds(user.id);
  const scope = notificationScope(user.id, organizationIds);
  const categoryTypes = filters.category ? notificationCategories[filters.category] : undefined;
  const where: Prisma.NotificationWhereInput = {
    AND: [scope],
    ...(filters.q ? { OR: [{ title: { contains: filters.q, mode: "insensitive" } }, { message: { contains: filters.q, mode: "insensitive" } }] } : {}),
    ...(filters.type ? { type: filters.type } : categoryTypes ? { type: { in: [...categoryTypes] } } : {}),
    ...(filters.read === "UNREAD" ? { readAt: null } : filters.read === "READ" ? { readAt: { not: null } } : {}),
    ...(filters.date ? { createdAt: { gte: databaseDate(filters.date), lt: databaseDate(shiftDateKey(filters.date, 1)) } } : {}),
  };
  const [notifications, total, unread] = await Promise.all([
    prisma.notification.findMany({ where, orderBy: { createdAt: "desc" }, skip: (filters.page - 1) * NOTIFICATION_PAGE_SIZE, take: NOTIFICATION_PAGE_SIZE }),
    prisma.notification.count({ where }),
    prisma.notification.count({ where: { AND: [scope, { readAt: null }] } }),
  ]);
  return { notifications: notifications.map(notificationDTO), total, unread, page: filters.page, pages: Math.max(1, Math.ceil(total / NOTIFICATION_PAGE_SIZE)) };
}

export async function getUnreadNotificationCount() {
  const user = await requireUser();
  const organizationIds = await notificationOrganizationIds(user.id);
  return prisma.notification.count({ where: { AND: [notificationScope(user.id, organizationIds), { readAt: null }] } });
}

export async function getNotificationsByType(type: NotificationType, page = 1) {
  return getMyNotifications({ type, page });
}

export async function markNotificationAsRead(notificationId: string): Promise<FormState> {
  const parsed = notificationIdSchema.safeParse({ notificationId });
  if (!parsed.success) return { message: "The notification could not be verified." };
  const user = await requireUser();
  const organizationIds = await notificationOrganizationIds(user.id);
  const notification = await prisma.notification.findFirst({ where: { id: parsed.data.notificationId, AND: [notificationScope(user.id, organizationIds)] }, select: { id: true, readAt: true } });
  if (!notification) return { message: "This notification is unavailable." };
  if (!notification.readAt) await prisma.notification.update({ where: { id: notification.id }, data: { readAt: new Date() } });
  revalidatePath("/notifications");
  return { success: true };
}

export async function markAllNotificationsAsRead(): Promise<FormState> {
  const user = await requireUser();
  const organizationIds = await notificationOrganizationIds(user.id);
  await prisma.notification.updateMany({ where: { AND: [notificationScope(user.id, organizationIds), { readAt: null }] }, data: { readAt: new Date() } });
  revalidatePath("/notifications");
  return { success: true, message: "All notifications marked as read." };
}
