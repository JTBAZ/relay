"use client";

import { useEffect, useRef, useState } from "react";
import {
  RELAY_API_BASE,
  galleryItemExportVisibleToVisitor,
  galleryItemPreviewSrc,
  type GalleryItem,
  type PageLayout,
  type TierFacet
} from "@/lib/relay-api";
import { accessChipLabel } from "@/app/components/GalleryGridTile";
import { groupGalleryItemsByPost } from "@/lib/gallery-group";
import { sortGalleryItemsForArrangement } from "@/lib/gallery-item-sort";
import { designerUnlockLabelFromFacets, pickPrimaryAccessTierIdForChip } from "@/lib/tier-access";
import { visitorMediaTierGateLocked } from "@/lib/visitor-tier-gate";
import { VisitorBatchSlideMedia } from "@/app/components/VisitorBatchSlideMedia";
import {
  VisitorTierGateBackdrop,
  VisitorTierGateOverlay,
  type VisitorTierGateOverlayVariant
} from "@/app/components/visitor/VisitorTierGateOverlay";
import {
  VisitorPatronTileEngageCluster,
  visitorPatronStarSnipFromEngagement,
  type VisitorPatronEngagementCallbacks
} from "@/app/components/visitor/VisitorPatronTileEngage";

type Props = {
  layout: PageLayout;
  sectionItems: Record<string, GalleryItem[]>;
  loading: boolean;
  onOpenItem: (item: GalleryItem) => void;
  /** Facet tier order (low→high); used for tier-based sorting */
  tierOrderIds: string[];
  tierTitleById: Record<string, string>;
  /** Campaign tier rows — resolves access chip when IDs are not in `tierOrderIds` */
  tierFacets: TierFacet[];
  /** Patreon URL for Upgrade on censored tiles */
  membershipUrl?: string | null;
  /** Site accent (matches designer); falls back in caller */
  accentColor?: string;
  lockedOverlayVariant?: VisitorTierGateOverlayVariant;
  /** Visitor star (whole post) + snip (visible slide’s media); omit in designer-only contexts */
  patronEngagement?: VisitorPatronEngagementCallbacks;
};

function tierBadgeLabel(
  item: GalleryItem,
  tierFacets: TierFacet[],
  tierTitleById: Record<string, string>
): string | null {
  if (!galleryItemExportVisibleToVisitor(item) || !item.tier_ids?.length) return null;
  const id = pickPrimaryAccessTierIdForChip(item.tier_ids, tierFacets);
  if (!id) return null;
  return accessChipLabel(id, tierTitleById);
}

// ─── SectionGroupTile ──────────────────────────────────────────────────────────
// Renders a single post group (1–N assets) as one tile with an optional carousel
// strip. Each section layout variant passes a different `imgClass`.

function SectionGroupTile({
  items,
  onOpenItem,
  showTierBadges,
  tierFacets,
  tierTitleById,
  tierOrderIds,
  membershipUrl,
  accentColor,
  lockedOverlayVariant,
  patronEngagement,
  imgClass = "aspect-square",
}: {
  items: GalleryItem[];
  onOpenItem: (item: GalleryItem) => void;
  showTierBadges: boolean;
  tierFacets: TierFacet[];
  tierTitleById: Record<string, string>;
  tierOrderIds: string[];
  membershipUrl?: string | null;
  accentColor: string;
  lockedOverlayVariant: VisitorTierGateOverlayVariant;
  patronEngagement?: VisitorPatronEngagementCallbacks;
  imgClass?: string;
}) {
  const n = items.length;
  const primary = items[0]!;
  const hasMulti = n > 1;
  const solo = primary;
  const soloGateLocked = visitorMediaTierGateLocked(solo);
  const soloImage =
    !soloGateLocked && solo.has_export && solo.mime_type?.startsWith("image/");
  const soloVideo =
    !soloGateLocked && solo.has_export && solo.mime_type?.startsWith("video/");
  const soloMedia = soloImage || soloVideo;
  const tierLabelSolo =
    showTierBadges && soloMedia ? tierBadgeLabel(solo, tierFacets, tierTitleById) : null;

  const [soloHovered, setSoloHovered] = useState(false);
  const soloVideoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const el = soloVideoRef.current;
    if (!soloVideo || !el) return;
    if (soloHovered) void el.play().catch(() => {});
    else {
      el.pause();
      el.currentTime = 0;
    }
  }, [soloHovered, soloVideo, solo.media_id]);

  const engage = patronEngagement
    ? visitorPatronStarSnipFromEngagement(primary.post_id, patronEngagement)
    : null;

  return (
    <div className="group relative overflow-hidden rounded-lg bg-current/[0.06] motion-safe:transition-[transform,box-shadow] motion-safe:duration-300 motion-safe:ease-out hover:z-[1] hover:-translate-y-0.5 hover:shadow-[0_12px_40px_-12px_rgba(0,0,0,0.55)]">
      {hasMulti ? (
        <VisitorBatchSlideMedia
          items={items}
          resetKey={primary.post_id}
          imgClass={imgClass}
          showTierBadges={showTierBadges}
          tierFacets={tierFacets}
          tierTitleById={tierTitleById}
          embedTitleOverlay
          tierOrderIds={tierOrderIds}
          patronMembershipUrl={membershipUrl}
          accentColor={accentColor}
          lockedOverlayVariant={lockedOverlayVariant}
          visitorPatronStar={engage?.visitorPatronStar}
          visitorPatronSnip={engage?.visitorPatronSnip}
          onActivateItem={(item) => onOpenItem(item)}
        />
      ) : (
        <div
          className={`relative overflow-hidden ${imgClass}`}
          onMouseEnter={() => setSoloHovered(true)}
          onMouseLeave={() => setSoloHovered(false)}
        >
          {soloGateLocked ? (
            <div className="relative h-full w-full min-h-[8rem]">
              <VisitorTierGateBackdrop previewSrc={galleryItemPreviewSrc(solo)} />
              <VisitorTierGateOverlay
                unlockLabel={designerUnlockLabelFromFacets(solo, tierOrderIds, tierTitleById)}
                accentColor={accentColor}
                membershipUrl={membershipUrl}
                variant={lockedOverlayVariant}
              />
            </div>
          ) : soloImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={`${RELAY_API_BASE}${solo.content_url_path}`}
              alt=""
              className="h-full w-full object-cover motion-safe:transition-transform motion-safe:duration-500 motion-safe:ease-out group-hover:scale-[1.02]"
            />
          ) : soloVideo ? (
            <video
              ref={soloVideoRef}
              src={`${RELAY_API_BASE}${solo.content_url_path}`}
              muted
              playsInline
              preload="metadata"
              className="h-full w-full object-cover motion-safe:transition-transform motion-safe:duration-500 motion-safe:ease-out group-hover:scale-[1.02]"
              aria-hidden
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-xs opacity-40">
              {solo.mime_type?.split("/")[0] ?? "media"}
            </div>
          )}
          {soloMedia ? (
            <div
              className="pointer-events-none absolute inset-0 z-[1] bg-gradient-to-t from-black/75 via-black/20 to-transparent opacity-80 motion-safe:transition-opacity motion-safe:duration-300 group-hover:opacity-95"
              aria-hidden
            />
          ) : null}
          {tierLabelSolo ? (
            <span
              className="pointer-events-none absolute right-2 top-2 z-[5] max-w-[min(100%,8rem)] truncate rounded-full border border-white/15 bg-black/80 px-2 py-0.5 text-[10px] font-semibold text-white shadow-sm backdrop-blur-sm"
              title={tierLabelSolo}
            >
              {tierLabelSolo}
            </span>
          ) : null}
          <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[4] bg-gradient-to-t from-black/75 via-black/20 to-transparent p-2.5 pt-8 opacity-80 motion-safe:transition-opacity motion-safe:duration-300 group-hover:opacity-95">
            <p className="truncate text-xs font-medium text-white drop-shadow-sm md:text-sm">
              {solo.title}
            </p>
          </div>
          {engage ? (
            <VisitorPatronTileEngageCluster
              postId={solo.post_id}
              currentMediaId={solo.media_id}
              visitorPatronStar={engage.visitorPatronStar}
              visitorPatronSnip={engage.visitorPatronSnip}
              className="absolute bottom-2 right-2 z-[25]"
            />
          ) : null}
          <button
            type="button"
            onClick={() => onOpenItem(solo)}
            className="absolute inset-0 z-[5] block cursor-pointer"
            aria-label={`Open: ${solo.title}`}
          />
        </div>
      )}
    </div>
  );
}

// ─── List-layout group row ─────────────────────────────────────────────────────

function SectionListRow({
  items,
  onOpenItem,
  showTierBadges,
  tierFacets,
  tierTitleById,
}: {
  items: GalleryItem[];
  onOpenItem: (item: GalleryItem) => void;
  showTierBadges: boolean;
  tierFacets: TierFacet[];
  tierTitleById: Record<string, string>;
}) {
  const lead = items[0]!;
  const tierLabel = showTierBadges
    ? tierBadgeLabel(lead, tierFacets, tierTitleById)
    : null;
  return (
    <button
      key={`${lead.post_id}::${lead.media_id}`}
      type="button"
      onClick={() => onOpenItem(lead)}
      className="flex w-full items-center gap-3 rounded-lg bg-current/[0.06] p-2.5 text-left motion-safe:transition-colors motion-safe:duration-200 hover:bg-current/[0.1]"
    >
      <div className="relative h-12 w-12 shrink-0">
        {lead.has_export && lead.mime_type?.startsWith("image/") ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`${RELAY_API_BASE}${lead.content_url_path}`}
            alt=""
            className="h-12 w-12 rounded-md object-cover"
          />
        ) : (
          <div className="flex h-12 w-12 items-center justify-center rounded-md bg-current/10 text-[10px] opacity-50">
            {lead.mime_type?.split("/")[0] ?? "media"}
          </div>
        )}
        {tierLabel ? (
          <span
            className="absolute right-0.5 top-0.5 z-[2] max-w-[5.5rem] truncate rounded-full border border-white/12 bg-black/80 px-1.5 py-px text-[9px] font-semibold text-white shadow-sm backdrop-blur-sm"
            title={tierLabel}
          >
            {tierLabel}
          </span>
        ) : null}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm">{lead.title}</p>
        <p className="mt-0.5 text-[10px] opacity-50">
          {lead.published_at.slice(0, 10)}
          {items.length > 1 ? (
            <span className="ml-1.5 opacity-70">· {items.length} assets</span>
          ) : null}
        </p>
      </div>
    </button>
  );
}

// ─── Main component ────────────────────────────────────────────────────────────

export default function PatronLayoutSections({
  layout,
  sectionItems,
  loading,
  onOpenItem,
  tierOrderIds,
  tierTitleById,
  tierFacets,
  membershipUrl = null,
  accentColor = "#00aa6f",
  lockedOverlayVariant = "blurred",
  patronEngagement
}: Props) {
  const showTierBadges = layout.theme.show_tier_badges ?? true;
  const arrMode = layout.theme.gallery_arrangement ?? "chronological";

  const sorted = [...layout.sections].sort((a, b) => a.sort_order - b.sort_order);

  if (loading && sorted.length > 0 && Object.keys(sectionItems).length === 0) {
    return (
      <p className="py-10 text-center text-sm text-[var(--lib-fg-muted)]">Loading curated sections…</p>
    );
  }

  const listRowProps = { onOpenItem, showTierBadges, tierFacets, tierTitleById };
  const sectionGroupProps = {
    ...listRowProps,
    tierOrderIds,
    membershipUrl,
    accentColor,
    lockedOverlayVariant,
    patronEngagement
  };

  return (
    <div className="flex w-full min-w-0 flex-col">
      {sorted.map((sec) => {
        const raw = sectionItems[sec.section_id] ?? [];
        const sortedItems = sortGalleryItemsForArrangement(raw, arrMode, tierOrderIds);
        // Group into one cell per post, then apply max_items as a post-count limit
        const groups = groupGalleryItemsByPost(sortedItems);
        const displayGroups = sec.max_items ? groups.slice(0, sec.max_items) : groups;
        const cols = Math.max(1, Math.min(sec.columns ?? 3, 3));

        return (
          <section key={sec.section_id} className="mb-10 last:mb-0">
            <div className="mb-4 flex items-end gap-3 border-b border-[var(--lib-border)] pb-3">
              <h2
                className="font-[family-name:var(--font-display)] text-xl font-medium tracking-tight text-[var(--lib-fg)] md:text-2xl"
              >
                {sec.title}
              </h2>
            </div>

            {displayGroups.length === 0 ? (
              <p className="text-xs opacity-50">No public items in this section yet.</p>
            ) : sec.layout === "list" ? (
              <div className="space-y-2">
                {displayGroups.map((group) => (
                  <SectionListRow
                    key={group.post_id}
                    items={group.items}
                    {...listRowProps}
                  />
                ))}
              </div>
            ) : sec.layout === "featured" ? (
              <div className="flex flex-col gap-3 md:gap-4">
                {/* Lead post — 16:9 full-width */}
                {displayGroups[0] ? (
                  <SectionGroupTile
                    key={displayGroups[0].post_id}
                    items={displayGroups[0].items}
                    imgClass="aspect-[16/9] w-full"
                    {...sectionGroupProps}
                  />
                ) : null}
                {/* Remaining posts — square grid */}
                {displayGroups.length > 1 ? (
                  <div
                    className="w-full min-w-0 gap-3 md:gap-4"
                    style={{
                      display: "grid",
                      gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`
                    }}
                  >
                    {displayGroups.slice(1).map((group) => (
                      <SectionGroupTile
                        key={group.post_id}
                        items={group.items}
                        imgClass="aspect-square"
                        {...sectionGroupProps}
                      />
                    ))}
                  </div>
                ) : null}
              </div>
            ) : (
              /* Grid and masonry layouts */
              <div
                className="w-full min-w-0 gap-3 md:gap-4"
                style={{
                  display: "grid",
                  gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`
                }}
              >
                {displayGroups.map((group) => (
                  <SectionGroupTile
                    key={group.post_id}
                    items={group.items}
                    imgClass={
                      sec.layout === "masonry"
                        ? "max-h-80 min-h-[10rem] h-auto w-full"
                        : "aspect-square"
                    }
                    {...sectionGroupProps}
                  />
                ))}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
