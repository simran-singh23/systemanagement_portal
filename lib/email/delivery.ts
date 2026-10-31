import "server-only";

import { Resend } from "resend";
import { prisma } from "@/lib/prisma";
import { databaseDate } from "@/lib/date-time";
import { buildDailyEmailReport } from "./report";
import { renderDailyEmail } from "./template";

export function emailSenderConfigured() {
  const sender = process.env.RESEND_FROM_EMAIL?.trim();
  const address = sender?.match(/<([^<>]+)>$/)?.[1] ?? sender;
  const url = process.env.AUTH_URL;
  try {
    return Boolean(process.env.RESEND_API_KEY?.trim() && address && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address) && url && (new URL(url).protocol === "https:" || process.env.NODE_ENV !== "production"));
  } catch { return false; }
}

function safeError(value: unknown) {
  return (value instanceof Error ? value.message : String(value)).replace(/re_[A-Za-z0-9_]+/g, "[redacted]").slice(0, 300);
}

type DeliveryResult = { status: "SUCCESS" | "FAILED" | "SKIPPED"; deliveredToProvider: number; reason?: string };

async function recordRun(organizationId: string, workDate: string, scheduledFor: string, runKey: string, result: DeliveryResult) {
  await prisma.automationExecution.upsert({ where: { runKey }, create: { organizationId, automation: "DAILY_EMAIL_REPORT", workDate: databaseDate(workDate), scheduledFor: new Date(scheduledFor), runKey, status: result.status, notificationsCreated: 0, metadata: { deliveredToProvider: result.deliveredToProvider, reason: result.reason ?? null } }, update: { status: result.status, executedAt: new Date(), errorSummary: result.status === "FAILED" ? result.reason : null, metadata: { deliveredToProvider: result.deliveredToProvider, reason: result.reason ?? null } } });
}

export async function deliverDailyEmail(organizationId: string, workDate: string, scheduledFor: string, runKey: string): Promise<DeliveryResult> {
  const date = databaseDate(workDate);
  const settings = await prisma.organizationSettings.findUnique({ where: { organizationId }, select: { dailyEmailEnabled: true, primaryReportRecipientId: true, additionalReportRecipientIds: true, timezone: true, workDays: true } });
  if (!settings?.dailyEmailEnabled || !settings.workDays.includes(date.getUTCDay())) {
    const result: DeliveryResult = { status: "SKIPPED", deliveredToProvider: 0, reason: "disabled_or_non_working_day" };
    await recordRun(organizationId, workDate, scheduledFor, runKey, result); return result;
  }
  const holiday = await prisma.organizationHoliday.findUnique({ where: { organizationId_holidayDate: { organizationId, holidayDate: date } }, select: { id: true } });
  if (holiday) { const result: DeliveryResult = { status: "SKIPPED", deliveredToProvider: 0, reason: "organization_holiday" }; await recordRun(organizationId, workDate, scheduledFor, runKey, result); return result; }
  if (!emailSenderConfigured()) { const result: DeliveryResult = { status: "SKIPPED", deliveredToProvider: 0, reason: "sender_unavailable" }; await recordRun(organizationId, workDate, scheduledFor, runKey, result); return result; }
  const recipientIds = [...new Set([settings.primaryReportRecipientId, ...settings.additionalReportRecipientIds].filter((id): id is string => Boolean(id)))];
  if (!recipientIds.length || !settings.primaryReportRecipientId) { const result: DeliveryResult = { status: "SKIPPED", deliveredToProvider: 0, reason: "no_primary_recipient" }; await recordRun(organizationId, workDate, scheduledFor, runKey, result); return result; }
  const recipients = await prisma.user.findMany({ where: { id: { in: recipientIds }, status: "ACTIVE", emailVerified: { not: null }, OR: [{ ownedOrganizations: { some: { id: organizationId } }, role: "SUPER_ADMIN" }, { organizationMembers: { some: { organizationId, status: "ACTIVE", role: { in: ["SUPER_ADMIN", "PRODUCT_MANAGER"] } } } }] }, select: { id: true, email: true } });
  if (recipients.length !== recipientIds.length || new Set(recipients.map((item) => item.email.toLowerCase())).size !== recipients.length) {
    const result: DeliveryResult = { status: "SKIPPED", deliveredToProvider: 0, reason: "recipient_authorization_changed" };
    await recordRun(organizationId, workDate, scheduledFor, runKey, result); return result;
  }
  const allowlist = process.env.NODE_ENV !== "production" ? new Set((process.env.RESEND_TEST_RECIPIENTS ?? "").split(",").map((value) => value.trim().toLowerCase()).filter(Boolean)) : null;
  if (allowlist && recipients.some((item) => !allowlist.has(item.email.toLowerCase()))) {
    const result: DeliveryResult = { status: "SKIPPED", deliveredToProvider: 0, reason: "test_recipient_not_allowlisted" };
    await recordRun(organizationId, workDate, scheduledFor, runKey, result); return result;
  }
  const report = await buildDailyEmailReport(organizationId, workDate, new Date(scheduledFor));
  if (!report) throw new Error("Daily team summary is not ready for email delivery.");
  const { html, text } = renderDailyEmail(report);
  const resend = new Resend(process.env.RESEND_API_KEY);
  let sent = 0;
  let failed = false;
  try {
    for (const recipient of recipients) {
      const recipientEmail = recipient.email.toLowerCase();
      const identity = { organizationId, reportDate: date, emailType: "DAILY_TEAM_REPORT", recipientEmail, reportVersion: 1 };
      const delivery = await prisma.emailDelivery.upsert({ where: { organizationId_reportDate_emailType_recipientEmail_reportVersion: identity }, create: identity, update: {} });
      if (delivery.status === "SENT" || delivery.status === "DELIVERED") continue;
      if (delivery.attemptCount >= 4) { failed = true; continue; }
      if (delivery.attemptCount > 0 && Date.now() - delivery.createdAt.getTime() >= 23 * 60 * 60_000) {
        await prisma.emailDelivery.update({ where: { id: delivery.id }, data: { status: "FAILED", lastError: "Automatic retry window expired; manual provider review required." } });
        failed = true;
        continue;
      }
      const stalled = delivery.status === "SENDING" && Date.now() - delivery.updatedAt.getTime() >= 5 * 60_000;
      if (delivery.status === "SENDING" && !stalled) { failed = true; continue; }
      if (delivery.status === "SENDING" && Date.now() - delivery.updatedAt.getTime() >= 23 * 60 * 60_000) {
        await prisma.emailDelivery.update({ where: { id: delivery.id }, data: { status: "FAILED", lastError: "Provider result is ambiguous after idempotency window; manual review required." } });
        failed = true;
        continue;
      }
      const claim = await prisma.emailDelivery.updateMany({ where: { id: delivery.id, status: delivery.status, updatedAt: delivery.updatedAt }, data: { status: "SENDING", attemptCount: { increment: 1 }, lastError: null } });
      if (!claim.count) { failed = true; continue; }
      let response;
      try {
        response = await resend.emails.send({ from: process.env.RESEND_FROM_EMAIL!, to: [recipientEmail], subject: `${report.organizationName} · Team report for ${workDate}`, html, text }, { idempotencyKey: `teamflow-daily-${delivery.id}` });
      } catch (error) {
        await prisma.emailDelivery.update({ where: { id: delivery.id }, data: { status: "FAILED", lastError: safeError(error) } });
        throw new Error(`Email provider request failed for delivery ${delivery.id}`);
      }
      if (response.error) {
        const permanent = response.error.statusCode != null && response.error.statusCode >= 400 && response.error.statusCode < 500 && response.error.statusCode !== 429;
        await prisma.emailDelivery.update({ where: { id: delivery.id }, data: { status: "FAILED", lastError: safeError(response.error.message), ...(permanent ? { attemptCount: 4 } : {}) } });
        if (!permanent) throw new Error(`Temporary email provider failure for delivery ${delivery.id}`);
        failed = true;
        continue;
      }
      if (!response.data?.id) { await prisma.emailDelivery.update({ where: { id: delivery.id }, data: { status: "FAILED", lastError: "Provider returned no message ID." } }); throw new Error(`Email provider returned no message ID for delivery ${delivery.id}`); }
      await prisma.emailDelivery.update({ where: { id: delivery.id }, data: { status: "SENT", providerMessageId: response.data.id, sentAt: new Date(), lastError: null } });
      sent += 1;
    }
    const result: DeliveryResult = { status: failed ? "FAILED" : "SUCCESS", deliveredToProvider: sent, ...(failed ? { reason: "one_or_more_recipients_failed" } : {}) };
    await recordRun(organizationId, workDate, scheduledFor, runKey, result);
    return result;
  } catch (error) {
    const result: DeliveryResult = { status: "FAILED", deliveredToProvider: sent, reason: safeError(error) };
    await recordRun(organizationId, workDate, scheduledFor, runKey, result);
    throw error;
  }
}
