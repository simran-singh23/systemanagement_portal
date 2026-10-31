"use client";

import { archiveTask } from "@/actions/task.actions";

export function ArchiveTaskButton({ organizationId, taskId }: { organizationId: string; taskId: string }) {
  const action = archiveTask.bind(null, organizationId, taskId);
  return <form action={action} onSubmit={(event) => { if (!window.confirm("Archive this task? It will be removed from active task lists, but its history will be preserved.")) event.preventDefault(); }}><button type="submit" className="text-xs font-semibold text-[#a83931] hover:text-[#7f2823]">Archive</button></form>;
}
