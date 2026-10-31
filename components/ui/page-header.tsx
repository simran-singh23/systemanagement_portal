import type { ReactNode } from "react";

export function PageHeader({ title, description, eyebrow, actions }: { title: string; description?: string; eyebrow?: string; actions?: ReactNode }) {
  return <section className="tf-page-header"><div className="min-w-0">{eyebrow ? <p className="tf-eyebrow">{eyebrow}</p> : null}<h1 className="tf-page-title">{title}</h1>{description ? <p className="tf-page-description">{description}</p> : null}</div>{actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}</section>;
}
