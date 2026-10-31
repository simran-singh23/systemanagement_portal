import type { MembershipStatus, UserRole } from "@prisma/client";

export function initials(name: string | null) {
  return (name || "Team member")
    .split(" ")
    .filter(Boolean)
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export function roleLabel(role: UserRole) {
  return role.replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function StatusBadge({ status }: { status: MembershipStatus }) {
  const styles = {
    ACTIVE: "bg-[#ecfdf3] text-[#157357] ring-[#c8ebda]",
    INVITED: "bg-[#fff8e8] text-[#9b6718] ring-[#f1dfac]",
    SUSPENDED: "bg-[#f2f4f7] text-[#667085] ring-[#dfe3e8]",
  }[status];

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ring-inset ${styles}`}>
      <span className={`size-1.5 rounded-full ${status === "ACTIVE" ? "bg-[#1aa476]" : status === "INVITED" ? "bg-[#e5a32c]" : "bg-[#98a2b3]"}`} />
      {status === "SUSPENDED" ? "Deactivated" : status.charAt(0) + status.slice(1).toLowerCase()}
    </span>
  );
}

export function RoleBadge({ role }: { role: UserRole }) {
  const tone = role === "PRODUCT_MANAGER"
    ? "bg-[#eef4ff] text-[#2555a7]"
    : role === "TEAM_LEAD"
      ? "bg-[#f4f0ff] text-[#6543a5]"
      : role === "SUPER_ADMIN"
        ? "bg-[#fff2ed] text-[#a94826]"
        : "bg-[#f2f4f7] text-[#536071]";
  return <span className={`rounded-lg px-2.5 py-1 text-[11px] font-semibold ${tone}`}>{roleLabel(role)}</span>;
}
