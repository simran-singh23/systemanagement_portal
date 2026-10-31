"use server";

import { signIn, signOut } from "@/auth";
import { redirect } from "next/navigation";
import { getGoogleOAuthCredentials } from "@/lib/google-oauth-config";

export async function loginWithGoogle() {
  const credentials = getGoogleOAuthCredentials();
  const missing = [
    !credentials.clientId && "AUTH_GOOGLE_ID (or GOOGLE_CLIENT_ID)",
    !credentials.clientSecret && "AUTH_GOOGLE_SECRET (or GOOGLE_CLIENT_SECRET)",
  ].filter((name): name is string => Boolean(name));

  if (missing.length > 0) {
    console.error(
      `Google OAuth is not configured. Missing: ${missing.join(", ")}. Set the values in the server environment and restart Next.js.`,
    );
    redirect("/login?error=google_oauth_not_configured");
  }

  await signIn("google", { redirectTo: "/auth/redirect" });
}

export async function logout() {
  await signOut({ redirectTo: "/login" });
}
