export default function LoadingDashboard() {
  return <div role="status" aria-label="Loading workspace" aria-busy="true" className="animate-pulse space-y-6">
    <span className="sr-only">Loading your workspace…</span>
    <div className="h-24 rounded-2xl bg-[var(--surface-subtle)]" />
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">{Array.from({ length: 4 }, (_, index) => <div key={index} className="h-36 rounded-xl bg-[var(--surface-subtle)]" />)}</div>
    <div className="grid gap-5 xl:grid-cols-[1.4fr_1fr]"><div className="h-[28rem] rounded-2xl bg-[var(--surface-subtle)]" /><div className="h-[28rem] rounded-2xl bg-[var(--surface-subtle)]" /></div>
  </div>;
}
