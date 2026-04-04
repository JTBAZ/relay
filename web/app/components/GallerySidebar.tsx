"use client";

import { useCallback, useMemo, useState, type ElementType } from "react";
import {
  ChevronRight,
  Download,
  Eye,
  EyeOff,
  FileText,
  Layers,
  Plus,
  Repeat,
  Search,
  ShieldAlert
} from "lucide-react";
import { RELAY_API_BASE, type FacetsData } from "@/lib/relay-api";
import CollectionsPanel from "./CollectionsPanel";
import MediaTypeMultiSelect, { type MediaTypeValue } from "./MediaTypeMultiSelect";

function formatExportedBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "—";
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let v = bytes;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  const rounded =
    i === 0 ? String(Math.round(v)) : v >= 10 ? String(Math.round(v)) : v.toFixed(1);
  return `${rounded} ${units[i]}`;
}

type VisibilityState = {
  hidden: boolean;
  mature: boolean;
};

type Props = {
  creatorId: string;
  facets: FacetsData;
  q: string;
  onSetQ: (v: string) => void;
  mediaTypes: MediaTypeValue[];
  onSetMediaTypes: (v: MediaTypeValue[]) => void;
  tagPick: string[];
  tierPick: string[];
  visibility: VisibilityState;
  onSetVisibility: (next: VisibilityState) => void;
  showTextOnlyPosts: boolean;
  onSetShowTextOnlyPosts: (v: boolean) => void;
  showShadowCovers: boolean;
  onSetShowShadowCovers: (v: boolean) => void;
  videoLoop: boolean;
  onSetVideoLoop: (v: boolean) => void;
  onToggleTag: (t: string) => void;
  onToggleTier: (t: string) => void;
  /** Tier ids merged into the single "Free" Access chip (public + free follower). */
  freePublicTierIds: string[];
  onToggleFreePublicTierGroup: () => void;
  activeCollectionId: string | null;
  onSelectCollection: (id: string | null) => void;
  onCollectionChange: () => void;
  collectionsReloadToken?: number;
  assetsInView: number;
  collectionCount: number;
};

function VisibilityToggle({
  icon: Icon,
  label,
  checked,
  onChange
}: {
  icon: ElementType;
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="group flex cursor-pointer items-center justify-between">
      <div className="flex items-center gap-2">
        <Icon className="h-3.5 w-3.5 text-[var(--lib-fg-muted)] transition-colors group-hover:text-[var(--lib-fg)]" />
        <span className="text-xs text-[var(--lib-fg-muted)] transition-colors group-hover:text-[var(--lib-fg)]">
          {label}
        </span>
      </div>
      <button
        type="button"
        onClick={() => onChange(!checked)}
        className={`relative h-5 w-9 rounded-full p-0.5 transition-colors ${
          checked ? "bg-[var(--lib-primary)]" : "bg-[var(--lib-muted)]"
        }`}
        aria-pressed={checked}
      >
        <span
          className={`block h-4 w-4 rounded-full bg-[var(--lib-fg)] transition-transform ${
            checked ? "translate-x-4" : "translate-x-0"
          }`}
        />
      </button>
    </label>
  );
}

export default function GallerySidebar({
  creatorId,
  facets,
  q,
  onSetQ,
  mediaTypes,
  onSetMediaTypes,
  tagPick,
  tierPick,
  visibility,
  onSetVisibility,
  showTextOnlyPosts,
  onSetShowTextOnlyPosts,
  showShadowCovers,
  onSetShowShadowCovers,
  videoLoop,
  onSetVideoLoop,
  onToggleTag,
  onToggleTier,
  freePublicTierIds,
  onToggleFreePublicTierGroup,
  activeCollectionId,
  onSelectCollection,
  onCollectionChange,
  collectionsReloadToken = 0,
  assetsInView,
  collectionCount
}: Props) {
  const [tagSearch, setTagSearch] = useState("");
  const [visibleTagCount, setVisibleTagCount] = useState(20);
  const [collectionsOpen, setCollectionsOpen] = useState(true);
  const [collectionEditorOpen, setCollectionEditorOpen] = useState(false);
  const [zipLoading, setZipLoading] = useState(false);
  const [zipError, setZipError] = useState<string | null>(null);

  const downloadLibraryZip = useCallback(async () => {
    setZipError(null);
    setZipLoading(true);
    try {
      const u = new URLSearchParams();
      u.set("creator_id", creatorId);
      // Pre-flight: lightweight HEAD to verify the ZIP endpoint is reachable and has content.
      const checkRes = await fetch(
        `${RELAY_API_BASE}/api/v1/export/library-zip?${u.toString()}`,
        { method: "HEAD" }
      );
      if (!checkRes.ok) {
        if (checkRes.status === 404) {
          throw new Error(
            "No exported media yet. Run a Patreon sync first, then try again."
          );
        }
        throw new Error(
          `Relay API returned ${checkRes.status}. Is the API running?`
        );
      }
      // Trigger a native browser download via anchor click — bypasses fetch().blob()
      // which fails on large responses proxied through Next.js dev server.
      const downloadUrl = `${RELAY_API_BASE}/api/v1/export/library-zip?${u.toString()}`;
      const a = document.createElement("a");
      a.href = downloadUrl;
      const safe = creatorId.replace(/[^\w.-]+/g, "_") || "library";
      a.download = `relay-library-${safe}.zip`;
      a.rel = "noopener";
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (e) {
      setZipError(e instanceof Error ? e.message : String(e));
    } finally {
      setZipLoading(false);
    }
  }, [creatorId]);

  const filteredTags = useMemo(() => {
    const search = tagSearch.trim().toLowerCase();
    if (!search) return facets.tag_ids;
    return facets.tag_ids.filter((tag) => tag.toLowerCase().includes(search));
  }, [facets.tag_ids, tagSearch]);

  const displayedTags = filteredTags.slice(0, visibleTagCount);
  const remainingTagCount = Math.max(0, filteredTags.length - displayedTags.length);

  const freePublicSet = useMemo(() => new Set(freePublicTierIds), [freePublicTierIds]);
  const otherAccessTiers = useMemo(
    () => facets.tiers.filter((t) => !freePublicSet.has(t.tier_id)),
    [facets.tiers, freePublicSet]
  );
  const freeChipSelected =
    freePublicTierIds.length > 0 && freePublicTierIds.every((id) => tierPick.includes(id));

  return (
    <aside className="flex min-h-0 w-full shrink-0 flex-col border-b border-[var(--lib-border)] bg-[var(--lib-sidebar)] lg:w-64 lg:border-b-0 lg:border-r">
      <div className="space-y-2 border-b border-[var(--lib-border)] p-3">
        <div className="flex items-center gap-2 rounded-md border border-[color-mix(in_oklab,var(--lib-border)_85%,var(--lib-fg-muted)_15%)] bg-[color-mix(in_oklab,var(--lib-input)_88%,var(--lib-fg)_12%)] px-2.5 py-1.5 shadow-[inset_0_1px_0_color-mix(in_oklab,white_6%,transparent)] focus-within:border-[var(--lib-ring)] focus-within:shadow-[0_0_0_1px_color-mix(in_oklab,var(--lib-ring)_35%,transparent)]">
          <Search
            className="h-3.5 w-3.5 shrink-0 text-[color-mix(in_oklab,var(--lib-fg-muted)_65%,var(--lib-fg))]"
            aria-hidden
          />
          <input
            value={q}
            onChange={(e) => onSetQ(e.target.value)}
            placeholder="Search assets..."
            className="min-w-0 flex-1 bg-transparent text-xs text-[color-mix(in_oklab,var(--lib-fg)_92%,white)] placeholder:text-[color-mix(in_oklab,var(--lib-fg-muted)_45%,var(--lib-fg))] outline-none"
          />
        </div>
        <MediaTypeMultiSelect selected={mediaTypes} onChange={onSetMediaTypes} />
      </div>

      <div className="flex-1 space-y-5 overflow-y-auto p-3">
        <section>
          <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-[var(--lib-fg-muted)]">
            Access
          </h3>
          <div className="flex flex-wrap gap-1">
            {freePublicTierIds.length > 0 ? (
              <button
                type="button"
                onClick={onToggleFreePublicTierGroup}
                title="Includes public posts"
                className={`rounded border px-2 py-0.5 text-[11px] transition-colors ${
                  freeChipSelected
                    ? "border-[var(--lib-primary)] bg-[var(--lib-primary)] text-[var(--lib-primary-fg)]"
                    : "border-[var(--lib-border)] bg-[var(--lib-sidebar-accent)] text-[var(--lib-fg)] hover:border-[var(--lib-fg-muted)]"
                }`}
              >
                Free
              </button>
            ) : null}
            {otherAccessTiers.map((tier) => (
              <button
                key={tier.tier_id}
                type="button"
                onClick={() => onToggleTier(tier.tier_id)}
                className={`rounded border px-2 py-0.5 text-[11px] transition-colors ${
                  tierPick.includes(tier.tier_id)
                    ? "border-[var(--lib-primary)] bg-[var(--lib-primary)] text-[var(--lib-primary-fg)]"
                    : "border-[var(--lib-border)] bg-[var(--lib-sidebar-accent)] text-[var(--lib-fg)] hover:border-[var(--lib-fg-muted)]"
                }`}
              >
                {tier.title}
              </button>
            ))}
          </div>
        </section>

        <section>
          <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-[var(--lib-fg-muted)]">
            Tags
          </h3>
          <input
            value={tagSearch}
            onChange={(e) => {
              setTagSearch(e.target.value);
              setVisibleTagCount(20);
            }}
            placeholder="Filter tags..."
            className="mb-2 w-full rounded-md border border-[var(--lib-border)] bg-[var(--lib-input)] px-2 py-1 text-xs text-[var(--lib-fg)]"
          />
          <div className="flex flex-wrap gap-1">
            {displayedTags.map((tag) => (
              <button
                key={tag}
                type="button"
                onClick={() => onToggleTag(tag)}
                className={`rounded border px-2 py-0.5 text-[11px] transition-colors ${
                  tagPick.includes(tag)
                    ? "border-[var(--lib-primary)] bg-[var(--lib-primary)] text-[var(--lib-primary-fg)]"
                    : "border-[var(--lib-border)] bg-[var(--lib-sidebar-accent)] text-[var(--lib-fg)] hover:border-[var(--lib-fg-muted)]"
                }`}
              >
                {tag}
              </button>
            ))}
          </div>
          {remainingTagCount > 0 ? (
            <button
              type="button"
              onClick={() => setVisibleTagCount((count) => count + 20)}
              className="mt-1 text-[10px] text-[var(--lib-primary)] hover:underline"
            >
              Show {Math.min(remainingTagCount, 20)} more
            </button>
          ) : null}
        </section>

        <section>
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => setCollectionsOpen((open) => !open)}
              className="group flex min-w-0 flex-1 items-center gap-1 text-left text-[10px] font-semibold uppercase tracking-wider text-[var(--lib-fg-muted)] transition-colors hover:text-[var(--lib-fg)]"
            >
              <ChevronRight
                className={`h-3 w-3 shrink-0 transition-transform ${collectionsOpen ? "rotate-90" : ""}`}
              />
              Collections
            </button>
            <button
              type="button"
              onClick={() => setCollectionEditorOpen(true)}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[var(--lib-fg-muted)] transition-colors hover:bg-[var(--lib-sidebar-accent)] hover:text-[var(--lib-fg)]"
              aria-label="New collection"
              title="New collection"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          </div>
          <CollectionsPanel
            creatorId={creatorId}
            activeCollectionId={activeCollectionId}
            onSelectCollection={onSelectCollection}
            onCollectionChange={onCollectionChange}
            reloadToken={collectionsReloadToken}
            collectionEditorOpen={collectionEditorOpen}
            onCollectionEditorOpenChange={setCollectionEditorOpen}
            showList={collectionsOpen}
          />
        </section>

        <section>
          <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-[var(--lib-fg-muted)]">
            Visibility
          </h3>
          <div className="space-y-2">
            <VisibilityToggle
              icon={visibility.hidden ? EyeOff : Eye}
              label="Hidden"
              checked={visibility.hidden}
              onChange={(checked) => onSetVisibility({ ...visibility, hidden: checked })}
            />
            <VisibilityToggle
              icon={ShieldAlert}
              label="Mature"
              checked={visibility.mature}
              onChange={(checked) => onSetVisibility({ ...visibility, mature: checked })}
            />
            <VisibilityToggle
              icon={FileText}
              label="Text-only posts"
              checked={showTextOnlyPosts}
              onChange={onSetShowTextOnlyPosts}
            />
            <VisibilityToggle
              icon={Layers}
              label="Duplicate Patreon covers"
              checked={showShadowCovers}
              onChange={onSetShowShadowCovers}
            />
          </div>
        </section>

        <section>
          <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-[var(--lib-fg-muted)]">
            Playback
          </h3>
          <div className="space-y-2">
            <VisibilityToggle
              icon={Repeat}
              label="Loop videos"
              checked={videoLoop}
              onChange={onSetVideoLoop}
            />
          </div>
        </section>
      </div>

      <div className="space-y-2 border-t border-[var(--lib-border)] p-3">
        <div className="flex items-center justify-between gap-2 text-[10px] text-[var(--lib-fg-muted)]">
          <span className="min-w-0">
            {assetsInView.toLocaleString()} across {collectionCount} collections
          </span>
          <span
            className="shrink-0 tabular-nums"
            title="Total size of exported files stored by Relay (not unexported or Patreon-only URLs)."
          >
            {formatExportedBytes(facets.export_total_bytes ?? 0)}
          </span>
        </div>
        <button
          type="button"
          onClick={() => void downloadLibraryZip()}
          disabled={zipLoading}
          title="ZIP includes only files in Relay export storage (after a live sync or successful per-item export), plus JSON manifests."
          className="flex w-full items-center justify-center gap-1.5 rounded-md border border-[var(--lib-border)] bg-[var(--lib-input)] px-2 py-1.5 text-[10px] font-medium text-[var(--lib-fg)] transition-colors hover:border-[var(--lib-primary)]/55 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Download className="h-3 w-3 shrink-0 text-[var(--lib-primary)]" aria-hidden />
          {zipLoading ? "Preparing ZIP…" : "Download library ZIP"}
        </button>
        {(facets.export_media_count ?? 0) === 0 && !zipError ? (
          <p className="text-[10px] leading-snug text-[var(--lib-fg-muted)]">
            0 exported files — run a{" "}
            <strong className="font-medium text-[var(--lib-fg)]">live</strong> Patreon sync (not dry run)
            so media is saved under export storage, then download works.
          </p>
        ) : null}
        {zipError ? (
          <p className="text-[10px] leading-snug text-[var(--lib-destructive)]">{zipError}</p>
        ) : null}
      </div>
    </aside>
  );
}
