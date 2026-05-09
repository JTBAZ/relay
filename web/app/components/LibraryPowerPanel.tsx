"use client";

import { useMemo, useState } from "react";
import {
  BarChart3,
  DollarSign,
  ExternalLink,
  Eye,
  EyeOff,
  Images,
  MessageSquare,
  ShieldAlert,
  ShieldCheck,
  Tag,
  Upload,
  X
} from "lucide-react";
import {
  RELAY_API_BASE,
  type Collection,
  type FacetsData,
  type GalleryItem,
  type PostVisibility,
  type TierFacet
} from "@/lib/relay-api";
import { InspectAssetPreview } from "./inspect/inspect-asset-preview";
import { accessChipLabel } from "./GalleryGridTile";

export type LibraryMode = "media" | "placement" | "engagement" | "financials";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  mode: LibraryMode;
  onModeChange: (mode: LibraryMode) => void;
  selectedItems: GalleryItem[];
  selectedPostMediaItems: GalleryItem[];
  onSelectMediaItem: (item: GalleryItem) => void;
  selectedPostIds: string[];
  collections: Collection[];
  activeCollectionId: string | null;
  facets: FacetsData;
  tierTitleById: Record<string, string>;
  creatorId: string;
  onClearSelection: () => void;
  onListRefresh: () => void;
  onCollectionsReload: () => void;
  onSelectCollection: (id: string | null) => void;
  onInspectPost: () => void;
  onApplyBulkTagDelta: (delta: { add: string[]; remove: string[]; perAsset?: boolean }) => Promise<void>;
  setItemVisibility: (items: GalleryItem[], visibility: PostVisibility) => Promise<void>;
  onError?: (message: string) => void;
  /** P5-sync-004 — matches API 423 when Patreon sync rollup is failed/degraded. */
  studioWriteBlocked?: boolean;
};

const MODES: Array<{ id: LibraryMode; label: string }> = [
  { id: "media", label: "Media" },
  { id: "placement", label: "Placement" },
  { id: "engagement", label: "Engage" },
  { id: "financials", label: "Money" }
];

function selectedTitle(item: GalleryItem | null): string {
  return item?.title?.trim() || "Selected post";
}

function selectedAccess(item: GalleryItem | null, tiers: TierFacet[], tierTitleById: Record<string, string>): string {
  if (!item) return "No post selected";
  if (item.tier_ids.length === 0) return "No tier gate";
  return item.tier_ids
    .map((id) => accessChipLabel(id, tierTitleById))
    .filter(Boolean)
    .slice(0, 3)
    .join(", ");
}

function formatDate(value?: string): string {
  if (!value) return "Unknown";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function mediaKind(item: GalleryItem | null): string {
  if (!item?.mime_type) return "Media";
  const [kind, subtype] = item.mime_type.split("/");
  return subtype ? `${kind} / ${subtype}` : kind;
}

function statusLabel(item: GalleryItem | null): string {
  if (!item) return "No selection";
  if (item.processing_status !== "READY") return item.processing_status.replaceAll("_", " ").toLowerCase();
  if (item.export_status === "missing") return "Export missing";
  return item.has_export ? "Ready" : "Patreon URL only";
}

function seededMetric(seed: string, min: number, max: number): number {
  const value = Array.from(seed).reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return min + (value % Math.max(1, max - min + 1));
}

export default function LibraryPowerPanel({
  isOpen,
  onClose,
  mode,
  onModeChange,
  selectedItems,
  selectedPostMediaItems,
  onSelectMediaItem,
  selectedPostIds,
  collections,
  facets,
  tierTitleById,
  onClearSelection,
  onListRefresh,
  onInspectPost,
  onApplyBulkTagDelta,
  setItemVisibility,
  onError,
  studioWriteBlocked = false
}: Props) {
  const [tagDraft, setTagDraft] = useState("");
  const [mediaEditorOpen, setMediaEditorOpen] = useState(false);
  const [stagedMediaNotes, setStagedMediaNotes] = useState<Record<string, string>>({});
  const [stagedAdditions, setStagedAdditions] = useState<string[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [previewTierId, setPreviewTierId] = useState("free");
  const selectedItem = selectedItems[0] ?? null;
  const singleSelection = selectedPostIds.length === 1;
  const selectedPostCount = selectedPostIds.length;

  const realTiers = useMemo(
    () =>
      facets.tiers.filter((tier) => {
        const title = tier.title.trim().toLowerCase();
        if (tier.tier_id === "relay_tier_public" || tier.tier_id === "relay_tier_all_patrons") return false;
        if (title === "public" || title === "all patrons") return false;
        return true;
      }),
    [facets.tiers]
  );

  const selectedCollections = useMemo(() => {
    if (!selectedItem) return [];
    return collections.filter(
      (collection) =>
        collection.post_ids.includes(selectedItem.post_id) ||
        selectedItem.collection_ids.includes(collection.collection_id)
    );
  }, [collections, selectedItem]);

  const pulseMetrics = useMemo(() => {
    if (!selectedItem) return null;
    const seed = `${selectedItem.post_id}:${selectedItem.media_id}`;
    const impressions = seededMetric(seed, 120, 3600);
    const comments = seededMetric(`${seed}:comments`, 0, 42);
    const collectionAdds = Math.max(selectedCollections.length, seededMetric(`${seed}:collections`, 0, 18));
    const conversions = seededMetric(`${seed}:conversions`, 0, 11);
    const tipRevenue = conversions * seededMetric(`${seed}:tips`, 3, 18);
    return { impressions, comments, collectionAdds, conversions, tipRevenue };
  }, [selectedCollections.length, selectedItem]);

  const applyVisibility = async (visibility: PostVisibility) => {
    if (studioWriteBlocked) return;
    if (selectedItems.length === 0) return;
    setBusy(`visibility:${visibility}`);
    try {
      await setItemVisibility(selectedItems, visibility);
      onListRefresh();
    } catch (error) {
      onError?.(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(null);
    }
  };

  const applyTags = async () => {
    if (studioWriteBlocked) return;
    const add = Array.from(new Set(tagDraft.split(",").map((tag) => tag.trim()).filter(Boolean)));
    if (add.length === 0) return;
    setBusy("tags");
    try {
      await onApplyBulkTagDelta({ add, remove: [] });
      setTagDraft("");
    } catch (error) {
      onError?.(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(null);
    }
  };

  const exportSelected = () => {
    const exportable = selectedItems.filter((item) => item.has_export && item.content_url_path);
    if (exportable.length === 0) {
      onError?.("No exportable files in the current selection.");
      return;
    }
    for (const item of exportable) {
      const anchor = document.createElement("a");
      anchor.href = `${RELAY_API_BASE}${item.content_url_path}`;
      anchor.target = "_blank";
      anchor.rel = "noopener noreferrer";
      anchor.download = "";
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
    }
  };

  const stageReplacement = (mediaId: string, file: File | null) => {
    if (!file) return;
    setStagedMediaNotes((prev) => ({ ...prev, [mediaId]: file.name }));
  };

  const stageAdditions = (files: FileList | null) => {
    if (!files?.length) return;
    setStagedAdditions((prev) => [...prev, ...Array.from(files).map((file) => file.name)]);
  };

  return (
    <aside
      className={[
        "absolute inset-y-0 right-0 z-[83] flex min-h-0 w-[min(22rem,calc(100vw-1rem))] shrink-0 flex-col border-l border-[var(--lib-border)] bg-[color-mix(in_srgb,var(--lib-card)_88%,var(--lib-bg))] shadow-2xl shadow-black/35 transition-transform duration-200 ease-out",
        isOpen ? "translate-x-0" : "pointer-events-none translate-x-[calc(100%+1rem)]"
      ].join(" ")}
      aria-hidden={!isOpen}
    >
      <div className="shrink-0 border-b border-[var(--lib-border)] p-3">
        <div className="flex items-center justify-between gap-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--lib-fg-muted)]">Power panel</p>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-[var(--lib-fg-muted)] hover:bg-[var(--lib-muted)] hover:text-[var(--lib-fg)]"
            aria-label="Close power panel"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>
        <div className="mt-2 grid grid-cols-4 gap-1 rounded-xl border border-[var(--lib-border)] bg-[var(--lib-bg)] p-1">
          {MODES.map((entry) => (
            <button
              key={entry.id}
              type="button"
              onClick={() => onModeChange(entry.id)}
              className={[
                "rounded-lg px-2 py-1.5 text-[10px] font-medium transition-colors",
                mode === entry.id
                  ? "bg-[color-mix(in_srgb,var(--lib-primary)_20%,var(--lib-card))] text-[var(--lib-fg)]"
                  : "text-[var(--lib-fg-muted)] hover:text-[var(--lib-fg)]"
              ].join(" ")}
            >
              {entry.label}
            </button>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-3">
        <section className="rounded-2xl border border-[var(--lib-border)] bg-[var(--lib-bg)] p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--lib-fg-muted)]">
              Pulse of the piece
            </p>
            {selectedItems.length > 0 ? (
              <button
                type="button"
                onClick={onClearSelection}
                className="rounded-full px-2 py-0.5 text-[10px] text-[var(--lib-fg-muted)] hover:bg-[var(--lib-muted)] hover:text-[var(--lib-fg)]"
              >
                Clear
              </button>
            ) : null}
          </div>
          <div className="relative flex h-40 overflow-hidden rounded-xl border border-dashed border-[var(--lib-border)] bg-[var(--lib-card)]">
            {selectedItem ? (
              <>
                <div className="flex h-full w-full items-center justify-center bg-[var(--lib-bg)]">
                  <InspectAssetPreview item={selectedItem} />
                </div>
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-3 pb-2 pt-8">
                  <p className="truncate text-xs font-semibold text-white">{selectedTitle(selectedItem)}</p>
                  <p className="truncate text-[10px] text-white/65">
                    {singleSelection
                      ? `${statusLabel(selectedItem)} · ${selectedAccess(selectedItem, realTiers, tierTitleById)}`
                      : `${selectedPostCount} posts selected`}
                  </p>
                </div>
              </>
            ) : (
              <div className="flex h-full w-full flex-col items-center justify-center px-4 text-center">
                <Images className="h-6 w-6 text-[var(--lib-fg-muted)]" aria-hidden />
                <p className="mt-2 text-xs font-medium text-[var(--lib-fg)]">No post selected</p>
                <p className="mt-1 text-[10px] leading-4 text-[var(--lib-fg-muted)]">
                  Click an item in the gallery to load it here.
                </p>
              </div>
            )}
          </div>
        </section>

        {mode === "media" ? (
          <section className="space-y-3">
            <PanelHeading icon={Images} title="Media" />
            {studioWriteBlocked ? (
              <p className="rounded-xl border border-[var(--lib-warning)]/35 bg-[var(--lib-warning)]/10 px-3 py-2 text-[11px] text-[var(--lib-fg)]">
                Patreon sync must be healthy before editing — use the sync banner or Patreon menu.
              </p>
            ) : null}
            <div className="rounded-xl border border-[var(--lib-border)] bg-[var(--lib-bg)] p-3">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--lib-fg-muted)]">
                Attached media
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {selectedPostMediaItems.length > 0 ? (
                  selectedPostMediaItems.map((item, index) => (
                    <button
                      key={`${item.post_id}:${item.media_id}`}
                      type="button"
                      onClick={() => onSelectMediaItem(item)}
                      className={[
                        "rounded-full border px-2 py-1 text-[10px] transition-colors",
                        selectedItem?.media_id === item.media_id
                          ? "border-[var(--lib-primary)] bg-[color-mix(in_srgb,var(--lib-primary)_16%,var(--lib-bg))] text-[var(--lib-fg)]"
                          : "border-[var(--lib-border)] text-[var(--lib-fg-muted)] hover:border-[var(--lib-primary)]/50 hover:text-[var(--lib-fg)]"
                      ].join(" ")}
                      aria-pressed={selectedItem?.media_id === item.media_id}
                    >
                      {index + 1}. {mediaKind(item).split(" / ")[0]}
                    </button>
                  ))
                ) : (
                  <span className="text-xs text-[var(--lib-fg-muted)]">No media attached.</span>
                )}
              </div>
            </div>
            <button
              type="button"
              disabled={selectedItems.length === 0 || studioWriteBlocked}
              onClick={() => setMediaEditorOpen(true)}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-[color-mix(in_srgb,var(--lib-primary)_45%,var(--lib-border))] bg-[color-mix(in_srgb,var(--lib-primary)_14%,var(--lib-card))] px-3 py-2 text-xs font-medium text-[var(--lib-fg)] hover:border-[var(--lib-primary)] disabled:opacity-45"
            >
              <Upload size={13} aria-hidden />
              Add or Edit Media
            </button>
            <button
              type="button"
              disabled={selectedItems.length === 0}
              onClick={onInspectPost}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-[var(--lib-border)] bg-[var(--lib-card)] px-3 py-2 text-xs font-medium text-[var(--lib-fg)] hover:border-[var(--lib-primary)]/50 disabled:opacity-45"
            >
              <ExternalLink size={13} aria-hidden />
              Open source post
            </button>
            <button
              type="button"
              disabled={selectedItems.length === 0}
              onClick={exportSelected}
              className="w-full rounded-xl border border-[var(--lib-border)] bg-[var(--lib-card)] px-3 py-2 text-left text-xs text-[var(--lib-fg)] hover:border-[var(--lib-primary)]/50 disabled:opacity-45"
            >
              Export selected files
            </button>
          </section>
        ) : null}

        {mode === "placement" ? (
          <section className="space-y-3">
            <PanelHeading icon={ShieldCheck} title="Placement" />
            {studioWriteBlocked ? (
              <p className="rounded-xl border border-[var(--lib-warning)]/35 bg-[var(--lib-warning)]/10 px-3 py-2 text-[11px] text-[var(--lib-fg)]">
                Editing is paused until Patreon sync is healthy.
              </p>
            ) : null}
            <div className="grid grid-cols-2 gap-2">
              <InfoTile label="Visibility" value={selectedItem?.visibility ?? "No selection"} />
              <InfoTile label="Access" value={selectedAccess(selectedItem, realTiers, tierTitleById)} />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <AccessButton icon={Eye} label="Visible" disabled={studioWriteBlocked} busy={busy === "visibility:visible"} onClick={() => void applyVisibility("visible")} />
              <AccessButton icon={EyeOff} label="Hidden" disabled={studioWriteBlocked} busy={busy === "visibility:hidden"} onClick={() => void applyVisibility("hidden")} />
              <AccessButton icon={ShieldAlert} label="Review" disabled={studioWriteBlocked} busy={busy === "visibility:review"} onClick={() => void applyVisibility("review")} />
            </div>
            <TagEditor value={tagDraft} onChange={setTagDraft} onSubmit={applyTags} busy={busy === "tags"} currentTags={selectedItem?.tag_ids ?? []} disabled={studioWriteBlocked} />
            <div className="rounded-xl border border-[var(--lib-border)] bg-[var(--lib-bg)] p-3">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--lib-fg-muted)]">Collections it lives in</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {selectedCollections.length > 0 ? (
                  selectedCollections.map((collection) => (
                    <span key={collection.collection_id} className="rounded-full border border-[var(--lib-border)] px-2 py-1 text-[10px] text-[var(--lib-fg-muted)]">
                      {collection.title}
                    </span>
                  ))
                ) : (
                  <span className="text-xs text-[var(--lib-fg-muted)]">Not in a collection yet.</span>
                )}
              </div>
            </div>
          </section>
        ) : null}

        {mode === "engagement" ? (
          <section className="space-y-3">
            <PanelHeading icon={MessageSquare} title="Engagement" />
            <div className="grid grid-cols-2 gap-2">
              <InfoTile label="Comments" value={pulseMetrics ? String(pulseMetrics.comments) : "0"} />
              <InfoTile label="Saved" value={pulseMetrics ? String(pulseMetrics.collectionAdds) : "0"} />
            </div>
            <div className="rounded-xl border border-[var(--lib-border)] bg-[var(--lib-bg)] p-3">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--lib-fg-muted)]">Audience preview</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <PreviewChip label="Public" active={previewTierId === "free"} onClick={() => setPreviewTierId("free")} />
                {realTiers.map((tier) => (
                  <PreviewChip
                    key={tier.tier_id}
                    label={tier.title}
                    active={previewTierId === tier.tier_id}
                    onClick={() => setPreviewTierId(tier.tier_id)}
                  />
                ))}
              </div>
              <p className="mt-3 text-xs leading-5 text-[var(--lib-fg-muted)]">
                Preview mode should show whether this piece appears as unlocked, teaser, or hidden for the chosen audience.
              </p>
            </div>
            <div className="rounded-xl border border-dashed border-[var(--lib-border)] bg-[var(--lib-card)] p-3 text-xs leading-5 text-[var(--lib-fg-muted)]">
              Recent comments and pinned media comments will land here once creator comment moderation is exposed in Library.
            </div>
          </section>
        ) : null}

        {mode === "financials" ? (
          <section className="space-y-3">
            <PanelHeading icon={DollarSign} title="Financials" />
            <div className="grid grid-cols-2 gap-2">
              <InfoTile label="Tips" value={pulseMetrics ? `$${pulseMetrics.tipRevenue.toLocaleString()}` : "$0"} />
              <InfoTile label="Conversions" value={pulseMetrics ? String(pulseMetrics.conversions) : "0"} />
              <InfoTile label="Impressions" value={pulseMetrics ? pulseMetrics.impressions.toLocaleString() : "0"} />
              <InfoTile label="Promo" value={selectedItem ? "Eligible" : "No selection"} />
            </div>
            <div className="rounded-xl border border-[var(--lib-border)] bg-[var(--lib-bg)] p-3">
              <div className="mb-2 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wide text-[var(--lib-fg-muted)]">
                <BarChart3 className="h-3.5 w-3.5" aria-hidden />
                Revenue pulse
              </div>
              <p className="text-xs leading-5 text-[var(--lib-fg-muted)]">
                Prototype figures are placeholders until tip, impression, and conversion events are attributed to posts/media.
              </p>
            </div>
          </section>
        ) : null}
      </div>

      <MediaEditorModal
        open={mediaEditorOpen}
        selectedItem={selectedItem}
        mediaItems={selectedPostMediaItems}
        stagedMediaNotes={stagedMediaNotes}
        stagedAdditions={stagedAdditions}
        onClose={() => setMediaEditorOpen(false)}
        onStageReplacement={stageReplacement}
        onStageAdditions={stageAdditions}
      />
    </aside>
  );
}

function MediaEditorModal({
  open,
  selectedItem,
  mediaItems,
  stagedMediaNotes,
  stagedAdditions,
  onClose,
  onStageReplacement,
  onStageAdditions
}: {
  open: boolean;
  selectedItem: GalleryItem | null;
  mediaItems: GalleryItem[];
  stagedMediaNotes: Record<string, string>;
  stagedAdditions: string[];
  onClose: () => void;
  onStageReplacement: (mediaId: string, file: File | null) => void;
  onStageAdditions: (files: FileList | null) => void;
}) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/75 p-4"
      role="dialog"
      aria-modal
      aria-label="Add or edit post media"
      onClick={onClose}
    >
      <div
        className="flex max-h-[min(86vh,680px)] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-[var(--lib-border)] bg-[var(--lib-card)] shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-[var(--lib-border)] px-4 py-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--lib-fg-muted)]">
              Media
            </p>
            <h2 className="mt-1 text-base font-semibold text-[var(--lib-fg)]">Add or Edit Media</h2>
            <p className="mt-1 text-xs leading-5 text-[var(--lib-fg-muted)]">
              {mediaItems.length} file{mediaItems.length === 1 ? "" : "s"} attached to this post.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-[var(--lib-fg-muted)] hover:bg-[var(--lib-muted)] hover:text-[var(--lib-fg)]"
            aria-label="Close media editor"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
          {mediaItems.map((item, index) => (
            <div
              key={`${item.post_id}:${item.media_id}`}
              className="flex gap-3 rounded-xl border border-[var(--lib-border)] bg-[var(--lib-bg)] p-3"
            >
              <div className="h-20 w-20 shrink-0 overflow-hidden rounded-lg border border-[var(--lib-border)] bg-[var(--lib-card)]">
                <InspectAssetPreview item={item} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-xs font-semibold text-[var(--lib-fg)]">
                      Media {index + 1}
                    </p>
                    <p className="mt-0.5 truncate text-[10px] text-[var(--lib-fg-muted)]">
                      {mediaKind(item)}
                    </p>
                  </div>
                  {selectedItem?.media_id === item.media_id ? (
                    <span className="shrink-0 rounded-full border border-[var(--lib-primary)]/50 px-2 py-0.5 text-[9px] text-[var(--lib-primary)]">
                      Selected
                    </span>
                  ) : null}
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <label className="cursor-pointer rounded-lg border border-[var(--lib-border)] bg-[var(--lib-card)] px-3 py-1.5 text-xs text-[var(--lib-fg)] hover:border-[var(--lib-primary)]/50">
                    Overwrite
                    <input
                      type="file"
                      className="hidden"
                      onChange={(event) => onStageReplacement(item.media_id, event.target.files?.[0] ?? null)}
                    />
                  </label>
                  {stagedMediaNotes[item.media_id] ? (
                    <span className="truncate text-[10px] text-[var(--lib-fg-muted)]">
                      Staged: {stagedMediaNotes[item.media_id]}
                    </span>
                  ) : null}
                </div>
              </div>
            </div>
          ))}

          <label className="flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-[var(--lib-border)] bg-[var(--lib-bg)] px-4 py-6 text-center hover:border-[var(--lib-primary)]/50">
            <Upload className="h-5 w-5 text-[var(--lib-primary)]" aria-hidden />
            <span className="mt-2 text-xs font-medium text-[var(--lib-fg)]">Add new media</span>
            <span className="mt-1 text-[10px] text-[var(--lib-fg-muted)]">Choose one or more files to attach to this post.</span>
            <input
              type="file"
              multiple
              className="hidden"
              onChange={(event) => onStageAdditions(event.target.files)}
            />
          </label>

          {stagedAdditions.length > 0 ? (
            <div className="rounded-xl border border-[var(--lib-border)] bg-[var(--lib-bg)] p-3">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--lib-fg-muted)]">Staged additions</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {stagedAdditions.map((name, index) => (
                  <span key={`${name}:${index}`} className="rounded-full border border-[var(--lib-border)] px-2 py-1 text-[10px] text-[var(--lib-fg-muted)]">
                    {name}
                  </span>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        <div className="border-t border-[var(--lib-border)] px-4 py-3">
          <div className="space-y-0.5 text-[10px] leading-4 text-[var(--lib-fg-muted)]">
            <p>Kind: {mediaKind(selectedItem)}</p>
            <p>Status: {statusLabel(selectedItem)}</p>
            <p>Published: {formatDate(selectedItem?.published_at)}</p>
            <p className="truncate">Post: {selectedItem?.post_id ?? "No selection"}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function PanelHeading({ icon: Icon, title }: { icon: typeof Images; title: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex h-7 w-7 items-center justify-center rounded-full border border-[var(--lib-border)] bg-[var(--lib-card)] text-[var(--lib-primary)]">
        <Icon size={14} aria-hidden />
      </div>
      <h3 className="text-sm font-semibold text-[var(--lib-fg)]">{title}</h3>
    </div>
  );
}

function InfoTile({ label, value, truncate }: { label: string; value: string; truncate?: boolean }) {
  return (
    <div className="rounded-xl border border-[var(--lib-border)] bg-[var(--lib-bg)] p-3">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--lib-fg-muted)]">{label}</p>
      <p
        className={[
          "mt-1 text-sm font-medium text-[var(--lib-fg)]",
          truncate ? "truncate" : ""
        ].join(" ")}
        title={truncate ? value : undefined}
      >
        {value}
      </p>
    </div>
  );
}

function TagEditor({
  value,
  onChange,
  onSubmit,
  busy,
  currentTags,
  disabled = false
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  busy: boolean;
  currentTags: string[];
  disabled?: boolean;
}) {
  return (
    <div className="rounded-xl border border-[var(--lib-border)] bg-[var(--lib-bg)] p-3">
      <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wide text-[var(--lib-fg-muted)]">
        <Tag size={12} aria-hidden />
        Tags on this piece
      </div>
      <div className="mt-2 flex flex-wrap gap-1">
        {currentTags.length > 0 ? (
          currentTags.map((tag) => (
            <span key={tag} className="rounded-full border border-[var(--lib-border)] px-2 py-0.5 text-[10px] text-[var(--lib-fg-muted)]">
              {tag}
            </span>
          ))
        ) : (
          <span className="text-xs text-[var(--lib-fg-muted)]">No tags yet.</span>
        )}
      </div>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        placeholder="tag_a, tag_b"
        className="mt-2 w-full rounded-lg border border-[var(--lib-border)] bg-[var(--lib-input)] px-2.5 py-2 text-xs text-[var(--lib-fg)] outline-none placeholder:text-[var(--lib-fg-muted)] focus:border-[var(--lib-primary)] disabled:opacity-45"
      />
      <button
        type="button"
        disabled={disabled || !value.trim() || busy}
        onClick={onSubmit}
        className="mt-2 rounded-lg border border-[var(--lib-border)] bg-[var(--lib-card)] px-3 py-1.5 text-xs text-[var(--lib-fg)] hover:border-[var(--lib-primary)]/50 disabled:opacity-45"
      >
        {busy ? "Applying…" : "Apply tags"}
      </button>
    </div>
  );
}

function AccessButton({
  icon: Icon,
  label,
  busy,
  disabled = false,
  onClick
}: {
  icon: typeof Eye;
  label: string;
  busy: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={busy || disabled}
      onClick={onClick}
      className="inline-flex items-center gap-2 rounded-xl border border-[var(--lib-border)] bg-[var(--lib-card)] px-3 py-2 text-xs text-[var(--lib-fg)] hover:border-[var(--lib-primary)]/50 disabled:opacity-45"
    >
      <Icon size={14} aria-hidden />
      {busy ? "…" : label}
    </button>
  );
}

function PreviewChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "rounded-full border px-2.5 py-1 text-[10px] transition-colors",
        active
          ? "border-[var(--lib-primary)]/60 bg-[color-mix(in_srgb,var(--lib-primary)_16%,var(--lib-bg))] text-[var(--lib-fg)]"
          : "border-[var(--lib-border)] bg-[var(--lib-card)] text-[var(--lib-fg-muted)] hover:text-[var(--lib-fg)]"
      ].join(" ")}
    >
      {label}
    </button>
  );
}
