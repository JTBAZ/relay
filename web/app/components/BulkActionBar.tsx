"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronDown,
  Download,
  Eye,
  FileText,
  FolderPlus,
  Layers3,
  Plus,
  Tag,
  X
} from "lucide-react";
import {
  accessTiersFromGalleryItem,
  AudienceAccessTierSelect
} from "./audience-access-tier-select";
import {
  RELAY_API_BASE,
  buildGalleryVisibilityBody,
  bucketItemsByVisibilityAfterAction,
  relayFetch,
  type Collection,
  type GalleryItem,
  type PostVisibility,
  type VisibilityAxisAction
} from "@/lib/relay-api";
import {
  PILOT_PERMISSION_BULK_VISIBILITY_HINT,
  PILOT_PERMISSION_HEADLINE
} from "@/lib/pilot-permission-copy";

type Panel = "none" | "tags" | "visibility" | "audience" | "collection";

const SEL = "#00aa6f";

type Props = {
  selectedCount: number;
  creatorId: string;
  selectedItems: GalleryItem[];
  selectedPostIds: string[];
  collections: Collection[];
  tierTitleById?: Record<string, string>;
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
  /** P5-sync-004 — matches API 423 when Patreon sync rollup is failed/degraded. */
  studioWriteBlocked?: boolean;
};

function patreonAccessLabel(item: GalleryItem | null, tierTitleById: Record<string, string>): string {
  if (!item) return "—";
  if (item.tier_ids.length === 0) return "No tier gate";
  return item.tier_ids
    .map((id) => tierTitleById[id]?.trim() || id.replace(/^patreon_tier_/, ""))
    .slice(0, 2)
    .join(", ");
}

function relayVisibilityLabel(item: GalleryItem | null): string {
  if (!item) return "—";
  if (item.visibility === "hidden") return "Hidden";
  if (item.visibility === "review") return "Adult (18+)";
  return "General";
}

type ToggleTriState = "off" | "on" | "mixed";

function visibilityTriState(
  items: GalleryItem[],
  match: (v: PostVisibility) => boolean
): ToggleTriState {
  if (items.length === 0) return "off";
  const hits = items.filter((i) => match(i.visibility)).length;
  if (hits === 0) return "off";
  if (hits === items.length) return "on";
  return "mixed";
}

type VisibilitySwitchProps = {
  label: string;
  helper: string;
  state: ToggleTriState;
  disabled?: boolean;
  busy?: boolean;
  title?: string;
  onToggle: (nextOn: boolean) => void;
};

function VisibilitySwitch({
  label,
  helper,
  state,
  disabled = false,
  busy = false,
  title,
  onToggle
}: VisibilitySwitchProps) {
  const on = state === "on";
  const mixed = state === "mixed";
  return (
    <div
      className="flex items-center justify-between gap-3 px-3 py-2.5"
      title={title}
    >
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-[var(--lib-fg)]">{label}</p>
        <p className="text-[9px] leading-snug text-[var(--lib-fg-muted)]">{helper}</p>
        {mixed ? (
          <p className="mt-0.5 text-[9px] text-amber-400/90">Mixed — click to set all off, then on again if needed</p>
        ) : null}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={mixed ? "mixed" : on}
        aria-label={label}
        disabled={disabled || busy}
        onClick={() => onToggle(mixed ? false : !on)}
        className={[
          "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border border-transparent transition-colors",
          "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color-mix(in_srgb,var(--lib-selection)_55%,transparent)]",
          "disabled:cursor-not-allowed disabled:opacity-45",
          on || mixed ? "" : "bg-[var(--lib-muted)]"
        ].join(" ")}
        style={on || mixed ? { backgroundColor: SEL } : undefined}
      >
        <span
          className={[
            "pointer-events-none block h-4 w-4 rounded-full bg-white shadow-sm transition-transform",
            on ? "translate-x-[1.125rem]" : mixed ? "translate-x-[0.5625rem]" : "translate-x-0.5"
          ].join(" ")}
          aria-hidden
        />
      </button>
    </div>
  );
}

export default function BulkActionBar({
  selectedCount,
  creatorId,
  selectedItems,
  selectedPostIds,
  collections,
  tierTitleById = {},
  onClearSelection,
  onListRefresh,
  onCollectionsReload,
  onApplyBulkTagDelta,
  suggestedTags = [],
  onInspectPost,
  onError,
  studioWriteBlocked = false
}: Props) {
  const [panel, setPanel] = useState<Panel>("none");
  const [tagAddDraft, setTagAddDraft] = useState("");
  const [tagRemoveDraft, setTagRemoveDraft] = useState("");
  /** Which tag field Quick pick writes to; follows focus, default Add. */
  const [tagFieldFocus, setTagFieldFocus] = useState<"add" | "remove">("add");
  const [tagAdvancedExpanded, setTagAdvancedExpanded] = useState(false);
  /** When set, bulk tag API uses `media_targets` (per-asset overrides) instead of post-level tags. */
  const [tagPerAsset, setTagPerAsset] = useState(false);
  const [tagBusy, setTagBusy] = useState(false);
  const [collBusy, setCollBusy] = useState<string | null>(null);
  const [newCollectionOpen, setNewCollectionOpen] = useState(false);
  const [newCollectionTitle, setNewCollectionTitle] = useState("");
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
      setTagAdvancedExpanded(false);
      setTagPerAsset(false);
    }
  }, [panel]);

  useEffect(() => {
    if (panel === "audience" && selectedPostIds.length !== 1) {
      closePanel();
    }
  }, [panel, selectedPostIds.length, closePanel]);

  useEffect(() => {
    if (panel !== "collection") {
      setNewCollectionOpen(false);
      setNewCollectionTitle("");
    }
  }, [panel]);

  useEffect(() => {
    if (panel === "collection") onCollectionsReload();
    // Refresh list when the panel opens; parent callback is stable enough to omit from deps.
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
    () => visibilityTriState(selectedItems, (v) => v === "hidden"),
    [selectedItems]
  );
  const matureState = useMemo(
    () => visibilityTriState(selectedItems, (v) => v === "review"),
    [selectedItems]
  );
  const allHidden = hiddenState === "on";
  const onHiddenToggle = (nextOn: boolean) => {
    void applyVisibilityAxis(nextOn ? "set_hidden" : "set_visible");
  };
  const onMatureToggle = (nextOn: boolean) => {
    void applyVisibilityAxis(nextOn ? "set_mature" : "set_general");
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
        body: JSON.stringify({ creator_id: creatorId, title })
      });
      const newId = created.collection_id;
      if (!newId) throw new Error("Missing collection id from server.");
      setNewCollectionTitle("");
      setNewCollectionOpen(false);
      await addPostsToCollection(newId);
    } catch (e) {
      onError?.(e instanceof Error ? e.message : String(e));
    } finally {
      setCollBusy(null);
    }
  };

  const parseTagList = (raw: string) =>
    Array.from(new Set(raw.split(",").map((t) => t.trim()).filter(Boolean)));

  const submitTags = async () => {
    if (studioWriteBlocked) return;
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

  const singleItem = selectedPostIds.length === 1 ? (selectedItems[0] ?? null) : null;
  const singlePostAudience = singleItem
    ? accessTiersFromGalleryItem(singleItem, tierTitleById)
    : [];
  const audienceSinglePostOnly = selectedPostIds.length !== 1;
  const toggle = (next: Panel) => setPanel((p) => (p === next ? "none" : next));

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
            {studioWriteBlocked ? (
              <p className="mb-2 rounded-lg border border-[var(--lib-warning)]/35 bg-[var(--lib-warning)]/10 px-2.5 py-2 text-[10px] text-[var(--lib-fg)]">
                Patreon sync must be healthy before editing tags.
              </p>
            ) : null}
            <p className="text-[10px] leading-snug text-[var(--lib-fg-muted)]">
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
                className="min-w-0 flex-1 rounded-lg border border-[var(--lib-border)] bg-[var(--lib-input)] px-2.5 py-2 text-xs text-[var(--lib-fg)] placeholder:text-[var(--lib-fg-muted)] disabled:opacity-45"
                onKeyDown={(e) => {
                  if (e.key === "Enter") void submitTags();
                }}
              />
              <button
                type="button"
                disabled={
                  studioWriteBlocked ||
                  tagBusy ||
                  (parseTagList(tagAddDraft).length === 0 && parseTagList(tagRemoveDraft).length === 0)
                }
                onClick={() => void submitTags()}
                className="shrink-0 rounded-lg px-3 py-2 text-xs font-semibold text-neutral-950 disabled:opacity-45"
                style={{ backgroundColor: SEL }}
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
                    className="rounded border border-[var(--lib-border)] bg-[var(--lib-sidebar-accent)] px-2 py-0.5 text-[10px] text-[var(--lib-fg)] hover:border-[color-mix(in_srgb,var(--lib-selection)_45%,var(--lib-border))]"
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
                className="flex items-center gap-1 text-[10px] font-medium text-[var(--lib-fg-muted)] transition-colors hover:text-[var(--lib-fg)]"
              >
                Advanced
                <ChevronDown
                  className={`h-3.5 w-3.5 shrink-0 transition-transform ${tagAdvancedExpanded ? "rotate-180" : ""}`}
                  aria-hidden
                />
              </button>
              {tagAdvancedExpanded ? (
                <div className="mt-2 space-y-3 rounded-lg border border-[var(--lib-border)] bg-[var(--lib-muted)]/35 p-2.5">
                  <label className="flex cursor-pointer items-start gap-2 text-[10px] text-[var(--lib-fg)]">
                    <input
                      type="checkbox"
                      checked={tagPerAsset}
                      onChange={(e) => setTagPerAsset(e.target.checked)}
                      className="mt-0.5 rounded border-[var(--lib-border)]"
                    />
                    <span className="font-medium">Selected assets only</span>
                  </label>
                  {tagPerAsset ? (
                    <p className="text-[9px] leading-snug text-[var(--lib-fg-muted)]">
                      Tags apply only to the selected files — other media in the same post stay
                      unchanged.
                    </p>
                  ) : null}
                  <div>
                    <p className="text-[10px] font-medium text-[var(--lib-fg-muted)]">Remove tags</p>
                    <input
                      value={tagRemoveDraft}
                      onChange={(e) => setTagRemoveDraft(e.target.value)}
                      onFocus={() => setTagFieldFocus("remove")}
                      placeholder="tag_a, tag_b"
                      aria-label="Remove tags"
                      className="mt-1 w-full rounded-lg border border-[var(--lib-border)] bg-[var(--lib-input)] px-2.5 py-2 text-xs text-[var(--lib-fg)] placeholder:text-[var(--lib-fg-muted)]"
                      onKeyDown={(e) => {
                        if (e.key === "Enter") void submitTags();
                      }}
                    />
                  </div>
                </div>
              ) : null}
            </div>
            <div className="mt-3 flex justify-end">
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
            </div>
          </div>
        ) : null}

        {panel === "visibility" ? (
          <div
            className="mb-2 w-[min(100%,20rem)] overflow-hidden rounded-xl border border-[var(--lib-border)] bg-[var(--lib-card)] py-1 shadow-2xl"
            style={{ boxShadow: `0 0 0 1px color-mix(in srgb, ${SEL} 22%, transparent)` }}
            aria-label="Relay visibility"
          >
            <p className="px-3 pb-0.5 pt-2 text-[10px] font-semibold uppercase tracking-wider text-[var(--lib-fg-muted)]">
              Visibility
            </p>
            <p className="px-3 pb-1 text-[10px] font-medium leading-snug text-[var(--lib-fg)]">
              {PILOT_PERMISSION_HEADLINE}
            </p>
            <p className="px-3 pb-2 text-[9px] leading-snug text-[var(--lib-fg-muted)]">
              {PILOT_PERMISSION_BULK_VISIBILITY_HINT} Changes save immediately.
            </p>
            {studioWriteBlocked ? (
              <p className="mx-2 mb-2 rounded-lg border border-[var(--lib-warning)]/35 bg-[var(--lib-warning)]/10 px-2.5 py-2 text-[10px] text-[var(--lib-fg)]">
                Patreon sync must be healthy before changing visibility.
              </p>
            ) : null}
            <VisibilitySwitch
              label="Hidden"
              helper="Not shown to anyone on Relay"
              state={hiddenState}
              busy={visBusy}
              disabled={studioWriteBlocked}
              title={
                selectedCount > 1
                  ? "Applies to all selected posts and assets"
                  : "Off = visible to entitled patrons (tier gate still applies)"
              }
              onToggle={onHiddenToggle}
            />
            <div className="mx-3 h-px bg-[var(--lib-border)]" role="separator" />
            <VisibilitySwitch
              label="Adult (18+)"
              helper="Mature content rating on Relay"
              state={matureState}
              busy={visBusy}
              disabled={studioWriteBlocked || allHidden}
              title={
                allHidden
                  ? "Unhide first — hidden posts cannot be rated while off-gallery"
                  : selectedCount > 1
                    ? "Applies to all selected; hidden rows stay hidden"
                    : "Off = general audience rating"
              }
              onToggle={onMatureToggle}
            />
            <p className="border-t border-[var(--lib-border)] px-3 py-2 text-[9px] leading-snug text-[var(--lib-fg-muted)]">
              <span className="font-medium text-[var(--lib-fg)]">General</span> — turn Adult off. Patrons
              still need the right tier when not hidden.
            </p>
          </div>
        ) : null}

        {panel === "audience" && singleItem ? (
          <div
            className="mb-2 w-[min(100%,20rem)] rounded-xl border border-[var(--lib-border)] bg-[var(--lib-card)] p-3 shadow-2xl"
            style={{ boxShadow: `0 0 0 1px color-mix(in srgb, ${SEL} 22%, transparent)` }}
          >
            <p className="pb-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--lib-fg-muted)]">
              Audience access
            </p>
            <p className="pb-2 text-[9px] leading-snug text-[var(--lib-fg-muted)]">
              Sets who can unlock this post on Relay — same as Inspection.
            </p>
            {studioWriteBlocked ? (
              <p className="mb-2 rounded-lg border border-[var(--lib-warning)]/35 bg-[var(--lib-warning)]/10 px-2.5 py-2 text-[10px] text-[var(--lib-fg)]">
                Patreon sync must be healthy before changing audience access.
              </p>
            ) : null}
            <AudienceAccessTierSelect
              creatorId={creatorId}
              postId={singleItem.post_id}
              accessTiers={singlePostAudience}
              disabled={studioWriteBlocked}
              compact
              onSaved={async () => {
                onListRefresh();
              }}
            />
          </div>
        ) : null}

        {panel === "collection" ? (
          <div
            className="mb-2 w-full max-w-sm overflow-hidden rounded-xl border border-[var(--lib-border)] bg-[var(--lib-card)] shadow-2xl"
            style={{ boxShadow: `0 0 0 1px color-mix(in srgb, ${SEL} 22%, transparent)` }}
            aria-label="Add to collection"
          >
            <div className="border-b border-[var(--lib-border)] px-3 py-2">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--lib-fg-muted)]">
                Add to collection
              </p>
              <p className="mt-0.5 text-[10px] leading-snug text-[var(--lib-fg-muted)]">
                {selectedPostIds.length} post{selectedPostIds.length === 1 ? "" : "s"} selected
              </p>
            </div>
            <div className="max-h-40 overflow-y-auto py-1">
              {collections.length === 0 ? (
                <p className="px-3 py-2 text-[11px] text-[var(--lib-fg-muted)]">
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
                        className="flex w-full items-center justify-between gap-2 rounded-lg px-2 py-2 text-left text-xs text-[var(--lib-fg)] hover:bg-[var(--lib-sidebar-accent)] disabled:opacity-50"
                      >
                        <span className="min-w-0 truncate font-medium">{c.title}</span>
                        <span className="shrink-0 text-[10px] text-[var(--lib-fg-muted)]">
                          {collBusy === c.collection_id ? (
                            "Adding…"
                          ) : (
                            <>
                              <span className="sr-only">Add to </span>
                              Add · {c.post_ids.length}
                            </>
                          )}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="border-t border-[var(--lib-border)]">
              <button
                type="button"
                disabled={collBusy !== null}
                onClick={() => setNewCollectionOpen((v) => !v)}
                className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-xs font-medium text-[var(--lib-fg)] hover:bg-[var(--lib-muted)] disabled:opacity-50"
              >
                <Plus className="h-3.5 w-3.5 shrink-0" style={{ color: SEL }} aria-hidden />
                New Collection
              </button>
              {newCollectionOpen ? (
                <div className="border-t border-[var(--lib-border)] bg-[var(--lib-muted)]/40 px-3 py-3">
                  <label className="sr-only" htmlFor="bulk-new-coll-title">
                    New collection name
                  </label>
                  <input
                    id="bulk-new-coll-title"
                    value={newCollectionTitle}
                    onChange={(e) => setNewCollectionTitle(e.target.value)}
                    placeholder="Collection name"
                    disabled={collBusy !== null}
                    className="mb-2 w-full rounded-lg border border-[var(--lib-border)] bg-[var(--lib-input)] px-2.5 py-2 text-xs text-[var(--lib-fg)] placeholder:text-[var(--lib-fg-muted)] focus:border-[var(--lib-ring)] focus:outline-none disabled:opacity-45"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        void createCollectionAndAdd();
                      }
                    }}
                  />
                  <button
                    type="button"
                    disabled={collBusy !== null || !newCollectionTitle.trim() || selectedPostIds.length === 0}
                    onClick={() => void createCollectionAndAdd()}
                    className="w-full rounded-lg py-2 text-xs font-semibold text-neutral-950 disabled:opacity-40"
                    style={{ backgroundColor: SEL }}
                  >
                    {collBusy === "new"
                      ? "Creating…"
                      : `Create & add ${selectedPostIds.length} post${selectedPostIds.length === 1 ? "" : "s"}`}
                  </button>
                </div>
              ) : null}
            </div>
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
            disabled={audienceSinglePostOnly || studioWriteBlocked}
            title={
              audienceSinglePostOnly
                ? "Select one post"
                : studioWriteBlocked
                  ? "Patreon sync must be healthy before changing audience access"
                  : "Change who can unlock this post on Relay"
            }
            onClick={() => {
              if (audienceSinglePostOnly || studioWriteBlocked) return;
              toggle("audience");
            }}
            className={`flex h-8 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium sm:px-3 disabled:cursor-not-allowed disabled:opacity-45 ${
              panel === "audience"
                ? "text-neutral-950"
                : "text-[var(--lib-fg-muted)] hover:bg-[var(--lib-muted)] hover:text-[var(--lib-fg)]"
            }`}
            style={panel === "audience" ? { backgroundColor: SEL } : undefined}
          >
            <Layers3 className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Audience</span>
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

          {singleItem ? (
            <>
              <span className="mx-0.5 hidden h-5 w-px bg-[var(--lib-border)] md:inline" aria-hidden />
              <div
                className="hidden min-w-0 flex-col items-start gap-0.5 md:flex"
                title={`${PILOT_PERMISSION_HEADLINE} · Relay: ${relayVisibilityLabel(singleItem)} · Patreon access (read-only): ${patreonAccessLabel(singleItem, tierTitleById)}`}
              >
                <span className="max-w-[11rem] truncate text-[9px] font-medium text-[var(--lib-fg)]">
                  {PILOT_PERMISSION_HEADLINE}
                </span>
                <span className="max-w-[9rem] truncate text-[9px] font-medium uppercase tracking-wide text-[var(--lib-fg-muted)]">
                  Relay: {relayVisibilityLabel(singleItem)}
                </span>
                <span className="max-w-[9rem] truncate text-[9px] text-[var(--lib-fg-muted)]">
                  Patreon (read-only): {patreonAccessLabel(singleItem, tierTitleById)}
                </span>
              </div>
            </>
          ) : null}

          <span className="mx-0.5 hidden h-5 w-px bg-[var(--lib-border)] sm:inline" aria-hidden />

          <button
            type="button"
            onClick={onInspectPost}
            className="ml-auto flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-full px-2.5 text-xs font-medium text-[var(--lib-fg-muted)] hover:bg-[var(--lib-muted)] hover:text-[var(--lib-fg)] sm:ml-0 sm:px-3"
            aria-label="Open post details"
            title="Open full post details (visibility, tags, tiers)"
          >
            <FileText className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Details</span>
          </button>
        </div>
      </div>
    </div>
  );
}
