export type GoogleOAuthCredentials = {
  clientId: string;
  clientSecret: string;
};

/**
 * Auth.js convention is AUTH_GOOGLE_ID/AUTH_GOOGLE_SECRET. The GOOGLE_* aliases
 * are also accepted for deployments that already use those names.
 */
export function getGoogleOAuthCredentials(): GoogleOAuthCredentials {
  return {
    clientId:
      process.env.AUTH_GOOGLE_ID?.trim() ||
      process.env.GOOGLE_CLIENT_ID?.trim() ||
      "",
    clientSecret:
      process.env.AUTH_GOOGLE_SECRET?.trim() ||
      process.env.GOOGLE_CLIENT_SECRET?.trim() ||
      "",
  };
}

