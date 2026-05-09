"use client";

import { Fragment, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import {
  Monitor,
  Tablet,
  Smartphone,
  Lock,
  ChevronRight,
  Grid3x3,
  AlignJustify,
  LayoutGrid,
  Star,
  ShoppingBag,
  Mail,
  Brush,
  Trophy,
  Link2,
  ExternalLink,
  X,
  ArrowUpRight,
  GripVertical,
} from "lucide-react";
import type {
  PageLayout,
  LibrarySection,
  ShopSection,
  EngagementSection,
  AnnouncementBanner,
  AnySection,
  SectionLayout,
  Collection,
  TierKey,
  LockedArtStyle,
  TypographyStyle,
} from "@/lib/designer-mock";
import { TIERS } from "@/lib/designer-mock";
import {
  RELAY_API_BASE,
  galleryItemImageGridSrc,
  type FacetsData,
  type GalleryItem,
  type PageLayout as ApiPageLayout,
  type Collection as ApiCollection,
} from "@/lib/relay-api";
import { nextPaidTierAfterRank } from "@/lib/tier-access";
import { designerPageLayoutToApi } from "@/lib/designer-layout-bridge";
import {
  previewLockState,
  tierKeyForGalleryItem,
} from "@/lib/designer-tier-map";
import { useLayoutSectionItems, type LayoutSectionVisitorOptions } from "@/lib/use-layout-section-items";
import { buildPublicProfileHeroModel } from "@/lib/public-profile-hero";
import CreatorPublicHero from "@/app/components/public-profile/CreatorPublicHero";
import PatronLayoutSections from "@/app/components/patron/PatronLayoutSections";

function galleryThumbUrl(item: GalleryItem | undefined): string | undefined {
  const grid = item ? galleryItemImageGridSrc(item) : null;
  if (grid) return grid;
  if (item?.has_export && item.content_url_path?.trim()) {
    return `${RELAY_API_BASE}${item.content_url_path}`;
  }
  return undefined;
}

// ─── Breakpoint definitions ───────────────────────────────────────────────────

const BREAKPOINTS = [
  { key: "desktop", label: "Desktop", icon: Monitor,    width: "100%",  maxPx: 9999 },
  { key: "tablet",  label: "Tablet",  icon: Tablet,     width: "768px", maxPx: 768  },
  { key: "mobile",  label: "Mobile",  icon: Smartphone, width: "390px", maxPx: 390  },
] as const;

type BpKey = (typeof BREAKPOINTS)[number]["key"];

// ─── Tier ordering ────────────────────────────────────────────────────────────

const TIER_ORDER: TierKey[] = ["public", "supporter", "member", "inner"];

function tierIndex(t: TierKey) {
  return TIER_ORDER.indexOf(t);
}

// ─── Tier badge ───────────────────────────────────────────────────────────────

const TIER_LABEL: Record<TierKey, string> = {
  public:    "Public",
  supporter: "Supporter",
  member:    "Member",
  inner:     "Inner Circle",
};

const TIER_COLOR: Record<TierKey, string> = {
  public:    "var(--relay-fg-subtle)",
  supporter: "var(--relay-green-400)",
  member:    "#60a5fa",
  inner:     "var(--relay-gold-500)",
};

function TierBadge({
  tier,
  showBadges,
  labelOverride,
}: {
  tier: TierKey;
  showBadges: boolean;
  /** Creator tier title from Library facets when available */
  labelOverride?: string | null;
}) {
  if (!showBadges) return null;
  const label = labelOverride?.trim();
  const text = label || TIER_LABEL[tier];
  const colorTier: TierKey = tier === "public" && label ? "supporter" : tier;
  const stroke = TIER_COLOR[colorTier];
  return (
    <span
      className="absolute top-2 right-2 z-[5] text-xs px-1.5 py-0.5 rounded-full font-medium"
      style={{
        background: "rgba(0,0,0,0.72)",
        color: stroke,
        border: `1px solid ${stroke}`,
        fontSize: "0.65rem",
      }}
    >
      {text}
    </span>
  );
}

// ─── Radius map ───────────────────────────────────────────────────────────────

const RADIUS_MAP = {
  none: "0px",
  sm:   "4px",
  md:   "8px",
  lg:   "14px",
} as const;

/** Tailwind-safe class names for library grid density */
const GRID_COLS_CLASS: Record<2 | 3 | 4, string> = {
  2: "grid-cols-2",
  3: "grid-cols-3",
  4: "grid-cols-4",
};

// ─── Typography stacks ────────────────────────────────────────────────────────

const TYPOGRAPHY_FONTS: Record<TypographyStyle, { heading: string; body: string }> = {
  editorial: {
    heading: "'Georgia', 'Times New Roman', serif",
    body:    "'Inter', system-ui, sans-serif",
  },
  minimal: {
    heading: "'Inter', system-ui, sans-serif",
    body:    "'Inter', system-ui, sans-serif",
  },
  warm: {
    heading: "'Palatino Linotype', 'Book Antiqua', Palatino, serif",
    body:    "'Georgia', serif",
  },
  mono: {
    heading: "'Courier New', Courier, monospace",
    body:    "'Courier New', Courier, monospace",
  },
};

// ─── Locked art renderers ─────────────────────────────────────────────────────

/** Patreon upgrade CTA — backend wiring later */
function LockedOverlayUpgradeButton({ accentColor }: { accentColor: string }) {
  return (
    <button
      type="button"
      className="text-xs font-semibold px-3.5 py-2 rounded-md transition-opacity hover:opacity-90"
      style={{ background: accentColor, color: "#0a0a0a" }}
      onClick={(e) => e.preventDefault()}
    >
      Upgrade
    </button>
  );
}

function LockedOverlay({
  style,
  tierRequired,
  accentColor,
  tierLabel,
}: {
  style: LockedArtStyle;
  tierRequired: TierKey;
  accentColor: string;
  /** Full line e.g. "Basic+" — overrides generic band label */
  tierLabel?: string;
}) {
  const line = tierLabel ?? `${TIER_LABEL[tierRequired]}+`;
  if (style === "blurred") {
    return (
      <div
        className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-3"
        style={{ backdropFilter: "blur(10px)", background: "rgba(0,0,0,0.35)" }}
      >
        <Lock size={18} style={{ color: "rgba(255,255,255,0.9)" }} />
        <span
          className="text-center text-pretty max-w-[11rem]"
          style={{ fontSize: "0.65rem", color: "rgba(255,255,255,0.82)", fontWeight: 600 }}
        >
          {line}
        </span>
        <LockedOverlayUpgradeButton accentColor={accentColor} />
      </div>
    );
  }

  if (style === "locked") {
    return (
      <div
        className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-4"
        style={{ background: "#000" }}
      >
        <Lock
          size={44}
          strokeWidth={1.5}
          style={{ color: "#fff" }}
          aria-hidden
        />
        <span
          className="text-center text-pretty max-w-[14rem]"
          style={{
            fontSize: "0.8rem",
            color: "rgba(255,255,255,0.88)",
            fontWeight: 600,
            lineHeight: 1.35,
          }}
        >
          {line}
        </span>
        <LockedOverlayUpgradeButton accentColor={accentColor} />
      </div>
    );
  }

  // paywall — strip along the bottom
  return (
    <div
      className="absolute bottom-0 left-0 right-0 flex items-center justify-between gap-2 px-2 py-2"
      style={{ background: "rgba(0,0,0,0.92)", borderTop: `2px solid ${accentColor}` }}
    >
      <div className="flex flex-col gap-1.5 min-w-0 flex-1">
        <div className="flex items-center gap-1.5 min-w-0">
          <Lock size={12} className="shrink-0" style={{ color: accentColor }} />
          <span
            className="truncate"
            style={{ fontSize: "0.65rem", color: "rgba(255,255,255,0.85)", fontWeight: 600 }}
          >
            {line}
          </span>
        </div>
        <LockedOverlayUpgradeButton accentColor={accentColor} />
      </div>
    </div>
  );
}

// ─── Grid item ────────────────────────────────────────────────────────────────

function GridItem({
  index,
  mediaId,
  tier,
  locked,
  unlockLabel,
  badgeTitle,
  showBadges,
  radius,
  lockedStyle,
  accentColor,
  imageUrl,
  selected,
  onSelect,
}: {
  index: number;
  mediaId?: string;
  tier: TierKey;
  locked: boolean;
  unlockLabel: string;
  badgeTitle?: string | null;
  showBadges: boolean;
  radius: string;
  lockedStyle: LockedArtStyle;
  accentColor: string;
  /** Resolved Library thumbnail; falls back to design stubs when missing */
  imageUrl?: string;
  selected?: boolean;
  onSelect?: (event: React.MouseEvent) => void;
}) {
  const selectable = Boolean(mediaId && onSelect);

  return (
    <button
      type="button"
      onClick={selectable ? onSelect : undefined}
      className="relative aspect-square overflow-hidden text-left"
      style={{
        backgroundColor: imageUrl ? undefined : "var(--relay-surface-2)",
        borderRadius: radius,
        border: selected ? `2px solid ${accentColor}` : "1px solid var(--relay-border)",
        boxShadow: selected ? `0 0 0 2px ${accentColor}44` : "none",
        cursor: selectable ? "pointer" : "default",
      }}
      title={selectable ? "Click to select. Shift-click to select variants." : undefined}
    >
      {imageUrl ? (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={imageUrl}
          alt=""
          className="pointer-events-none absolute inset-0 h-full w-full object-cover object-center"
        />
      ) : null}
      {selectable ? (
        <span
          className="absolute left-2 top-2 z-10 flex h-5 w-5 items-center justify-center rounded-full border text-[10px] font-semibold"
          style={{
            borderColor: selected ? accentColor : "rgba(255,255,255,0.4)",
            background: selected ? accentColor : "rgba(0,0,0,0.55)",
            color: selected ? "black" : "rgba(255,255,255,0.8)",
          }}
        >
          {selected ? "✓" : index + 1}
        </span>
      ) : null}
      {!imageUrl ? (
        <div
          className="absolute inset-0 flex items-center justify-center text-[10px]"
          style={{ color: "var(--relay-fg-subtle)" }}
        >
          No media
        </div>
      ) : null}
      {locked ? (
        <LockedOverlay
          style={lockedStyle}
          tierRequired={tier}
          accentColor={accentColor}
          tierLabel={unlockLabel}
        />
      ) : (
        <TierBadge
          tier={tier}
          showBadges={showBadges}
          labelOverride={badgeTitle}
        />
      )}
    </button>
  );
}

// ─── Section layout renderer ──────────────────────────────────────────────────

function SectionPreview({
  section,
  collection,
  showBadges,
  radius,
  viewerTier,
  viewerMaxRank,
  lockedStyle,
  accentColor,
  fonts,
  galleryItems,
  selectedMediaIds,
  onMediaSelect,
  tierOrderIds,
  tierTitleById,
  facets,
}: {
  section: LibrarySection;
  collection: Collection | undefined;
  showBadges: boolean;
  radius: string;
  viewerTier: TierKey;
  /** Simulated viewer tier rank when Library facets exist (-1 = public) */
  viewerMaxRank: number;
  lockedStyle: LockedArtStyle;
  accentColor: string;
  fonts: { heading: string; body: string };
  /** Loaded from Library via layout API; may be empty while loading */
  galleryItems: GalleryItem[];
  selectedMediaIds: Set<string>;
  onMediaSelect: (sectionId: string, mediaId: string, event: React.MouseEvent) => void;
  tierOrderIds: string[];
  tierTitleById: Record<string, string>;
  facets: FacetsData | null;
}) {
  const isCatalog = section.filterQuery !== undefined;
  const fallbackTier = (collection?.tier as TierKey) ?? "public";
  function cellTier(i: number): TierKey {
    const it = galleryItems[i];
    if (it) return tierKeyForGalleryItem(it, tierOrderIds);
    return fallbackTier;
  }
  const count = Math.min(section.itemLimit, 36, galleryItems.length);
  const gridCols = section.gridColumns ?? 3;
  const gridClass = GRID_COLS_CLASS[gridCols];

  const thumb = (i: number) => galleryThumbUrl(galleryItems[i]);

  function lockAt(i: number) {
    return previewLockState(
      galleryItems[i],
      cellTier(i),
      viewerMaxRank,
      tierOrderIds,
      tierTitleById,
      viewerTier,
      facets
    );
  }

  const LAYOUT_ICON: Record<SectionLayout, React.ReactNode> = {
    grid:     <Grid3x3 size={10} />,
    masonry:  <LayoutGrid size={10} />,
    list:     <AlignJustify size={10} />,
    featured: <Star size={10} />,
  };

  const renderLayout = (layout: SectionLayout) => {
    if (count === 0) {
      return (
        <div
          className="rounded-lg border border-dashed px-4 py-8 text-center text-xs"
          style={{ borderColor: "var(--relay-border)", color: "var(--relay-fg-subtle)" }}
        >
          No media in this block yet.
        </div>
      );
    }

    switch (layout) {
      case "grid":
        return (
          <div className={`grid ${gridClass} gap-1.5`}>
            {Array.from({ length: count }).map((_, i) => {
              const pl = lockAt(i);
              const item = galleryItems[i];
              return (
              <GridItem
                key={item?.media_id ?? `cell-${i}`}
                index={i}
                mediaId={item?.media_id}
                tier={cellTier(i)}
                locked={pl.locked}
                unlockLabel={pl.unlockLabel}
                badgeTitle={pl.badgeTitle}
                showBadges={showBadges}
                radius={radius}
                lockedStyle={lockedStyle}
                accentColor={accentColor}
                imageUrl={thumb(i)}
                selected={item ? selectedMediaIds.has(item.media_id) : false}
                onSelect={item ? (event) => onMediaSelect(section.id, item.media_id, event) : undefined}
              />
            );
            })}
          </div>
        );

      case "masonry":
        return (
          <div className={`grid ${gridClass} gap-1.5`}>
            {Array.from({ length: count }).map((_, i) => {
              const ct = cellTier(i);
              const pl = lockAt(i);
              const imageUrl = thumb(i);
              const item = galleryItems[i];
              const selected = item ? selectedMediaIds.has(item.media_id) : false;
              return (
              <button
                type="button"
                key={item?.media_id ?? `m-${i}`}
                onClick={item ? (event) => onMediaSelect(section.id, item.media_id, event) : undefined}
                className="relative overflow-hidden"
                style={{
                  backgroundColor: imageUrl ? undefined : "var(--relay-surface-2)",
                  borderRadius: radius,
                  border: selected ? `2px solid ${accentColor}` : "1px solid var(--relay-border)",
                  aspectRatio: i % 3 === 0 ? "3/4" : "4/3",
                  boxShadow: selected ? `0 0 0 2px ${accentColor}44` : "none",
                  cursor: item ? "pointer" : "default",
                }}
                title={item ? "Click to select. Shift-click to select variants." : undefined}
              >
                {imageUrl ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={imageUrl}
                    alt=""
                    className="pointer-events-none absolute inset-0 h-full w-full object-cover object-center"
                  />
                ) : null}
                {item ? (
                  <span
                    className="absolute left-2 top-2 z-10 flex h-5 w-5 items-center justify-center rounded-full border text-[10px] font-semibold"
                    style={{
                      borderColor: selected ? accentColor : "rgba(255,255,255,0.4)",
                      background: selected ? accentColor : "rgba(0,0,0,0.55)",
                      color: selected ? "black" : "rgba(255,255,255,0.8)",
                    }}
                  >
                    {selected ? "✓" : i + 1}
                  </span>
                ) : null}
                {!imageUrl ? (
                  <div
                    className="absolute inset-0 flex items-center justify-center text-[10px]"
                    style={{ color: "var(--relay-fg-subtle)" }}
                  >
                    No media
                  </div>
                ) : null}
                {pl.locked ? (
                  <LockedOverlay
                    style={lockedStyle}
                    tierRequired={ct}
                    accentColor={accentColor}
                    tierLabel={pl.unlockLabel}
                  />
                ) : (
                  <TierBadge
                    tier={ct}
                    showBadges={showBadges}
                    labelOverride={pl.badgeTitle}
                  />
                )}
              </button>
            );
            })}
          </div>
        );

      case "list":
        return (
          <div className="flex flex-col gap-2">
            {Array.from({ length: count }).map((_, i) => {
              const ct = cellTier(i);
              const pl = lockAt(i);
              const imageUrl = thumb(i);
              const item = galleryItems[i];
              const selected = item ? selectedMediaIds.has(item.media_id) : false;
              return (
                <button
                  type="button"
                  key={item?.media_id ?? i}
                  onClick={item ? (event) => onMediaSelect(section.id, item.media_id, event) : undefined}
                  className="flex items-center gap-3 relative overflow-hidden text-left"
                  style={{
                    borderBottom: selected ? `1px solid ${accentColor}` : "1px solid var(--relay-border)",
                    paddingBottom: "8px",
                    cursor: item ? "pointer" : "default",
                  }}
                  title={item ? "Click to select. Shift-click to select variants." : undefined}
                >
                  <div
                    className="relative h-10 w-14 shrink-0 overflow-hidden"
                    style={{
                      backgroundColor: imageUrl ? undefined : "var(--relay-surface-2)",
                      borderRadius: radius,
                    }}
                  >
                    {imageUrl ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        src={imageUrl}
                        alt=""
                        className="pointer-events-none absolute inset-0 h-full w-full object-cover object-center"
                      />
                    ) : null}
                    {pl.locked && lockedStyle === "blurred" && (
                      <div
                        className="absolute inset-0"
                        style={{
                          backdropFilter: "blur(6px)",
                          background: "rgba(0,0,0,0.4)",
                        }}
                      />
                    )}
                  </div>
                  <div className="flex flex-col gap-1 flex-1 min-w-0">
                    <div
                      className="h-2.5 rounded"
                      style={{
                        background: pl.locked
                          ? "var(--relay-border)"
                          : "var(--relay-surface-2)",
                        width: "60%",
                        filter: pl.locked ? "blur(3px)" : "none",
                      }}
                    />
                    <div
                      className="h-2 rounded"
                      style={{
                        background: "var(--relay-border)",
                        width: "40%",
                      }}
                    />
                  </div>
                  {pl.locked && (
                    <div className="flex flex-col items-end gap-1.5 shrink-0 max-w-[6.5rem]">
                      <span
                        className="text-xs flex items-center gap-0.5 truncate w-full justify-end"
                        style={{
                          color: TIER_COLOR[ct],
                          fontSize: "0.65rem",
                        }}
                        title={pl.unlockLabel}
                      >
                        <Lock size={9} className="shrink-0" />
                        <span className="truncate">{pl.unlockLabel}</span>
                      </span>
                      <LockedOverlayUpgradeButton accentColor={accentColor} />
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        );

      case "featured": {
        const subCount = Math.max(0, count - 1);
        const h0 = lockAt(0);
        const ct0 = cellTier(0);
        const heroImage = thumb(0);
        return (
          <div className="flex flex-col gap-1.5">
            <div
              className="relative w-full overflow-hidden"
              style={{
                backgroundColor: heroImage ? undefined : "var(--relay-surface-2)",
                borderRadius: radius,
                aspectRatio: "16/9",
                border: "1px solid var(--relay-border)",
              }}
            >
              {heroImage ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={heroImage}
                  alt=""
                  className="pointer-events-none absolute inset-0 h-full w-full object-cover object-center"
                />
              ) : null}
              {!heroImage ? (
                <div
                  className="absolute inset-0 flex items-center justify-center text-xs"
                  style={{ color: "var(--relay-fg-subtle)" }}
                >
                  No media
                </div>
              ) : null}
              <div
                className="absolute inset-0"
                style={{
                  background:
                    "linear-gradient(to top, rgba(0,0,0,0.7) 0%, transparent 50%)",
                }}
              />
              <div className="absolute bottom-3 left-3 flex flex-col gap-1">
                <div
                  className="h-3 rounded"
                  style={{
                    background: "rgba(255,255,255,0.9)",
                    width: "120px",
                  }}
                />
                <div
                  className="h-2 rounded"
                  style={{
                    background: "rgba(255,255,255,0.5)",
                    width: "80px",
                  }}
                />
              </div>
              {h0.locked ? (
                <LockedOverlay
                  style={lockedStyle}
                  tierRequired={ct0}
                  accentColor={accentColor}
                  tierLabel={h0.unlockLabel}
                />
              ) : (
                <TierBadge
                  tier={ct0}
                  showBadges={showBadges}
                  labelOverride={h0.badgeTitle}
                />
              )}
            </div>
            <div className={`grid ${gridClass} gap-1.5`}>
              {Array.from({ length: subCount }).map((_, i) => {
                const idx = i + 1;
                const pl = lockAt(idx);
                const item = galleryItems[idx];
                return (
                <GridItem
                  key={item?.media_id ?? `f-${i}`}
                  index={idx}
                  mediaId={item?.media_id}
                  tier={cellTier(idx)}
                  locked={pl.locked}
                  unlockLabel={pl.unlockLabel}
                  badgeTitle={pl.badgeTitle}
                  showBadges={showBadges}
                  radius={radius}
                  lockedStyle={lockedStyle}
                  accentColor={accentColor}
                  imageUrl={thumb(idx)}
                  selected={item ? selectedMediaIds.has(item.media_id) : false}
                  onSelect={item ? (event) => onMediaSelect(section.id, item.media_id, event) : undefined}
                />
              );
              })}
            </div>
          </div>
        );
      }

      default:
        return null;
    }
  };

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h3
          className="text-sm font-semibold"
          style={{ color: "var(--relay-fg)", fontFamily: fonts.heading }}
        >
          {section.label}
        </h3>
        <div
          className="flex items-center gap-1.5"
          style={{ color: "var(--relay-fg-subtle)" }}
        >
          <span style={{ fontSize: "0.65rem" }}>{LAYOUT_ICON[section.layout]}</span>
          <span style={{ fontSize: "0.65rem", textTransform: "capitalize" }}>
            {section.layout}
          </span>
          {isCatalog ? (
            <span style={{ fontSize: "0.65rem", color: "var(--relay-green-400)" }}>
              Mixed tiers
            </span>
          ) : (
            collection &&
            fallbackTier !== "public" && (
              <span
                style={{
                  color: TIER_COLOR[fallbackTier],
                  display: "flex",
                  alignItems: "center",
                  gap: "2px",
                  fontSize: "0.65rem",
                }}
              >
                <Lock size={9} />
                {TIER_LABEL[fallbackTier]}
              </span>
            )
          )}
        </div>
      </div>
      {renderLayout(section.layout)}
    </section>
  );
}

// ─── Shop section preview ─────────────────────────────────────────────────────

function ShopPreview({
  section,
  radius,
  accentColor,
  fonts,
}: {
  section: ShopSection;
  radius: string;
  accentColor: string;
  fonts: { heading: string; body: string };
}) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h3
          className="text-sm font-semibold flex items-center gap-2"
          style={{ color: "var(--relay-fg)", fontFamily: fonts.heading }}
        >
          {section.label}
          <ShoppingBag size={13} style={{ color: "#f59e0b" }} />
        </h3>
        <span
          className="text-xs flex items-center gap-1"
          style={{ color: "var(--relay-fg-subtle)" }}
        >
          <ExternalLink size={10} />
          View store
        </span>
      </div>

      {section.items.length === 0 ? (
        <div
          className="flex flex-col items-center justify-center py-8 rounded-md"
          style={{
            border: "1px dashed var(--relay-border)",
            color: "var(--relay-fg-subtle)",
          }}
        >
          <ShoppingBag size={18} style={{ marginBottom: "6px" }} />
          <span className="text-xs">No shop items yet</span>
        </div>
      ) : (
        <div
          className="grid gap-3"
          style={{
            gridTemplateColumns: `repeat(${section.gridCols}, minmax(0, 1fr))`,
          }}
        >
          {section.items.map((item) => (
            <div
              key={item.id}
              className="flex flex-col gap-2 overflow-hidden"
              style={{
                border: "1px solid var(--relay-border)",
                borderRadius: radius,
              }}
            >
              <div className="relative aspect-square w-full overflow-hidden">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={item.imageUrl}
                  alt=""
                  className="pointer-events-none absolute inset-0 h-full w-full object-cover object-center"
                />
              </div>
              <div className="px-2 pb-2 flex flex-col gap-1">
                <span
                  className="text-xs font-medium leading-snug text-pretty"
                  style={{ color: "var(--relay-fg)", fontFamily: fonts.body }}
                >
                  {item.title}
                </span>
                <div className="flex items-center justify-between">
                  <span
                    className="text-xs font-semibold"
                    style={{ color: accentColor }}
                  >
                    {item.price}
                  </span>
                  <button
                    className="text-xs px-2 py-0.5 rounded"
                    style={{
                      background: `${accentColor}22`,
                      color: accentColor,
                      border: `1px solid ${accentColor}44`,
                      fontSize: "0.65rem",
                    }}
                  >
                    Buy
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

// ─── Engagement block preview ─────────────────────────────────────────────────

const ENGAGEMENT_ICON_MAP: Record<string, React.ReactNode> = {
  newsletter: <Mail size={16} />,
  commission: <Brush size={16} />,
  contest:    <Trophy size={16} />,
  links:      <Link2 size={16} />,
};

function EngagementPreview({
  section,
  radius,
  accentColor,
  fonts,
}: {
  section: EngagementSection;
  radius: string;
  accentColor: string;
  fonts: { heading: string; body: string };
}) {
  if (section.blockType === "links") {
    return (
      <section className="flex flex-col gap-3">
        <h3
          className="text-sm font-semibold"
          style={{ color: "var(--relay-fg)", fontFamily: fonts.heading }}
        >
          {section.heading || section.label}
        </h3>
        <div className="flex flex-wrap gap-2">
          {(section.links ?? []).map((link, i) => (
            <a
              key={i}
              href={link.url || "#"}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full transition-colors"
              style={{
                background: "var(--relay-surface-2)",
                border: "1px solid var(--relay-border)",
                color: "var(--relay-fg-muted)",
                fontFamily: fonts.body,
              }}
            >
              <ExternalLink size={10} />
              {link.platform}
            </a>
          ))}
        </div>
      </section>
    );
  }

  const CTA_LABEL: Record<string, string> = {
    newsletter: "Subscribe",
    commission: "Open commissions — inquire",
    contest:    "Enter contest",
  };

  return (
    <section
      className="flex flex-col gap-3 px-5 py-5 rounded-md"
      style={{
        border: `1px solid ${accentColor}44`,
        background: `${accentColor}0a`,
        borderRadius: radius,
      }}
    >
      <div
        className="flex items-center justify-center rounded-full"
        style={{
          width: "36px",
          height: "36px",
          background: `${accentColor}22`,
          border: `1px solid ${accentColor}44`,
          color: accentColor,
        }}
      >
        {ENGAGEMENT_ICON_MAP[section.blockType]}
      </div>
      <div className="flex flex-col gap-1.5">
        <h3
          className="text-sm font-semibold"
          style={{ color: "var(--relay-fg)", fontFamily: fonts.heading }}
        >
          {section.heading || section.label}
        </h3>
        {section.body && (
          <p
            className="text-xs leading-relaxed text-pretty"
            style={{ color: "var(--relay-fg-muted)", fontFamily: fonts.body }}
          >
            {section.body}
          </p>
        )}
      </div>

      {section.blockType === "newsletter" && (
        <div className="flex gap-1.5">
          <input
            type="email"
            placeholder="your@email.com"
            readOnly
            className="flex-1 text-xs px-2.5 py-1.5 rounded-md"
            style={{
              background: "var(--relay-surface-2)",
              border: "1px solid var(--relay-border)",
              color: "var(--relay-fg-muted)",
              outline: "none",
              fontFamily: fonts.body,
            }}
          />
          <button
            className="text-xs px-3 py-1.5 rounded-md font-medium shrink-0"
            style={{
              background: accentColor,
              color: "#000",
              fontFamily: fonts.body,
            }}
          >
            Subscribe
          </button>
        </div>
      )}

      {(section.blockType === "commission" ||
        section.blockType === "contest") && (
        <button
          className="self-start text-xs px-3 py-1.5 rounded-md font-medium flex items-center gap-1.5"
          style={{
            background: accentColor,
            color: "#000",
            fontFamily: fonts.body,
          }}
        >
          {CTA_LABEL[section.blockType]}
          <ArrowUpRight size={11} />
        </button>
      )}
    </section>
  );
}

// ─── Announcement banner preview ──────────────────────────────────────────────

const ANNOUNCEMENT_COLORS: Record<AnnouncementBanner["style"], { bg: string; fg: string; border: string }> = {
  promo: { bg: "#78350f", fg: "#fde68a", border: "#d97706" },
  info:  { bg: "#1e3a5f", fg: "#bfdbfe", border: "#3b82f6" },
  alert: { bg: "#450a0a", fg: "#fca5a5", border: "#ef4444" },
};

function AnnouncementPreview({
  section,
  fonts,
}: {
  section: AnnouncementBanner;
  fonts: { heading: string; body: string };
}) {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;

  const c = ANNOUNCEMENT_COLORS[section.style];

  // Check expiry
  const isExpired =
    section.expiresAt && new Date(section.expiresAt) < new Date();
  if (isExpired) return null;

  return (
    <div
      className="flex items-center justify-between gap-3 px-4 py-2.5"
      style={{
        background: c.bg,
        borderBottom: `2px solid ${c.border}`,
      }}
    >
      <p
        className="text-xs text-pretty flex-1"
        style={{ color: c.fg, fontFamily: fonts.body }}
      >
        {section.message}
      </p>
      <button
        onClick={() => setDismissed(true)}
        style={{ color: c.fg, opacity: 0.6 }}
        aria-label="Dismiss"
      >
        <X size={13} />
      </button>
    </div>
  );
}

// ─── Patron upgrade nudge ─────────────────────────────────────────────────────

function PatronUpgradeNudge({
  useFacets,
  viewerTier,
  viewerMaxRank,
  tierOrderIds,
  tierTitleById,
  facets,
  accentColor,
  fonts,
}: {
  useFacets: boolean;
  viewerTier: TierKey;
  viewerMaxRank: number;
  tierOrderIds: string[];
  tierTitleById: Record<string, string>;
  facets: FacetsData | null;
  accentColor: string;
  fonts: { heading: string; body: string };
}) {
  void facets;
  if (useFacets && tierOrderIds.length > 0) {
    const viewerLabel =
      viewerMaxRank < 0
        ? "Public"
        : (tierTitleById[tierOrderIds[viewerMaxRank]] ?? tierOrderIds[viewerMaxRank]).trim();

    const next = nextPaidTierAfterRank(tierOrderIds, tierTitleById, viewerMaxRank);
    const nextTitle = next?.title ?? null;
    if (!nextTitle) return null;

    return (
      <div
        className="mt-6 mx-6 flex items-center justify-between gap-3 px-4 py-3 rounded-md"
        style={{
          background: `${accentColor}0f`,
          border: `1px solid ${accentColor}33`,
        }}
      >
        <div className="flex flex-col gap-0.5 min-w-0">
          <span
            className="text-xs font-semibold"
            style={{ color: "var(--relay-fg)", fontFamily: fonts.heading }}
          >
            Viewing as {viewerLabel}
          </span>
          <span
            className="text-xs"
            style={{ color: "var(--relay-fg-muted)", fontFamily: fonts.body }}
          >
            Upgrade to {nextTitle} to unlock more content
          </span>
        </div>
        <button
          type="button"
          className="text-xs px-3 py-1.5 rounded-md font-medium shrink-0"
          style={{ background: accentColor, color: "#000", fontFamily: fonts.body }}
        >
          Upgrade
        </button>
      </div>
    );
  }

  if (viewerTier === "inner") return null;

  const nextTierIndex = tierIndex(viewerTier) + 1;
  const nextTier = TIER_ORDER[nextTierIndex];
  if (!nextTier) return null;

  return (
    <div
      className="mt-6 mx-6 flex items-center justify-between gap-3 px-4 py-3 rounded-md"
      style={{
        background: `${accentColor}0f`,
        border: `1px solid ${accentColor}33`,
      }}
    >
      <div className="flex flex-col gap-0.5">
        <span
          className="text-xs font-semibold"
          style={{ color: "var(--relay-fg)", fontFamily: fonts.heading }}
        >
          Viewing as {TIER_LABEL[viewerTier]}
        </span>
        <span
          className="text-xs"
          style={{ color: "var(--relay-fg-muted)", fontFamily: fonts.body }}
        >
          Upgrade to {TIER_LABEL[nextTier]} to unlock more content
        </span>
      </div>
      <button
        type="button"
        className="text-xs px-3 py-1.5 rounded-md font-medium shrink-0"
        style={{ background: accentColor, color: "#000", fontFamily: fonts.body }}
      >
        Upgrade
      </button>
    </div>
  );
}

// ─── Accent color resolver ────────────────────────────────────────────────────

const ACCENT_COLORS: Record<string, string> = {
  green:   "var(--relay-green-400)",
  neutral: "var(--relay-fg-muted)",
  warm:    "#d97706",
};

/** Accent picker removed from Theme for now — preview uses fixed Relay green. */
function resolveAccent(): string {
  return ACCENT_COLORS.green;
}

// ─── Tier switcher ─────────────────────────────────────────────────────────────

const TIER_PILL_COLOR: Record<TierKey, { active: string; activeBg: string; activeBorder: string }> = {
  public:    { active: "var(--relay-fg-muted)",    activeBg: "var(--relay-surface-2)",  activeBorder: "var(--relay-border)"    },
  supporter: { active: "var(--relay-green-400)",   activeBg: "var(--relay-green-950)",  activeBorder: "var(--relay-green-600)" },
  member:    { active: "#60a5fa",                   activeBg: "#1e3a5f",                 activeBorder: "#3b82f6"                },
  inner:     { active: "var(--relay-gold-500)",    activeBg: "#292109",                 activeBorder: "#d97706"                },
};

function LegacyTierSwitcher({
  value,
  onChange,
}: {
  value: TierKey;
  onChange: (t: TierKey) => void;
}) {
  return (
    <div className="flex items-center gap-1">
      {TIERS.map(({ key, label }) => {
        const active = value === key;
        const colors = TIER_PILL_COLOR[key];
        return (
          <button
            type="button"
            key={key}
            onClick={() => onChange(key)}
            className="text-xs px-2.5 py-1.5 rounded-md transition-colors"
            title={`Preview as ${label}`}
            style={{
              color: active ? colors.active : "var(--relay-fg-subtle)",
              background: active ? colors.activeBg : "transparent",
              border: `1px solid ${active ? colors.activeBorder : "transparent"}`,
              fontSize: "0.7rem",
            }}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

const FACET_PILL_PALETTE: {
  active: string;
  activeBg: string;
  activeBorder: string;
}[] = [
  { active: "var(--relay-green-400)", activeBg: "var(--relay-green-950)", activeBorder: "var(--relay-green-600)" },
  { active: "#60a5fa", activeBg: "#1e3a5f", activeBorder: "#3b82f6" },
  { active: "var(--relay-gold-500)", activeBg: "#292109", activeBorder: "#d97706" },
  { active: "#a78bfa", activeBg: "#2e1065", activeBorder: "#7c3aed" },
];

/** Preview tier control using real Library tier titles (facets). */
function FacetTierSwitcher({
  tierOrderIds,
  tierTitleById,
  viewerMaxRank,
  onChange,
}: {
  tierOrderIds: string[];
  tierTitleById: Record<string, string>;
  viewerMaxRank: number;
  onChange: (rank: number) => void;
}) {
  const pubActive = viewerMaxRank < 0;
  return (
    <div className="flex items-center gap-1 flex-wrap justify-center max-w-[min(100%,320px)]">
      <button
        type="button"
        onClick={() => onChange(-1)}
        className="text-xs px-2.5 py-1.5 rounded-md transition-colors max-w-[100px] truncate"
        title="Preview as visitor (no Patreon tier)"
        style={{
          color: pubActive ? TIER_PILL_COLOR.public.active : "var(--relay-fg-subtle)",
          background: pubActive ? TIER_PILL_COLOR.public.activeBg : "transparent",
          border: `1px solid ${pubActive ? TIER_PILL_COLOR.public.activeBorder : "transparent"}`,
          fontSize: "0.7rem",
        }}
      >
        Public
      </button>
      {tierOrderIds.map((id, i) => {
        const active = viewerMaxRank === i;
        const pal = FACET_PILL_PALETTE[i % FACET_PILL_PALETTE.length];
        const raw = (tierTitleById[id] ?? id).trim() || id;
        const label = raw.length > 22 ? `${raw.slice(0, 20)}…` : raw;
        return (
          <button
            type="button"
            key={id}
            onClick={() => onChange(i)}
            className="text-xs px-2.5 py-1.5 rounded-md transition-colors max-w-[120px] truncate"
            title={`Preview as ${raw}`}
            style={{
              color: active ? pal.active : "var(--relay-fg-subtle)",
              background: active ? pal.activeBg : "transparent",
              border: `1px solid ${active ? pal.activeBorder : "transparent"}`,
              fontSize: "0.7rem",
            }}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

function viewingAsLabel(
  useFacets: boolean,
  viewerMaxRank: number,
  tierOrderIds: string[],
  tierTitleById: Record<string, string>,
  viewerTier: TierKey
): string {
  if (useFacets && tierOrderIds.length > 0) {
    if (viewerMaxRank < 0) return "Public";
    const id = tierOrderIds[viewerMaxRank];
    if (!id) return "Public";
    return (tierTitleById[id] ?? id).trim() || "Public";
  }
  return TIER_LABEL[viewerTier];
}

// ─── Section dispatcher ───────────────────────────────────────────────────────

function SectionDispatch({
  section,
  collections,
  showBadges,
  radius,
  viewerTier,
  viewerMaxRank,
  lockedStyle,
  accentColor,
  fonts,
  sectionItems,
  selectedMediaIds,
  onMediaSelect,
  tierOrderIds,
  tierTitleById,
  facets,
}: {
  section: AnySection;
  collections: Collection[];
  showBadges: boolean;
  radius: string;
  viewerTier: TierKey;
  viewerMaxRank: number;
  lockedStyle: LockedArtStyle;
  accentColor: string;
  fonts: { heading: string; body: string };
  sectionItems: Record<string, GalleryItem[]>;
  selectedMediaIds: Set<string>;
  onMediaSelect: (sectionId: string, mediaId: string, event: React.MouseEvent) => void;
  tierOrderIds: string[];
  tierTitleById: Record<string, string>;
  facets: FacetsData | null;
}) {
  if (section.kind === "announcement") {
    return <AnnouncementPreview section={section} fonts={fonts} />;
  }

  // Remaining sections go inside the padded content area
  if (section.kind === "library") {
    const isCatalog = section.filterQuery !== undefined;
    const collection: Collection | undefined = isCatalog
      ? {
          slug: "__relay_catalog__",
          label: "All visible work",
          itemCount: 0,
          tier: "public",
        }
      : collections.find((c) => c.slug === section.collectionSlug);
    return (
      <SectionPreview
        section={section}
        collection={collection}
        showBadges={showBadges}
        radius={radius}
        viewerTier={viewerTier}
        viewerMaxRank={viewerMaxRank}
        lockedStyle={lockedStyle}
        accentColor={accentColor}
        fonts={fonts}
        galleryItems={sectionItems[section.id] ?? []}
        selectedMediaIds={selectedMediaIds}
        onMediaSelect={onMediaSelect}
        tierOrderIds={tierOrderIds}
        tierTitleById={tierTitleById}
        facets={facets}
      />
    );
  }
  if (section.kind === "shop") {
    return (
      <ShopPreview
        section={section}
        radius={radius}
        accentColor={accentColor}
        fonts={fonts}
      />
    );
  }
  if (section.kind === "engagement") {
    return (
      <EngagementPreview
        section={section}
        radius={radius}
        accentColor={accentColor}
        fonts={fonts}
      />
    );
  }
  return null;
}

function minimapSectionKind(section: AnySection): string {
  if (section.kind === "library") {
    if (section.filterQuery !== undefined) {
      if (section.label.toLowerCase().includes("tier")) return "Tier Gallery";
      const keys = Object.keys(section.filterQuery);
      if (keys.length === 1 && section.filterQuery.sort === "published") return "Newest";
      return keys.length === 0 ? "Chronological" : "Filtered";
    }
    return section.layout === "featured" ? "Featured" : "Collection";
  }
  if (section.kind === "shop") return "Shop";
  if (section.kind === "engagement") return "Engage";
  return "Banner";
}

function minimapAccent(section: AnySection): string {
  if (section.kind === "library") {
    if (section.filterQuery !== undefined && section.label.toLowerCase().includes("tier")) {
      return "var(--relay-gold-500)";
    }
    return section.filterQuery === undefined ? "#60a5fa" : "var(--relay-green-400)";
  }
  if (section.kind === "shop") return "#f59e0b";
  if (section.kind === "engagement") return "#60a5fa";
  return "#f87171";
}

function minimapMeta(section: AnySection, collections: Collection[]): string {
  if (section.kind === "library") {
    if (section.filterQuery !== undefined) return "Library catalog";
    return collections.find((c) => c.slug === section.collectionSlug)?.label ?? "Collection";
  }
  if (section.kind === "shop") return `${section.items.length} items`;
  if (section.kind === "engagement") return section.blockType;
  return section.style;
}

function reorderSections(sections: AnySection[], draggedId: string, targetId: string): AnySection[] {
  if (draggedId === targetId) return sections;
  const from = sections.findIndex((s) => s.id === draggedId);
  const to = sections.findIndex((s) => s.id === targetId);
  if (from < 0 || to < 0) return sections;
  const next = [...sections];
  const [moved] = next.splice(from, 1);
  if (!moved) return sections;
  next.splice(to, 0, moved);
  return next;
}

const DESIGNER_BLOCK_MIME = "application/x-relay-designer-block";

type DesignerBlockPayload =
  | { source: "designer-block-palette"; kind: "announcement" }
  | { source: "designer-block-palette"; kind: "collection" };

type PresentationStyle = "grid" | "masonry" | "showcase";
type PendingBlockPlacement = { kind: DesignerBlockPayload["kind"]; insertIndex: number };

function parseDesignerBlockPayload(raw: string): DesignerBlockPayload | null {
  if (!raw.trim()) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<DesignerBlockPayload>;
    if (parsed.source !== "designer-block-palette" || typeof parsed.kind !== "string") return null;
    return parsed as DesignerBlockPayload;
  } catch {
    return null;
  }
}

function isCatalogSection(section: AnySection): section is LibrarySection {
  return section.kind === "library" && section.filterQuery !== undefined;
}

function presentationStyleForLayout(layout: PageLayout): PresentationStyle {
  const firstLibrary = layout.sections.find((section): section is LibrarySection => section.kind === "library");
  if (!firstLibrary) return "grid";
  if (firstLibrary.layout === "featured") return "showcase";
  if (firstLibrary.layout === "masonry") return "masonry";
  return "grid";
}

function applyPresentationStyle(layout: PageLayout, style: PresentationStyle): PageLayout {
  return {
    ...layout,
    sections: layout.sections.map((section, index) => {
      if (section.kind !== "library") return section;
      if (style === "showcase") {
        return {
          ...section,
          layout: index === 0 ? "featured" : "grid",
          gridColumns: index === 0 ? 2 : 3,
          itemLimit: index === 0 ? Math.max(section.itemLimit, 12) : section.itemLimit,
        };
      }
      if (style === "masonry") {
        return {
          ...section,
          layout: "masonry",
          gridColumns: 2,
          itemLimit: Math.min(section.itemLimit, 24),
        };
      }
      return {
        ...section,
        layout: "grid",
        gridColumns: 3,
        itemLimit: Math.max(section.itemLimit, 24),
      };
    }),
  };
}

function applyGalleryOrder(layout: PageLayout, mode: "chronological" | "tier"): PageLayout {
  return {
    ...layout,
    theme: {
      ...layout.theme,
      galleryArrangement: mode,
    },
    sections: layout.sections.map((section) => {
      if (!isCatalogSection(section)) return section;
      return {
        ...section,
        label: mode === "tier" ? "Tier Gallery" : "Chronological Gallery",
      };
    }),
  };
}

function DesignerMinimap({
  layout,
  collections,
  activeSectionId,
  pendingBlockPlacement,
  onFocus,
  onLayoutChange,
  onPendingBlockDrop,
}: {
  layout: PageLayout;
  collections: Collection[];
  activeSectionId: string | null;
  pendingBlockPlacement: PendingBlockPlacement | null;
  onFocus: (id: string) => void;
  onLayoutChange: (layout: PageLayout) => void;
  onPendingBlockDrop: (placement: PendingBlockPlacement) => void;
}) {
  const sections = layout.sections;
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dropId, setDropId] = useState<string | null>(null);
  const presentationStyle = presentationStyleForLayout(layout);

  function handleDrop(e: React.DragEvent, targetSectionId: string | null) {
    e.preventDefault();
    const targetIndex = targetSectionId
      ? sections.findIndex((section) => section.id === targetSectionId)
      : sections.length;
    const insertIndex = targetIndex >= 0 ? targetIndex : sections.length;
    const palettePayload = parseDesignerBlockPayload(e.dataTransfer.getData(DESIGNER_BLOCK_MIME));
    if (palettePayload) {
      onPendingBlockDrop({ kind: palettePayload.kind, insertIndex });
    } else {
      const id = e.dataTransfer.getData("text/plain") || draggedId;
      if (id && targetSectionId) {
        onLayoutChange({ ...layout, sections: reorderSections(sections, id, targetSectionId) });
      }
    }
    setDraggedId(null);
    setDropId(null);
  }

  function renderPendingCard(insertIndex: number) {
    if (!pendingBlockPlacement || pendingBlockPlacement.insertIndex !== insertIndex) return null;
    const isCollection = pendingBlockPlacement.kind === "collection";
    const accent = isCollection ? "#60a5fa" : "#f87171";
    return (
      <div
        className="rounded-xl border border-dashed p-2 text-left"
        style={{
          borderColor: accent,
          background: `${accent}1a`,
          boxShadow: `0 0 0 1px ${accent}55`,
        }}
      >
        <div className="mb-2 flex items-center justify-between gap-2">
          <span
            className="inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide"
            style={{ borderColor: `${accent}66`, color: accent }}
          >
            <GripVertical size={10} />
            Pending {isCollection ? "Collection" : "Post"}
          </span>
          <span className="text-[10px]" style={{ color: "var(--relay-fg-subtle)" }}>
            {insertIndex + 1}
          </span>
        </div>
        <p className="text-xs font-medium" style={{ color: "var(--relay-fg)" }}>
          Fill out menu, then Create
        </p>
        <p className="mt-0.5 text-[10px]" style={{ color: "var(--relay-fg-subtle)" }}>
          This block will insert here.
        </p>
      </div>
    );
  }

  return (
    <div
      className="hidden w-56 shrink-0 flex-col border-r px-3 py-3 lg:flex"
      style={{
        borderColor: "var(--relay-border)",
        background: "var(--relay-surface-1)",
      }}
    >
      <div className="mb-2 flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-medium" style={{ color: "var(--relay-fg)" }}>
            Profile minimap
          </p>
          <p className="text-[10px]" style={{ color: "var(--relay-fg-subtle)" }}>
            Click to jump. Drag blocks to rearrange the page.
          </p>
        </div>
        <span className="shrink-0 text-[10px]" style={{ color: "var(--relay-fg-subtle)" }}>
          {sections.filter((s) => s.visible).length}/{sections.length} visible
        </span>
      </div>

      <div className="mb-3 flex flex-wrap gap-1.5">
        {([
          ["chronological", "Chronological"],
          ["tier", "Tier based"],
        ] as const).map(([value, label]) => {
          const active = layout.theme.galleryArrangement === value;
          return (
            <button
              key={value}
              type="button"
              onClick={() => onLayoutChange(applyGalleryOrder(layout, value))}
              className="rounded-full border px-2.5 py-1 text-[10px] font-medium transition-colors"
              style={{
                borderColor: active ? "var(--relay-gold-500)" : "var(--relay-border)",
                background: active ? "rgba(217,119,6,0.14)" : "var(--relay-bg)",
                color: active ? "var(--relay-gold-500)" : "var(--relay-fg-subtle)",
              }}
            >
              {label}
            </button>
          );
        })}
      </div>

      <div className="mb-3 flex flex-wrap gap-1.5">
        {([
          ["grid", "Grid"],
          ["masonry", "Masonry"],
          ["showcase", "Showcase"],
        ] as const).map(([value, label]) => {
          const active = presentationStyle === value;
          return (
            <button
              key={value}
              type="button"
              onClick={() => onLayoutChange(applyPresentationStyle(layout, value))}
              className="rounded-full border px-2.5 py-1 text-[10px] font-medium transition-colors"
              style={{
                borderColor: active ? "var(--relay-green-600)" : "var(--relay-border)",
                background: active ? "var(--relay-green-950)" : "var(--relay-bg)",
                color: active ? "var(--relay-green-400)" : "var(--relay-fg-subtle)",
              }}
            >
              {label}
            </button>
          );
        })}
      </div>

      <div
        className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto pr-1"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => handleDrop(e, null)}
      >
        {sections.length === 0 ? (
          pendingBlockPlacement ? (
            renderPendingCard(0)
          ) : (
          <div
            className="rounded-lg border border-dashed px-3 py-4 text-center text-xs"
            style={{ borderColor: "var(--relay-border)", color: "var(--relay-fg-subtle)" }}
          >
            Drag a block type here, then fill out the menu to create it.
          </div>
          )
        ) : (
          sections.map((section, index) => {
            const active = activeSectionId === section.id;
            const dropping = dropId === section.id && draggedId !== section.id;
            const accent = minimapAccent(section);
            const dims = !section.visible;
            return (
              <Fragment key={section.id}>
                {renderPendingCard(index)}
                <button
                type="button"
                draggable
                onClick={() => onFocus(section.id)}
                onDragStart={(e) => {
                  setDraggedId(section.id);
                  e.dataTransfer.effectAllowed = "move";
                  e.dataTransfer.setData("text/plain", section.id);
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDropId(section.id);
                }}
                onDragLeave={() => setDropId((current) => (current === section.id ? null : current))}
                onDrop={(e) => {
                  e.preventDefault();
                  handleDrop(e, section.id);
                }}
                onDragEnd={() => {
                  setDraggedId(null);
                  setDropId(null);
                }}
                className="group relative rounded-xl border p-2 text-left transition-all"
                style={{
                  borderColor: active || dropping ? accent : "var(--relay-border)",
                  background: active
                    ? "var(--relay-green-950)"
                    : dropping
                      ? "rgba(255,255,255,0.08)"
                      : "var(--relay-bg)",
                  opacity: dims ? 0.48 : 1,
                  boxShadow: active ? `0 0 0 1px ${accent}` : "none",
                }}
                title={`Jump to ${section.label}`}
              >
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span
                    className="inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide"
                    style={{ borderColor: `${accent}66`, color: accent }}
                  >
                    <GripVertical size={10} />
                    {minimapSectionKind(section)}
                  </span>
                  <span className="text-[10px]" style={{ color: "var(--relay-fg-subtle)" }}>
                    {index + 1}
                  </span>
                </div>
                <div className="mb-2 grid grid-cols-4 gap-1">
                  {Array.from({ length: 8 }).map((_, i) => (
                    <span
                      key={i}
                      className="block rounded-sm"
                      style={{
                        height: i % 5 === 0 ? 18 : 12,
                        background: i % 3 === 0 ? `${accent}55` : "var(--relay-surface-2)",
                        border: "1px solid var(--relay-border)",
                      }}
                    />
                  ))}
                </div>
                <p className="truncate text-xs font-medium" style={{ color: "var(--relay-fg)" }}>
                  {section.label}
                </p>
                <p className="truncate text-[10px]" style={{ color: "var(--relay-fg-subtle)" }}>
                  {dims ? "Hidden · " : ""}
                  {minimapMeta(section, collections)}
                </p>
                </button>
              </Fragment>
            );
          })
        )}
        {sections.length > 0 ? renderPendingCard(sections.length) : null}
      </div>
    </div>
  );
}

// ─── Canvas Preview ───────────────────────────────────────────────────────────

function sectionPresentation(section: AnySection): PresentationStyle {
  if (section.kind !== "library") return "grid";
  if (section.layout === "featured") return "showcase";
  if (section.layout === "masonry") return "masonry";
  return "grid";
}

function presentationPatch(section: LibrarySection, style: PresentationStyle): LibrarySection {
  if (style === "showcase") {
    return {
      ...section,
      layout: "featured",
      gridColumns: 2,
      itemLimit: Math.max(section.itemLimit, 12),
    };
  }
  if (style === "masonry") {
    return {
      ...section,
      layout: "masonry",
      gridColumns: 2,
      itemLimit: Math.min(section.itemLimit, 24),
    };
  }
  return {
    ...section,
    layout: "grid",
    gridColumns: 3,
    itemLimit: Math.max(section.itemLimit, 24),
  };
}

function SectionCanvasFrame({
  section,
  active,
  selectedMediaCount,
  children,
  onSelect,
  onSetPresentation,
  onMove,
  onToggleVisible,
}: {
  section: AnySection;
  active: boolean;
  selectedMediaCount: number;
  children: React.ReactNode;
  onSelect: () => void;
  onSetPresentation: (style: PresentationStyle) => void;
  onMove: (delta: -1 | 1) => void;
  onToggleVisible: () => void;
}) {
  const isLibrary = section.kind === "library";
  const style = sectionPresentation(section);
  return (
    <div
      data-designer-section-id={section.id}
      className="group relative scroll-mt-16 rounded-xl transition-all"
      style={{
        outline: active ? "2px solid var(--relay-green-500)" : "1px solid transparent",
        outlineOffset: active ? "8px" : "4px",
      }}
      onClick={(event) => {
        event.stopPropagation();
        onSelect();
      }}
    >
      {active ? (
        <div
          className="absolute -top-12 left-0 right-0 z-20 flex flex-wrap items-center justify-between gap-2 rounded-lg border px-2 py-1.5 shadow-[0_8px_24px_rgba(0,0,0,0.35)]"
          style={{
            background: "rgba(0,0,0,0.82)",
            borderColor: "var(--relay-green-700)",
            color: "var(--relay-fg-muted)",
          }}
        >
          <div className="flex min-w-0 items-center gap-2">
            <span className="max-w-[10rem] truncate text-[10px] font-semibold uppercase tracking-wide">
              Editing {section.label}
            </span>
            {selectedMediaCount > 1 ? (
              <button
                type="button"
                className="rounded-full border px-2 py-1 text-[10px] font-medium"
                style={{
                  borderColor: "var(--relay-gold-500)",
                  color: "var(--relay-gold-500)",
                  background: "rgba(217,119,6,0.14)",
                }}
                title="Variant stacks need backend support before this can persist."
              >
                Stack {selectedMediaCount} selected
              </button>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-1">
            {isLibrary
              ? ([
                  ["grid", "Grid"],
                  ["masonry", "Masonry"],
                  ["showcase", "Showcase"],
                ] as const).map(([value, label]) => {
                  const isActive = style === value;
                  return (
                    <button
                      key={value}
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        onSetPresentation(value);
                      }}
                      className="rounded-full border px-2 py-1 text-[10px] font-medium"
                      style={{
                        borderColor: isActive ? "var(--relay-green-600)" : "var(--relay-border)",
                        background: isActive ? "var(--relay-green-950)" : "transparent",
                        color: isActive ? "var(--relay-green-400)" : "var(--relay-fg-subtle)",
                      }}
                    >
                      {label}
                    </button>
                  );
                })
              : null}
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onMove(-1);
              }}
              className="rounded-full border px-2 py-1 text-[10px]"
              style={{ borderColor: "var(--relay-border)", color: "var(--relay-fg-subtle)" }}
            >
              Up
            </button>
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onMove(1);
              }}
              className="rounded-full border px-2 py-1 text-[10px]"
              style={{ borderColor: "var(--relay-border)", color: "var(--relay-fg-subtle)" }}
            >
              Down
            </button>
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onToggleVisible();
              }}
              className="rounded-full border px-2 py-1 text-[10px]"
              style={{ borderColor: "var(--relay-border)", color: "var(--relay-fg-subtle)" }}
            >
              Hide
            </button>
          </div>
        </div>
      ) : null}
      {children}
    </div>
  );
}

interface CanvasPreviewProps {
  layout: PageLayout;
  collections: Collection[];
  onLayoutChange: (updated: PageLayout) => void;
  pendingBlockPlacement: PendingBlockPlacement | null;
  onPendingBlockDrop: (placement: PendingBlockPlacement) => void;
  creatorId: string;
  apiLayout: ApiPageLayout;
  apiCollections: ApiCollection[];
  /** From facets: tiers ordered low→high price; used when gallery arrangement is "tier" */
  tierOrderIds: string[];
  /** Patreon tier id → display title from Library facets */
  tierTitleById: Record<string, string>;
  /** Library facets (pledge floors); used so $0 tiers are not paywalled in Public preview */
  facets: FacetsData | null;
  /** Patreon vanity slug for hero link (campaign sync) */
  patreonSlug: string | null;
}

export function CanvasPreview({
  layout,
  collections,
  onLayoutChange,
  pendingBlockPlacement,
  onPendingBlockDrop,
  creatorId,
  apiLayout,
  apiCollections,
  tierOrderIds,
  tierTitleById,
  facets,
  patreonSlug,
}: CanvasPreviewProps) {
  const scrollRootRef = useRef<HTMLDivElement>(null);
  const [breakpoint, setBreakpoint] = useState<BpKey>("desktop");
  const [viewerTier, setViewerTier] = useState<TierKey>("inner");
  const [viewerMaxRank, setViewerMaxRank] = useState(-1);
  const [activeSectionId, setActiveSectionId] = useState<string | null>(null);
  const [selectedMediaSectionId, setSelectedMediaSectionId] = useState<string | null>(null);
  const [selectedMediaIds, setSelectedMediaIds] = useState<Set<string>>(() => new Set());
  const viewerTouchedRef = useRef(false);

  const useFacets = tierOrderIds.length > 0;

  useEffect(() => {
    if (viewerTouchedRef.current || tierOrderIds.length === 0) return;
    setViewerMaxRank(tierOrderIds.length - 1);
  }, [tierOrderIds]);

  const previewLayout = useMemo(
    () => designerPageLayoutToApi(layout, apiLayout),
    [layout, apiLayout]
  );

  const publicHeroModel = useMemo(
    () =>
      buildPublicProfileHeroModel({
        pageLayout: previewLayout,
        visitorHero: facets?.visitor_hero,
        creatorId,
        patreonVanitySlug: patreonSlug
      }),
    [previewLayout, facets?.visitor_hero, creatorId, patreonSlug]
  );

  const layoutVisitorOptions = useMemo((): LayoutSectionVisitorOptions => {
    const base = { visitor: true as const };
    if (!useFacets || tierOrderIds.length === 0) {
      return { ...base, dev_sim_patron: true, simulate_tier_ids: [] };
    }
    if (viewerMaxRank < 0) {
      return { ...base, dev_sim_patron: true, simulate_tier_ids: [] };
    }
    const tid = tierOrderIds[viewerMaxRank];
    return { ...base, dev_sim_patron: true, simulate_tier_ids: tid ? [tid] : [] };
  }, [useFacets, tierOrderIds, viewerMaxRank]);

  const { sectionItems, loading: layoutSectionsLoading } = useLayoutSectionItems(
    previewLayout,
    creatorId,
    apiCollections,
    layoutVisitorOptions
  );

  const bp = BREAKPOINTS.find((b) => b.key === breakpoint)!;
  const visibleSections = layout.sections.filter((s) => s.visible);
  const radius = RADIUS_MAP[layout.theme.radius] ?? "8px";
  const accentColor = resolveAccent();
  const fonts = TYPOGRAPHY_FONTS[layout.theme.typography] ?? TYPOGRAPHY_FONTS.editorial;

  // Split announcements (full-bleed) from content sections (padded)
  const announcementSections = visibleSections.filter(
    (s) => s.kind === "announcement"
  ) as AnnouncementBanner[];
  const contentSections = visibleSections.filter(
    (s) => s.kind !== "announcement"
  );

  const allLibrarySectionsInOrder = useMemo(
    () => layout.sections.filter((s): s is LibrarySection => s.kind === "library"),
    [layout.sections]
  );

  const firstLibrarySection = useMemo(
    () => contentSections.find((s): s is LibrarySection => s.kind === "library"),
    [contentSections]
  );

  const mockByApiId = useMemo(() => {
    const sortedApi = [...previewLayout.sections].sort((a, b) => a.sort_order - b.sort_order);
    const m = new Map<string, LibrarySection>();
    sortedApi.forEach((apiSec, i) => {
      const mock = allLibrarySectionsInOrder[i];
      if (mock) m.set(apiSec.section_id, mock);
    });
    return m;
  }, [previewLayout.sections, allLibrarySectionsInOrder]);

  const visibleMockLibraryIdSet = useMemo(
    () =>
      new Set(
        visibleSections
          .filter((s): s is LibrarySection => s.kind === "library")
          .map((s) => s.id)
      ),
    [visibleSections]
  );

  const patronCanvasLayout = useMemo(() => {
    const sorted = [...previewLayout.sections].sort((a, b) => a.sort_order - b.sort_order);
    const sections = sorted.filter((sec) => {
      const mock = mockByApiId.get(sec.section_id);
      return mock && visibleMockLibraryIdSet.has(mock.id);
    });
    return { ...previewLayout, sections };
  }, [previewLayout, mockByApiId, visibleMockLibraryIdSet]);

  const patronLibShellStyle = useMemo(
    (): CSSProperties => ({
      ["--lib-fg" as string]: "var(--relay-fg)",
      ["--lib-fg-muted" as string]: "var(--relay-fg-muted)",
      ["--lib-border" as string]: "var(--relay-border)",
      ["--lib-card" as string]: "var(--relay-surface-1)",
      ["--lib-muted" as string]: "var(--relay-surface-2)",
      ["--lib-selection" as string]: "var(--relay-green-400)",
      ["--lib-bg" as string]: "var(--relay-bg)"
    }),
    []
  );

  const focusSection = (sectionId: string) => {
    setActiveSectionId(sectionId);
    const el = scrollRootRef.current?.querySelector<HTMLElement>(
      `[data-designer-section-id="${CSS.escape(sectionId)}"]`
    );
    el?.scrollIntoView({ block: "start", behavior: "smooth" });
  };

  const selectSection = (sectionId: string) => {
    setActiveSectionId(sectionId);
    if (selectedMediaSectionId !== sectionId) {
      setSelectedMediaSectionId(null);
      setSelectedMediaIds(new Set());
    }
  };

  const handleMediaSelect = (sectionId: string, mediaId: string, event: React.MouseEvent) => {
    event.stopPropagation();
    setActiveSectionId(sectionId);
    setSelectedMediaSectionId(sectionId);
    setSelectedMediaIds((current) => {
      if (!event.shiftKey || selectedMediaSectionId !== sectionId) {
        return new Set([mediaId]);
      }
      const next = new Set(current);
      if (next.has(mediaId)) next.delete(mediaId);
      else next.add(mediaId);
      return next;
    });
  };

  const handleOpenPatronItem = (item: GalleryItem) => {
    let mockSectionId: string | null = null;
    for (const sec of patronCanvasLayout.sections) {
      if ((sectionItems[sec.section_id] ?? []).some((it) => it.media_id === item.media_id)) {
        mockSectionId = mockByApiId.get(sec.section_id)?.id ?? null;
        if (mockSectionId) break;
      }
    }
    if (!mockSectionId) return;
    setActiveSectionId(mockSectionId);
    setSelectedMediaSectionId(mockSectionId);
    setSelectedMediaIds(new Set([item.media_id]));
  };

  const updateSection = (sectionId: string, updater: (section: AnySection) => AnySection) => {
    onLayoutChange({
      ...layout,
      sections: layout.sections.map((section) => (section.id === sectionId ? updater(section) : section)),
    });
  };

  const setSectionPresentation = (sectionId: string, style: PresentationStyle) => {
    updateSection(sectionId, (section) => {
      if (section.kind !== "library") return section;
      return presentationPatch(section, style);
    });
  };

  const moveSection = (sectionId: string, delta: -1 | 1) => {
    const currentIndex = layout.sections.findIndex((section) => section.id === sectionId);
    const nextIndex = currentIndex + delta;
    if (currentIndex < 0 || nextIndex < 0 || nextIndex >= layout.sections.length) return;
    const sections = [...layout.sections];
    const [moved] = sections.splice(currentIndex, 1);
    if (!moved) return;
    sections.splice(nextIndex, 0, moved);
    onLayoutChange({ ...layout, sections });
  };

  return (
    <div
      className="flex flex-col h-full"
      style={{ background: "var(--relay-bg)" }}
    >
      {/* Toolbar */}
      <div
        className="flex items-center justify-between px-4 h-11 shrink-0 gap-3"
        style={{
          background: "var(--relay-surface-1)",
          borderBottom: "1px solid var(--relay-border)",
        }}
      >
        {/* Left: breakpoint switcher */}
        <div className="flex items-center gap-1">
          {BREAKPOINTS.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setBreakpoint(key)}
              className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md transition-colors"
              title={label}
              style={{
                color:
                  breakpoint === key
                    ? "var(--relay-green-400)"
                    : "var(--relay-fg-muted)",
                background:
                  breakpoint === key ? "var(--relay-green-950)" : "transparent",
                border: `1px solid ${
                  breakpoint === key
                    ? "var(--relay-green-800)"
                    : "transparent"
                }`,
              }}
            >
              <Icon size={13} />
              <span className="hidden sm:inline">{label}</span>
            </button>
          ))}
        </div>

        {/* Right: width / status */}
        <div className="flex items-center gap-2">
          <span
            className="text-xs"
            style={{ color: "var(--relay-fg-subtle)" }}
          >
            {bp.key === "desktop" ? "Full width" : bp.width}
          </span>
          {!layout.published && (
            <span
              className="text-xs px-2 py-0.5 rounded-full"
              style={{
                background: "var(--relay-surface-2)",
                color: "var(--relay-fg-subtle)",
                border: "1px solid var(--relay-border)",
              }}
            >
              Unpublished
            </span>
          )}
          {layout.published && (
            <a
              href="#"
              className="flex items-center gap-1 text-xs transition-colors"
              style={{ color: "var(--relay-green-400)" }}
            >
              <span
                className="w-1.5 h-1.5 rounded-full"
                style={{ background: "var(--relay-green-400)" }}
              />
              Live
              <ChevronRight size={11} />
            </a>
          )}
        </div>
      </div>

      <p
        className="shrink-0 border-b px-4 py-2 text-[10px] leading-snug"
        style={{
          borderColor: "var(--relay-border)",
          color: "var(--relay-fg-subtle)",
          background: "var(--relay-bg)",
        }}
      >
        Canvas mirrors your synced Library presentation — Spotlight + sections here reshape how that catalog reads.
        Audience simulation uses the sticky bar below.
      </p>

      {/* Canvas scroll area — sticky “Viewing as” floats at top center of workspace */}
      <div className="relative flex min-h-0 flex-1 overflow-hidden">
        <DesignerMinimap
          layout={layout}
          collections={collections}
          activeSectionId={activeSectionId}
          pendingBlockPlacement={pendingBlockPlacement}
          onFocus={focusSection}
          onLayoutChange={onLayoutChange}
          onPendingBlockDrop={onPendingBlockDrop}
        />
        <div ref={scrollRootRef} className="flex-1 overflow-y-auto overflow-x-hidden">
          <div
            className="sticky top-0 z-30 flex justify-center px-3 pt-2 pb-2 pointer-events-none"
          >
            <div
              className="pointer-events-auto flex items-center gap-2 rounded-full border px-3 py-2 shadow-[0_8px_32px_rgba(0,0,0,0.35)] backdrop-blur-md"
              style={{
                background: "rgba(0,0,0,0.42)",
                borderColor: "rgba(255,255,255,0.12)",
              }}
            >
              <span
                className="shrink-0 text-[0.65rem] font-medium uppercase tracking-wide"
                style={{ color: "rgba(255,255,255,0.72)" }}
              >
                Viewing as
              </span>
              {useFacets ? (
                <FacetTierSwitcher
                  tierOrderIds={tierOrderIds}
                  tierTitleById={tierTitleById}
                  viewerMaxRank={viewerMaxRank}
                  onChange={(rank) => {
                    viewerTouchedRef.current = true;
                    setViewerMaxRank(rank);
                  }}
                />
              ) : (
                <LegacyTierSwitcher
                  value={viewerTier}
                  onChange={(tier) => {
                    viewerTouchedRef.current = true;
                    setViewerTier(tier);
                  }}
                />
              )}
            </div>
          </div>

          <div className="flex justify-center px-4 pb-8 pt-2">
        <div
          className="w-full transition-all duration-300"
          style={{ maxWidth: bp.key === "desktop" ? "100%" : bp.width }}
        >
          {/* Patron-facing page frame */}
          <div
            className="flex flex-col pb-16"
            style={{
              background: "var(--relay-bg)",
              borderRadius: radius,
              overflow: "hidden",
              border: "1px solid var(--relay-border)",
              gap: 0,
            }}
          >
            {/* Announcement banners — full bleed, above hero */}
            {announcementSections.map((ann) => (
              <SectionCanvasFrame
                key={ann.id}
                section={ann}
                active={activeSectionId === ann.id}
                selectedMediaCount={0}
                onSelect={() => selectSection(ann.id)}
                onSetPresentation={() => undefined}
                onMove={(delta) => moveSection(ann.id, delta)}
                onToggleVisible={() => updateSection(ann.id, (section) => ({ ...section, visible: false }))}
              >
                <AnnouncementPreview section={ann} fonts={fonts} />
              </SectionCanvasFrame>
            ))}

            {/* Hero */}
            <CreatorPublicHero model={publicHeroModel} radius="0px" fonts={fonts} />

            {/* Patron upgrade nudge — hidden when there is no higher paid tier to pitch */}
            <PatronUpgradeNudge
              useFacets={useFacets}
              viewerTier={viewerTier}
              viewerMaxRank={viewerMaxRank}
              tierOrderIds={tierOrderIds}
              tierTitleById={tierTitleById}
              facets={facets}
              accentColor={accentColor}
              fonts={fonts}
            />

            {/* Content sections — curated library uses same `PatronLayoutSections` as /patron/c */}
            {contentSections.length > 0 ? (
              <div className="flex flex-col gap-10 px-6 mt-8">
                {contentSections.map((section) => {
                  if (section.kind === "library") {
                    if (!firstLibrarySection || section.id !== firstLibrarySection.id) {
                      return null;
                    }
                    if (previewLayout.sections.length === 0) {
                      return (
                        <div
                          key="patron-curated-empty"
                          className="rounded-lg border px-4 py-6 text-center text-sm"
                          style={{
                            borderColor: "var(--relay-border)",
                            color: "var(--relay-fg-subtle)"
                          }}
                        >
                          Add a library block to mirror your published gallery layout here.
                        </div>
                      );
                    }
                    if (patronCanvasLayout.sections.length === 0) {
                      return (
                        <div
                          key="patron-curated-all-hidden"
                          className="rounded-lg border px-4 py-6 text-center text-sm"
                          style={{
                            borderColor: "var(--relay-border)",
                            color: "var(--relay-fg-subtle)"
                          }}
                        >
                          All library sections are hidden — show one in the Inspector to preview it
                          here.
                        </div>
                      );
                    }
                    return (
                      <div key="patron-curated" className="min-w-0" style={patronLibShellStyle}>
                        <PatronLayoutSections
                          layout={patronCanvasLayout}
                          sectionItems={sectionItems}
                          loading={layoutSectionsLoading}
                          onOpenItem={handleOpenPatronItem}
                          tierOrderIds={tierOrderIds}
                          tierTitleById={tierTitleById}
                          tierFacets={facets?.tiers ?? []}
                          membershipUrl={publicHeroModel.patreonProfileHref}
                          accentColor={
                            patronCanvasLayout.theme.accent_color?.trim() ||
                            publicHeroModel.accentColor
                          }
                          renderDesignerSectionChrome={({ apiSectionId, children }) => {
                            const mockSec = mockByApiId.get(apiSectionId);
                            if (!mockSec) {
                              return <div className="mb-10 last:mb-0">{children}</div>;
                            }
                            return (
                              <div className="mb-10 last:mb-0">
                                <SectionCanvasFrame
                                  section={mockSec}
                                  active={activeSectionId === mockSec.id}
                                  selectedMediaCount={
                                    selectedMediaSectionId === mockSec.id
                                      ? selectedMediaIds.size
                                      : 0
                                  }
                                  onSelect={() => selectSection(mockSec.id)}
                                  onSetPresentation={(style) =>
                                    setSectionPresentation(mockSec.id, style)
                                  }
                                  onMove={(delta) => moveSection(mockSec.id, delta)}
                                  onToggleVisible={() =>
                                    updateSection(mockSec.id, (current) => ({
                                      ...current,
                                      visible: false
                                    }))
                                  }
                                >
                                  {children}
                                </SectionCanvasFrame>
                              </div>
                            );
                          }}
                        />
                      </div>
                    );
                  }
                  return (
                    <SectionCanvasFrame
                      key={section.id}
                      section={section}
                      active={activeSectionId === section.id}
                      selectedMediaCount={
                        selectedMediaSectionId === section.id ? selectedMediaIds.size : 0
                      }
                      onSelect={() => selectSection(section.id)}
                      onSetPresentation={(style) => setSectionPresentation(section.id, style)}
                      onMove={(delta) => moveSection(section.id, delta)}
                      onToggleVisible={() =>
                        updateSection(section.id, (current) => ({ ...current, visible: false }))
                      }
                    >
                      <SectionDispatch
                        section={section}
                        collections={collections}
                        showBadges={layout.theme.showTierBadges}
                        radius={radius}
                        viewerTier={viewerTier}
                        viewerMaxRank={useFacets ? viewerMaxRank : -1}
                        lockedStyle={layout.theme.lockedArtStyle}
                        accentColor={accentColor}
                        fonts={fonts}
                        sectionItems={sectionItems}
                        selectedMediaIds={
                          selectedMediaSectionId === section.id ? selectedMediaIds : new Set()
                        }
                        onMediaSelect={handleMediaSelect}
                        tierOrderIds={tierOrderIds}
                        tierTitleById={tierTitleById}
                        facets={facets}
                      />
                    </SectionCanvasFrame>
                  );
                })}
              </div>
            ) : (
              <div
                className="flex flex-col items-center justify-center py-16 gap-2 mx-6 mt-8"
                style={{
                  border: "1px dashed var(--relay-border)",
                  borderRadius: radius,
                  color: "var(--relay-fg-subtle)",
                }}
              >
                <p className="text-sm">No visible sections</p>
                <p className="text-xs">
                  Toggle visibility in the Inspector to show sections here.
                </p>
              </div>
            )}

            {/* Footer footnote */}
            <div
              className="mx-6 mt-10 mb-6 flex items-center justify-center gap-1.5 text-xs"
              style={{ color: "var(--relay-fg-subtle)" }}
            >
              <Lock size={10} />
              <span>
                Viewing as{" "}
                {viewingAsLabel(
                  useFacets,
                  viewerMaxRank,
                  tierOrderIds,
                  tierTitleById,
                  viewerTier
                )}{" "}
                — content follows your Library
                visibility settings
              </span>
            </div>
          </div>
        </div>
          </div>
        </div>
      </div>
    </div>
  );
}

