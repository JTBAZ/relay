"use client";

import { useState, type ElementType, type KeyboardEvent } from "react";
import {
  LayoutGrid,
  List,
  Search,
  Plus,
  Pin,
  MoreHorizontal,
  Globe,
  Link2,
  Lock,
  ChevronDown,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  MOCK_COLLECTIONS,
  VISIBILITY_CONFIG,
  type Collection,
  type CollectionVisibility,
} from "@/lib/collections-data";

type ViewMode = "grid" | "list";
type SortKey = "recently-added" | "title" | "item-count";

interface CollectionsBrowserProps {
  selectedId: string | null;
  onSelect: (collection: Collection) => void;
  onNewShelf: () => void;
}

const VISIBILITY_ICONS: Record<CollectionVisibility, ElementType> = {
  private: Lock,
  link: Link2,
  public: Globe,
};

const SORT_OPTIONS: { label: string; value: SortKey }[] = [
  { label: "Recently added", value: "recently-added" },
  { label: "Title", value: "title" },
  { label: "Item count", value: "item-count" },
];

function runIfRowActivationKey(e: KeyboardEvent, action: () => void) {
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    action();
  }
}

function VisibilityBadge({ visibility }: { visibility: CollectionVisibility }) {
  const Icon = VISIBILITY_ICONS[visibility];
  return (
    <span className="flex items-center gap-1 text-[#9CA3AF]">
      <Icon className="h-3 w-3" />
      <span className="text-[10px]">{VISIBILITY_CONFIG[visibility].label}</span>
    </span>
  );
}

function CollectionCover({ collection, size = "lg" }: { collection: Collection; size?: "sm" | "lg" }) {
  return (
    <div
      className={cn(
        "relative flex flex-col justify-between overflow-hidden",
        size === "lg" ? "h-full w-full p-4" : "h-10 w-14 p-2",
      )}
      style={{ background: collection.coverColor }}
    >
      <div
        className={cn("self-start rounded-sm opacity-80", size === "lg" ? "h-1 w-6" : "h-0.5 w-4")}
        style={{ background: collection.coverAccent }}
      />
      <div className="flex flex-col gap-0.5">
        <div
          className="rounded-full opacity-60"
          style={{ background: collection.coverAccent, height: 2, width: size === "lg" ? 28 : 16 }}
        />
        <div
          className="rounded-full opacity-30"
          style={{ background: collection.coverAccent, height: 2, width: size === "lg" ? 18 : 10 }}
        />
      </div>
    </div>
  );
}

function CollectionCardGrid({
  collection,
  selected,
  onClick,
}: {
  collection: Collection;
  selected: boolean;
  onClick: () => void;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => runIfRowActivationKey(e, onClick)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={cn(
        "group relative flex w-full cursor-pointer flex-col overflow-hidden rounded-xl border text-left transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2D6A4F]",
        selected
          ? "border-[#2D6A4F] bg-[#0D1F17] shadow-[0_0_0_1px_#2D6A4F22]"
          : "border-[#2A2A2A] bg-[#111111] hover:border-[#3A3A3A] hover:bg-[#141414]",
      )}
    >
      <div className="relative h-36 w-full">
        <CollectionCover collection={collection} size="lg" />
        {collection.pinned && (
          <div className="absolute right-2 top-2 rounded bg-black/50 p-1">
            <Pin className="h-3 w-3 text-[#C5B358]" aria-label="Pinned" />
          </div>
        )}
        {hovered && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 bg-black/50">
            <span className="text-xs font-semibold tracking-wide text-[#F9FAFB]">Open collection</span>
            <span className="text-[10px] text-[#9CA3AF]">{collection.itemCount} items</span>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-2.5 p-4">
        <div className="flex items-start justify-between gap-2">
          <h3 className="line-clamp-1 text-balance text-sm font-semibold leading-snug text-[#F9FAFB]">
            {collection.title}
          </h3>
          <button
            type="button"
            onClick={(e) => e.stopPropagation()}
            className="shrink-0 rounded p-0.5 opacity-0 transition-opacity hover:bg-[#2A2A2A] focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#2D6A4F] group-hover:opacity-100"
            aria-label="More options"
          >
            <MoreHorizontal className="h-3.5 w-3.5 text-[#9CA3AF]" />
          </button>
        </div>
        <p className="line-clamp-2 text-xs leading-relaxed text-[#9CA3AF]">{collection.description}</p>

        <div className="flex flex-wrap gap-1">
          {collection.tags.map((tag) => (
            <span
              key={tag}
              className="cursor-default rounded-full border border-[#2A2A2A] px-1.5 py-0.5 text-[10px] text-[#9CA3AF] transition-colors hover:border-[#2D6A4F] hover:text-[#40916C]"
            >
              #{tag}
            </span>
          ))}
        </div>

        <div className="flex items-center justify-between border-t border-[#2A2A2A] pt-1.5">
          <VisibilityBadge visibility={collection.visibility} />
          <span className="text-[10px] text-[#9CA3AF]">
            {collection.itemCount} items · {collection.updatedAt}
          </span>
        </div>
      </div>
    </div>
  );
}

function CollectionRowList({
  collection,
  selected,
  onClick,
}: {
  collection: Collection;
  selected: boolean;
  onClick: () => void;
}) {
  const VisIcon = VISIBILITY_ICONS[collection.visibility];
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => runIfRowActivationKey(e, onClick)}
      className={cn(
        "group flex w-full cursor-pointer items-center gap-4 rounded-xl border px-4 py-3 text-left transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2D6A4F]",
        selected
          ? "border-[#2D6A4F] bg-[#0D1F17]"
          : "border-[#2A2A2A] bg-[#111111] hover:border-[#3A3A3A] hover:bg-[#141414]",
      )}
    >
      <div className="h-10 w-14 shrink-0 overflow-hidden rounded-lg">
        <CollectionCover collection={collection} size="sm" />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-semibold text-[#F9FAFB]">{collection.title}</p>
          {collection.pinned && <Pin className="h-3 w-3 shrink-0 text-[#C5B358]" aria-label="Pinned" />}
        </div>
        <p className="mt-0.5 truncate text-xs text-[#9CA3AF]">{collection.description}</p>
      </div>

      <div className="hidden shrink-0 items-center gap-1.5 md:flex">
        {collection.tags.slice(0, 3).map((tag) => (
          <span
            key={tag}
            className="rounded-full border border-[#2A2A2A] px-1.5 py-0.5 text-[10px] text-[#9CA3AF]"
          >
            #{tag}
          </span>
        ))}
      </div>

      <span className="hidden w-28 shrink-0 items-center gap-1 text-[10px] text-[#9CA3AF] lg:flex">
        <VisIcon className="h-3 w-3" />
        {VISIBILITY_CONFIG[collection.visibility].label}
      </span>

      <span className="w-16 shrink-0 text-right text-xs text-[#9CA3AF]">{collection.itemCount} items</span>

      <button
        type="button"
        onClick={(e) => e.stopPropagation()}
        className="shrink-0 rounded p-1.5 opacity-0 transition-opacity hover:bg-[#2A2A2A] focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#2D6A4F] group-hover:opacity-100"
        aria-label="More options"
      >
        <MoreHorizontal className="h-4 w-4 text-[#9CA3AF]" />
      </button>
    </div>
  );
}

export function CollectionsBrowser({ selectedId, onSelect, onNewShelf }: CollectionsBrowserProps) {
  const [view, setView] = useState<ViewMode>("grid");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortKey>("recently-added");
  const [sortOpen, setSortOpen] = useState(false);

  const filtered = MOCK_COLLECTIONS.filter((c) => {
    const matchesSearch =
      !search ||
      c.title.toLowerCase().includes(search.toLowerCase()) ||
      c.description.toLowerCase().includes(search.toLowerCase()) ||
      c.tags.some((t) => t.toLowerCase().includes(search.toLowerCase()));
    return matchesSearch;
  })
    .sort((a, b) => {
      if (sort === "title") return a.title.localeCompare(b.title);
      if (sort === "item-count") return b.itemCount - a.itemCount;
      if (a.pinned && !b.pinned) return -1;
      if (!a.pinned && b.pinned) return 1;
      return 0;
    });

  const currentSortLabel = SORT_OPTIONS.find((s) => s.value === sort)?.label ?? "Sort";
  const totalItems = MOCK_COLLECTIONS.reduce((a, c) => a + c.itemCount, 0);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center justify-between border-b border-[#2A2A2A] px-6 py-5">
        <div>
          <h1 className="text-lg font-semibold text-[#F9FAFB]">Collections</h1>
          <p className="mt-0.5 text-xs text-[#9CA3AF]">
            {MOCK_COLLECTIONS.length} shelves · {totalItems} items collected
          </p>
        </div>
        <button
          type="button"
          onClick={onNewShelf}
          className="flex items-center gap-2 rounded-lg bg-[#2D6A4F] px-3.5 py-2 text-sm font-medium text-[#F9FAFB] transition-colors hover:bg-[#40916C] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#40916C] focus-visible:ring-offset-1 focus-visible:ring-offset-[#0A0A0A]"
        >
          <Plus className="h-4 w-4" />
          New shelf
        </button>
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-3 border-b border-[#2A2A2A] px-6 py-3">
        <div className="relative min-w-0 w-48 sm:w-64">
          <Search className="absolute left-3 top-1/2 h-3 w-3 -translate-y-1/2 text-[#9CA3AF]" aria-hidden />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search collections, tags..."
            aria-label="Search collections"
            className="w-full rounded-lg border border-[#2A2A2A] bg-[#1A1A1A] py-2 pl-9 pr-3 text-xs text-[#F9FAFB] placeholder:text-[#9CA3AF] transition-colors focus:border-[#2D6A4F] focus:outline-none focus:ring-1 focus:ring-[#2D6A4F]"
          />
        </div>

        <div className="flex-1" />

        <div className="relative shrink-0">
          <button
            type="button"
            onClick={() => setSortOpen((p) => !p)}
            aria-haspopup="listbox"
            aria-expanded={sortOpen}
            className="flex items-center gap-1.5 rounded-lg border border-[#2A2A2A] bg-[#1A1A1A] px-3 py-2 text-xs text-[#9CA3AF] transition-colors hover:border-[#333333] hover:text-[#F9FAFB] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#2D6A4F]"
          >
            {currentSortLabel}
            <ChevronDown className="h-3 w-3" />
          </button>
          {sortOpen && (
            <div
              role="listbox"
              aria-label="Sort options"
              className="absolute right-0 top-full z-20 mt-1 w-40 overflow-hidden rounded-lg border border-[#2A2A2A] bg-[#1A1A1A] shadow-xl"
            >
              {SORT_OPTIONS.map((s) => (
                <button
                  key={s.value}
                  type="button"
                  role="option"
                  aria-selected={sort === s.value}
                  onClick={() => {
                    setSort(s.value);
                    setSortOpen(false);
                  }}
                  className={cn(
                    "w-full px-3 py-2 text-left text-xs transition-colors hover:bg-[#2A2A2A]",
                    sort === s.value ? "text-[#40916C]" : "text-[#9CA3AF] hover:text-[#F9FAFB]",
                  )}
                >
                  {s.label}
                </button>
              ))}
            </div>
          )}
        </div>

        <div
          className="flex shrink-0 items-center rounded-lg border border-[#2A2A2A] bg-[#111111] p-1"
          role="group"
          aria-label="View mode"
        >
          <button
            type="button"
            onClick={() => setView("grid")}
            aria-pressed={view === "grid"}
            aria-label="Grid view"
            className={cn(
              "rounded p-1.5 transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#2D6A4F]",
              view === "grid" ? "bg-[#2D6A4F] text-[#F9FAFB]" : "text-[#9CA3AF] hover:text-[#F9FAFB]",
            )}
          >
            <LayoutGrid className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setView("list")}
            aria-pressed={view === "list"}
            aria-label="List view"
            className={cn(
              "rounded p-1.5 transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#2D6A4F]",
              view === "list" ? "bg-[#2D6A4F] text-[#F9FAFB]" : "text-[#9CA3AF] hover:text-[#F9FAFB]",
            )}
          >
            <List className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-5">
        {filtered.length === 0 ? (
          <div className="flex h-48 flex-col items-center justify-center gap-3" role="status">
            <p className="text-sm text-[#9CA3AF]">No collections match</p>
            <button
              type="button"
              onClick={() => setSearch("")}
              className="text-xs text-[#2D6A4F] transition-colors hover:text-[#40916C]"
            >
              Clear filters
            </button>
          </div>
        ) : view === "grid" ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {filtered.map((col) => (
              <CollectionCardGrid
                key={col.id}
                collection={col}
                selected={selectedId === col.id}
                onClick={() => onSelect(col)}
              />
            ))}
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {filtered.map((col) => (
              <CollectionRowList
                key={col.id}
                collection={col}
                selected={selectedId === col.id}
                onClick={() => onSelect(col)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
