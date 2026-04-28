"use client";

import {
  BarChart3,
  LayoutGrid,
  Library,
  Users
} from "lucide-react";
import { LibraryStatCard } from "./LibraryStatCard";

export type LibraryOverviewCounts = {
  postCount: number;
  assetCount: number;
  collectionCount: number;
  exportMediaCount: number;
  patronCount: number;
};

type Props = {
  counts: LibraryOverviewCounts;
};

/**
 * Ports the v0 “app shell” overview (stat grid + route map) into the real Library.
 * Counts are live where available; trend lines are labels, not growth metrics.
 */
export function LibraryOverviewPanel({ counts }: Props) {
  const {
    postCount,
    assetCount,
    collectionCount,
    exportMediaCount,
    patronCount
  } = counts;

  return (
    <details
      className="group shrink-0 border-b border-[var(--lib-border)] bg-[color-mix(in_srgb,var(--lib-card)_65%,var(--lib-bg))]"
      open
    >
      <summary className="cursor-pointer list-none px-4 py-2 text-[10px] font-semibold uppercase tracking-wider text-[var(--lib-fg-muted)] marker:hidden [&::-webkit-details-marker]:hidden">
        <span className="flex items-center gap-2">
          <span className="inline-block transition-transform group-open:rotate-90" aria-hidden>
            ▸
          </span>
          Workspace overview (design shell — Relay routes)
        </span>
      </summary>
      <div className="space-y-4 px-4 pb-4 pt-1">
        <section aria-label="Workspace metrics">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <LibraryStatCard
              label="Posts in view"
              value={postCount.toLocaleString()}
              sublabel="Filtered grid"
              icon={LayoutGrid}
            />
            <LibraryStatCard
              label="Assets in view"
              value={assetCount.toLocaleString()}
              sublabel="Media rows"
              icon={BarChart3}
            />
            <LibraryStatCard
              label="Collections"
              value={collectionCount.toLocaleString()}
              sublabel="Saved sets"
              icon={Library}
            />
            <LibraryStatCard
              label="Exported media"
              value={exportMediaCount.toLocaleString()}
              sublabel={patronCount > 0 ? `${patronCount.toLocaleString()} patrons (snapshot)` : "Run sync to grow"}
              icon={Users}
            />
          </div>
        </section>
      </div>
    </details>
  );
}
