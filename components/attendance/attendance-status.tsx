import type { AttendanceStatus } from "@prisma/client";

const styles: Record<AttendanceStatus, string> = {
  PRESENT: "bg-[#eaf8f2] text-[#157357]",
  LATE: "bg-[#fff6e5] text-[#a35f00]",
  ABSENT: "bg-[#fff0ef] text-[#b42318]",
  HALF_DAY: "bg-[#f3efff] text-[#6941c6]",
  REMOTE: "bg-[#eef4ff] text-[#2555a7]",
  ON_LEAVE: "bg-[#f2f4f7] text-[#475467]",
};

export function AttendanceStatusBadge({ status, emptyLabel = "Not checked in" }: { status: AttendanceStatus | null; emptyLabel?: string }) {
  if (!status) return <span className="inline-flex rounded-full bg-[#f2f4f7] px-2.5 py-1 text-[11px] font-semibold text-[#667085]">{emptyLabel}</span>;
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${styles[status]}`}>{status.replaceAll("_", " ").toLowerCase().replace(/^./, (letter) => letter.toUpperCase())}</span>;
}
