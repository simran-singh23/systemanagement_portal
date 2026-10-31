"use client";

import { archiveTask } from "@/actions/task.actions";
import { useActionState } from "react";
import type { FormState } from "@/lib/validations";

export function ArchiveTaskButton({ organizationId, taskId }: { organizationId: string; taskId: string }) {
  const [state, action, pending] = useActionState(archiveTask.bind(null, organizationId, taskId), {} as FormState);
  return <form action={action} onSubmit={(event) => { if (!window.confirm("Archive this task? It will be removed from active task lists, but its history will be preserved.")) event.preventDefault(); }}><button type="submit" disabled={pending} className="text-xs font-semibold text-[#a83931] hover:text-[#7f2823] disabled:opacity-50">{pending ? "Archiving…" : "Archive"}</button>{state.message && !state.success ? <p role="status" className="mt-2 max-w-xs text-xs text-[#b42318]">{state.message}</p> : null}</form>;
}
