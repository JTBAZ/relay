"use client";

import { useMemo, useRef, useEffect, type RefObject } from "react";
import { PieChart as PieChartIcon, X } from "lucide-react";
import type { GalleryItem, TierFacet } from "@/lib/relay-api";
import { pickPrimaryAccessTierIdForChip, tierAnalyticsBucketLabel } from "@/lib/tier-access";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  items: GalleryItem[];
  anchorRef: RefObject<HTMLButtonElement | null>;
  tierTitleById: Record<string, string>;
  tierFacets: TierFacet[];
};

export default function GalleryStatsDrawer({
  isOpen,
  onClose,
  items,
  anchorRef,
  tierTitleById,
  tierFacets
}: Props) {
  const popoverRef = useRef<HTMLDivElement>(null);

  const stats = useMemo(() => {
    const matureCount = items.filter((it) => it.visibility === "review").length;
    const generalCount = items.length - matureCount;
    const tierCounts: Record<string, number> = {};
    const tagCounts: Record<string, number> = {};

    for (const item of items) {
      const tid =
        item.tier_ids.length > 0
          ? pickPrimaryAccessTierIdForChip(item.tier_ids, tierFacets)
          : null;
      const title = tid ? tierTitleById[tid] ?? tid : "No Tier";
      const bucket = tid ? tierAnalyticsBucketLabel(tid, title) : "No Tier";
      tierCounts[bucket] = (tierCounts[bucket] ?? 0) + 1;
      for (const tag of item.tag_ids) tagCounts[tag] = (tagCounts[tag] ?? 0) + 1;
    }

    return {
      total: items.length,
      matureCount,
      generalCount,
      tierCounts: Object.entries(tierCounts).sort((a, b) => b[1] - a[1]),
      sortedTags: Object.entries(tagCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
    };
  }, [items, tierFacets, tierTitleById]);

  useEffect(() => {
    if (!isOpen) return;
    const onPointer = (event: MouseEvent) => {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(event.target as Node) &&
        anchorRef.current &&
        !anchorRef.current.contains(event.target as Node)
      ) {
        onClose();
      }
    };
    document.addEventListener("mousedown", onPointer);
    return () => document.removeEventListener("mousedown", onPointer);
  }, [anchorRef, isOpen, onClose]);

  if (!isOpen) return null;

  const tierColors = ["#00ffb4", "#00d4a0", "#00a882", "#007d64", "#005e4c"];
  const tierTotal = stats.tierCounts.reduce((sum, [, count]) => sum + count, 0);
  let cumulative = 0;

  return (
    <div
      ref={popoverRef}
      data-gallery-stats-drawer
      className="absolute left-2 top-[calc(2.5rem+2px)] z-50 flex w-72 max-h-[420px] flex-col rounded-lg border border-[var(--lib-border)] bg-[var(--lib-card)] shadow-2xl"
    >
      <div className="flex h-9 shrink-0 items-center justify-between border-b border-[var(--lib-border)] px-3">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-[var(--lib-fg)]">
          Gallery Statistics
        </span>
        <button
          type="button"
          onClick={onClose}
          className="flex h-5 w-5 items-center justify-center rounded text-[var(--lib-fg-muted)] hover:bg-[var(--lib-muted)] hover:text-[var(--lib-fg)]"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto p-3">
        <div className="flex items-baseline gap-2 px-1">
          <span className="text-2xl font-bold tabular-nums text-[var(--lib-fg)]">
            {stats.total.toLocaleString()}
          </span>
          <span className="text-xs text-[var(--lib-fg-muted)]">total assets</span>
        </div>

        <section>
          <h4 className="mb-2 text-[9px] font-semibold uppercase tracking-widest text-[var(--lib-fg-muted)]">
            Content Rating
          </h4>
          <StatBar label="General" count={stats.generalCount} total={stats.total} color="#00ffb4" />
          <StatBar label="Mature 18+" count={stats.matureCount} total={stats.total} color="#ef4444" />
        </section>

        <section>
          <h4 className="mb-2 text-[9px] font-semibold uppercase tracking-widest text-[var(--lib-fg-muted)]">
            Tier Distribution
          </h4>
          <div className="mb-2 flex items-center gap-3">
            <div className="relative h-16 w-16 shrink-0">
              <svg viewBox="0 0 32 32" className="h-full w-full -rotate-90">
                {stats.tierCounts.map(([tier, count], idx) => {
                  const pct = tierTotal > 0 ? (count / tierTotal) * 100 : 0;
                  const offset = -cumulative;
                  cumulative += pct;
                  return (
                    <circle
                      key={tier}
                      r="14"
                      cx="16"
                      cy="16"
                      fill="transparent"
                      stroke={tierColors[idx % tierColors.length]}
                      strokeWidth="4"
                      strokeDasharray={`${(count / Math.max(1, tierTotal)) * 87.96} 87.96`}
                      strokeDashoffset={offset * 0.8796}
                    />
                  );
                })}
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <PieChartIcon className="h-4 w-4 text-[var(--lib-fg-muted)]/25" />
              </div>
            </div>
            <div className="flex-1 space-y-1">
              {stats.tierCounts.map(([tier, count], idx) => (
                <div key={tier} className="flex items-center gap-1.5 text-[11px]">
                  <div
                    className="h-1.5 w-1.5 rounded-full"
                    style={{ backgroundColor: tierColors[idx % tierColors.length] }}
                  />
                  <span
                    className="flex-1 text-[var(--lib-fg-muted)]"
                    title={tier === "Free" ? "Includes public posts" : undefined}
                  >
                    {tier}
                  </span>
                  <span className="tabular-nums text-[var(--lib-fg)]">{count}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section>
          <h4 className="mb-2 text-[9px] font-semibold uppercase tracking-widest text-[var(--lib-fg-muted)]">
            Most Common Tags
          </h4>
          <div className="space-y-1.5">
            {stats.sortedTags.map(([tag, count], idx) => (
              <div key={tag} className="flex items-center gap-2">
                <span className="w-16 truncate text-[11px] text-[var(--lib-fg-muted)]">{tag}</span>
                <div className="h-1 flex-1 overflow-hidden rounded-full bg-[var(--lib-muted)]">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${stats.sortedTags[0] ? (count / stats.sortedTags[0][1]) * 100 : 0}%`,
                      backgroundColor: `oklch(0.68 0.14 ${155 + idx * 12})`
                    }}
                  />
                </div>
                <span className="w-5 text-right text-[10px] tabular-nums text-[var(--lib-fg)]">{count}</span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

function StatBar({
  label,
  count,
  total,
  color
}: {
  label: string;
  count: number;
  total: number;
  color: string;
}) {
  const pct = total > 0 ? (count / total) * 100 : 0;
  return (
    <div className="flex items-center gap-2">
      <span className="w-16 shrink-0 truncate text-[11px] text-[var(--lib-fg-muted)]">{label}</span>
      <div className="h-1 flex-1 overflow-hidden rounded-full bg-[var(--lib-muted)]">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
      <span className="w-8 text-right text-[10px] tabular-nums text-[var(--lib-fg)]">
        {count.toLocaleString()}
      </span>
    </div>
  );
}
