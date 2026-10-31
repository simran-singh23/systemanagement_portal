"use client";
export function PrintReportButton() { return <button type="button" onClick={() => window.print()} className="print:hidden h-10 rounded-xl border border-[#dfe4eb] bg-white px-4 text-sm font-semibold text-[#344054]">Print report</button>; }
