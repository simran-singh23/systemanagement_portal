import { Icon, type IconName } from "@/components/ui/icons";

type SectionPlaceholderProps = {
  eyebrow: string;
  title: string;
  description: string;
  icon: IconName;
};

export function SectionPlaceholder({ eyebrow, title, description, icon }: SectionPlaceholderProps) {
  return (
    <section className="grid min-h-[calc(100vh-9rem)] place-items-center">
      <div className="w-full max-w-xl rounded-3xl border border-[#e6eaf0] bg-white p-8 text-center shadow-[0_12px_35px_rgba(16,24,40,0.05)] sm:p-12">
        <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-[#eef4ff] text-[#2563eb]"><Icon name={icon} className="size-6" /></span>
        <p className="mt-6 font-mono text-[10px] font-semibold uppercase tracking-[0.17em] text-[#2563eb]">{eyebrow}</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-[-0.045em] text-[#172033]">{title}</h1>
        <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-[#667085]">{description}</p>
        <span className="mt-7 inline-flex rounded-full bg-[#f5f7fb] px-3 py-1.5 text-xs font-medium text-[#7c8799]">Planned for a later phase</span>
      </div>
    </section>
  );
}
