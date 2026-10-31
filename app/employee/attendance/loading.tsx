export default function LoadingAttendance() {
  return <div className="animate-pulse space-y-6"><div className="h-20 rounded-2xl bg-white" /><div className="h-[24rem] rounded-[1.75rem] bg-[#172033]/90" /><div className="grid gap-4 sm:grid-cols-3">{Array.from({ length: 3 }, (_, index) => <div key={index} className="h-32 rounded-2xl bg-white" />)}</div><div className="h-72 rounded-2xl bg-white" /></div>;
}
