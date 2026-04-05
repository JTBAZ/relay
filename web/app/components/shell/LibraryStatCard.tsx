import type { LucideIcon } from "lucide-react";

type Props = {
  icon?: LucideIcon;
  label: string;
  value: string | number;
  /** Secondary line under value — can be live data or placeholder trend copy */
  sublabel?: string;
  className?: string;
};

/** v0 shell–style metric tile; uses `library-shell` tokens only (no shadcn). */
export function LibraryStatCard({ icon: Icon, label, value, sublabel, className = "" }: Props) {
  return (
    <div
      className={`flex flex-col gap-2 rounded-lg border border-[var(--lib-border)] bg-[var(--lib-card)] px-4 py-3 transition-colors hover:border-[color-mix(in_srgb,var(--lib-selection)_45%,var(--lib-border))] ${className}`}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--lib-fg-muted)]">
          {label}
        </span>
        {Icon ? <Icon className="h-3.5 w-3.5 shrink-0 text-[var(--lib-fg-muted)]" aria-hidden /> : null}
      </div>
      <p className="text-xl font-bold tabular-nums tracking-tight text-[var(--lib-fg)]">{value}</p>
      {sublabel ? (
        <p className="text-[11px] font-medium text-[var(--lib-primary)]">{sublabel}</p>
      ) : null}
    </div>
  );
}
