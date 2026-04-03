"use client";

import { galleryItemKey, type PostGalleryGroup } from "@/lib/gallery-group";
import type { GalleryItem, TierFacet } from "@/lib/relay-api";
import GalleryGridTile from "./GalleryGridTile";

export type GalleryGridDensity = "dense" | "normal";

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

type Props = {
  groups: PostGalleryGroup[];
  tierTitleById: Record<string, string>;
  tierFacets?: TierFacet[];
  selectedKeys: Set<string>;
  /** Dense = more columns (control-room style); comfortable = larger thumbnails */
  gridDensity?: GalleryGridDensity;
  onToggleSelectGroup: (items: GalleryItem[]) => void;
  onFocusIndex: (index: number) => void;
  /** Carousel thumb (etc.): select only this asset, not the whole post. */
  onIsolateAssetSelection?: (item: GalleryItem) => void;
  creatorId: string;
  onExportRetryComplete?: () => void;
};

export default function GalleryGrid({
  groups,
  tierTitleById,
  tierFacets = [],
  selectedKeys,
  gridDensity = "dense",
  onToggleSelectGroup,
  onFocusIndex,
  onIsolateAssetSelection,
  creatorId,
  onExportRetryComplete
}: Props) {
  const gridClass =
    gridDensity === "dense"
      ? "grid grid-cols-2 auto-rows-[minmax(14rem,1fr)] gap-2 p-4 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6"
      : "grid grid-cols-2 auto-rows-[minmax(14rem,1fr)] gap-3 p-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-4 xl:grid-cols-5";

  return (
    <div className={gridClass} role="list">
      {groups.map((group, idx) => (
        <div key={group.post_id} className="flex h-full min-h-0 min-w-0 w-full">
          <GalleryGridTile
            items={group.items}
            tierTitleById={tierTitleById}
            tierFacets={tierFacets}
            selected={groupFullySelected(group, selectedKeys)}
            partiallySelected={groupPartiallySelected(group, selectedKeys)}
            flatIndex={idx}
            onToggleSelect={onToggleSelectGroup}
            onFocusIndex={onFocusIndex}
            onIsolateAssetSelection={onIsolateAssetSelection}
            creatorId={creatorId}
            onExportRetryComplete={onExportRetryComplete}
          />
        </div>
      ))}
    </div>
  );
}
