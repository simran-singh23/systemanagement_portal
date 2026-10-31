import { z } from "zod";

// Persist these fields before contacting the provider: retries with the same
// idempotency key must use exactly the same report, sender and subject.
export const emailRequestSchema = z.object({
  from: z.string().min(1),
  subject: z.string().min(1),
  html: z.string(),
  text: z.string(),
});
