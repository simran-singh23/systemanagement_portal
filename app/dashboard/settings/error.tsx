"use client";

export default function ErrorState({ reset }: { reset: () => void }) {
  return <div className="rounded-2xl border border-[#f2c8c8] bg-white p-8 text-center"><h2 className="font-semibold text-[#253047]">Settings could not load</h2><p className="mt-2 text-sm text-[#7c8799]">The organization policy data is temporarily unavailable.</p><button onClick={reset} className="mt-4 rounded-xl bg-[#172033] px-4 py-2 text-sm font-semibold text-white">Try again</button></div>;
}
