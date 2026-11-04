"use server";

import { AuthError } from "next-auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { signIn, signOut } from "@/auth";
import { requireUser } from "@/lib/dal/auth";
import { consumePasswordLinkRequest } from "@/lib/auth-rate-limit";
import { changeCurrentPassword, consumePasswordToken, sendPasswordSetupOrReset } from "@/lib/password-account";
import { credentialsSchema, newPasswordSchema } from "@/lib/password";

export type AuthFormState = { message?: string; success?: boolean };

export async function loginWithPassword(_state: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const parsed = credentialsSchema.safeParse({ email: formData.get("email"), password: formData.get("password") });
  if (!parsed.success) return { message: "Enter a valid email and password." };

  try {
    await signIn("credentials", { email: parsed.data.email, password: parsed.data.password, redirectTo: "/auth/redirect" });
  } catch (error) {
    if (error instanceof AuthError) return { message: "Email or password is incorrect, or this account is not active." };
    throw error;
  }
  return { message: "Unable to sign in. Please try again." };
}

export async function requestPasswordLink(_state: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const parsed = credentialsSchema.shape.email.safeParse(email);
  if (parsed.success) {
    const requestHeaders = await headers();
    const ip = requestHeaders.get("x-real-ip")?.trim() || requestHeaders.get("x-forwarded-for")?.split(",").at(-1)?.trim() || "unknown";
    const allowed = await consumePasswordLinkRequest(parsed.data, ip);
    if (allowed) {
      try { await sendPasswordSetupOrReset(parsed.data); }
      catch (error) { console.error("Password-link delivery failed.", error instanceof Error ? error.message : "unknown error"); }
    }
  }
  return { success: true, message: "If that address belongs to an eligible TeamFlow account, password instructions will be sent shortly." };
}

export async function setPassword(_state: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const token = String(formData.get("token") ?? "");
  const password = String(formData.get("password") ?? "");
  const confirmation = String(formData.get("confirmation") ?? "");
  if (!newPasswordSchema.safeParse(password).success) return { message: "Use a password between 12 and 128 characters." };
  if (password !== confirmation) return { message: "The passwords do not match." };
  try {
    await consumePasswordToken(token, password);
  } catch {
    return { message: "This password link is invalid or has expired. Request a new one." };
  }
  redirect("/login?password=updated");
}

export async function changePassword(_state: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const user = await requireUser();
  const currentPassword = String(formData.get("currentPassword") ?? "");
  const password = String(formData.get("password") ?? "");
  const confirmation = String(formData.get("confirmation") ?? "");
  if (!newPasswordSchema.safeParse(password).success) return { message: "Use a password between 12 and 128 characters." };
  if (password !== confirmation) return { message: "The passwords do not match." };
  try {
    await changeCurrentPassword(user.id, currentPassword, password);
  } catch (error) {
    return { message: error instanceof Error ? error.message : "Password change failed." };
  }
  await signOut({ redirectTo: "/login?password=updated" });
  return { success: true, message: "Password updated." };
}
