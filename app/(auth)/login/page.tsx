import type { Metadata } from "next";
import Link from "next/link";
import { loginWithGoogle } from "@/actions/auth.actions";
import { Icon } from "@/components/ui/icons";
import { GoogleSubmitButton, LoginForm } from "@/components/auth/login-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function Login({
  searchParams,
}: PageProps<"/login">) {
  const { error, password } = await searchParams;

  return (
    <main className="grid min-h-screen bg-white lg:grid-cols-[1.04fr_0.96fr]">
      <section className="relative hidden overflow-hidden bg-[#172033] p-12 text-white lg:flex lg:flex-col xl:p-16">
        <div className="absolute -right-32 -top-28 size-[30rem] rounded-full border border-white/10" />
        <div className="absolute -right-16 -top-4 size-[21rem] rounded-full border border-white/10" />
        <div className="absolute right-24 top-28 size-3 rounded-full bg-[#72a0ff] shadow-[0_0_0_10px_rgba(114,160,255,0.09)]" />

        <Link href="/" className="relative flex items-center gap-2.5 self-start">
          <span className="grid size-9 place-items-center rounded-xl bg-[#2563eb]">
            <span className="flex items-end gap-[3px]" aria-hidden="true"><span className="h-2 w-1 rounded-full bg-white/65" /><span className="h-4 w-1 rounded-full bg-white" /><span className="h-3 w-1 rounded-full bg-white/80" /></span>
          </span>
          <span className="text-xl font-bold tracking-[-0.035em]">TeamFlow</span>
        </Link>

        <div className="relative my-auto max-w-xl py-16">
          <span className="mb-7 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.06] px-3 py-1.5 text-xs font-medium text-white/75"><Icon name="sparkle" className="size-3.5 text-[#8eb2ff]" /> One calm place for team operations</span>
          <p className="max-w-lg text-5xl font-semibold leading-[1.06] tracking-[-0.055em] xl:text-6xl">Move work forward, without the busywork.</p>
          <p className="mt-6 max-w-md text-base leading-7 text-white/60">Bring priorities, attendance, progress, and team updates into one focused workspace.</p>

          <div className="mt-10 grid max-w-lg grid-cols-3 gap-3">
            {[{ value: "84%", label: "weekly plan" }, { value: "12", label: "active projects" }, { value: "4.8", label: "team pulse" }].map((stat) => (
              <div key={stat.label} className="rounded-2xl border border-white/10 bg-white/[0.05] p-4 backdrop-blur">
                <p className="font-mono text-xl font-semibold">{stat.value}</p><p className="mt-1 text-[11px] text-white/65">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>

        <p className="relative text-xs text-white/65">© 2026 TeamFlow. Built for focused teams.</p>
      </section>

      <section className="flex min-h-screen items-center justify-center bg-[#fbfcfe] px-5 py-10 sm:px-8">
        <div className="w-full max-w-[27rem]">
          <Link href="/" className="mb-12 flex items-center gap-2.5 lg:hidden">
            <span className="grid size-9 place-items-center rounded-xl bg-[#2563eb] text-white"><span className="flex items-end gap-[3px]" aria-hidden="true"><span className="h-2 w-1 rounded-full bg-white/65" /><span className="h-4 w-1 rounded-full bg-white" /><span className="h-3 w-1 rounded-full bg-white/80" /></span></span>
            <span className="text-xl font-bold tracking-[-0.035em] text-[#172033]">TeamFlow</span>
          </Link>

          <div className="mb-8">
            <p className="mb-3 font-mono text-xs font-semibold uppercase tracking-[0.16em] text-[#2563eb]">Welcome back</p>
            <h1 className="text-[2rem] font-semibold tracking-[-0.045em] text-[#172033]">Sign in to your workspace</h1>
            <p className="mt-2 text-sm leading-6 text-[#667085]">Use your work email to continue to TeamFlow.</p>
          </div>

          {password === "updated" && <p role="status" className="mb-5 rounded-xl border border-[#b8e4d0] bg-[#f2fbf6] px-4 py-3 text-sm text-[#176b45]">Your password is ready. You can now sign in.</p>}

          {error && (
            <div role="alert" className="mb-5 rounded-xl border border-[#f5c7c2] bg-[#fff5f4] px-4 py-3 text-sm text-[#a83931]">
              {error === "CredentialsSignin"
                ? "Email or password is incorrect, or this account is not active."
                : error === "google_oauth_not_configured"
                ? "Google sign-in is not configured. Add your Google OAuth client ID and secret to .env.local, then restart the development server."
                : error === "Configuration"
                  ? "Google sign-in could not finish because TeamFlow cannot reach its database. Start PostgreSQL, confirm DATABASE_URL, and try again."
                : "Sign-in failed or this account is suspended. Try another Google account."}
            </div>
          )}

          <LoginForm />

          <div className="my-6 flex items-center gap-3 text-[11px] font-medium uppercase tracking-[0.12em] text-[#98a2b3]"><span className="h-px flex-1 bg-[#e5eaf1]" />Or continue with<span className="h-px flex-1 bg-[#e5eaf1]" /></div>

          <form action={loginWithGoogle}>
            <GoogleSubmitButton />
          </form>

          <p className="mt-6 text-center text-xs leading-5 text-[#667085]">Access is limited to approved TeamFlow workspace members. Your dashboard is selected automatically from your assigned role.</p>
        </div>
      </section>
    </main>
  );
}
