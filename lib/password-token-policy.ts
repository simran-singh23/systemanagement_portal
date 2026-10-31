export type PasswordTokenState = {
  purpose: "INITIAL_SETUP" | "PASSWORD_RESET";
  expiresAt: Date;
  consumedAt: Date | null;
  userStatus: "ACTIVE" | "INVITED" | "SUSPENDED";
  emailVerified: Date | null;
  passwordHash: string | null;
};

export function isPasswordTokenUsable(state: PasswordTokenState, now = new Date()) {
  if (state.consumedAt || state.expiresAt.getTime() <= now.getTime() || state.userStatus === "SUSPENDED") return false;
  if (state.purpose === "INITIAL_SETUP") return state.passwordHash === null;
  return state.userStatus === "ACTIVE" && state.emailVerified !== null && state.passwordHash !== null;
}
