import Link from "next/link";
import type { ReactNode } from "react";
import { ChevronLeft, ChevronRight, SlidersHorizontal, X } from "lucide-react";

type ParamValue = string | undefined;

export function buildTableHref(pathname: string, params: Record<string, ParamValue>, updates: Record<string, ParamValue>) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries({ ...params, ...updates })) if (value) query.set(key, value);
  const value = query.toString();
  return value ? `${pathname}?${value}` : pathname;
}

export function AdvancedFilterBar({ children }: { children: ReactNode }) {
  return <div className="border-b border-[#edf0f4] bg-[#fcfcfd] p-4"><div className="mb-3 flex items-center gap-2 text-xs font-semibold text-[#667085]"><SlidersHorizontal className="size-4" /> Refine results</div>{children}</div>;
}

export function FilterDropdown({ name, label, value, options, className = "" }: { name: string; label: string; value?: string; options: [string, string][]; className?: string }) {
  return <select aria-label={label} name={name} defaultValue={value ?? ""} className={`h-10 min-w-0 rounded-xl border border-[#dfe4eb] bg-white px-3 text-sm text-[#475467] outline-none focus:border-[#80a7f5] ${className}`}><option value="">{label}</option>{options.map(([option, text]) => <option key={option} value={option}>{text}</option>)}</select>;
}

export function DateRangeFilter({ from, to }: { from?: string; to?: string }) {
  return <><input aria-label="From date" type="date" name="from" defaultValue={from ?? ""} className="h-10 min-w-0 rounded-xl border border-[#dfe4eb] bg-white px-3 text-sm text-[#475467]" /><input aria-label="To date" type="date" name="to" defaultValue={to ?? ""} className="h-10 min-w-0 rounded-xl border border-[#dfe4eb] bg-white px-3 text-sm text-[#475467]" /></>;
}

export function SortSelector({ value, options }: { value?: string; options: [string, string][] }) {
  return <FilterDropdown name="sort" label="Sort by" value={value} options={options} />;
}

export function ClearFiltersButton({ href }: { href: string }) {
  return <Link href={href} className="inline-flex h-10 items-center justify-center gap-1.5 rounded-xl border border-[#dfe4eb] bg-white px-3 text-xs font-semibold text-[#667085] hover:bg-[#f7f8fa]"><X className="size-3.5" /> Clear</Link>;
}

export function ActiveFilterChips({ pathname, params, filters }: { pathname: string; params: Record<string, ParamValue>; filters: { key: string; label: string; value?: string }[] }) {
  const active = filters.filter((filter) => filter.value);
  if (!active.length) return null;
  return <div className="flex flex-wrap gap-2 border-b border-[#edf0f4] px-4 py-3">{active.map((filter) => <Link key={filter.key} href={buildTableHref(pathname, params, { [filter.key]: undefined, page: undefined })} className="inline-flex items-center gap-1.5 rounded-full bg-[#eef4ff] px-2.5 py-1 text-[11px] font-medium text-[#2555a7]">{filter.label}: {filter.value}<X className="size-3" /></Link>)}</div>;
}

export function PaginationControls({ pathname, params, page, pageSize, total, pages }: { pathname: string; params: Record<string, ParamValue>; page: number; pageSize: number; total: number; pages: number }) {
  const first = total ? (page - 1) * pageSize + 1 : 0;
  const last = Math.min(total, page * pageSize);
  return <div className="flex flex-col gap-3 border-t border-[#edf0f4] px-4 py-3 sm:flex-row sm:items-center sm:justify-between"><p className="text-xs text-[#7c8799]">Showing {first}–{last} of {total}</p><div className="flex items-center justify-between gap-2"><form className="mr-1 flex items-center gap-1">{Object.entries(params).map(([key, value]) => key !== "page" && key !== "pageSize" && value ? <input key={key} type="hidden" name={key} value={value} /> : null)}<select aria-label="Rows per page" name="pageSize" defaultValue={String(pageSize)} className="h-9 rounded-lg border border-[#dfe4eb] bg-white px-2 text-xs text-[#667085]"><option value="10">10 / page</option><option value="20">20 / page</option><option value="50">50 / page</option></select><button className="h-9 rounded-lg border border-[#dfe4eb] bg-white px-2 text-[11px] font-semibold text-[#667085]">Set</button></form><Link aria-label="Previous page" tabIndex={page <= 1 ? -1 : undefined} aria-disabled={page <= 1} href={page > 1 ? buildTableHref(pathname, params, { page: String(page - 1) }) : "#"} className={`grid size-9 place-items-center rounded-lg border ${page <= 1 ? "pointer-events-none border-[#edf0f4] text-[#c5cbd4]" : "border-[#dfe4eb] text-[#536074] hover:bg-[#f7f8fa]"}`}><ChevronLeft className="size-4" /></Link><span className="min-w-20 text-center text-xs font-medium text-[#667085]">{page} / {pages}</span><Link aria-label="Next page" tabIndex={page >= pages ? -1 : undefined} aria-disabled={page >= pages} href={page < pages ? buildTableHref(pathname, params, { page: String(page + 1) }) : "#"} className={`grid size-9 place-items-center rounded-lg border ${page >= pages ? "pointer-events-none border-[#edf0f4] text-[#c5cbd4]" : "border-[#dfe4eb] text-[#536074] hover:bg-[#f7f8fa]"}`}><ChevronRight className="size-4" /></Link></div></div>;
}
