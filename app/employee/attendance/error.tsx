"use client";

export default function AttendanceError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <div className="rounded-2xl border border-[#f0d7d4] bg-white px-6 py-14 text-center"><h2 className="text-lg font-semibold text-[#253047]">Attendance could not be loaded</h2><p className="mt-2 text-sm text-[#7c8799]">Your attendance data is safe. Try again after the connection is restored.</p><button onClick={reset} className="mt-5 rounded-xl bg-[#172033] px-4 py-2.5 text-sm font-semibold text-white">Try again</button></div>;
}
