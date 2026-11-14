import { z } from "zod";

export const credentialsSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  // Don't trim passwords: spaces are valid password characters.
  password: z.string().min(1).max(256),
});

export const newPasswordSchema = z.string().min(12, "Use at least 12 characters.").max(128, "Password must be 128 characters or fewer.");

export const initialPasswordSchema = z.object({
  password: newPasswordSchema,
  confirmation: z.string().min(1, "Confirm the initial password."),
}).refine((value) => value.password === value.confirmation, {
  path: ["confirmation"], message: "The passwords do not match.",
});
