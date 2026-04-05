"use client";

import { useState, type ElementType, type ReactNode } from "react";
import {
  X,
  Plus,
  Globe,
  Link2,
  Lock,
  ChevronDown,
  Trash2,
  ExternalLink,
  Pin,
  PinOff,
  Check,
  FileText,
  Image,
  Link,
  Video,
  StickyNote,
  File,
  Users,
  Tag,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  VISIBILITY_CONFIG,
  ITEM_TYPE_CONFIG,
  type Collection,
  type CollectionVisibility,
  type ItemType,
} from "@/lib/collections-data";

interface CollectionEditorRailProps {
  collection: Collection;
  onClose: () => void;
}

const TYPE_ICONS: Record<ItemType, ElementType> = {
  article: FileText,
  image: Image,
  link: Link,
  video: Video,
  note: StickyNote,
  pdf: File,
};

const VISIBILITY_ICONS: Record<CollectionVisibility, ElementType> = {
  private: Lock,
  link: Link2,
  public: Globe,
};

function SelectDropdown<T extends string>({
  value,
  options,
  onChange,
  renderOption,
  renderValue,
  ariaLabel,
}: {
  value: T;
  options: T[];
  onChange: (v: T) => void;
  renderOption: (v: T) => ReactNode;
  renderValue: (v: T) => ReactNode;
  ariaLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((p) => !p)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        className="flex w-full items-center justify-between gap-2 rounded-lg border border-[#2A2A2A] bg-[#1A1A1A] px-3 py-1.5 text-xs transition-colors hover:border-[#333333] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#2D6A4F]"
      >
        <span>{renderValue(value)}</span>
        <ChevronDown className="h-3 w-3 text-[#9CA3AF]" />
      </button>
      {open && (
        <div
          role="listbox"
          className="absolute left-0 top-full z-30 mt-1 w-full overflow-hidden rounded-lg border border-[#2A2A2A] bg-[#1A1A1A] shadow-xl"
        >
          {options.map((opt) => (
            <button
              key={opt}
              type="button"
              role="option"
              aria-selected={opt === value}
              onClick={() => {
                onChange(opt);
                setOpen(false);
              }}
              className={cn(
                "flex w-full items-center justify-between px-3 py-2 text-left text-xs transition-colors hover:bg-[#2A2A2A]",
                opt === value ? "text-[#40916C]" : "text-[#F9FAFB]",
              )}
            >
              {renderOption(opt)}
              {opt === value && <Check className="h-3 w-3 text-[#40916C]" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function CollectionEditorRail({ collection, onClose }: CollectionEditorRailProps) {
  const [title, setTitle] = useState(collection.title);
  const [description, setDescription] = useState(collection.description);
  const [visibility, setVisibility] = useState<CollectionVisibility>(collection.visibility);
  const [pinned, setPinned] = useState(collection.pinned ?? false);
  const [myTags, setMyTags] = useState<string[]>(collection.tags);
  const [tagInput, setTagInput] = useState("");
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const addTag = () => {
    const t = tagInput.trim().toLowerCase().replace(/^#+/, "");
    if (t && !myTags.includes(t)) setMyTags((prev) => [...prev, t]);
    setTagInput("");
  };

  const removeTag = (tag: string) => setMyTags((prev) => prev.filter((x) => x !== tag));

  const visibilityOptions: CollectionVisibility[] = ["private", "link", "public"];

  const communityTagCounts: Record<string, number> = {};
  collection.items.forEach((item) => {
    (item.communityTags ?? []).forEach((t) => {
      communityTagCounts[t] = (communityTagCounts[t] ?? 0) + 1;
    });
  });
  const topCommunityTags = Object.entries(communityTagCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([tag]) => tag);

  const suggestedTags = topCommunityTags.filter((t) => !myTags.includes(t));

  return (
    <div className="flex h-full flex-col border-l border-[#2A2A2A] bg-[#111111]">
      <div className="flex shrink-0 items-center justify-between border-b border-[#2A2A2A] px-5 py-4">
        <span className="text-xs font-semibold uppercase tracking-wider text-[#9CA3AF]">
          Collection detail
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setPinned((p) => !p)}
            className={cn(
              "rounded p-1.5 transition-colors hover:bg-[#1A1A1A] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#2D6A4F]",
              pinned ? "text-[#C5B358]" : "text-[#9CA3AF]",
            )}
            aria-label={pinned ? "Unpin collection" : "Pin collection"}
            aria-pressed={pinned}
          >
            {pinned ? <Pin className="h-4 w-4" /> : <PinOff className="h-4 w-4" />}
          </button>
          <button
            type="button"
            aria-label="Open in full view"
            className="rounded p-1.5 text-[#9CA3AF] transition-colors hover:bg-[#1A1A1A] hover:text-[#F9FAFB] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#2D6A4F]"
          >
            <ExternalLink className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close detail panel"
            className="rounded p-1.5 text-[#9CA3AF] transition-colors hover:bg-[#1A1A1A] hover:text-[#F9FAFB] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#2D6A4F]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div
          className="relative flex h-36 w-full flex-col justify-between p-5"
          style={{ background: collection.coverColor }}
          aria-hidden
        >
          <div className="h-1 w-8 rounded-full opacity-70" style={{ background: collection.coverAccent }} />
          <div>
            <p className="text-base font-semibold leading-snug text-[#F9FAFB]">{title || collection.title}</p>
            <p className="mt-1 text-xs opacity-70" style={{ color: collection.coverAccent }}>
              {collection.itemCount} items collected
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-5 px-5 py-5">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="rail-title" className="text-[10px] font-semibold uppercase tracking-wider text-[#9CA3AF]">
              Title
            </label>
            <input
              id="rail-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full rounded-lg border border-[#2A2A2A] bg-[#1A1A1A] px-3 py-2 text-sm text-[#F9FAFB] placeholder:text-[#9CA3AF] transition-colors focus:border-[#2D6A4F] focus:outline-none focus:ring-1 focus:ring-[#2D6A4F]"
              placeholder="Collection title"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="rail-desc" className="text-[10px] font-semibold uppercase tracking-wider text-[#9CA3AF]">
              Description
            </label>
            <textarea
              id="rail-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full resize-none rounded-lg border border-[#2A2A2A] bg-[#1A1A1A] px-3 py-2 text-sm leading-relaxed text-[#F9FAFB] placeholder:text-[#9CA3AF] transition-colors focus:border-[#2D6A4F] focus:outline-none focus:ring-1 focus:ring-[#2D6A4F]"
              placeholder="What is this collection about?"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-[#9CA3AF]">Sharing</span>
            <SelectDropdown
              value={visibility}
              options={visibilityOptions}
              onChange={setVisibility}
              ariaLabel="Collection visibility"
              renderValue={(v) => {
                const Icon = VISIBILITY_ICONS[v];
                return (
                  <span className="flex items-center gap-1.5 text-[#F9FAFB]">
                    <Icon className="h-3 w-3" />
                    {VISIBILITY_CONFIG[v].label}
                  </span>
                );
              }}
              renderOption={(v) => {
                const Icon = VISIBILITY_ICONS[v];
                return (
                  <span className="flex flex-col">
                    <span className="flex items-center gap-1.5">
                      <Icon className="h-3 w-3" />
                      {VISIBILITY_CONFIG[v].label}
                    </span>
                    <span className="ml-4 text-[9px] text-[#9CA3AF]">{VISIBILITY_CONFIG[v].description}</span>
                  </span>
                );
              }}
            />
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-1.5">
              <Tag className="h-3 w-3 text-[#9CA3AF]" aria-hidden />
              <span className="text-[10px] font-semibold uppercase tracking-wider text-[#9CA3AF]">Your tags</span>
            </div>
            <div className="mb-2 flex flex-wrap gap-1.5">
              {myTags.map((tag) => (
                <span
                  key={tag}
                  className="flex items-center gap-1 rounded-full border border-[#1B4332] bg-[#0D1F17] px-2 py-0.5 text-[10px] text-[#40916C]"
                >
                  #{tag}
                  <button
                    type="button"
                    onClick={() => removeTag(tag)}
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
                    addTag();
                  }
                }}
                placeholder="Add tag..."
                aria-label="Add a tag"
                className="flex-1 rounded-lg border border-[#2A2A2A] bg-[#1A1A1A] px-3 py-1.5 text-xs text-[#F9FAFB] placeholder:text-[#9CA3AF] transition-colors focus:border-[#2D6A4F] focus:outline-none focus:ring-1 focus:ring-[#2D6A4F]"
              />
              <button
                type="button"
                onClick={addTag}
                aria-label="Add tag"
                className="rounded-lg border border-[#2A2A2A] bg-[#1A1A1A] px-2.5 text-[#9CA3AF] transition-colors hover:border-[#2D6A4F] hover:text-[#40916C] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#2D6A4F]"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            </div>

            {suggestedTags.length > 0 && (
              <div className="flex flex-col gap-1.5 pt-1">
                <div className="flex items-center gap-1.5">
                  <Users className="h-3 w-3 text-[#9CA3AF]" aria-hidden />
                  <span className="text-[10px] text-[#9CA3AF]">Community tags — click to add</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {suggestedTags.map((tag) => (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => setMyTags((prev) => [...prev, tag])}
                      aria-label={`Add community tag ${tag}`}
                      className="rounded-full border border-[#2A2A2A] px-2 py-0.5 text-[10px] text-[#9CA3AF] transition-colors hover:border-[#2D6A4F] hover:text-[#40916C] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#2D6A4F]"
                    >
                      +#{tag}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="border-t border-[#2A2A2A]" />

          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-[#9CA3AF]">
                Items ({collection.items.length})
              </span>
              <button
                type="button"
                className="flex items-center gap-1 text-[10px] font-medium text-[#2D6A4F] transition-colors hover:text-[#40916C] focus-visible:outline-none"
              >
                <Plus className="h-3 w-3" />
                Collect
              </button>
            </div>

            <div className="flex flex-col gap-1">
              {collection.items.map((item) => {
                const Icon = TYPE_ICONS[item.type];
                const typeColor = ITEM_TYPE_CONFIG[item.type].color;
                return (
                  <div
                    key={item.id}
                    className="group flex flex-col gap-1.5 rounded-lg border border-[#2A2A2A] bg-[#1A1A1A] px-3 py-2.5 transition-colors hover:border-[#333333]"
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className="flex h-6 w-6 shrink-0 items-center justify-center rounded"
                        style={{ background: `${typeColor}18` }}
                        aria-hidden
                      >
                        <Icon className="h-3 w-3" style={{ color: typeColor }} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-medium text-[#F9FAFB]">{item.title}</p>
                        {item.source && <p className="truncate text-[10px] text-[#9CA3AF]">{item.source}</p>}
                      </div>
                      <span className="shrink-0 text-[10px] text-[#9CA3AF]">{item.addedAt}</span>
                      <button
                        type="button"
                        aria-label={`Remove ${item.title}`}
                        className="rounded p-0.5 text-[#9CA3AF] opacity-0 transition-all hover:bg-[#2A2A2A] hover:text-red-400 focus-visible:opacity-100 focus-visible:outline-none group-hover:opacity-100"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>

                    {(item.myTags.length > 0 || (item.communityTags ?? []).length > 0) && (
                      <div className="flex flex-wrap gap-1 pl-9">
                        {item.myTags.map((t) => (
                          <span
                            key={t}
                            className="rounded-full border border-[#1B4332] bg-[#0D1F17] px-1.5 py-0.5 text-[9px] text-[#40916C]"
                          >
                            #{t}
                          </span>
                        ))}
                        {(item.communityTags ?? []).slice(0, 2).map((t) => (
                          <span
                            key={t}
                            title="Community tag"
                            className="rounded-full border border-[#2A2A2A] px-1.5 py-0.5 text-[9px] text-[#6B7280]"
                          >
                            #{t}
                          </span>
                        ))}
                        {item.collectorCount ? (
                          <span className="flex items-center gap-0.5 pl-1 text-[9px] text-[#6B7280]">
                            <Users className="h-2.5 w-2.5" />
                            {item.collectorCount.toLocaleString()}
                          </span>
                        ) : null}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="border-t border-[#2A2A2A]" />

          <div className="flex flex-col gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-[#9CA3AF]">About</span>
            <div className="grid grid-cols-2 gap-x-4 gap-y-2">
              {[
                { label: "Created", value: collection.createdAt },
                { label: "Updated", value: collection.updatedAt },
                { label: "Items", value: `${collection.itemCount}` },
                { label: "Sharing", value: VISIBILITY_CONFIG[visibility].label },
              ].map((m) => (
                <div key={m.label}>
                  <p className="text-[10px] text-[#9CA3AF]">{m.label}</p>
                  <p className="mt-0.5 text-xs text-[#F9FAFB]">{m.value}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="h-4" />
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-3 border-t border-[#2A2A2A] px-5 py-4">
        <div className="flex-1" />
        <button
          type="button"
          className="rounded-lg border border-[#2A2A2A] px-3 py-1.5 text-xs text-[#9CA3AF] transition-colors hover:border-[#333333] hover:text-[#F9FAFB] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#2D6A4F]"
        >
          Discard
        </button>
        <button
          type="button"
          onClick={handleSave}
          className={cn(
            "flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-xs font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#40916C]",
            saved ? "bg-[#1B4332] text-[#40916C]" : "bg-[#2D6A4F] text-[#F9FAFB] hover:bg-[#40916C]",
          )}
        >
          {saved && <Check className="h-3 w-3" />}
          {saved ? "Saved" : "Save"}
        </button>
      </div>
    </div>
  );
}
