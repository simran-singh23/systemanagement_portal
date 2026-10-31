export function UserAvatar({ name, email, image, size = "md" }: { name: string | null; email: string; image?: string | null; size?: "sm" | "md" }) {
  const label = name || email;
  const initials = label.split(/\s|@/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("");
  const dimensions = size === "sm" ? "size-8 rounded-lg text-[10px]" : "size-9 rounded-xl text-xs";
  return image ? <span aria-label={label} role="img" style={{ backgroundImage: `url(${image})` }} className={`${dimensions} block shrink-0 bg-[var(--blue-soft)] bg-cover bg-center`} /> : <span aria-hidden="true" className={`${dimensions} grid shrink-0 place-items-center bg-[var(--blue-soft)] font-bold text-[var(--blue)]`}>{initials}</span>;
}
