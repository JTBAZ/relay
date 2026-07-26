"use client";

import {
  formatSyncHealthRollupBanner,
  shouldShowSyncHealthBanner,
  type PatreonSyncStateData
} from "@/lib/relay-api";

type Props = {
  syncState: PatreonSyncStateData | null;
  onViewDetails: () => void;
};

export default function SyncHealthBanner({ syncState, onViewDetails }: Props) {
  if (!syncState || !shouldShowSyncHealthBanner(syncState)) return null;

  const status = syncState.sync_health.status;
  const line = formatSyncHealthRollupBanner(syncState);

  const box =
    status === "failed"
      ? "border-[var(--lib-destructive)]/40 bg-[var(--lib-destructive)]/12"
      : status === "degraded"
        ? "border-[var(--lib-warning)]/45 bg-[var(--lib-warning)]/12"
        : "border-[var(--lib-border)] bg-[color-mix(in_srgb,var(--lib-muted)_55%,transparent)]";

  return (
    <div
      role="region"
      aria-label="Patreon sync status"
      className={`flex shrink-0 items-center justify-between gap-3 border-b px-3 py-2 text-xs leading-snug text-[var(--lib-fg)] ${box}`}
    >
      <p className="min-w-0 flex-1">{line}</p>
      <button
        type="button"
        className="shrink-0 rounded-md border border-[color-mix(in_srgb,var(--lib-fg)_18%,var(--lib-border))] bg-[var(--lib-card)] px-2.5 py-1 text-[11px] font-medium text-[var(--lib-fg)] transition-colors hover:border-[var(--lib-primary)]/50 hover:text-[var(--lib-fg)]"
        onClick={onViewDetails}
      >
        View details
      </button>
    </div>
  );
}
