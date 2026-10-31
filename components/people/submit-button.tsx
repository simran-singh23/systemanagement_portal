"use client";

import { useFormStatus } from "react-dom";

export function SubmitButton({ label, pendingLabel = "Saving…" }: { label: string; pendingLabel?: string }) {
  const { pending } = useFormStatus();
  return (
    <button disabled={pending} type="submit" className="inline-flex h-11 items-center justify-center rounded-xl bg-[#2563eb] px-5 text-sm font-semibold text-white shadow-[0_6px_16px_rgba(37,99,235,0.18)] transition hover:bg-[#1f58d2] disabled:cursor-not-allowed disabled:opacity-60">
      {pending ? pendingLabel : label}
    </button>
  );
}
