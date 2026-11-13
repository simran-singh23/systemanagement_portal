export default function LoadingEmployeeWorkspace() {
  return <div role="status" aria-label="Loading your workspace" aria-busy="true" className="animate-pulse space-y-6">
    <span className="sr-only">Loading your workspace…</span>
    <div className="h-24 rounded-2xl bg-[var(--surface-subtle)]" />
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{Array.from({ length: 3 }, (_, index) => <div key={index} className="h-28 rounded-2xl bg-[var(--surface-subtle)]" />)}</div>
    <div className="grid gap-5 xl:grid-cols-[1.4fr_1fr]"><div className="h-[28rem] rounded-2xl bg-[var(--surface-subtle)]" /><div className="h-[28rem] rounded-2xl bg-[var(--surface-subtle)]" /></div>
  </div>;
}
