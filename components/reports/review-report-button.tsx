"use client";

import { useActionState } from "react";
import { reviewDailyReport } from "@/actions/report.actions";
import type { FormState } from "@/lib/validations";

const initialState: FormState = {};

export function ReviewReportButton({ organizationId, reportId, version }: { organizationId: string; reportId: string; version: string }) {
  const [state, action, pending] = useActionState(reviewDailyReport, initialState);
  return <form action={action} className="rounded-2xl border border-[#e6eaf0] bg-white p-5 print:hidden">
    <input type="hidden" name="organizationId" value={organizationId} />
    <input type="hidden" name="reportId" value={reportId} />
    <input type="hidden" name="version" value={version} />
    <button disabled={pending} className="rounded-xl bg-[#2563eb] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Mark as reviewed</button>
    {pending || state.message ? <p role="status" className="mt-2 text-sm text-[#475467]">{pending ? "Saving review…" : state.message}</p> : null}
  </form>;
}
