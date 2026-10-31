import { createHmac, randomUUID } from "node:crypto";
import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { assertSafeTestDatabaseUrl } from "../helpers/test-database";

test.skip(!process.env.TEST_DATABASE_URL, "Set a migrated local TEST_DATABASE_URL for webhook persistence tests.");

test("signed delivery webhooks update the actual HTTP endpoint and reject tampering", async ({ request }) => {
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: assertSafeTestDatabaseUrl(process.env.TEST_DATABASE_URL) }) });
  const recipientEmail = `webhook-${randomUUID()}@teamflow.test`;
  const owner = await prisma.user.create({ data: { email: recipientEmail } });
  let organizationId: string | undefined;
  try {
    const organization = await prisma.organization.create({ data: { name: "Webhook test", slug: `webhook-${randomUUID()}`, ownerId: owner.id } });
    organizationId = organization.id;
    const providerMessageId = randomUUID();
    const delivery = await prisma.emailDelivery.create({ data: { organizationId, recipientEmail, reportDate: new Date("2026-10-30"), status: "SENDING", attemptCount: 1 } });
    const payload = JSON.stringify({ type: "email.delivered", created_at: new Date().toISOString(), data: {
      email_id: providerMessageId, to: [recipientEmail], tags: { teamflow_delivery_id: delivery.id },
    } });
    const id = `msg_${randomUUID()}`;
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = createHmac("sha256", "teamflow-local-browser-webhook-secret").update(`${id}.${timestamp}.${payload}`).digest("base64");
    const headers = { "webhook-id": id, "webhook-timestamp": timestamp, "webhook-signature": `v1,${signature}`, "content-type": "application/json" };
    const tampered = await request.post("/api/webhooks/resend", { headers, data: payload.replace("email.delivered", "email.bounced") });
    expect(tampered.status()).toBe(400);
    expect((await prisma.emailDelivery.findUniqueOrThrow({ where: { id: delivery.id } })).status).toBe("SENDING");
    const response = await request.post("/api/webhooks/resend", { headers, data: payload });
    expect(response.status()).toBe(200);
    const saved = await prisma.emailDelivery.findUniqueOrThrow({ where: { id: delivery.id } });
    expect(saved.status).toBe("DELIVERED");
    expect(saved.providerMessageId).toBe(providerMessageId);
    expect(saved.deliveredAt).not.toBeNull();
    expect((await request.post("/api/webhooks/resend", { headers, data: payload })).status()).toBe(200);
  } finally {
    if (organizationId) await prisma.organization.delete({ where: { id: organizationId } });
    await prisma.user.delete({ where: { id: owner.id } });
    await prisma.$disconnect();
  }
});
