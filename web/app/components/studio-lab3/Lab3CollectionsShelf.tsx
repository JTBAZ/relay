"use client";

import { useMemo, useState } from "react";
import { galleryItemImageGridSrc, type Collection, type GalleryItem } from "@/lib/relay-api";
import { stacksFromCollections, type StudioCollectionStack } from "@/lib/studio-content-projection";

type Props = {
  collections: Collection[];
  items: GalleryItem[];
  activeCollectionId: string | null;
  onSelect: (collectionId: string | null) => void;
};

function CompactCollectionChip({
  stack,
  selected,
  onSelect
}: {
  stack: StudioCollectionStack;
  selected: boolean;
  onSelect: (collectionId: string | null) => void;
}) {
  const covers = stack.member_covers.slice(0, 3);
  const [failed, setFailed] = useState<Record<string, boolean>>({});
  const stackWidth = 48 + Math.max(0, covers.length - 1) * 8;

  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={() => onSelect(selected ? null : stack.collection_id)}
      className={`flex h-14 shrink-0 items-center gap-2.5 rounded-lg px-1.5 pr-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lab3-mint,#9bf0c4)] ${
        selected ? "bg-[#9bf0c414] ring-1 ring-[var(--lab3-mint,#9bf0c4)]" : "hover:bg-[#ffffff08]"
      }`}
    >
      <div className="relative h-12 shrink-0" style={{ width: stackWidth }}>
        {covers.length === 0 ? (
          <div className="h-12 w-12 rounded-md border border-[var(--lab3-hairline,#1c211f)] bg-[#122018]" />
        ) : (
          covers.map((cover, index) => (
            <div
              key={cover.post_id}
              className="absolute top-0 h-12 w-12 overflow-hidden rounded-md border border-[var(--lab3-hairline,#1c211f)] bg-[#122018]"
              style={{ left: index * 8, zIndex: covers.length - index }}
            >
              {cover.src && !failed[cover.post_id] ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={cover.src}
                  alt=""
                  className="h-full w-full object-cover"
                  onError={() => setFailed((prev) => ({ ...prev, [cover.post_id]: true }))}
                />
              ) : null}
            </div>
          ))
        )}
      </div>
      <span className="min-w-0 text-left">
        <span className="block max-w-[9rem] truncate text-[12px] font-medium text-[var(--lab3-text,#d0ddd4)]">
          {stack.title}
        </span>
        <span className="text-[10px] tabular-nums text-[var(--lab3-text-muted,#6a736e)]">
          {stack.post_ids.length}
        </span>
      </span>
    </button>
  );
}

export function Lab3CollectionsShelf({
  collections,
  items,
  activeCollectionId,
  onSelect
}: Props) {
  const stacks = useMemo(() => {
    const titles = new Map<string, string>();
    const srcs = new Map<string, string | null>();
    for (const it of items) {
      if (!titles.has(it.post_id)) titles.set(it.post_id, it.title);
      if (!srcs.has(it.post_id)) srcs.set(it.post_id, galleryItemImageGridSrc(it));
    }
    return stacksFromCollections(collections, titles, srcs).filter(
      (stack) => stack.post_ids.length > 0
    );
  }, [collections, items]);

  if (stacks.length === 0) return null;

  return (
    <section
      className="flex h-[72px] shrink-0 items-center border-b border-[var(--lab3-hairline,#1c211f)] px-5 sm:px-6"
      aria-label="Collections"
      data-lab3-collections-shelf
      data-lab3-shelf-compact=""
    >
      <div className="flex h-14 w-full gap-1 overflow-x-auto library-hide-scrollbars">
        {stacks.map((stack) => (
          <CompactCollectionChip
            key={stack.collection_id}
            stack={stack}
            selected={stack.collection_id === activeCollectionId}
            onSelect={onSelect}
          />
        ))}
      </div>
    </section>
  );
}
