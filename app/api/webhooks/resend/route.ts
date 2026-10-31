import { Resend } from "resend";
import { prisma } from "@/lib/prisma";

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
  if (!event.type.startsWith("email.") || !("email_id" in event.data)) return new Response(null, { status: 204 });
  const providerMessageId = event.data.email_id;
  if (event.type === "email.delivered") {
    await prisma.emailDelivery.updateMany({ where: { providerMessageId, status: { not: "DELIVERED" } }, data: { status: "DELIVERED", deliveredAt: new Date(event.created_at), lastError: null } });
  } else if (["email.failed", "email.bounced", "email.complained", "email.suppressed"].includes(event.type)) {
    await prisma.emailDelivery.updateMany({ where: { providerMessageId, status: { not: "DELIVERED" } }, data: { status: "FAILED", lastError: `Provider event: ${event.type}` } });
  }
  return new Response(null, { status: 204 });
}
