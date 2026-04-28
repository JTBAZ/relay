import Link from "next/link";
import type { LucideIcon } from "lucide-react";

type Props = {
  href: string;
  title: string;
  description: string;
  badge?: string;
  icon?: LucideIcon;
};

/** Compact Library action button — navigates within Relay (Next 14). */
export function LibraryRouteCard({ href, title, description, badge, icon: Icon }: Props) {
  return (
    <Link
      href={href}
      aria-label={`${title}: ${description}`}
      title={description}
      className="group inline-flex items-center gap-2 rounded-full border border-[color-mix(in_srgb,var(--lib-selection)_38%,var(--lib-border))] bg-[color-mix(in_srgb,var(--lib-selection)_14%,#050807)] px-3.5 py-2 text-sm font-semibold text-[var(--lib-fg)] shadow-[0_0_0_1px_rgba(255,255,255,0.04),0_8px_24px_-18px_var(--lib-selection)] transition-colors hover:border-[var(--lib-selection)] hover:bg-[color-mix(in_srgb,var(--lib-selection)_22%,#050807)] hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lib-selection)]/60"
    >
      {Icon ? (
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--lib-selection)_24%,#020403)] ring-1 ring-[color-mix(in_srgb,var(--lib-selection)_40%,transparent)] transition-colors group-hover:bg-[color-mix(in_srgb,var(--lib-selection)_34%,#020403)]">
          <Icon className="h-3.5 w-3.5 text-[var(--lib-selection)] transition-colors group-hover:text-white" />
        </span>
      ) : null}
      <span>{title}</span>
      {badge ? (
        <span className="rounded-full bg-[color-mix(in_srgb,var(--lib-selection)_28%,transparent)] px-2 py-0.5 text-[10px] font-semibold tracking-wide text-[var(--lib-selection)] ring-1 ring-[color-mix(in_srgb,var(--lib-selection)_30%,transparent)]">
          {badge}
        </span>
      ) : null}
    </Link>
  );
}
