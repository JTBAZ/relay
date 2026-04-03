"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ChevronDown,
  Download,
  Eye,
  EyeOff,
  FileText,
  FolderPlus,
  ShieldAlert,
  ShieldCheck,
  Tag,
  X
} from "lucide-react";
import {
  RELAY_API_BASE,
  buildGalleryVisibilityBody,
  bucketItemsByVisibilityAfterAction,
  type Collection,
  type GalleryItem,
  type PostVisibility,
  type VisibilityAxisAction
} from "@/lib/relay-api";

type Panel = "none" | "tags" | "visibility" | "collection";

const SEL = "#00aa6f";

type Props = {
  selectedCount: number;
  creatorId: string;
  selectedItems: GalleryItem[];
  selectedPostIds: string[];
  collections: Collection[];
  onClearSelection: () => void;
  onListRefresh: () => void;
  onCollectionsReload: () => void;
  onApplyBulkTagDelta: (delta: {
    add: string[];
    remove: string[];
    /** Tag only selected asset rows (overrides), not whole posts. */
    perAsset?: boolean;
  }) => Promise<void>;
  /** Facet tag ids for quick pick (optional). */
  suggestedTags?: string[];
  /** Open post inspector (e.g. PostBatchModal) for the current selection. */
  onInspectPost: () => void;
  onError?: (message: string) => void;
};

export default function BulkActionBar({
  selectedCount,
  creatorId,
  selectedItems,
  selectedPostIds,
  collections,
  onClearSelection,
  onListRefresh,
  onCollectionsReload,
  onApplyBulkTagDelta,
  suggestedTags = [],
  onInspectPost,
  onError
}: Props) {
  const [panel, setPanel] = useState<Panel>("none");
  const [tagAddDraft, setTagAddDraft] = useState("");
  const [tagRemoveDraft, setTagRemoveDraft] = useState("");
  /** Which tag field Quick pick writes to; follows focus, default Add. */
  const [tagFieldFocus, setTagFieldFocus] = useState<"add" | "remove">("add");
  const [tagRemoveExpanded, setTagRemoveExpanded] = useState(false);
  /** When set, bulk tag API uses `media_targets` (per-asset overrides) instead of post-level tags. */
  const [tagPerAsset, setTagPerAsset] = useState(false);
  const [tagBusy, setTagBusy] = useState(false);
  const [collBusy, setCollBusy] = useState<string | null>(null);
  const [visBusy, setVisBusy] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const closePanel = useCallback(() => setPanel("none"), []);

  useEffect(() => {
    if (panel === "none") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closePanel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [panel, closePanel]);

  useEffect(() => {
    if (panel === "none") return;
    const onPointer = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) closePanel();
    };
    window.addEventListener("mousedown", onPointer);
    return () => window.removeEventListener("mousedown", onPointer);
  }, [panel, closePanel]);

  useEffect(() => {
    if (panel === "tags") {
      setTagFieldFocus("add");
      setTagRemoveExpanded(false);
      setTagPerAsset(false);
    }
  }, [panel]);

  const postVisibilityUpdate = async (items: GalleryItem[], visibility: PostVisibility) => {
    const body = buildGalleryVisibilityBody(creatorId, items, visibility);
    const res = await fetch(`${RELAY_API_BASE}/api/v1/gallery/visibility`, {
      method: "POST",
      cache: "no-store",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body)
    });
    if (!res.ok) {
      const j = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
      throw new Error(j?.error?.message ?? res.statusText);
    }
  };

  const applyVisibilityAxis = async (action: VisibilityAxisAction) => {
    setVisBusy(true);
    try {
      const buckets = bucketItemsByVisibilityAfterAction(selectedItems, action);
      for (const [vis, group] of Array.from(buckets.entries())) {
        if (group.length === 0) continue;
        await postVisibilityUpdate(group, vis);
      }
      closePanel();
      onClearSelection();
      onListRefresh();
    } catch (e) {
      onError?.(e instanceof Error ? e.message : String(e));
    } finally {
      setVisBusy(false);
    }
  };

  const onExport = () => {
    const exportable = selectedItems.filter((i) => i.has_export && i.content_url_path);
    if (exportable.length === 0) {
      onError?.("No exportable files in the current selection.");
      return;
    }
    for (const it of exportable) {
      const url = `${RELAY_API_BASE}${it.content_url_path}`;
      const a = document.createElement("a");
      a.href = url;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.download = "";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
  };

  const addToCollection = async (collectionId: string) => {
    if (selectedPostIds.length === 0) return;
    setCollBusy(collectionId);
    try {
      const res = await fetch(
        `${RELAY_API_BASE}/api/v1/gallery/collections/${collectionId}/posts`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ post_ids: selectedPostIds })
        }
      );
      if (!res.ok) {
        const j = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
        onError?.(j?.error?.message ?? res.statusText);
        return;
      }
      closePanel();
      onCollectionsReload();
      onListRefresh();
    } finally {
      setCollBusy(null);
    }
  };

  const parseTagList = (raw: string) =>
    Array.from(new Set(raw.split(",").map((t) => t.trim()).filter(Boolean)));

  const submitTags = async () => {
    const add = parseTagList(tagAddDraft);
    const remove = parseTagList(tagRemoveDraft);
    if (add.length === 0 && remove.length === 0) return;
    if (tagPerAsset) {
      const real = selectedItems.filter((i) => !i.media_id.startsWith("post_only_"));
      if (real.length === 0) {
        onError?.("Per-asset tags need at least one image/video row (not text-only posts).");
        return;
      }
    }
    setTagBusy(true);
    try {
      await onApplyBulkTagDelta({ add, remove, perAsset: tagPerAsset });
      setTagAddDraft("");
      setTagRemoveDraft("");
      closePanel();
    } catch (e) {
      onError?.(e instanceof Error ? e.message : String(e));
    } finally {
      setTagBusy(false);
    }
  };

  const applyQuickPickTag = (tag: string) => {
    if (tagFieldFocus === "add") setTagAddDraft(tag);
    else setTagRemoveDraft(tag);
  };

  if (selectedCount === 0) return null;

  const toggle = (next: Panel) => setPanel((p) => (p === next ? "none" : next));

  const visRow =
    "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-xs font-medium text-[var(--lib-fg)] transition-colors hover:bg-[var(--lib-muted)] disabled:opacity-45";

  return (
    <div
      ref={rootRef}
      className="pointer-events-none absolute bottom-6 left-1/2 z-30 w-[min(100vw-1.5rem,52rem)] -translate-x-1/2 px-3"
    >
      <div className="pointer-events-auto relative flex flex-col items-center" data-bulk-action-bar>
        {panel === "tags" ? (
          <div
            className="mb-2 w-full max-w-md rounded-xl border border-[var(--lib-border)] bg-[var(--lib-card)] p-3 shadow-2xl"
            style={{ boxShadow: `0 0 0 1px color-mix(in srgb, ${SEL} 22%, transparent)` }}
          >
            <label className="flex cursor-pointer items-start gap-2 text-[10px] text-[var(--lib-fg)]">
              <input
                type="checkbox"
                checked={tagPerAsset}
                onChange={(e) => setTagPerAsset(e.target.checked)}
                className="mt-0.5 rounded border-[var(--lib-border)]"
              />
              <span>
                <span className="font-medium">Selected assets only</span>
                <span className="block text-[var(--lib-fg-muted)]">
                  {tagPerAsset
                    ? "Tags apply to each chosen row only (good for character / prop labels inside one post). Default off = whole post."
                    : "Turn on to tag individual files without adding tags to siblings in the same post."}
                </span>
              </span>
            </label>
            {!tagPerAsset ? (
              <p className="mt-2 text-[10px] text-[var(--lib-fg-muted)]">
                Applies to every post that has selected media (post-level overrides).
              </p>
            ) : null}
            <p className="mt-3 text-[10px] font-semibold uppercase tracking-wider text-[var(--lib-fg-muted)]">
              Add tags
            </p>
            <input
              value={tagAddDraft}
              onChange={(e) => setTagAddDraft(e.target.value)}
              onFocus={() => setTagFieldFocus("add")}
              placeholder="tag_a, tag_b"
              className="mt-1 w-full rounded-lg border border-[var(--lib-border)] bg-[var(--lib-input)] px-2.5 py-2 text-xs text-[var(--lib-fg)] placeholder:text-[var(--lib-fg-muted)]"
              onKeyDown={(e) => {
                if (e.key === "Enter") void submitTags();
              }}
            />
            {suggestedTags.length > 0 ? (
              <div className="mt-3 space-y-1.5">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--lib-fg-muted)]">
                  Quick pick
                </p>
                <p className="text-[9px] leading-snug text-[var(--lib-fg-muted)]">
                  Fills the field you last focused (defaults to Add). Click a chip to replace its text.
                </p>
                <div className="flex flex-wrap gap-1">
                  {suggestedTags.slice(0, 24).map((tag) => (
                    <button
                      key={tag}
                      type="button"
                      title={`Use “${tag}” in the ${tagFieldFocus === "add" ? "Add" : "Remove"} field`}
                      onClick={() => applyQuickPickTag(tag)}
                      className="rounded border border-[var(--lib-border)] bg-[var(--lib-sidebar-accent)] px-2 py-0.5 text-[10px] text-[var(--lib-fg)] hover:border-[color-mix(in_srgb,var(--lib-selection)_45%,var(--lib-border))]"
                    >
                      {tag}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
            <div className="mt-3">
              <button
                type="button"
                aria-expanded={tagRemoveExpanded}
                onClick={() => setTagRemoveExpanded((o) => !o)}
                className="flex items-center gap-1 text-[10px] font-medium text-[var(--lib-fg-muted)] transition-colors hover:text-[var(--lib-fg)]"
              >
                More
                <ChevronDown
                  className={`h-3.5 w-3.5 shrink-0 transition-transform ${tagRemoveExpanded ? "rotate-180" : ""}`}
                  aria-hidden
                />
              </button>
              {tagRemoveExpanded ? (
                <div className="mt-2 rounded-lg border border-[var(--lib-border)] bg-[var(--lib-muted)]/35 p-2.5">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--lib-fg-muted)]">
                    Remove tags
                  </p>
                  <input
                    value={tagRemoveDraft}
                    onChange={(e) => setTagRemoveDraft(e.target.value)}
                    onFocus={() => setTagFieldFocus("remove")}
                    placeholder="tag_a, tag_b"
                    className="mt-1 w-full rounded-lg border border-[var(--lib-border)] bg-[var(--lib-input)] px-2.5 py-2 text-xs text-[var(--lib-fg)] placeholder:text-[var(--lib-fg-muted)]"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") void submitTags();
                    }}
                  />
                  <p className="mt-2 text-[9px] leading-snug text-[var(--lib-fg-muted)]">
                    If the same tag is in both Add and Remove, remove wins for this request.
                  </p>
                </div>
              ) : null}
            </div>
            <div className="mt-3 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setTagAddDraft("");
                  setTagRemoveDraft("");
                  closePanel();
                }}
                className="rounded-lg px-3 py-1.5 text-xs text-[var(--lib-fg-muted)] hover:bg-[var(--lib-muted)] hover:text-[var(--lib-fg)]"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={
                  tagBusy ||
                  (parseTagList(tagAddDraft).length === 0 && parseTagList(tagRemoveDraft).length === 0)
                }
                onClick={() => void submitTags()}
                className="rounded-lg px-3 py-1.5 text-xs font-semibold text-neutral-950 disabled:opacity-45"
                style={{ backgroundColor: SEL }}
              >
                {tagBusy ? "…" : "Apply"}
              </button>
            </div>
          </div>
        ) : null}

        {panel === "visibility" ? (
          <div
            className="mb-2 w-[min(100%,16rem)] overflow-hidden rounded-xl border border-[var(--lib-border)] bg-[var(--lib-card)] py-1 shadow-2xl"
            style={{ boxShadow: `0 0 0 1px color-mix(in srgb, ${SEL} 22%, transparent)` }}
            role="menu"
            aria-label="Visibility actions"
          >
            <button
              type="button"
              role="menuitem"
              disabled={visBusy}
              onClick={() => void applyVisibilityAxis("set_visible")}
              className={visRow}
            >
              <Eye className="h-4 w-4 shrink-0" style={{ color: SEL }} aria-hidden />
              Set Visible
            </button>
            <button
              type="button"
              role="menuitem"
              disabled={visBusy}
              onClick={() => void applyVisibilityAxis("set_hidden")}
              className={visRow}
            >
              <EyeOff className="h-4 w-4 shrink-0 text-[var(--lib-fg-muted)]" aria-hidden />
              Set Hidden
            </button>
            <div className="my-1 h-px bg-[var(--lib-border)]" role="separator" />
            <button
              type="button"
              role="menuitem"
              disabled={visBusy}
              onClick={() => void applyVisibilityAxis("set_mature")}
              className={visRow}
            >
              <ShieldAlert className="h-4 w-4 shrink-0 text-amber-400" aria-hidden />
              Set Mature
            </button>
            <button
              type="button"
              role="menuitem"
              disabled={visBusy}
              onClick={() => void applyVisibilityAxis("set_general")}
              className={visRow}
            >
              <ShieldCheck className="h-4 w-4 shrink-0 text-[var(--lib-fg-muted)]" aria-hidden />
              Set General
            </button>
          </div>
        ) : null}

        {panel === "collection" ? (
          <div className="mb-2 max-h-52 w-full max-w-sm overflow-y-auto rounded-xl border border-[var(--lib-border)] bg-[var(--lib-card)] p-2 shadow-2xl">
            <p className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--lib-fg-muted)]">
              Add posts to collection
            </p>
            {collections.length === 0 ? (
              <p className="px-2 py-3 text-xs text-[var(--lib-fg-muted)]">No collections yet.</p>
            ) : (
              <ul className="space-y-0.5">
                {collections.map((c) => (
                  <li key={c.collection_id}>
                    <button
                      type="button"
                      disabled={collBusy !== null}
                      onClick={() => void addToCollection(c.collection_id)}
                      className="flex w-full items-center justify-between rounded-lg px-2 py-2 text-left text-xs text-[var(--lib-fg)] hover:bg-[var(--lib-sidebar-accent)] disabled:opacity-50"
                    >
                      <span className="truncate">{c.title}</span>
                      <span className="shrink-0 tabular-nums text-[10px] text-[var(--lib-fg-muted)]">
                        {collBusy === c.collection_id ? "…" : `${c.post_ids.length}`}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : null}

        <div
          className="flex w-full items-center gap-0.5 rounded-full border-2 bg-[var(--lib-card)]/98 py-1 pl-1 pr-1 shadow-[0_12px_40px_rgba(0,0,0,0.55)] backdrop-blur-md sm:gap-1 sm:pl-1.5 sm:pr-2"
          style={{ borderColor: SEL }}
        >
          <div className="flex min-w-0 items-center gap-1.5 border-r border-[var(--lib-border)] pr-2 pl-1">
            <span
              className="flex h-7 min-w-[2.25rem] items-center justify-center rounded-md px-2 text-xs font-bold tabular-nums text-neutral-950"
              style={{ backgroundColor: SEL }}
            >
              {selectedCount}
            </span>
            <span className="hidden text-[11px] font-medium text-[var(--lib-fg-muted)] sm:inline">
              selected
            </span>
            <button
              type="button"
              onClick={onClearSelection}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[var(--lib-fg-muted)] hover:bg-[var(--lib-muted)] hover:text-[var(--lib-fg)]"
              aria-label="Clear selection"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <button
            type="button"
            onClick={() => toggle("tags")}
            className={`flex h-8 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium sm:px-3 ${
              panel === "tags"
                ? "text-neutral-950"
                : "text-[var(--lib-fg-muted)] hover:bg-[var(--lib-muted)] hover:text-[var(--lib-fg)]"
            }`}
            style={panel === "tags" ? { backgroundColor: SEL } : undefined}
          >
            <Tag className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Tags</span>
          </button>
          <button
            type="button"
            onClick={() => toggle("visibility")}
            className={`flex h-8 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium sm:px-3 ${
              panel === "visibility"
                ? "text-neutral-950"
                : "text-[var(--lib-fg-muted)] hover:bg-[var(--lib-muted)] hover:text-[var(--lib-fg)]"
            }`}
            style={panel === "visibility" ? { backgroundColor: SEL } : undefined}
          >
            <Eye className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Visibility</span>
          </button>
          <button
            type="button"
            onClick={() => toggle("collection")}
            className={`flex h-8 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium sm:px-3 ${
              panel === "collection"
                ? "text-neutral-950"
                : "text-[var(--lib-fg-muted)] hover:bg-[var(--lib-muted)] hover:text-[var(--lib-fg)]"
            }`}
            style={panel === "collection" ? { backgroundColor: SEL } : undefined}
          >
            <FolderPlus className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Collection</span>
          </button>
          <button
            type="button"
            onClick={onExport}
            className="flex h-8 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium text-[var(--lib-fg-muted)] hover:bg-[var(--lib-muted)] hover:text-[var(--lib-fg)] sm:px-3"
          >
            <Download className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Export</span>
          </button>

          <span className="mx-0.5 hidden h-5 w-px bg-[var(--lib-border)] sm:inline" aria-hidden />

          <button
            type="button"
            onClick={onInspectPost}
            className="ml-auto flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-full px-2.5 text-xs font-medium text-[var(--lib-fg-muted)] hover:bg-[var(--lib-muted)] hover:text-[var(--lib-fg)] sm:ml-0 sm:px-3"
            aria-label="Inspect post"
            title="Open full post (first selected asset’s post)"
          >
            <FileText className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Inspect Post</span>
          </button>
        </div>
      </div>
    </div>
  );
}
