"use client";

import { useState, useMemo, useRef, useEffect, type ElementType } from "react";
import {
  ArrowLeft,
  Search,
  X,
  Plus,
  Check,
  FileText,
  Image,
  Link,
  Video,
  Music,
  File,
  Users,
  ExternalLink,
  Copy,
  ChevronDown,
  Filter,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  MOCK_CREATORS,
  CATALOG_ITEMS,
  MOCK_SHELF_NAMES,
  CATALOG_ITEM_TYPE_CONFIG,
  type CatalogItem,
  type CatalogItemType,
  type Creator,
} from "@/lib/collections-data";

interface CollectFromSubscriptionsProps {
  onBack: () => void;
}

const TYPE_ICONS: Record<CatalogItemType, ElementType> = {
  article: FileText,
  image: Image,
  link: Link,
  video: Video,
  audio: Music,
  pdf: File,
};

const MEDIA_TYPES: { label: string; value: CatalogItemType | "all" }[] = [
  { label: "All", value: "all" },
  { label: "Article", value: "article" },
  { label: "Image", value: "image" },
  { label: "Video", value: "video" },
  { label: "Link", value: "link" },
  { label: "Audio", value: "audio" },
];

interface ToastState {
  id: string;
  message: string;
  shelf: string;
  visible: boolean;
}

function DestinationPicker({
  onConfirm,
  onClose,
}: {
  onConfirm: (shelf: string) => void;
  onClose: () => void;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="absolute right-0 top-full z-50 mt-1.5 w-56 overflow-hidden rounded-xl border border-[#2A2A2A] bg-[#1A1A1A] shadow-2xl"
      role="dialog"
      aria-label="Choose a shelf"
    >
      <div className="px-3 pb-2 pt-3">
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-[#9CA3AF]">Add to shelf</p>
        <div className="flex flex-col gap-0.5">
          {MOCK_SHELF_NAMES.map((name) => (
            <button
              key={name}
              type="button"
              onClick={() => setSelected(selected === name ? null : name)}
              className={cn(
                "flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-xs transition-colors",
                selected === name
                  ? "border border-[#1B4332] bg-[#0D1F17] text-[#40916C]"
                  : "text-[#F9FAFB] hover:bg-[#222222]",
              )}
            >
              <span className="truncate">{name}</span>
              {selected === name && <Check className="ml-2 h-3 w-3 shrink-0" />}
            </button>
          ))}

          {creating ? (
            <div className="mt-1 flex gap-1.5">
              <input
                autoFocus
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && newName.trim()) setSelected(newName.trim());
                  if (e.key === "Escape") {
                    setCreating(false);
                    setNewName("");
                  }
                }}
                placeholder="Shelf name…"
                className="flex-1 rounded-lg border border-[#2D6A4F] bg-[#111111] px-2.5 py-1.5 text-xs text-[#F9FAFB] placeholder:text-[#9CA3AF] focus:outline-none"
              />
              <button
                type="button"
                onClick={() => {
                  if (newName.trim()) setSelected(newName.trim());
                }}
                className="rounded-lg bg-[#2D6A4F] px-2 text-[#F9FAFB] transition-colors hover:bg-[#40916C]"
              >
                <Check className="h-3 w-3" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setCreating(true)}
              className="mt-1 flex w-full items-center gap-1.5 rounded-lg px-2.5 py-2 text-xs text-[#9CA3AF] transition-colors hover:bg-[#222222] hover:text-[#40916C]"
            >
              <Plus className="h-3 w-3" />
              Create new shelf…
            </button>
          )}
        </div>
      </div>

      <div className="flex justify-end border-t border-[#2A2A2A] px-3 py-2.5">
        <button
          type="button"
          disabled={!selected}
          onClick={() => selected && onConfirm(selected)}
          className={cn(
            "rounded-lg px-4 py-1.5 text-xs font-semibold transition-colors",
            selected
              ? "bg-[#2D6A4F] text-[#F9FAFB] hover:bg-[#40916C]"
              : "cursor-not-allowed bg-[#1A1A1A] text-[#6B7280]",
          )}
        >
          Add to shelf
        </button>
      </div>
    </div>
  );
}

function Inspector({
  item,
  creator,
  onCollect,
}: {
  item: CatalogItem;
  creator: Creator;
  onCollect: (shelf: string) => void;
}) {
  const Icon = TYPE_ICONS[item.type];
  const typeConf = CATALOG_ITEM_TYPE_CONFIG[item.type];
  const [myTags, setMyTags] = useState<string[]>(item.tags);
  const [tagInput, setTagInput] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const addTag = (t: string) => {
    const clean = t.trim().toLowerCase().replace(/^#+/, "");
    if (clean && !myTags.includes(clean)) setMyTags((p) => [...p, clean]);
    setTagInput("");
  };

  const communityOnly = (item.communityTags ?? []).filter((t) => !myTags.includes(t));

  return (
    <aside className="flex h-full flex-col border-l border-[#2A2A2A] bg-[#111111]">
      <div className="shrink-0 border-b border-[#2A2A2A] px-5 pb-4 pt-5">
        <div className="mb-3 flex items-center gap-2">
          <div
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg"
            style={{ background: `${typeConf.color}18` }}
          >
            <Icon className="h-3.5 w-3.5" style={{ color: typeConf.color }} />
          </div>
          <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: typeConf.color }}>
            {typeConf.label}
          </span>
        </div>

        <div
          className="mb-3 flex h-36 w-full items-center justify-center rounded-xl"
          style={{ background: `${creator.avatarColor}18`, border: `1px solid ${creator.avatarColor}22` }}
          aria-hidden
        >
          <Icon className="h-8 w-8 opacity-20" style={{ color: creator.avatarColor }} />
        </div>

        <h2 className="text-balance text-sm font-semibold leading-snug text-[#F9FAFB]">{item.title}</h2>
        <p className="mt-1.5 text-xs leading-relaxed text-[#9CA3AF]">{item.description}</p>

        <div className="mt-3 flex items-center gap-2">
          <div
            className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[8px] font-bold text-[#F9FAFB]"
            style={{ background: creator.avatarColor }}
            aria-hidden
          >
            {creator.name[0]}
          </div>
          <span className="text-xs text-[#9CA3AF]">{creator.name}</span>
          <span className="text-[10px] text-[#6B7280]">· {item.savedAt}</span>
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-5 overflow-y-auto px-5 py-4">
        <div className="relative">
          <button
            type="button"
            onClick={() => setPickerOpen((p) => !p)}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#2D6A4F] py-2.5 text-sm font-semibold text-[#F9FAFB] transition-colors hover:bg-[#40916C] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#40916C]"
          >
            <Plus className="h-4 w-4" />
            Add to collection
            <ChevronDown className="h-3.5 w-3.5 opacity-60" />
          </button>
          {pickerOpen && (
            <DestinationPicker
              onConfirm={(shelf) => {
                setPickerOpen(false);
                onCollect(shelf);
              }}
              onClose={() => setPickerOpen(false)}
            />
          )}
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-[#2A2A2A] py-1.5 text-xs text-[#9CA3AF] transition-colors hover:border-[#333333] hover:text-[#F9FAFB]"
          >
            {copied ? <Check className="h-3 w-3 text-[#40916C]" /> : <Copy className="h-3 w-3" />}
            {copied ? "Copied" : "Copy link"}
          </button>
          <button
            type="button"
            className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-[#2A2A2A] py-1.5 text-xs text-[#9CA3AF] transition-colors hover:border-[#333333] hover:text-[#F9FAFB]"
          >
            <ExternalLink className="h-3 w-3" />
            Open original
          </button>
        </div>

        <div className="flex flex-col gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-[#9CA3AF]">Your tags</span>
          <div className="flex flex-wrap gap-1.5">
            {myTags.map((tag) => (
              <span
                key={tag}
                className="flex items-center gap-1 rounded-full border border-[#1B4332] bg-[#0D1F17] px-2 py-0.5 text-[10px] text-[#40916C]"
              >
                #{tag}
                <button
                  type="button"
                  onClick={() => setMyTags((p) => p.filter((t) => t !== tag))}
                  aria-label={`Remove tag ${tag}`}
                  className="text-[#9CA3AF] transition-colors hover:text-[#F9FAFB] focus-visible:outline-none"
                >
                  <X className="h-2.5 w-2.5" />
                </button>
              </span>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addTag(tagInput);
                }
              }}
              placeholder="Add a tag…"
              aria-label="Add a tag"
              className="flex-1 rounded-lg border border-[#2A2A2A] bg-[#1A1A1A] px-3 py-1.5 text-xs text-[#F9FAFB] placeholder:text-[#9CA3AF] transition-colors focus:border-[#2D6A4F] focus:outline-none focus:ring-1 focus:ring-[#2D6A4F]"
            />
            <button
              type="button"
              onClick={() => addTag(tagInput)}
              aria-label="Add tag"
              className="rounded-lg border border-[#2A2A2A] bg-[#1A1A1A] px-2.5 text-[#9CA3AF] transition-colors hover:border-[#2D6A4F] hover:text-[#40916C] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#2D6A4F]"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {communityOnly.length > 0 && (
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-1.5">
              <Users className="h-3 w-3 text-[#9CA3AF]" aria-hidden />
              <span className="text-[10px] font-semibold uppercase tracking-wider text-[#9CA3AF]">
                Also tagged by collectors
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {communityOnly.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => addTag(tag)}
                  aria-label={`Add community tag ${tag}`}
                  className="rounded-full border border-[#2A2A2A] px-2 py-0.5 text-[10px] text-[#9CA3AF] transition-colors hover:border-[#2D6A4F] hover:text-[#40916C] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#2D6A4F]"
                >
                  +#{tag}
                </button>
              ))}
            </div>
            {item.collectorCount ? (
              <p className="flex items-center gap-1 text-[10px] text-[#6B7280]">
                <Users className="h-2.5 w-2.5" />
                {item.collectorCount.toLocaleString()} collectors saved this
              </p>
            ) : null}
          </div>
        )}
      </div>
    </aside>
  );
}

function CatalogCard({
  item,
  creator,
  selected,
  onClick,
}: {
  item: CatalogItem;
  creator: Creator;
  selected: boolean;
  onClick: () => void;
}) {
  const Icon = TYPE_ICONS[item.type];
  const typeConf = CATALOG_ITEM_TYPE_CONFIG[item.type];

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group flex w-full flex-col gap-2.5 rounded-xl border p-3.5 text-left transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2D6A4F]",
        selected
          ? "border-[#2D6A4F] bg-[#0D1F17]"
          : "border-[#2A2A2A] bg-[#111111] hover:border-[#3A3A3A] hover:bg-[#141414]",
      )}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <div
            className="flex h-5 w-5 shrink-0 items-center justify-center rounded"
            style={{ background: `${typeConf.color}18` }}
            aria-hidden
          >
            <Icon className="h-2.5 w-2.5" style={{ color: typeConf.color }} />
          </div>
          <span className="text-[9px] font-semibold uppercase tracking-wider" style={{ color: typeConf.color }}>
            {typeConf.label}
          </span>
        </div>
        <span className="text-[10px] text-[#6B7280]">{item.savedAt}</span>
      </div>

      <p className="line-clamp-2 text-xs font-semibold leading-snug text-[#F9FAFB]">{item.title}</p>

      <div className="flex items-center gap-1.5">
        <div
          className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[7px] font-bold text-[#F9FAFB]"
          style={{ background: creator.avatarColor }}
          aria-hidden
        >
          {creator.name[0]}
        </div>
        <span className="truncate text-[10px] text-[#9CA3AF]">{creator.name}</span>
      </div>

      {item.tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {item.tags.slice(0, 2).map((t) => (
            <span key={t} className="rounded-full border border-[#2A2A2A] px-1.5 py-0.5 text-[9px] text-[#9CA3AF]">
              #{t}
            </span>
          ))}
        </div>
      )}
    </button>
  );
}

export function CollectFromSubscriptions({ onBack }: CollectFromSubscriptionsProps) {
  const [selectedCreators, setSelectedCreators] = useState<Set<string>>(new Set());
  const [creatorSearch, setCreatorSearch] = useState("");
  const [catalogSearch, setCatalogSearch] = useState("");
  const [mediaType, setMediaType] = useState<CatalogItemType | "all">("all");
  const [onlyMyTags, setOnlyMyTags] = useState(false);
  const [onlyCommunityTags, setOnlyCommunityTags] = useState(false);
  const [selectedItem, setSelectedItem] = useState<CatalogItem | null>(null);
  const [toasts, setToasts] = useState<ToastState[]>([]);

  const toggleCreator = (id: string) => {
    setSelectedCreators((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setSelectedItem(null);
  };

  const filteredCreators = MOCK_CREATORS.filter(
    (c) =>
      c.name.toLowerCase().includes(creatorSearch.toLowerCase()) ||
      c.handle.toLowerCase().includes(creatorSearch.toLowerCase()),
  );

  const catalogItems = useMemo(() => {
    const activeCreators =
      selectedCreators.size > 0 ? selectedCreators : new Set(MOCK_CREATORS.map((c) => c.id));
    return CATALOG_ITEMS.filter((item) => {
      if (!activeCreators.has(item.creatorId)) return false;
      if (mediaType !== "all" && item.type !== mediaType) return false;
      if (catalogSearch) {
        const q = catalogSearch.toLowerCase();
        const matches =
          item.title.toLowerCase().includes(q) ||
          item.description.toLowerCase().includes(q) ||
          item.tags.some((t) => t.toLowerCase().includes(q)) ||
          (item.communityTags ?? []).some((t) => t.toLowerCase().includes(q));
        if (!matches) return false;
      }
      if (onlyMyTags && item.tags.length === 0) return false;
      if (onlyCommunityTags && (!item.communityTags || item.communityTags.length === 0)) return false;
      return true;
    });
  }, [selectedCreators, mediaType, catalogSearch, onlyMyTags, onlyCommunityTags]);

  const creatorMap = useMemo(() => Object.fromEntries(MOCK_CREATORS.map((c) => [c.id, c])), []);

  const handleCollect = (shelf: string) => {
    if (!selectedItem) return;
    const id = `toast-${Date.now()}`;
    const toast: ToastState = { id, message: `Added to "${shelf}"`, shelf, visible: true };
    setToasts((p) => [...p, toast]);
    setTimeout(() => {
      setToasts((p) => p.map((t) => (t.id === id ? { ...t, visible: false } : t)));
      setTimeout(() => setToasts((p) => p.filter((t) => t.id !== id)), 300);
    }, 3000);
  };

  const noCreatorsSelected = selectedCreators.size === 0;
  const noResults = catalogItems.length === 0 && !noCreatorsSelected;

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#0A0A0A]">
      <div className="flex shrink-0 items-center gap-3 border-b border-[#2A2A2A] px-6 py-4">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1.5 rounded text-xs text-[#9CA3AF] transition-colors hover:text-[#F9FAFB] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#2D6A4F]"
          aria-label="Back to Collections"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Collections
        </button>
        <span className="text-xs text-[#3A3A3A]">/</span>
        <span className="text-xs font-medium text-[#F9FAFB]">Collect</span>
      </div>

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <div className="flex w-52 shrink-0 flex-col border-r border-[#2A2A2A] bg-[#111111] xl:w-60">
          <div className="shrink-0 px-4 pb-3 pt-4">
            <p className="mb-2.5 text-[10px] font-semibold uppercase tracking-wider text-[#9CA3AF]">
              Your subscriptions
            </p>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-3 w-3 -translate-y-1/2 text-[#9CA3AF]" aria-hidden />
              <input
                value={creatorSearch}
                onChange={(e) => setCreatorSearch(e.target.value)}
                placeholder="Filter creators…"
                aria-label="Filter creators"
                className="w-full rounded-lg border border-[#2A2A2A] bg-[#1A1A1A] py-1.5 pl-7 pr-3 text-xs text-[#F9FAFB] placeholder:text-[#9CA3AF] transition-colors focus:border-[#2D6A4F] focus:outline-none focus:ring-1 focus:ring-[#2D6A4F]"
              />
            </div>
          </div>

          <div className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-3 pb-4">
            {filteredCreators.map((creator) => {
              const active = selectedCreators.has(creator.id);
              return (
                <button
                  key={creator.id}
                  type="button"
                  onClick={() => toggleCreator(creator.id)}
                  aria-pressed={active}
                  className={cn(
                    "flex w-full items-center gap-2.5 rounded-lg border px-2.5 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#2D6A4F]",
                    active
                      ? "border border-[#1B4332] bg-[#0D1F17]"
                      : "border border-transparent hover:bg-[#1A1A1A]",
                  )}
                >
                  <div
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[9px] font-bold text-[#F9FAFB]"
                    style={{ background: creator.avatarColor }}
                    aria-hidden
                  >
                    {creator.name[0]}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium text-[#F9FAFB]">{creator.name}</p>
                    <p className="truncate text-[9px] text-[#6B7280]">{creator.itemCount} items</p>
                  </div>
                  {active && <div className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#40916C]" aria-hidden />}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-[#2A2A2A] px-5 py-3">
            <div className="relative min-w-0 w-48 sm:w-64">
              <Search className="absolute left-3 top-1/2 h-3 w-3 -translate-y-1/2 text-[#9CA3AF]" aria-hidden />
              <input
                value={catalogSearch}
                onChange={(e) => setCatalogSearch(e.target.value)}
                placeholder="Search titles, notes, tags…"
                aria-label="Search catalog"
                className="w-full rounded-lg border border-[#2A2A2A] bg-[#1A1A1A] py-1.5 pl-8 pr-3 text-xs text-[#F9FAFB] placeholder:text-[#9CA3AF] transition-colors focus:border-[#2D6A4F] focus:outline-none focus:ring-1 focus:ring-[#2D6A4F]"
              />
            </div>

            <div className="flex items-center gap-1" role="group" aria-label="Filter by media type">
              {MEDIA_TYPES.map((mt) => (
                <button
                  key={mt.value}
                  type="button"
                  onClick={() => setMediaType(mt.value)}
                  aria-pressed={mediaType === mt.value}
                  className={cn(
                    "whitespace-nowrap rounded-full px-2.5 py-1 text-[10px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#2D6A4F]",
                    mediaType === mt.value
                      ? "bg-[#2D6A4F] text-[#F9FAFB]"
                      : "border border-[#2A2A2A] text-[#9CA3AF] hover:border-[#3A3A3A] hover:text-[#F9FAFB]",
                  )}
                >
                  {mt.label}
                </button>
              ))}
            </div>

            <div className="ml-auto flex items-center gap-1.5">
              <Filter className="h-3 w-3 text-[#6B7280]" aria-hidden />
              <button
                type="button"
                onClick={() => setOnlyMyTags((p) => !p)}
                aria-pressed={onlyMyTags}
                className={cn(
                  "whitespace-nowrap rounded-full px-2.5 py-1 text-[10px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#2D6A4F]",
                  onlyMyTags
                    ? "border border-[#2D6A4F] bg-[#0D1F17] text-[#40916C]"
                    : "border border-[#2A2A2A] text-[#9CA3AF] hover:border-[#3A3A3A] hover:text-[#F9FAFB]",
                )}
              >
                Has my tags
              </button>
              <button
                type="button"
                onClick={() => setOnlyCommunityTags((p) => !p)}
                aria-pressed={onlyCommunityTags}
                className={cn(
                  "whitespace-nowrap rounded-full px-2.5 py-1 text-[10px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#2D6A4F]",
                  onlyCommunityTags
                    ? "border border-[#2D6A4F] bg-[#0D1F17] text-[#40916C]"
                    : "border border-[#2A2A2A] text-[#9CA3AF] hover:border-[#3A3A3A] hover:text-[#F9FAFB]",
                )}
              >
                Has community tags
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-5 py-5">
            {noCreatorsSelected ? (
              <div className="flex h-full flex-col items-center justify-center gap-4 text-center" role="status">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-[#2A2A2A] bg-[#1A1A1A]">
                  <Users className="h-5 w-5 text-[#9CA3AF]" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-[#F9FAFB]">Select creators to browse</p>
                  <p className="mx-auto mt-1 max-w-xs text-xs text-[#9CA3AF]">
                    Choose one or more subscriptions on the left to see their latest items here.
                  </p>
                </div>
              </div>
            ) : noResults ? (
              <div className="flex h-full flex-col items-center justify-center gap-3" role="status">
                <p className="text-sm text-[#9CA3AF]">No items match your filters</p>
                <button
                  type="button"
                  onClick={() => {
                    setCatalogSearch("");
                    setMediaType("all");
                    setOnlyMyTags(false);
                    setOnlyCommunityTags(false);
                  }}
                  className="text-xs text-[#2D6A4F] transition-colors hover:text-[#40916C]"
                >
                  Clear filters
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {catalogItems.map((item) => (
                  <CatalogCard
                    key={item.id}
                    item={item}
                    creator={creatorMap[item.creatorId]}
                    selected={selectedItem?.id === item.id}
                    onClick={() => setSelectedItem((p) => (p?.id === item.id ? null : item))}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        {selectedItem ? (
          <div className="h-full w-72 shrink-0 overflow-hidden border-l border-[#2A2A2A] xl:w-80">
            <Inspector
              key={selectedItem.id}
              item={selectedItem}
              creator={creatorMap[selectedItem.creatorId]}
              onCollect={handleCollect}
            />
          </div>
        ) : (
          <div className="hidden h-full w-72 shrink-0 flex-col items-center justify-center gap-3 border-l border-[#2A2A2A] bg-[#111111] lg:flex xl:w-80">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-[#2A2A2A] bg-[#1A1A1A]">
              <FileText className="h-4 w-4 text-[#9CA3AF]" />
            </div>
            <p className="px-6 text-center text-xs text-[#9CA3AF]">Select an item to preview and collect it</p>
          </div>
        )}
      </div>

      <div
        className="pointer-events-none fixed bottom-5 right-5 z-50 flex flex-col gap-2"
        aria-live="polite"
        aria-label="Notifications"
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={cn(
              "pointer-events-auto flex items-center gap-3 rounded-xl border border-[#2A2A2A] bg-[#1A1A1A] px-4 py-3 text-sm text-[#F9FAFB] shadow-2xl transition-all duration-300",
              toast.visible ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0",
            )}
          >
            <Check className="h-3.5 w-3.5 shrink-0 text-[#40916C]" />
            {toast.message}
            <button
              type="button"
              onClick={() => setToasts((p) => p.filter((t) => t.id !== toast.id))}
              className="ml-1 text-[#9CA3AF] transition-colors hover:text-[#F9FAFB] focus-visible:outline-none"
              aria-label="Dismiss"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
