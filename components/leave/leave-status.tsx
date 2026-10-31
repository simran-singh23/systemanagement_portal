import type { LeaveStatus, LeaveType } from "@prisma/client";

const statusStyles: Record<LeaveStatus, string> = {
  PENDING: "border-[#f3d9a4] bg-[#fff8e8] text-[#9a6108]",
  APPROVED: "border-[#bfe8d6] bg-[#ecf9f3] text-[#147653]",
  REJECTED: "border-[#f2c8c8] bg-[#fff1f1] text-[#b33b3b]",
  CANCELLED: "border-[#dfe4eb] bg-[#f7f8fa] text-[#667085]",
};

export function LeaveStatusBadge({ status }: { status: LeaveStatus }) {
  return <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold capitalize ${statusStyles[status]}`}>{status.toLowerCase()}</span>;
}

export function LeaveTypeBadge({ type }: { type: LeaveType }) {
  return <span className="inline-flex rounded-full bg-[#eef4ff] px-2.5 py-1 text-[11px] font-semibold text-[#2555a7]">{type.toLowerCase().replaceAll("_", " ")}</span>;
}
