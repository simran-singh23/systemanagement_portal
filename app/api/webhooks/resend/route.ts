import { Resend } from "resend";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const failureEvents = new Set(["email.failed", "email.bounced", "email.complained", "email.suppressed"]);
const emailEventSchema = z.object({
  type: z.string(),
  created_at: z.iso.datetime({ offset: true }),
  data: z.object({
    email_id: z.string().min(1),
    to: z.array(z.string()).min(1),
    tags: z.record(z.string(), z.string()).optional(),
  }),
});

export async function POST(request: Request) {
  const webhookSecret = process.env.RESEND_WEBHOOK_SECRET?.trim();
  if (!webhookSecret) return new Response("Webhook unavailable", { status: 503 });
  const id = request.headers.get("webhook-id");
  const timestamp = request.headers.get("webhook-timestamp");
  const signature = request.headers.get("webhook-signature");
  if (!id || !timestamp || !signature) return new Response("Invalid signature", { status: 400 });
  const payload = await request.text();
  let event;
  try {
    event = new Resend(process.env.RESEND_API_KEY || "webhook-verification-only").webhooks.verify({ payload, webhookSecret, headers: { id, timestamp, signature } });
  } catch { return new Response("Invalid signature", { status: 400 }); }
  const envelope = z.object({ type: z.string() }).safeParse(event);
  if (!envelope.success) return new Response("Invalid event", { status: 400 });
  if (envelope.data.type !== "email.delivered" && !failureEvents.has(envelope.data.type)) return new Response(null, { status: 200 });
  const parsed = emailEventSchema.safeParse(event);
  if (!parsed.success) return new Response("Invalid event", { status: 400 });
  const { data, type, created_at } = parsed.data;
  const deliveryId = data.tags?.teamflow_delivery_id;
  const status = await prisma.$transaction(async (tx) => {
    // Lock the correlated row so simultaneous and out-of-order webhook updates
    // cannot erase a terminal bounce/complaint or associate two provider IDs.
    const rows = await tx.$queryRaw<Array<{ id: string }>>`SELECT "id" FROM "email_deliveries" WHERE "provider_message_id" = ${data.email_id} OR "id" = ${deliveryId ?? ""} FOR UPDATE`;
    if (!rows.length) return deliveryId ? 503 : 200; // unrelated auth email, or retry an early tagged event
    if (rows.length !== 1) return 400;
    const delivery = await tx.emailDelivery.findUniqueOrThrow({ where: { id: rows[0].id } });
    if ((deliveryId && deliveryId !== delivery.id) || (delivery.providerMessageId && delivery.providerMessageId !== data.email_id) || !delivery.attemptCount) return 400;
    if (!data.to.some((email) => email.toLowerCase() === delivery.recipientEmail.toLowerCase())) return 400;
    if (type === "email.delivered") {
      // Failure events are terminal for this provider message, even when a
      // delayed delivery event arrives after a complaint or bounce.
      if (delivery.status === "FAILED" && delivery.providerMessageId) return 200;
      if (delivery.status === "DELIVERED") return 200;
      await tx.emailDelivery.update({ where: { id: delivery.id }, data: { providerMessageId: data.email_id, status: "DELIVERED", sentAt: delivery.sentAt ?? new Date(created_at), deliveredAt: new Date(created_at), lastError: null } });
    } else {
      await tx.emailDelivery.update({ where: { id: delivery.id }, data: { providerMessageId: data.email_id, status: "FAILED", lastError: `Provider event: ${type}` } });
    }
    return 200;
  });
  return new Response(status === 503 ? "Delivery not ready" : null, { status });
}
