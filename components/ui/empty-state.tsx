import type { ReactNode } from "react";
import { Icon, type IconName } from "@/components/ui/icons";

export function EmptyState({ title, description, icon = "file", action }: { title: string; description: string; icon?: IconName; action?: ReactNode }) {
  return <div className="tf-empty-state"><span className="grid size-11 place-items-center rounded-xl bg-[var(--blue-soft)] text-[var(--blue)]"><Icon name={icon} className="size-5" /></span><h3 className="mt-4 text-sm font-semibold text-[var(--ink)]">{title}</h3><p className="mx-auto mt-1 max-w-sm text-sm leading-6 text-[var(--muted)]">{description}</p>{action ? <div className="mt-4">{action}</div> : null}</div>;
}
