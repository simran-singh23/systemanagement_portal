export default function LoadingTeamAttendance() {
  return <div className="animate-pulse space-y-6"><div className="h-20 rounded-2xl bg-white" /><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 4 }, (_, index) => <div key={index} className="h-32 rounded-2xl bg-white" />)}</div><div className="h-[30rem] rounded-2xl bg-white" /></div>;
}
