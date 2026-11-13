export default function LoadingTeamAttendance() {
  return <div role="status" aria-label="Loading attendance" aria-busy="true" className="animate-pulse space-y-6"><span className="sr-only">Loading team attendance…</span><div className="h-20 rounded-2xl bg-[var(--surface-subtle)]" /><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 4 }, (_, index) => <div key={index} className="h-32 rounded-2xl bg-[var(--surface-subtle)]" />)}</div><div className="h-[30rem] rounded-2xl bg-[var(--surface-subtle)]" /></div>;
}
