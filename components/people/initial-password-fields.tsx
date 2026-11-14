export function InitialPasswordFields({ errors }: { errors?: Record<string, string[]> }) {
  const inputClass = "mt-2 h-11 w-full rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 text-sm text-[var(--ink)]";
  return <div className="grid gap-4 sm:grid-cols-2">
    <label className="text-sm font-medium text-[var(--ink)]">Initial password
      <input className={inputClass} type="password" name="password" autoComplete="new-password" minLength={12} maxLength={128} required aria-invalid={Boolean(errors?.password)} aria-describedby="initial-password-help" />
      {errors?.password && <span className="mt-1 block text-xs text-[var(--danger)]">{errors.password[0]}</span>}
    </label>
    <label className="text-sm font-medium text-[var(--ink)]">Confirm initial password
      <input className={inputClass} type="password" name="confirmation" autoComplete="new-password" minLength={12} maxLength={128} required aria-invalid={Boolean(errors?.confirmation)} />
      {errors?.confirmation && <span className="mt-1 block text-xs text-[var(--danger)]">{errors.confirmation[0]}</span>}
    </label>
    <p id="initial-password-help" className="text-xs leading-5 text-[var(--muted)] sm:col-span-2">Use 12–128 characters. Share the email and initial password directly with this employee. They can change their password under Password &amp; security after signing in.</p>
  </div>;
}
