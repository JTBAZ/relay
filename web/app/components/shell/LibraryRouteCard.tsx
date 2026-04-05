import Link from "next/link";
import type { LucideIcon } from "lucide-react";

type Props = {
  href: string;
  title: string;
  description: string;
  badge?: string;
  icon?: LucideIcon;
};

/** v0 RouteCard pattern — navigates within Relay (Next 14). */
export function LibraryRouteCard({ href, title, description, badge, icon: Icon }: Props) {
  return (
    <Link
      href={href}
      className="group flex items-start gap-3 rounded-lg border border-[var(--lib-border)] bg-[var(--lib-card)] px-4 py-3 transition-colors hover:border-[color-mix(in_srgb,var(--lib-selection)_40%,var(--lib-border))] hover:bg-[color-mix(in_srgb,var(--lib-selection)_8%,var(--lib-card))]"
    >
      {Icon ? (
        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-[var(--lib-muted)] transition-colors group-hover:bg-[color-mix(in_srgb,var(--lib-selection)_15%,var(--lib-muted))]">
          <Icon className="h-4 w-4 text-[var(--lib-fg-muted)] transition-colors group-hover:text-[var(--lib-selection)]" />
        </span>
      ) : null}
      <div className="min-w-0 flex-1 space-y-0.5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold text-[var(--lib-fg)] transition-colors group-hover:text-[var(--lib-selection)]">
            {title}
          </span>
          {badge ? (
            <span className="rounded-full bg-[color-mix(in_srgb,var(--lib-selection)_18%,transparent)] px-2 py-0.5 text-[10px] font-semibold tracking-wide text-[var(--lib-selection)]">
              {badge}
            </span>
          ) : null}
        </div>
        <p className="text-xs leading-relaxed text-[var(--lib-fg-muted)]">{description}</p>
      </div>
    </Link>
  );
}
