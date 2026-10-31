import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import Credentials from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { NextResponse } from "next/server";
import type { UserRole, UserStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { dashboardPathForRole } from "@/lib/permissions";
import { reconcileAccountAccess } from "@/lib/member-access";
import { getGoogleOAuthCredentials } from "@/lib/google-oauth-config";
import { authVersionAccepts, credentialsSchema, getDummyPasswordHash, verifyPassword } from "@/lib/password";
import { consumeCredentialsAttempt } from "@/lib/auth-rate-limit";
import { recordAuthSecurityEvent } from "@/lib/password-account";

const googleOAuth = getGoogleOAuthCredentials();

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60,
  },
  pages: {
    signIn: "/login",
    error: "/login",
  },
  providers: [
    Google({
      clientId: googleOAuth.clientId,
      clientSecret: googleOAuth.clientSecret,
      authorization: {
        params: {
          prompt: "select_account",
          access_type: "offline",
          response_type: "code",
        },
      },
    }),
    Credentials({
      id: "credentials",
      name: "Email and password",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(rawCredentials, request) {
        const parsed = credentialsSchema.safeParse(rawCredentials);
        if (!parsed.success) return null;

        const ip = request.headers.get("x-real-ip")?.trim()
          || request.headers.get("x-forwarded-for")?.split(",").at(-1)?.trim()
          || "unknown";
        const allowed = await consumeCredentialsAttempt(parsed.data.email, ip);
        if (!allowed) return null;
        const user = await prisma.user.findUnique({
          where: { email: parsed.data.email },
          select: { id: true, name: true, email: true, emailVerified: true, passwordHash: true, role: true, status: true },
        });
        const hash = user?.passwordHash ?? await getDummyPasswordHash();
        const passwordMatches = await verifyPassword(hash, parsed.data.password);
        if (!user || !user.passwordHash || !user.emailVerified || user.status !== "ACTIVE" || !passwordMatches) {
          await recordAuthSecurityEvent({ event: "credentials_login_failed", userId: user?.id, email: parsed.data.email }).catch(() => undefined);
          return null;
        }
        return { id: user.id, name: user.name, email: user.email, role: user.role, status: user.status };
      },
    }),
  ],
  callbacks: {
    async signIn({ user }) {
      if (!user.email) return false;

      const existingUser = await prisma.user.findUnique({
        where: { email: user.email },
        select: { id: true, status: true },
      });

      if (existingUser?.status === "SUSPENDED") return false;
      return true;
    },
    async jwt({ token, user, account }) {
      if (token.invalidated) return token;
      const userId = user?.id ?? token.userId ?? token.sub;
      if (userId) {
        let dbUser = await prisma.user.findUnique({
          where: { id: String(userId) },
          select: { id: true, role: true, status: true, authVersion: true, emailVerified: true },
        });

        // An invitation is activated only after the OAuth callback has completed
        // and Auth.js has persisted the provider account, not in the pre-link signIn hook.
        if (user && account?.provider === "google" && dbUser?.status === "INVITED" && dbUser.emailVerified) {
          await prisma.$transaction(async (tx) => {
            await tx.organizationMember.updateMany({ where: { userId: dbUser!.id, status: "INVITED" }, data: { status: "ACTIVE", joinedAt: new Date() } });
            await reconcileAccountAccess(tx, dbUser!.id);
          });
          dbUser = await prisma.user.findUnique({ where: { id: String(userId) }, select: { id: true, role: true, status: true, authVersion: true, emailVerified: true } });
        }

        if (dbUser) {
          if (!authVersionAccepts(token.authVersion, dbUser.authVersion, Boolean(user))) {
            token.invalidated = true;
            token.status = "SUSPENDED";
            return token;
          }
          token.userId = dbUser.id;
          token.role = dbUser.role;
          token.status = dbUser.status;
          token.authVersion = dbUser.authVersion;
        } else token.status = "SUSPENDED";
      }

      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = token.invalidated ? "" : (token.userId ?? token.sub) as string;
        session.user.role = (token.role ?? "EMPLOYEE") as UserRole;
        session.user.status = token.invalidated ? "SUSPENDED" : (token.status ?? "ACTIVE") as UserStatus;
      }
      return session;
    },
    authorized({ auth: session, request }) {
      const path = request.nextUrl.pathname;
      const user = session?.user;
      const isAuthenticated = Boolean(user?.id && user.status === "ACTIVE");
      const isManagerRoute = path.startsWith("/dashboard");
      const isEmployeeRoute = path.startsWith("/employee");
      const isProtectedRoute = isManagerRoute || isEmployeeRoute || path.startsWith("/auth/redirect") || path === "/pending-access";

      if (isProtectedRoute && !isAuthenticated) return false;

      if (isManagerRoute && user?.role === "EMPLOYEE") {
        return NextResponse.redirect(new URL("/employee", request.nextUrl));
      }

      if (isEmployeeRoute && user && user.role !== "EMPLOYEE") {
        return NextResponse.redirect(new URL("/dashboard", request.nextUrl));
      }

      if (path === "/login" && isAuthenticated && user) {
        return NextResponse.redirect(
          new URL(dashboardPathForRole(user.role), request.nextUrl),
        );
      }

      return true;
    },
  },
  events: {
    async signIn({ user, account }) {
      if (!user.id) return;
      await prisma.user.update({
        where: { id: user.id },
        data: { lastLoginAt: new Date() },
      });
      await recordAuthSecurityEvent({ event: "sign_in_succeeded", userId: user.id, email: user.email ?? undefined, metadata: { provider: account?.provider ?? "unknown" } });
    },
    async signOut(message) {
      if (!("token" in message)) return;
      const userId = typeof message.token?.userId === "string" ? message.token.userId : message.token?.sub;
      if (userId) await recordAuthSecurityEvent({ event: "sign_out", userId });
    },
  },
});
