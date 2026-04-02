"use client";

import { useMemo } from "react";
import { groupGalleryItemsByPost, galleryItemKey } from "@/lib/gallery-group";
import type { GalleryItem } from "@/lib/relay-api";
import GalleryGridTile from "./GalleryGridTile";
import PostBatchGridCell from "./PostBatchGridCell";

type Props = {
  items: GalleryItem[];
  tierTitleById: Record<string, string>;
  selectedKeys: Set<string>;
  focusIndex: number;
  onToggleSelect: (item: GalleryItem) => void;
  onFocusIndex: (index: number) => void;
  onInspect: (item: GalleryItem) => void;
  onOpenPostBatch: (items: GalleryItem[], startFlatIndex: number) => void;
};

export default function GalleryGrid({
  items,
  tierTitleById,
  selectedKeys,
  focusIndex,
  onToggleSelect,
  onFocusIndex,
  onInspect,
  onOpenPostBatch
}: Props) {
  const groups = useMemo(() => groupGalleryItemsByPost(items), [items]);

  let startFlatIndex = 0;

  return (
    <div
      className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2 p-4"
      role="list"
    >
      {groups.map((group) => {
        const { post_id, items: groupItems } = group;
        const start = startFlatIndex;
        startFlatIndex += groupItems.length;

        if (groupItems.length === 1) {
          const item = groupItems[0]!;
          const k = galleryItemKey(item);
          return (
            <div key={post_id} role="listitem">
              <GalleryGridTile
                item={item}
                tierTitleById={tierTitleById}
                selected={selectedKeys.has(k)}
                focused={focusIndex === start}
                flatIndex={start}
                onToggleSelect={onToggleSelect}
                onInspect={onInspect}
                onFocusIndex={onFocusIndex}
              />
            </div>
          );
        }

        return (
          <div key={post_id} role="listitem">
            <PostBatchGridCell
              items={groupItems}
              startFlatIndex={start}
              tierTitleById={tierTitleById}
              focusIndex={focusIndex}
              onOpenPostBatch={() => onOpenPostBatch(groupItems, start)}
              onInspect={onInspect}
              onFocusIndex={onFocusIndex}
            />
          </div>
        );
      })}
    </div>
  );
}
