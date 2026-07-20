"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  ChevronDown,
  Eye,
  FolderPlus,
  Link2,
  Plus,
  Tag,
  Trash2,
  X
} from "lucide-react";
import {
  buildGalleryVisibilityBody,
  bucketItemsByVisibilityAfterAction,
  relayFetch,
  relayNativeDeletePost,
  type Collection,
  type GalleryItem,
  type PostVisibility,
  type VisibilityAxisAction
} from "@/lib/relay-api";
import {
  PILOT_PERMISSION_BULK_VISIBILITY_HINT,
  PILOT_PERMISSION_HEADLINE
} from "@/lib/pilot-permission-copy";
import { visibilityItemsTriState } from "@/lib/visibility-toggle-state";
import { VisibilitySwitchRow } from "@/app/components/studio/VisibilitySwitchRow";

type Panel = "none" | "tags" | "visibility" | "collection";

const SEL = "#00aa6f";

type Props = {
  /** Distinct selected post count (for copy); bar should only mount when ≥2. */
  selectedPostIds: string[];
  creatorId: string;
  selectedItems: GalleryItem[];
  collections: Collection[];
  onClearSelection: () => void;
  onListRefresh: () => void;
  onCollectionsReload: () => void;
  onApplyBulkTagDelta: (delta: {
    add: string[];
    remove: string[];
    perAsset?: boolean;
  }) => Promise<void>;
  suggestedTags?: string[];
  onError?: (message: string) => void;
  studioWriteBlocked?: boolean;
  onLinkPosts?: (postIds: string[]) => void;
};

function parseTagList(raw: string): string[] {
  return raw
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
}

/**
 * Multi-select library toolkit (≥2 posts). Single-post manage lives on card click → hero / chips.
 */
export default function BulkActionBar({
  selectedPostIds,
  creatorId,
  selectedItems,
  collections,
  onClearSelection,
  onListRefresh,
  onCollectionsReload,
  onApplyBulkTagDelta,
  suggestedTags = [],
  onError,
  studioWriteBlocked = false,
  onLinkPosts
}: Props) {
  const [panel, setPanel] = useState<Panel>("none");
  const [tagAddDraft, setTagAddDraft] = useState("");
  const [tagRemoveDraft, setTagRemoveDraft] = useState("");
  const [tagFieldFocus, setTagFieldFocus] = useState<"add" | "remove">("add");
  const [tagAdvancedExpanded, setTagAdvancedExpanded] = useState(false);
  const [tagPerAsset, setTagPerAsset] = useState(false);
  const [tagBusy, setTagBusy] = useState(false);
  const [collBusy, setCollBusy] = useState<string | null>(null);
  const [newCollectionOpen, setNewCollectionOpen] = useState(false);
  const [newCollectionTitle, setNewCollectionTitle] = useState("");
  const [visBusy, setVisBusy] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const closePanel = useCallback(() => setPanel("none"), []);
  const postCount = selectedPostIds.length;

  const allSelectedAreRelayNative =
    selectedPostIds.length > 0 && selectedPostIds.every((id) => id.startsWith("relay_p_"));

  const deleteSelectedRelayPosts = useCallback(async () => {
    if (studioWriteBlocked || deleteBusy || !allSelectedAreRelayNative) return;
    const n = selectedPostIds.length;
    const ok = window.confirm(
      `Delete ${n} Relay posts? They will disappear from your Library and patron feeds. Media files are kept.`
    );
    if (!ok) return;
    setDeleteBusy(true);
    try {
      for (const postId of selectedPostIds) {
        await relayNativeDeletePost(postId, creatorId);
      }
      closePanel();
      onClearSelection();
      onListRefresh();
    } catch (e) {
      onError?.(e instanceof Error ? e.message : String(e));
    } finally {
      setDeleteBusy(false);
    }
  }, [
    studioWriteBlocked,
    deleteBusy,
    allSelectedAreRelayNative,
    selectedPostIds,
    creatorId,
    closePanel,
    onClearSelection,
    onListRefresh,
    onError
  ]);

  const triggerLinkPosts = useCallback(() => {
    if (selectedPostIds.length < 2) return;
    closePanel();
    onLinkPosts?.(selectedPostIds);
  }, [closePanel, onLinkPosts, selectedPostIds]);

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
      setTagAdvancedExpanded(false);
      setTagPerAsset(false);
    }
  }, [panel]);

  useEffect(() => {
    if (panel !== "collection") {
      setNewCollectionOpen(false);
      setNewCollectionTitle("");
    }
  }, [panel]);

  useEffect(() => {
    if (panel === "collection") onCollectionsReload();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- avoid reload loop on every parent render
  }, [panel]);

  const postVisibilityUpdate = async (items: GalleryItem[], visibility: PostVisibility) => {
    const body = buildGalleryVisibilityBody(creatorId, items, visibility);
    await relayFetch<unknown>("/api/v1/gallery/visibility", {
      method: "POST",
      cache: "no-store",
      body: JSON.stringify(body)
    });
  };

  const applyVisibilityAxis = async (action: VisibilityAxisAction) => {
    if (studioWriteBlocked) return;
    setVisBusy(true);
    try {
      const buckets = bucketItemsByVisibilityAfterAction(selectedItems, action);
      for (const [vis, group] of Array.from(buckets.entries())) {
        if (group.length === 0) continue;
        await postVisibilityUpdate(group, vis);
      }
      onListRefresh();
    } catch (e) {
      onError?.(e instanceof Error ? e.message : String(e));
    } finally {
      setVisBusy(false);
    }
  };

  const hiddenState = useMemo(
    () => visibilityItemsTriState(selectedItems, (v) => v === "hidden"),
    [selectedItems]
  );
  const matureState = useMemo(
    () => visibilityItemsTriState(selectedItems, (v) => v === "review"),
    [selectedItems]
  );
  const allHidden = hiddenState === "on";
  const onHiddenToggle = (nextOn: boolean) => {
    void applyVisibilityAxis(nextOn ? "set_hidden" : "set_visible");
  };
  const onMatureToggle = (nextOn: boolean) => {
    void applyVisibilityAxis(nextOn ? "set_mature" : "set_general");
  };

  const addPostsToCollection = async (collectionId: string) => {
    if (selectedPostIds.length === 0) return;
    setCollBusy(collectionId);
    try {
      await relayFetch<unknown>(
        `/api/v1/gallery/collections/${encodeURIComponent(collectionId)}/posts`,
        {
          method: "POST",
          body: JSON.stringify({ post_ids: selectedPostIds })
        }
      );
      setNewCollectionOpen(false);
      setNewCollectionTitle("");
      closePanel();
      onCollectionsReload();
      onListRefresh();
    } catch (e) {
      onError?.(e instanceof Error ? e.message : String(e));
    } finally {
      setCollBusy(null);
    }
  };

  const createCollectionAndAdd = async () => {
    const title = newCollectionTitle.trim();
    if (!title || selectedPostIds.length === 0) return;
    setCollBusy("new");
    try {
      const created = await relayFetch<Collection>("/api/v1/gallery/collections", {
        method: "POST",
        body: JSON.stringify({ title })
      });
      const newId = created.collection_id;
      setNewCollectionTitle("");
      setNewCollectionOpen(false);
      await addPostsToCollection(newId);
    } catch (e) {
      onError?.(e instanceof Error ? e.message : String(e));
      setCollBusy(null);
    }
  };

  const submitTags = async () => {
    if (studioWriteBlocked) return;
    const add = parseTagList(tagAddDraft);
    const remove = parseTagList(tagRemoveDraft);
    if (add.length === 0 && remove.length === 0) return;
    if (tagPerAsset) {
      const real = selectedItems.filter((i) => i.media_id && !i.shadow_cover);
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

  if (postCount < 2) return null;

  const toggle = (next: Panel) => setPanel((p) => (p === next ? "none" : next));

  const mint = "#9bf0c4";
  const bar = (
    <div
      ref={rootRef}
      className="pointer-events-none fixed bottom-6 left-1/2 z-[45] flex -translate-x-1/2 flex-col items-center"
      data-bulk-action-bar
    >
      <div className="pointer-events-auto relative flex flex-col items-center">
        {panel === "tags" ? (
          <div
            className="mb-2 w-[min(100vw-2rem,20rem)] rounded-2xl border p-3 shadow-2xl"
            style={{ background: "#0e0e0e", borderColor: "#2a2a2a" }}
          >
            {studioWriteBlocked ? (
              <p className="mb-2 rounded-lg border border-[var(--lib-warning)]/35 bg-[var(--lib-warning)]/10 px-2.5 py-2 text-[10px] text-[var(--lib-fg)]">
                Patreon sync must be healthy before editing tags.
              </p>
            ) : null}
            <p className="text-[10px] leading-snug" style={{ color: "#666" }}>
              Tags apply to the whole post for each selected item.
            </p>
            <div className="mt-3 flex gap-2">
              <input
                value={tagAddDraft}
                onChange={(e) => setTagAddDraft(e.target.value)}
                onFocus={() => setTagFieldFocus("add")}
                disabled={studioWriteBlocked}
                placeholder="Add tags (comma-separated)"
                aria-label="Add tags"
                className="min-w-0 flex-1 rounded-xl border px-2.5 py-2 text-xs outline-none disabled:opacity-45"
                style={{ background: "#111", borderColor: "#2a2a2a", color: "#e8e8e0" }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void submitTags();
                }}
              />
              <button
                type="button"
                disabled={
                  studioWriteBlocked ||
                  tagBusy ||
                  (parseTagList(tagAddDraft).length === 0 &&
                    parseTagList(tagRemoveDraft).length === 0)
                }
                onClick={() => void submitTags()}
                className="shrink-0 rounded-xl px-3 py-2 text-xs font-semibold disabled:opacity-45"
                style={{
                  background: "rgba(155,240,196,0.14)",
                  color: mint,
                  border: "1px solid rgba(155,240,196,0.35)"
                }}
              >
                {tagBusy ? "…" : "Apply"}
              </button>
            </div>
            {suggestedTags.length > 0 ? (
              <div className="mt-2.5 flex flex-wrap gap-1">
                {suggestedTags.slice(0, 24).map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    title={`Add “${tag}”`}
                    onClick={() => applyQuickPickTag(tag)}
                    className="rounded-lg border px-2 py-0.5 text-[10px] transition-colors"
                    style={{ borderColor: "#2a2a2a", color: "#888", background: "#111" }}
                  >
                    {tag}
                  </button>
                ))}
              </div>
            ) : null}
            <div className="mt-3">
              <button
                type="button"
                aria-expanded={tagAdvancedExpanded}
                onClick={() => setTagAdvancedExpanded((o) => !o)}
                className="flex items-center gap-1 text-[10px] font-medium transition-colors"
                style={{ color: "#666" }}
              >
                <ChevronDown
                  className={`h-3 w-3 transition-transform ${tagAdvancedExpanded ? "rotate-180" : ""}`}
                />
                Advanced
              </button>
              {tagAdvancedExpanded ? (
                <div className="mt-2 space-y-2 border-t pt-2" style={{ borderColor: "#1a1a1a" }}>
                  <input
                    value={tagRemoveDraft}
                    onChange={(e) => setTagRemoveDraft(e.target.value)}
                    onFocus={() => setTagFieldFocus("remove")}
                    disabled={studioWriteBlocked}
                    placeholder="Remove tags (comma-separated)"
                    aria-label="Remove tags"
                    className="w-full rounded-xl border px-2.5 py-2 text-xs outline-none disabled:opacity-45"
                    style={{ background: "#111", borderColor: "#2a2a2a", color: "#e8e8e0" }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") void submitTags();
                    }}
                  />
                  <label className="flex items-center gap-2 text-[10px]" style={{ color: "#666" }}>
                    <input
                      type="checkbox"
                      checked={tagPerAsset}
                      onChange={(e) => setTagPerAsset(e.target.checked)}
                      className="rounded"
                    />
                    Tags apply only to the selected files — other media in the same post stay
                    unchanged
                  </label>
                </div>
              ) : null}
            </div>
          </div>
        ) : null}

        {panel === "visibility" ? (
          <div
            className="mb-2 w-[min(100vw-2rem,18rem)] overflow-hidden rounded-2xl border shadow-2xl"
            style={{ background: "#0e0e0e", borderColor: "#2a2a2a" }}
          >
            <p
              className="border-b px-3 py-2 text-[10px] font-semibold uppercase tracking-wider"
              style={{ borderColor: "#1a1a1a", color: "#666" }}
            >
              Visibility
            </p>
            <p
              className="border-b px-3 py-1.5 text-[10px] font-medium leading-snug"
              style={{ borderColor: "#1a1a1a", color: "#ccc" }}
            >
              {PILOT_PERMISSION_HEADLINE}
            </p>
            <p
              className="border-b px-3 py-2 text-[9px] leading-snug"
              style={{ borderColor: "#1a1a1a", color: "#555" }}
            >
              {PILOT_PERMISSION_BULK_VISIBILITY_HINT}
            </p>
            {studioWriteBlocked ? (
              <p className="mx-3 mt-2 rounded-lg border border-[var(--lib-warning)]/35 bg-[var(--lib-warning)]/10 px-2.5 py-2 text-[10px] text-[var(--lib-fg)]">
                Patreon sync must be healthy before changing visibility.
              </p>
            ) : null}
            <VisibilitySwitchRow
              label="Hidden"
              helper="Off gallery for patrons; you still see it in Library"
              state={hiddenState}
              busy={visBusy}
              disabled={studioWriteBlocked}
              accentColor={SEL}
              title="Applies to all selected posts and assets"
              onToggle={onHiddenToggle}
            />
            <div className="mx-3 h-px" style={{ background: "#1a1a1a" }} role="separator" />
            <VisibilitySwitchRow
              label="Adult (18+)"
              helper="Mature content rating on Relay"
              state={matureState}
              busy={visBusy}
              disabled={studioWriteBlocked || allHidden}
              accentColor={SEL}
              title={
                allHidden
                  ? "Unhide first — hidden posts cannot be rated while off-gallery"
                  : "Applies to all selected; hidden rows stay hidden"
              }
              onToggle={onMatureToggle}
            />
          </div>
        ) : null}

        {panel === "collection" ? (
          <div
            className="mb-2 w-[min(100vw-2rem,18rem)] overflow-hidden rounded-2xl border shadow-2xl"
            style={{ background: "#0e0e0e", borderColor: "#2a2a2a" }}
            aria-label="Add to collection"
          >
            <div className="border-b px-3 py-2" style={{ borderColor: "#1a1a1a" }}>
              <p
                className="text-[10px] font-semibold uppercase tracking-wider"
                style={{ color: "#666" }}
              >
                Add to collection
              </p>
              <p className="mt-0.5 text-[10px] leading-snug" style={{ color: "#555" }}>
                {postCount} posts selected
              </p>
            </div>
            <div className="max-h-40 overflow-y-auto py-1">
              {collections.length === 0 ? (
                <p className="px-3 py-2 text-[11px]" style={{ color: "#555" }}>
                  No collections yet — create one below.
                </p>
              ) : (
                <ul className="space-y-0.5 px-1">
                  {collections.map((c) => (
                    <li key={c.collection_id}>
                      <button
                        type="button"
                        disabled={collBusy !== null}
                        onClick={() => void addPostsToCollection(c.collection_id)}
                        className="flex w-full items-center justify-between gap-2 rounded-lg px-2 py-2 text-left text-xs disabled:opacity-50"
                        style={{ color: "#ccc" }}
                      >
                        <span className="min-w-0 truncate font-medium">{c.title}</span>
                        <span className="shrink-0 text-[10px]" style={{ color: "#555" }}>
                          {collBusy === c.collection_id ? "Adding…" : `Add · ${c.post_ids.length}`}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="border-t" style={{ borderColor: "#1a1a1a" }}>
              <button
                type="button"
                disabled={collBusy !== null}
                onClick={() => setNewCollectionOpen((v) => !v)}
                className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-xs font-medium disabled:opacity-50"
                style={{ color: "#ccc" }}
              >
                <Plus className="h-3.5 w-3.5 shrink-0" style={{ color: mint }} aria-hidden />
                New Collection
              </button>
              {newCollectionOpen ? (
                <div className="border-t px-3 py-3" style={{ borderColor: "#1a1a1a", background: "#0a0a0a" }}>
                  <label className="sr-only" htmlFor="bulk-new-coll-title">
                    New collection name
                  </label>
                  <input
                    id="bulk-new-coll-title"
                    value={newCollectionTitle}
                    onChange={(e) => setNewCollectionTitle(e.target.value)}
                    placeholder="Collection name"
                    disabled={collBusy !== null}
                    className="mb-2 w-full rounded-xl border px-2.5 py-2 text-xs outline-none disabled:opacity-45"
                    style={{ background: "#111", borderColor: "#2a2a2a", color: "#e8e8e0" }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        void createCollectionAndAdd();
                      }
                    }}
                  />
                  <button
                    type="button"
                    disabled={
                      collBusy !== null || !newCollectionTitle.trim() || selectedPostIds.length === 0
                    }
                    onClick={() => void createCollectionAndAdd()}
                    className="w-full rounded-xl py-2 text-xs font-semibold disabled:opacity-40"
                    style={{
                      background: "rgba(155,240,196,0.14)",
                      color: mint,
                      border: "1px solid rgba(155,240,196,0.35)"
                    }}
                  >
                    {collBusy === "new" ? "Creating…" : `Create & add ${postCount} posts`}
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        ) : null}

        {/* v0 LinkPostsFloatingBar chrome — fixed bottom-center */}
        <div
          className="flex items-center gap-3 rounded-2xl border px-4 py-3 shadow-2xl"
          style={{
            background: "#0e0e0e",
            borderColor: "#2a2a2a",
            boxShadow: "0 8px 40px rgba(0,0,0,0.6)"
          }}
        >
          <span className="text-[12px]" style={{ color: "#666" }}>
            <span className="font-semibold tabular-nums" style={{ color: "#ccc" }}>
              {postCount}
            </span>{" "}
            posts selected
          </span>
          <div className="h-4 w-px" style={{ background: "#2a2a2a" }} />
          {onLinkPosts ? (
            <button
              type="button"
              onClick={triggerLinkPosts}
              className="flex items-center gap-2 rounded-xl px-3.5 py-2 text-[12px] font-semibold transition-all duration-150"
              style={{
                background: "rgba(155,240,196,0.14)",
                color: mint,
                border: "1px solid rgba(155,240,196,0.35)"
              }}
            >
              <Link2 className="h-3.5 w-3.5" />
              Link posts
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => toggle("tags")}
            className="flex items-center gap-1.5 rounded-xl px-2.5 py-2 text-[12px] font-medium transition-colors"
            style={{
              color: panel === "tags" ? mint : "#666",
              background: panel === "tags" ? "rgba(155,240,196,0.08)" : "transparent"
            }}
          >
            <Tag className="h-3.5 w-3.5" />
            Tags
          </button>
          <button
            type="button"
            onClick={() => toggle("visibility")}
            className="flex items-center gap-1.5 rounded-xl px-2.5 py-2 text-[12px] font-medium transition-colors"
            style={{
              color: panel === "visibility" ? mint : "#666",
              background: panel === "visibility" ? "rgba(155,240,196,0.08)" : "transparent"
            }}
          >
            <Eye className="h-3.5 w-3.5" />
            Visibility
          </button>
          <button
            type="button"
            onClick={() => toggle("collection")}
            className="flex items-center gap-1.5 rounded-xl px-2.5 py-2 text-[12px] font-medium transition-colors"
            style={{
              color: panel === "collection" ? mint : "#666",
              background: panel === "collection" ? "rgba(155,240,196,0.08)" : "transparent"
            }}
          >
            <FolderPlus className="h-3.5 w-3.5" />
            Collection
          </button>
          {allSelectedAreRelayNative ? (
            <button
              type="button"
              onClick={() => void deleteSelectedRelayPosts()}
              disabled={studioWriteBlocked || deleteBusy}
              title={`Delete ${postCount} Relay posts`}
              className="flex items-center gap-1.5 rounded-xl px-2.5 py-2 text-[12px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-45"
              style={{ color: "#f87171" }}
            >
              <Trash2 className="h-3.5 w-3.5" />
              {deleteBusy ? "Deleting…" : "Delete"}
            </button>
          ) : null}
          <button
            type="button"
            onClick={onClearSelection}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border transition-all duration-150"
            style={{ borderColor: "#2a2a2a", color: "#555", background: "transparent" }}
            aria-label="Clear selection"
            title="Clear selection"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      </div>
    </div>
  );

  if (typeof document === "undefined") return bar;
  return createPortal(bar, document.body);
}
