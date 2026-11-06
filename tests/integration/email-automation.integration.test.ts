import assert from "node:assert/strict";
import { createHmac, randomUUID } from "node:crypto";
import test from "node:test";
import { assertSafeTestDatabaseUrl } from "../helpers/test-database";

const workDate = "2026-10-30";
const scheduledFor = `${workDate}T19:15:00.000Z`;
const webhookSecret = `whsec_${Buffer.from("teamflow-local-webhook-test-secret").toString("base64")}`;

test("email delivery, signed webhooks and office automations", {
  skip: !process.env.TEST_DATABASE_URL && "Set an explicit migrated local TEST_DATABASE_URL.",
}, async (context) => {
  const originalEnvironment = { ...process.env };
  const originalFetch = globalThis.fetch;
  process.env.DATABASE_URL = assertSafeTestDatabaseUrl(process.env.TEST_DATABASE_URL);
  process.env.RESEND_API_KEY = "re_local_test_only";
  process.env.RESEND_FROM_EMAIL = "TeamFlow <reports@teamflow.test>";
  process.env.RESEND_WEBHOOK_SECRET = webhookSecret;
  process.env.AUTH_URL = "https://teamflow.test";
  const { prisma } = await import("../../lib/prisma");
  const { deliverDailyEmail } = await import("../../lib/email/delivery");
  const { POST } = await import("../../app/api/webhooks/resend/route");
  const { buildDueAutomationEvents, executeAutomation } = await import("../../lib/automation");
  const { reportRecipientWhere } = await import("../../lib/email/recipients");

  type ProviderBody = { from: string; to: string[]; subject: string; html: string; text: string; tags: Array<{ name: string; value: string }> };
  let calls: Array<{ body: ProviderBody; key: string | null }> = [];
  let provider: (body: ProviderBody) => Promise<Response> = async () => Response.json({ id: randomUUID() });
  // Every fetch is intercepted. Unexpected network destinations fail the test.
  globalThis.fetch = async (input, init) => {
    assert.equal(String(input), "https://api.resend.com/emails");
    assert.equal(init?.method, "POST");
    const body = JSON.parse(String(init?.body)) as ProviderBody;
    calls.push({ body, key: new Headers(init?.headers).get("idempotency-key") });
    return provider(body);
  };

  function webhook(type: string, messageId: string, options: { deliveryId?: string; recipient?: string; invalidSignature?: boolean } = {}) {
    const payload = JSON.stringify({ type, created_at: scheduledFor, data: {
      email_id: messageId, from: "reports@teamflow.test", to: [options.recipient || "manager@teamflow.test"],
      subject: "Daily report", created_at: scheduledFor,
      ...(options.deliveryId ? { tags: { teamflow_delivery_id: options.deliveryId } } : {}),
    } });
    const id = `msg_${randomUUID()}`;
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = createHmac("sha256", Buffer.from(webhookSecret.slice(6), "base64")).update(`${id}.${timestamp}.${payload}`).digest("base64");
    return new Request("https://teamflow.test/api/webhooks/resend", {
      method: "POST", body: payload,
      headers: { "webhook-id": id, "webhook-timestamp": timestamp, "webhook-signature": `v1,${options.invalidSignature ? "bad" : signature}` },
    });
  }

  async function fixture() {
    calls = [];
    provider = async () => Response.json({ id: randomUUID() });
    const manager = await prisma.user.create({ data: { email: `manager-${randomUUID()}@teamflow.test`, name: "Manager", role: "SUPER_ADMIN", emailVerified: new Date() } });
    const employee = await prisma.user.create({ data: { email: `employee-${randomUUID()}@teamflow.test`, name: "Employee", emailVerified: new Date() } });
    const suspended = await prisma.user.create({ data: { email: `suspended-${randomUUID()}@teamflow.test`, name: "Suspended", status: "SUSPENDED" } });
    const organization = await prisma.organization.create({ data: {
      name: "Email test", slug: `email-${randomUUID()}`, ownerId: manager.id,
      members: { create: [{ userId: manager.id, role: "SUPER_ADMIN" }, { userId: employee.id, role: "EMPLOYEE" }, { userId: suspended.id, role: "EMPLOYEE" }] },
      settings: { create: { timezone: "UTC", workDays: [0, 1, 2, 3, 4, 5, 6], dailyEmailEnabled: true, primaryReportRecipientId: manager.id } },
    } });
    process.env.RESEND_TEST_RECIPIENTS = manager.email;
    const runKey = `${organization.id}:DAILY_EMAIL_REPORT:${workDate}`;
    await prisma.dailyTeamSummary.create({ data: { organizationId: organization.id, workDate: new Date(workDate), summaryData: { employeesExpected: 1 } } });
    return {
      manager, employee, suspended, organization, runKey,
      send: () => deliverDailyEmail(organization.id, workDate, scheduledFor, runKey),
      delivery: () => prisma.emailDelivery.findFirstOrThrow({ where: { organizationId: organization.id } }),
      clean: async () => {
        await prisma.organization.delete({ where: { id: organization.id } });
        await prisma.user.deleteMany({ where: { id: { in: [manager.id, employee.id, suspended.id] } } });
      },
    };
  }

  try {
    await context.test("duplicate sends are prevented and provider acceptance differs from delivery confirmation", async () => {
      const f = await fixture();
      try {
        assert.equal((await f.send()).status, "SUCCESS");
        const delivery = await f.delivery();
        assert.equal(delivery.status, "SENT");
        assert.equal(delivery.deliveredAt, null);
        assert.equal((await f.send()).status, "SUCCESS");
        assert.equal(calls.length, 1);
        assert.equal(calls[0].key, `teamflow-daily-${delivery.id}`);
        assert.equal((await POST(webhook("email.delivered", delivery.providerMessageId!, { recipient: f.manager.email }))).status, 200);
        assert.equal((await POST(webhook("email.delivered", delivery.providerMessageId!, { recipient: f.manager.email }))).status, 200);
        assert.equal((await f.delivery()).status, "DELIVERED");
      } finally { await f.clean(); }
    });

    await context.test("an early signed webhook survives the sender response and invalid signatures change nothing", async () => {
      const f = await fixture();
      try {
        const messageId = randomUUID();
        provider = async (body) => {
          const deliveryId = body.tags.find((tag) => tag.name === "teamflow_delivery_id")?.value;
          assert.ok(deliveryId);
          assert.equal((await POST(webhook("email.delivered", messageId, { deliveryId, recipient: f.manager.email, invalidSignature: true }))).status, 400);
          assert.equal((await f.delivery()).status, "SENDING");
          assert.equal((await POST(webhook("email.delivered", messageId, { deliveryId, recipient: f.manager.email }))).status, 200);
          return Response.json({ id: messageId });
        };
        await f.send();
        assert.equal((await f.delivery()).status, "DELIVERED");
        assert.equal((await f.delivery()).providerMessageId, messageId);
      } finally { await f.clean(); }
    });

    await context.test("temporary errors retry an identical stored request despite changes to the report", async () => {
      const f = await fixture();
      try {
        provider = async () => Response.json({ name: "application_error", statusCode: 503, message: "Temporary provider failure" }, { status: 503 });
        await assert.rejects(f.send());
        assert.equal((await f.delivery()).attemptCount, 1);
        await prisma.organization.update({ where: { id: f.organization.id }, data: { name: "Changed report content" } });
        provider = async () => Response.json({ id: randomUUID() });
        await f.send();
        assert.deepEqual(calls[0], calls[1]);
        assert.equal((await f.delivery()).attemptCount, 2);
      } finally { await f.clean(); }
    });

    await context.test("a concurrent sender causes a delayed retry without a second provider call", async () => {
      const f = await fixture();
      try {
        let notifyStarted!: () => void;
        let finishSend!: () => void;
        const started = new Promise<void>((resolve) => { notifyStarted = resolve; });
        const finish = new Promise<void>((resolve) => { finishSend = resolve; });
        provider = async () => { notifyStarted(); await finish; return Response.json({ id: randomUUID() }); };
        const first = f.send();
        await started;
        try { await assert.rejects(f.send(), { name: "RetryAfterError" }); }
        finally { finishSend(); await first; }
        assert.equal(calls.length, 1);
      } finally { await f.clean(); }
    });

    await context.test("bounces after delivery are recorded and cannot cause an automatic resend", async () => {
      const f = await fixture();
      try {
        await f.send();
        const delivery = await f.delivery();
        await POST(webhook("email.delivered", delivery.providerMessageId!, { recipient: f.manager.email }));
        await POST(webhook("email.bounced", delivery.providerMessageId!, { recipient: f.manager.email }));
        assert.equal((await f.delivery()).status, "FAILED");
        await POST(webhook("email.delivered", delivery.providerMessageId!, { recipient: f.manager.email }));
        assert.equal((await f.delivery()).status, "FAILED");
        assert.equal((await f.send()).status, "FAILED");
        assert.equal(calls.length, 1);
      } finally { await f.clean(); }
    });

    await context.test("permanent provider failures stop retries and store a failed automation run", async () => {
      const f = await fixture();
      try {
        provider = async () => Response.json({ name: "validation_error", statusCode: 422, message: "Invalid sender" }, { status: 422 });
        assert.equal((await f.send()).status, "FAILED");
        assert.equal((await f.send()).status, "FAILED");
        assert.equal(calls.length, 1);
        const run = await prisma.automationExecution.findUniqueOrThrow({ where: { runKey: f.runKey } });
        assert.equal(run.status, "FAILED");
        assert.ok(run.errorSummary);
      } finally { await f.clean(); }
    });

    await context.test("a provider idempotency conflict is retried instead of treated as permanent", async () => {
      const f = await fixture();
      try {
        provider = async () => Response.json({ name: "concurrent_idempotent_requests", statusCode: 409, message: "Another request is in progress" }, { status: 409 });
        await assert.rejects(f.send(), /Temporary email provider failure/);
        assert.equal((await f.delivery()).attemptCount, 1);
        provider = async () => Response.json({ id: randomUUID() });
        assert.equal((await f.send()).status, "SUCCESS");
        assert.deepEqual(calls[0], calls[1]);
      } finally { await f.clean(); }
    });

    await context.test("stalled sends recover within the retry window and stop after it expires", async () => {
      const f = await fixture();
      try {
        provider = async () => { throw new Error("Simulated connection interruption"); };
        await assert.rejects(f.send());
        const delivery = await f.delivery();
        await prisma.emailDelivery.update({ where: { id: delivery.id }, data: { status: "SENDING", updatedAt: new Date(Date.now() - 6 * 60_000) } });
        provider = async () => Response.json({ id: randomUUID() });
        await f.send();
        assert.equal((await f.delivery()).status, "SENT");
        assert.deepEqual(calls[0], calls[1]);
        // Simulate a send with an ambiguous provider outcome outside the safe retry window.
        await prisma.emailDelivery.update({ where: { id: delivery.id }, data: { status: "SENDING", providerMessageId: null, createdAt: new Date(Date.now() - 24 * 60 * 60_000), updatedAt: new Date(Date.now() - 24 * 60 * 60_000) } });
        assert.equal((await f.send()).status, "FAILED");
        assert.equal(calls.length, 2);
      } finally { await f.clean(); }
    });

    await context.test("legacy attempts without a saved payload require manual review", async () => {
      const f = await fixture();
      try {
        await prisma.emailDelivery.create({ data: { organizationId: f.organization.id, reportDate: new Date(workDate), recipientEmail: f.manager.email, status: "FAILED", attemptCount: 1 } });
        assert.equal((await f.send()).status, "FAILED");
        assert.equal(calls.length, 0);
        assert.match((await f.delivery()).lastError!, /original provider request was not saved/);
      } finally { await f.clean(); }
    });

    await context.test("missing summaries record a failure that can succeed on retry", async () => {
      const f = await fixture();
      try {
        await prisma.dailyTeamSummary.deleteMany({ where: { organizationId: f.organization.id } });
        await assert.rejects(f.send(), /summary is not ready/);
        const run = await prisma.automationExecution.findUniqueOrThrow({ where: { runKey: f.runKey } });
        assert.equal(run.status, "FAILED");
        assert.equal(calls.length, 0);
        await prisma.dailyTeamSummary.create({ data: { organizationId: f.organization.id, workDate: new Date(workDate), summaryData: {} } });
        assert.equal((await f.send()).status, "SUCCESS");
      } finally { await f.clean(); }
    });

    await context.test("signed events cannot update another recipient or replace a provider message ID", async () => {
      const f = await fixture();
      try {
        await f.send();
        const delivery = await f.delivery();
        assert.equal((await POST(webhook("email.delivered", delivery.providerMessageId!, { deliveryId: delivery.id, recipient: "other@teamflow.test" }))).status, 400);
        assert.equal((await POST(webhook("email.delivered", randomUUID(), { deliveryId: delivery.id, recipient: f.manager.email }))).status, 400);
        assert.equal((await f.delivery()).status, "SENT");
        assert.equal((await POST(webhook("email.delivered", randomUUID(), { deliveryId: "not-yet-persisted" }))).status, 503);
        assert.equal((await POST(webhook("email.delivered", randomUUID()))).status, 200);
      } finally { await f.clean(); }
    });

    await context.test("disabled delivery, holidays and recipient allowlists prevent provider calls", async () => {
      const f = await fixture();
      try {
        process.env.RESEND_TEST_RECIPIENTS = "";
        assert.equal((await f.send()).reason, "test_recipient_not_allowlisted");
        process.env.RESEND_TEST_RECIPIENTS = f.manager.email;
        await prisma.organizationSettings.update({ where: { organizationId: f.organization.id }, data: { dailyEmailEnabled: false } });
        assert.equal((await f.send()).reason, "disabled_or_non_working_day");
        await prisma.organizationSettings.update({ where: { organizationId: f.organization.id }, data: { dailyEmailEnabled: true } });
        await prisma.organizationHoliday.create({ data: { organizationId: f.organization.id, holidayDate: new Date(workDate), name: "Test holiday" } });
        assert.equal((await f.send()).reason, "organization_holiday");
        assert.equal(calls.length, 0);
      } finally { await f.clean(); }
    });

    await context.test("foreign, suspended and employee recipients are excluded from manager reports", async () => {
      const f = await fixture();
      const foreign = await prisma.user.create({ data: { email: `foreign-${randomUUID()}@teamflow.test`, role: "SUPER_ADMIN", emailVerified: new Date() } });
      try {
        assert.deepEqual((await prisma.user.findMany({ where: reportRecipientWhere(f.organization.id), select: { id: true } })).map((user) => user.id), [f.manager.id]);
        await prisma.organizationSettings.update({ where: { organizationId: f.organization.id }, data: { primaryReportRecipientId: foreign.id } });
        const result = await f.send();
        assert.equal(result.reason, "recipient_authorization_changed");
        assert.equal(calls.length, 0);
      } finally { await f.clean(); await prisma.user.delete({ where: { id: foreign.id } }); }
    });

    await context.test("the scheduler reads overnight policy, report requirements and holidays from storage", async () => {
      const f = await fixture();
      try {
        await prisma.organizationSettings.update({
          where: { organizationId: f.organization.id },
          data: {
            timezone: "Asia/Kolkata", workdayStart: "22:00", workdayEnd: "06:00", overnightShiftEnabled: true,
            checkInReminderTime: "21:30", checkInCutoffTime: "02:00",
            dailyReportReminderTime: "01:00", dailyReportDueTime: "02:00", requireDailyReports: false, dailyEmailEnabled: false,
          },
        });
        const { events } = await buildDueAutomationEvents(new Date("2026-10-30T21:00:00.000Z"));
        const scoped = events.filter((event) => event.organizationId === f.organization.id);
        assert.ok(!scoped.some((event) => event.automation === "DAILY_REPORT_REMINDER" || event.automation === "MISSING_DAILY_REPORT"));
        const cutoff = scoped.find((event) => event.automation === "MISSING_CHECK_IN");
        assert.ok(cutoff);
        assert.equal(cutoff.workDate, workDate);
        assert.equal(cutoff.scheduledFor, "2026-10-30T20:30:00.000Z");
        await prisma.organizationHoliday.create({ data: { organizationId: f.organization.id, holidayDate: new Date(workDate), name: "Holiday" } });
        const run = await executeAutomation(cutoff);
        assert.equal(run.status, "SKIPPED");
        assert.deepEqual(run.metadata, { reason: "organization_holiday" });
        assert.equal(await prisma.notification.count({ where: { organizationId: f.organization.id } }), 0);
      } finally { await f.clean(); }
    });

    await context.test("reminders exclude suspended accounts and duplicate execution does not duplicate notifications", async () => {
      const f = await fixture();
      try {
        const payload = { organizationId: f.organization.id, automation: "CHECK_IN_REMINDER" as const, workDate, scheduledFor, runKey: `${f.organization.id}:CHECK_IN_REMINDER:${workDate}` };
        await executeAutomation(payload);
        await executeAutomation(payload);
        const notifications = await prisma.notification.findMany({ where: { organizationId: f.organization.id } });
        assert.deepEqual(notifications.map((item) => item.userId), [f.employee.id]);
        await executeAutomation({ ...payload, automation: "DAILY_TEAM_SUMMARY", runKey: `${f.organization.id}:DAILY_TEAM_SUMMARY:${workDate}` });
        const summary = await prisma.dailyTeamSummary.findFirstOrThrow({ where: { organizationId: f.organization.id } });
        assert.equal((summary.summaryData as { employeesExpected: number }).employeesExpected, 1);
      } finally { await f.clean(); }
    });
  } finally {
    globalThis.fetch = originalFetch;
    for (const key of Object.keys(process.env)) if (!(key in originalEnvironment)) delete process.env[key];
    Object.assign(process.env, originalEnvironment);
    await prisma.$disconnect();
  }
});
