"use client";

import type { ReactNode } from "react";

export type LibraryEmptyVariant =
  | "no_posts"
  | "no_results"
  | "no_cues"
  | "no_month_events"
  | "no_selection"
  | "no_distribution";

type LibraryEmptyStateProps = {
  variant: LibraryEmptyVariant;
  title?: string;
  description?: string;
  action?: ReactNode;
  className?: string;
  /** Use dashed border for primary empty (library). */
  dashed?: boolean;
};

const COPY: Record<LibraryEmptyVariant, { title: string; description: string }> = {
  no_posts: {
    title: "No posts in your library yet",
    description:
      "Connect Patreon (creator OAuth), then use Patreon → Check for new posts to pull posts into Relay. Nothing here is shown to visitors until you curate Relay visibility and layout.",
  },
  no_results: {
    title: "No assets match your filters",
    description:
      "Adjust Find Assets, tags, tiers, visibility toggles, or media types — or clear search.",
  },
  no_cues: {
    title: "Nothing cued to fill",
    description:
      "Drop Import Bay media onto the Scheduler, then choose AutoPost or Schedule Post. Or add a scheduled post with +.",
  },
  no_month_events: {
    title: "No scheduled steps this month",
    description: "Use + to add a scheduled post, or approve a Coach plan to fill the calendar.",
  },
  no_selection: {
    title: "No post selected",
    description: "Click an item in the gallery to load it here.",
  },
  no_distribution: {
    title: "No distribution gaps",
    description: "This work is present on tracked destinations, or distribution data is still loading.",
  },
};

export default function LibraryEmptyState({
  variant,
  title,
  description,
  action,
  className = "",
  dashed = false,
}: LibraryEmptyStateProps) {
  const defaults = COPY[variant];
  return (
    <div
      role="status"
      className={`rounded-lg border px-4 py-6 text-center ${
        dashed
          ? "border-dashed border-[var(--lib-border)] bg-[var(--lib-muted)]/25"
          : "border-[var(--lib-border)] bg-[var(--lib-card)]"
      } ${className}`}
    >
      <p className="text-sm font-medium text-[var(--lib-fg)]">{title ?? defaults.title}</p>
      <p className="mx-auto mt-2 max-w-md text-xs leading-relaxed text-[var(--lib-fg-muted)]">
        {description ?? defaults.description}
      </p>
      {action ? <div className="mt-3 flex justify-center">{action}</div> : null}
    </div>
  );
}
