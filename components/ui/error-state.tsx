"use client";

import { Icon } from "@/components/ui/icons";

export function ErrorState({ title, description, reset }: { title: string; description: string; reset: () => void }) {
  return <div className="tf-error-state" role="alert"><span className="grid size-11 place-items-center rounded-xl bg-[#fff1f0] text-[#b42318]"><Icon name="x" className="size-5" /></span><h2 className="mt-4 text-base font-semibold text-[var(--ink)]">{title}</h2><p className="mx-auto mt-1 max-w-md text-sm leading-6 text-[var(--muted)]">{description}</p><button onClick={reset} className="tf-button-primary mt-5">Try again</button></div>;
}
