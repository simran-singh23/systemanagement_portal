export function UnreadCountBadge({ count }: { count: number }) {
  if (!count) return null;
  return <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-[#2563eb] px-1.5 py-0.5 text-[10px] font-bold leading-4 text-white">{count > 99 ? "99+" : count}</span>;
}
