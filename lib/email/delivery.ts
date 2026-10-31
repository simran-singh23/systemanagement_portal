import "server-only";

import { Resend } from "resend";
import { RetryAfterError } from "inngest";
import { prisma } from "@/lib/prisma";
import { databaseDate } from "@/lib/date-time";
import { buildDailyEmailReport } from "./report";
import { renderDailyEmail } from "./template";
import { reportRecipientWhere } from "./recipients";
import { emailRequestSchema } from "./provider-request";

export function emailSenderConfigured() {
  const sender = process.env.RESEND_FROM_EMAIL?.trim();
  const address = sender?.match(/<([^<>]+)>$/)?.[1] ?? sender;
  const url = process.env.AUTH_URL;
  try {
    return Boolean(process.env.RESEND_API_KEY?.trim() && address && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address) && url && (new URL(url).protocol === "https:" || process.env.NODE_ENV !== "production"));
  } catch { return false; }
}

function safeError(value: unknown) {
  return (value instanceof Error ? value.message : String(value)).replace(/re_[A-Za-z0-9_]+/g, "[redacted]").replace(/postgres(?:ql)?:\/\/[^\s]+/gi, "[database-url-redacted]").slice(0, 300);
}

type DeliveryResult = { status: "SUCCESS" | "FAILED" | "SKIPPED"; deliveredToProvider: number; reason?: string };

async function recordRun(organizationId: string, workDate: string, scheduledFor: string, runKey: string, result: DeliveryResult) {
  const errorSummary = result.status === "FAILED" ? result.reason : null;
  const metadata = { deliveredToProvider: result.deliveredToProvider, reason: result.reason ?? null };
  await prisma.automationExecution.upsert({ where: { runKey }, create: { organizationId, automation: "DAILY_EMAIL_REPORT", workDate: databaseDate(workDate), scheduledFor: new Date(scheduledFor), runKey, status: result.status, notificationsCreated: 0, errorSummary, metadata }, update: { status: result.status, executedAt: new Date(), errorSummary, metadata } });
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
  const recipients = await prisma.user.findMany({ where: { ...reportRecipientWhere(organizationId), id: { in: recipientIds } }, select: { id: true, email: true } });
  if (recipients.length !== recipientIds.length || new Set(recipients.map((item) => item.email.toLowerCase())).size !== recipients.length) {
    const result: DeliveryResult = { status: "SKIPPED", deliveredToProvider: 0, reason: "recipient_authorization_changed" };
    await recordRun(organizationId, workDate, scheduledFor, runKey, result); return result;
  }
  const allowlist = process.env.NODE_ENV !== "production" ? new Set((process.env.RESEND_TEST_RECIPIENTS ?? "").split(",").map((value) => value.trim().toLowerCase()).filter(Boolean)) : null;
  if (allowlist && recipients.some((item) => !allowlist.has(item.email.toLowerCase()))) {
    const result: DeliveryResult = { status: "SKIPPED", deliveredToProvider: 0, reason: "test_recipient_not_allowlisted" };
    await recordRun(organizationId, workDate, scheduledFor, runKey, result); return result;
  }
  const resend = new Resend(process.env.RESEND_API_KEY);
  let sent = 0;
  let failed = false;
  try {
    for (const recipient of recipients) {
      const recipientEmail = recipient.email.toLowerCase();
      const identity = { organizationId, reportDate: date, emailType: "DAILY_TEAM_REPORT", recipientEmail, reportVersion: 1 };
      const delivery = await prisma.emailDelivery.upsert({ where: { organizationId_reportDate_emailType_recipientEmail_reportVersion: identity }, create: identity, update: {} });
      if (delivery.status === "SENT" || delivery.status === "DELIVERED") continue;
      // A provider ID means a send was accepted already. A later failure/bounce
      // requires review, not another automatic attempt at the same message.
      if (delivery.providerMessageId) { failed = true; continue; }
      if (delivery.attemptCount >= 4) { failed = true; continue; }
      const snapshot = { id: delivery.id, status: delivery.status, updatedAt: delivery.updatedAt, attemptCount: delivery.attemptCount, providerMessageId: null };
      if (delivery.attemptCount > 0 && Date.now() - delivery.createdAt.getTime() >= 23 * 60 * 60_000) {
        await prisma.emailDelivery.updateMany({ where: snapshot, data: { status: "FAILED", lastError: "Automatic retry window expired; manual provider review required." } });
        failed = true;
        continue;
      }
      const stalled = delivery.status === "SENDING" && Date.now() - delivery.updatedAt.getTime() >= 5 * 60_000;
      if (delivery.status === "SENDING" && !stalled) throw new RetryAfterError("Email delivery is already in progress.", "5m");
      if (delivery.attemptCount > 0 && !delivery.requestPayload) {
        await prisma.emailDelivery.updateMany({ where: snapshot, data: { status: "FAILED", attemptCount: 4, lastError: "The original provider request was not saved. Review the previous send before retrying." } });
        failed = true;
        continue;
      }
      let requestPayload;
      if (delivery.requestPayload) requestPayload = emailRequestSchema.parse(delivery.requestPayload);
      else {
        const report = await buildDailyEmailReport(organizationId, workDate, new Date(scheduledFor));
        if (!report) throw new Error("Daily team summary is not ready for email delivery.");
        requestPayload = { from: process.env.RESEND_FROM_EMAIL!, subject: `${report.organizationName} · Team report for ${workDate}`, ...renderDailyEmail(report) };
      }
      const claim = await prisma.emailDelivery.updateMany({ where: snapshot, data: { status: "SENDING", attemptCount: { increment: 1 }, lastError: null, requestPayload } });
      if (!claim.count) throw new RetryAfterError("Email delivery was claimed by another request.", "5m");
      const claimed = { id: delivery.id, status: "SENDING" as const, attemptCount: delivery.attemptCount + 1, providerMessageId: null };
      let response;
      try {
        response = await resend.emails.send({ ...requestPayload, to: [recipientEmail], tags: [{ name: "teamflow_delivery_id", value: delivery.id }] }, { idempotencyKey: `teamflow-daily-${delivery.id}`, signal: AbortSignal.timeout(30_000) });
      } catch (error) {
        await prisma.emailDelivery.updateMany({ where: claimed, data: { status: "FAILED", lastError: safeError(error) } });
        throw new Error(`Email provider request failed for delivery ${delivery.id}`);
      }
      if (response.error) {
        const retryableConflict = ["concurrent_idempotent_requests", "resource_locked"].includes(response.error.name);
        const permanent = response.error.statusCode != null && response.error.statusCode >= 400 && response.error.statusCode < 500 && ![408, 429].includes(response.error.statusCode) && !retryableConflict;
        await prisma.emailDelivery.updateMany({ where: claimed, data: { status: "FAILED", lastError: safeError(response.error.message), ...(permanent ? { attemptCount: 4 } : {}) } });
        if (!permanent) throw new Error(`Temporary email provider failure for delivery ${delivery.id}`);
        failed = true;
        continue;
      }
      if (!response.data?.id) { await prisma.emailDelivery.updateMany({ where: claimed, data: { status: "FAILED", lastError: "Provider returned no message ID." } }); throw new Error(`Email provider returned no message ID for delivery ${delivery.id}`); }
      // A signed webhook can arrive before the response. Never overwrite it.
      await prisma.emailDelivery.updateMany({ where: claimed, data: { status: "SENT", providerMessageId: response.data.id, sentAt: new Date(), lastError: null } });
      if ((await prisma.emailDelivery.findUniqueOrThrow({ where: { id: delivery.id } })).status === "FAILED") failed = true;
      sent += 1;
    }
    const result: DeliveryResult = { status: failed ? "FAILED" : "SUCCESS", deliveredToProvider: sent, ...(failed ? { reason: "one_or_more_recipients_failed" } : {}) };
    await recordRun(organizationId, workDate, scheduledFor, runKey, result);
    return result;
  } catch (error) {
    const result: DeliveryResult = { status: "FAILED", deliveredToProvider: sent, reason: safeError(error) };
    await recordRun(organizationId, workDate, scheduledFor, runKey, result);
    if (error instanceof RetryAfterError) throw error;
    throw new Error(safeError(error));
  }
}
