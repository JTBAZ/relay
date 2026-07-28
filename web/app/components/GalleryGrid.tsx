"use client";

import { memo, useEffect, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { galleryItemKey, type PostGalleryGroup } from "@/lib/gallery-group";
import { collapsePostGroupsToGridCards } from "@/lib/active-post-linked-sets";
import type { GalleryItem, TierFacet } from "@/lib/relay-api";
import ActivePostPresenceCard from "./ActivePostPresenceCard";
import LinkedSetCard from "./studio/LinkedSetCard";

export type GalleryGridDensity = "dense" | "normal" | "lab" | "lab2";

/** Match Tailwind viewport breakpoints used by the grid classes. */
export function galleryGridColumnCount(
  viewportWidth: number,
  density: GalleryGridDensity
): number {
  if (density === "lab2") {
    // v0 Active Posts: 3 cols default, 4 at xl.
    if (viewportWidth >= 1280) return 4;
    if (viewportWidth >= 768) return 3;
    if (viewportWidth >= 560) return 2;
    return 1;
  }
  if (density === "lab") {
    // Fill stage left of Schedule Rail — denser columns as width grows.
    if (viewportWidth >= 1280) return 5;
    if (viewportWidth >= 1024) return 4;
    if (viewportWidth >= 768) return 3;
    if (viewportWidth >= 560) return 2;
    return 1;
  }
  if (density === "dense") {
    if (viewportWidth >= 1280) return 7;
    if (viewportWidth >= 1024) return 6;
    if (viewportWidth >= 768) return 4;
    if (viewportWidth >= 640) return 3;
    return 2;
  }
  if (viewportWidth >= 1024) return 5;
  if (viewportWidth >= 768) return 4;
  if (viewportWidth >= 640) return 3;
  return 2;
}

function groupFullySelected(group: PostGalleryGroup, selectedKeys: Set<string>): boolean {
  return (
    group.items.length > 0 && group.items.every((i) => selectedKeys.has(galleryItemKey(i)))
  );
}

function groupPartiallySelected(group: PostGalleryGroup, selectedKeys: Set<string>): boolean {
  if (group.items.length <= 1) return false;
  const any = group.items.some((i) => selectedKeys.has(galleryItemKey(i)));
  return any && !groupFullySelected(group, selectedKeys);
}

function setFullySelected(
  members: PostGalleryGroup[],
  selectedKeys: Set<string>
): boolean {
  return (
    members.length > 0 &&
    members.every((group) => groupFullySelected(group, selectedKeys))
  );
}

type Props = {
  groups: PostGalleryGroup[];
  tierTitleById: Record<string, string>;
  tierFacets?: TierFacet[];
  selectedKeys: Set<string>;
  gridDensity?: GalleryGridDensity;
  onToggleSelectGroup: (items: GalleryItem[], selectionAnchorKey?: string) => void;
  onFocusIndex: (index: number) => void;
  onIsolateAssetSelection?: (item: GalleryItem) => void;
  creatorId: string;
  onExportRetryComplete?: () => void;
  onPresentClick: (destination: string, externalUrl: string) => void;
  onGhostClick: (destination: string, items: GalleryItem[]) => void;
  onOpenLinkedSet: (creativeWorkId: string) => void;
  onOpenPost: (items: GalleryItem[]) => void;
};

function GalleryGrid({
  groups,
  tierTitleById,
  tierFacets = [],
  selectedKeys,
  gridDensity = "dense",
  onToggleSelectGroup,
  onFocusIndex,
  onPresentClick,
  onGhostClick,
  onOpenLinkedSet,
  onOpenPost,
  creatorId,
  onExportRetryComplete
}: Props) {
  const cards = useMemo(() => collapsePostGroupsToGridCards(groups), [groups]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [viewportWidth, setViewportWidth] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth : 1024
  );
  const [scrollWidth, setScrollWidth] = useState(0);

  useEffect(() => {
    const onResize = () => setViewportWidth(window.innerWidth);
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width ?? el.clientWidth;
      setScrollWidth(w);
    });
    ro.observe(el);
    setScrollWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const columnCount = galleryGridColumnCount(viewportWidth, gridDensity);
  const rowCount = Math.ceil(cards.length / columnCount) || 0;
  const isLab2Grid = gridDensity === "lab2";
  const isLabGrid = gridDensity === "lab" || isLab2Grid;
  // lab2 uses v0 landscape cards; classic lab uses square tiles.
  const tileAspect = isLab2Grid ? "4 / 3" : gridDensity === "lab" ? "1 / 1" : "3 / 4";
  const aspectFactor = isLab2Grid ? 3 / 4 : gridDensity === "lab" ? 1 : 4 / 3;

  const padX = isLab2Grid ? 40 : isLabGrid ? 24 : gridDensity === "dense" ? 32 : 48;
  const gap = isLab2Grid ? 10 : isLabGrid ? 12 : 12;
  const estimateRowSize = useMemo(() => {
    const inner = Math.max(160, (scrollWidth || viewportWidth) - padX);
    const colW = (inner - gap * (columnCount - 1)) / columnCount;
    return Math.max(140, colW * aspectFactor + gap);
  }, [scrollWidth, viewportWidth, padX, columnCount, gap, aspectFactor]);

  const rowVirtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => estimateRowSize,
    overscan: 3
  });

  const padClass = isLab2Grid
    ? "px-5"
    : isLabGrid
      ? "px-3"
      : gridDensity === "dense"
        ? "px-4"
        : "px-6";

  return (
    <div
      ref={scrollRef}
      className={`min-h-0 flex-1 overflow-auto pb-10 ${isLabGrid ? "bg-[#050706]" : "bg-black"}`}
    >
      <div
        className={`relative w-full ${isLab2Grid ? "pt-4" : isLabGrid ? "pt-3" : "pt-4"}`}
        style={{ height: `${rowVirtualizer.getTotalSize() + (isLabGrid ? 72 : 96)}px` }}
        role="list"
      >
        {rowVirtualizer.getVirtualItems().map((virtualRow) => {
          const start = virtualRow.index * columnCount;
          const rowCards = cards.slice(start, start + columnCount);
          return (
            <div
              key={virtualRow.key}
              data-index={virtualRow.index}
              ref={rowVirtualizer.measureElement}
              className={`absolute left-0 right-0 grid ${padClass}`}
              style={{
                transform: `translateY(${virtualRow.start}px)`,
                gridTemplateColumns: `repeat(${columnCount}, minmax(0, 1fr))`,
                gap: `${gap}px`
              }}
            >
              {rowCards.map((card, colIdx) => {
                const idx = start + colIdx;
                if (card.kind === "linked_set") {
                  const memberGroups = card.members.map((m) => m.group);
                  const allItems = memberGroups.flatMap((g) => g.items);
                  const coverItems =
                    card.members.find((m) => m.post_id === card.cover_post_id)?.group.items ??
                    card.members[0]?.group.items ??
                    [];
                  return (
                    <div key={card.creative_work_id} className="min-w-0 w-full">
                      <LinkedSetCard
                        creativeWorkId={card.creative_work_id}
                        title={card.title}
                        memberCount={card.member_count}
                        members={card.members}
                        present={card.present}
                        missing={card.missing}
                        selected={setFullySelected(memberGroups, selectedKeys)}
                        aspectRatio={tileAspect}
                        presentation={isLab2Grid ? "lab2" : "default"}
                        onToggleSelect={() => onToggleSelectGroup(allItems)}
                        onOpenSummary={() => onOpenLinkedSet(card.creative_work_id)}
                        onPresentClick={onPresentClick}
                        onGhostClick={() => {
                          onGhostClick("x", coverItems);
                        }}
                      />
                    </div>
                  );
                }

                const group = card.group;
                return (
                  <div key={group.post_id} className="min-w-0 w-full">
                    <ActivePostPresenceCard
                      items={group.items}
                      tierTitleById={tierTitleById}
                      tierFacets={tierFacets}
                      selected={groupFullySelected(group, selectedKeys)}
                      partiallySelected={groupPartiallySelected(group, selectedKeys)}
                      flatIndex={idx}
                      aspectRatio={tileAspect}
                      presentation={isLab2Grid ? "lab2" : "default"}
                      creatorId={creatorId}
                      onExportRetryComplete={onExportRetryComplete}
                      onToggleSelect={onToggleSelectGroup}
                      onFocusIndex={onFocusIndex}
                      onOpen={onOpenPost}
                      onPresentClick={onPresentClick}
                      onGhostClick={onGhostClick}
                    />
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default memo(GalleryGrid);
