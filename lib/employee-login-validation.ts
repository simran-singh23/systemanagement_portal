import { z } from "zod";
import { employeeSchema } from "./validations";
import { initialPasswordSchema } from "./password-validation";

export const employeeCreationSchema = employeeSchema.extend({
  loginMethod: z.enum(["EMAIL_INVITE", "ADMIN_PASSWORD"]).default("EMAIL_INVITE"),
  password: z.string().max(128).optional(),
  confirmation: z.string().max(128).optional(),
}).superRefine((data, context) => {
  if (data.loginMethod !== "ADMIN_PASSWORD") return;
  const password = initialPasswordSchema.safeParse(data);
  if (!password.success) for (const issue of password.error.issues) {
    context.addIssue({ code: "custom", path: issue.path, message: issue.message });
  }
});
