import type { Metadata } from "next";
import Link from "next/link";
import type { EmailDeliveryStatus, Prisma } from "@prisma/client";
import { requireCurrentOrganization } from "@/lib/dal/auth";
import { databaseDate, isValidDateKey } from "@/lib/date-time";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = { title: "Email report delivery" };
export const dynamic = "force-dynamic";

type Search = { date?: string; status?: string; q?: string; page?: string };
const statuses: EmailDeliveryStatus[] = ["PENDING", "SENDING", "SENT", "DELIVERED", "FAILED"];

export default async function EmailReportsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const [{ organization }, filters] = await Promise.all([requireCurrentOrganization("organization:manage"), searchParams]);
  const status = statuses.includes(filters.status as EmailDeliveryStatus) ? filters.status as EmailDeliveryStatus : undefined;
  const date = filters.date && isValidDateKey(filters.date) ? databaseDate(filters.date) : undefined;
  const q = filters.q?.trim().slice(0, 100) || "";
  const page = Math.max(1, Math.min(1000, Number.parseInt(filters.page ?? "1", 10) || 1));
  const where: Prisma.EmailDeliveryWhereInput = { organizationId: organization.id, ...(status ? { status } : {}), ...(date ? { reportDate: date } : {}), ...(q ? { recipientEmail: { contains: q, mode: "insensitive" } } : {}) };
  const [deliveries, count, latest] = await Promise.all([
    prisma.emailDelivery.findMany({ where, orderBy: [{ reportDate: "desc" }, { createdAt: "desc" }], skip: (page - 1) * 20, take: 20 }),
    prisma.emailDelivery.count({ where }),
    prisma.dailyTeamSummary.findFirst({ where: { organizationId: organization.id }, orderBy: { workDate: "desc" }, select: { workDate: true } }),
  ]);
  const pages = Math.max(1, Math.ceil(count / 20));
  const query = (next: number) => { const params = new URLSearchParams(); if (date) params.set("date", filters.date!); if (status) params.set("status", status); if (q) params.set("q", q); params.set("page", String(next)); return `?${params}`; };
  return <div className="space-y-6"><header className="flex flex-wrap items-end justify-between gap-4"><div><p className="tf-eyebrow">Manager delivery</p><h1 className="tf-page-title mt-2">Email reports</h1><p className="tf-page-description">Provider acceptance and verified delivery status for {organization.name}.</p></div><div className="flex gap-2">{latest ? <Link href={`/dashboard/email-reports/preview?date=${latest.workDate.toISOString().slice(0, 10)}`} className="tf-button-primary">Preview latest report</Link> : null}<Link href="/dashboard/settings?section=email" className="rounded-xl border border-[#dfe4eb] bg-white px-4 py-2 text-sm font-semibold text-[#344054]">Email settings</Link></div></header>
    <section className="overflow-hidden rounded-2xl border border-[#e6eaf0] bg-white"><form className="grid gap-3 border-b border-[#edf0f4] p-4 sm:grid-cols-4"><input name="date" type="date" aria-label="Report date" defaultValue={filters.date ?? ""} className="h-10 rounded-xl border border-[#dfe4eb] px-3 text-sm" /><select name="status" aria-label="Delivery status" defaultValue={status ?? ""} className="h-10 rounded-xl border border-[#dfe4eb] px-3 text-sm"><option value="">All statuses</option>{statuses.map((item) => <option key={item}>{item}</option>)}</select><input name="q" type="search" aria-label="Recipient email" placeholder="Search recipient" defaultValue={q} className="h-10 rounded-xl border border-[#dfe4eb] px-3 text-sm" /><button className="h-10 rounded-xl bg-[#172033] px-4 text-sm font-semibold text-white">Filter</button></form>
      {deliveries.length ? <><div className="overflow-x-auto"><table className="w-full min-w-[780px] text-left text-sm"><thead className="bg-[#fafbfc] text-[11px] uppercase tracking-[.08em] text-[#98a2b3]"><tr><th className="px-5 py-3">Report date</th><th className="px-4 py-3">Recipient</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Attempts</th><th className="px-4 py-3">Accepted</th><th className="px-4 py-3">Delivered</th><th className="px-5 py-3">Detail</th></tr></thead><tbody className="divide-y divide-[#edf0f4]">{deliveries.map((item) => <tr key={item.id}><td className="px-5 py-4 font-mono text-xs">{item.reportDate.toISOString().slice(0, 10)}</td><td className="px-4 py-4">{item.recipientEmail}</td><td className="px-4 py-4"><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${item.status === "DELIVERED" ? "bg-[#eaf8f2] text-[#157357]" : item.status === "FAILED" ? "bg-[#fff1f0] text-[#a43b32]" : "bg-[#eef4ff] text-[#2555a7]"}`}>{item.status}</span></td><td className="px-4 py-4 font-mono text-xs">{item.attemptCount}</td><td className="px-4 py-4 text-xs text-[#667085]">{item.sentAt?.toLocaleString("en-IN") ?? "—"}</td><td className="px-4 py-4 text-xs text-[#667085]">{item.deliveredAt?.toLocaleString("en-IN") ?? "—"}</td><td className="max-w-[16rem] truncate px-5 py-4 text-xs text-[#667085]" title={item.lastError ?? ""}>{item.lastError ?? "—"}</td></tr>)}</tbody></table></div><div className="flex items-center justify-between gap-4 border-t border-[#edf0f4] px-5 py-3 text-xs text-[#667085]"><span>{count} deliveries · page {page} of {pages}</span><div className="flex gap-2">{page > 1 ? <Link href={query(page - 1)}>Previous</Link> : null}{page < pages ? <Link href={query(page + 1)}>Next</Link> : null}</div></div></> : <div className="px-6 py-14 text-center text-sm text-[#667085]">No email deliveries match these filters. Reports appear here after a scheduled send is attempted.</div>}</section></div>;
}
