"use client";

import { useMemo, useState } from "react";
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
import { STUB_IMAGES, TIERS } from "@/lib/designer-mock";
import {
  RELAY_API_BASE,
  type FacetsData,
  type GalleryItem,
  type PageLayout as ApiPageLayout,
  type Collection as ApiCollection,
} from "@/lib/relay-api";
import {
  nextPaidTierAfterRank,
  isFreePublicAccessTier,
  RELAY_TIER_ALL_PATRONS,
} from "@/lib/tier-access";
import { designerPageLayoutToApi } from "@/lib/designer-layout-bridge";
import { sortGalleryItemsForArrangement } from "@/lib/gallery-item-sort";
import {
  previewLockState,
  tierKeyForGalleryItem,
} from "@/lib/designer-tier-map";
import { useLayoutSectionItems } from "@/lib/use-layout-section-items";

function galleryThumbUrl(item: GalleryItem | undefined, fallbackIndex: number): string {
  if (item?.has_export && item.content_url_path?.trim()) {
    return `${RELAY_API_BASE}${item.content_url_path}`;
  }
  return STUB_IMAGES[fallbackIndex % STUB_IMAGES.length];
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
  if (!showBadges || tier === "public") return null;
  const text = labelOverride?.trim() || TIER_LABEL[tier];
  return (
    <span
      className="absolute top-2 right-2 text-xs px-1.5 py-0.5 rounded-full font-medium"
      style={{
        background: "rgba(0,0,0,0.72)",
        color: TIER_COLOR[tier],
        border: `1px solid ${TIER_COLOR[tier]}`,
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
  tier,
  locked,
  unlockLabel,
  badgeTitle,
  showBadges,
  radius,
  lockedStyle,
  accentColor,
  imageUrl,
}: {
  index: number;
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
}) {
  const bg = imageUrl ?? STUB_IMAGES[index % STUB_IMAGES.length];

  return (
    <div
      className="relative overflow-hidden bg-center bg-cover aspect-square"
      style={{
        backgroundImage: `url(${bg})`,
        borderRadius: radius,
        border: "1px solid var(--relay-border)",
      }}
    >
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
    </div>
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
  const count = Math.min(section.itemLimit, 36);
  const gridCols = section.gridColumns ?? 3;
  const gridClass = GRID_COLS_CLASS[gridCols];

  const thumb = (i: number) => galleryThumbUrl(galleryItems[i], i);

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
    switch (layout) {
      case "grid":
        return (
          <div className={`grid ${gridClass} gap-1.5`}>
            {Array.from({ length: count }).map((_, i) => {
              const pl = lockAt(i);
              return (
              <GridItem
                key={galleryItems[i]?.media_id ?? `cell-${i}`}
                index={i}
                tier={cellTier(i)}
                locked={pl.locked}
                unlockLabel={pl.unlockLabel}
                badgeTitle={pl.badgeTitle}
                showBadges={showBadges}
                radius={radius}
                lockedStyle={lockedStyle}
                accentColor={accentColor}
                imageUrl={thumb(i)}
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
              return (
              <div
                key={galleryItems[i]?.media_id ?? `m-${i}`}
                className="relative overflow-hidden bg-center bg-cover"
                style={{
                  backgroundImage: `url(${thumb(i)})`,
                  borderRadius: radius,
                  border: "1px solid var(--relay-border)",
                  aspectRatio: i % 3 === 0 ? "3/4" : "4/3",
                }}
              >
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
              </div>
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
              return (
                <div
                  key={i}
                  className="flex items-center gap-3 relative overflow-hidden"
                  style={{
                    borderBottom: "1px solid var(--relay-border)",
                    paddingBottom: "8px",
                  }}
                >
                  <div
                    className="w-14 h-10 shrink-0 bg-center bg-cover relative overflow-hidden"
                    style={{
                      backgroundImage: `url(${thumb(i)})`,
                      borderRadius: radius,
                    }}
                  >
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
                </div>
              );
            })}
          </div>
        );

      case "featured": {
        const subCount = Math.max(0, count - 1);
        const h0 = lockAt(0);
        const ct0 = cellTier(0);
        return (
          <div className="flex flex-col gap-1.5">
            <div
              className="relative w-full overflow-hidden bg-center bg-cover"
              style={{
                backgroundImage: `url(${thumb(0)})`,
                borderRadius: radius,
                aspectRatio: "16/9",
                border: "1px solid var(--relay-border)",
              }}
            >
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
                return (
                <GridItem
                  key={galleryItems[idx]?.media_id ?? `f-${i}`}
                  index={idx}
                  tier={cellTier(idx)}
                  locked={pl.locked}
                  unlockLabel={pl.unlockLabel}
                  badgeTitle={pl.badgeTitle}
                  showBadges={showBadges}
                  radius={radius}
                  lockedStyle={lockedStyle}
                  accentColor={accentColor}
                  imageUrl={thumb(idx)}
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
              <div
                className="w-full aspect-square bg-center bg-cover"
                style={{ backgroundImage: `url(${item.imageUrl})` }}
              />
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

// ─── Hero preview ─────────────────────────────────────────────────────────────

function HeroPreview({
  layout,
  radius,
  fonts,
  patreonSlug,
  heroMembershipTiers,
}: {
  layout: PageLayout;
  radius: string;
  fonts: { heading: string; body: string };
  /** Lowercase Patreon vanity from campaign sync — shown when Show Patreon is on */
  patreonSlug: string | null;
  /** Paid campaign tiers for decorative hero row (mirrors visitor profile) */
  heroMembershipTiers: { id: string; title: string }[];
}) {
  const { hero, theme, displayName, bio, avatarUrl } = layout;
  const slug = patreonSlug?.trim().toLowerCase() || null;
  const showPatreon = Boolean(theme.showPatreonLink && slug);
  const belowAvatar = (theme.patreonLinkPosition ?? "below_bio") === "below_avatar";

  const bioTrim = bio.trim();
  const subTrim = hero.subline.trim();
  let primaryText: string | null = null;
  let secondaryText: string | null = null;
  if (theme.showBio && bioTrim) {
    primaryText = bioTrim;
    if (subTrim && subTrim !== bioTrim) secondaryText = subTrim;
  } else if (subTrim) {
    primaryText = subTrim;
  }

  const patreonEl = showPatreon ? (
    <a
      href={`https://www.patreon.com/${encodeURIComponent(slug!)}`}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center justify-center gap-1.5 text-xs font-medium transition-opacity hover:opacity-90"
      style={{ color: "var(--relay-green-400)", fontFamily: fonts.body }}
    >
      <ExternalLink size={12} />
      patreon.com/{slug}
    </a>
  ) : null;

  return (
    <div
      className="relative flex flex-col items-center justify-end overflow-hidden"
      style={{ minHeight: "min(52vh, 380px)", borderRadius: radius }}
    >
      {hero.showCover && (
        <div
          className="absolute inset-0 bg-center bg-cover"
          style={{ backgroundImage: `url(${hero.coverUrl})` }}
        />
      )}
      <div
        className="absolute inset-0"
        style={{
          background: hero.showCover
            ? "linear-gradient(to bottom, rgba(0,0,0,0.2) 0%, rgba(0,0,0,0.82) 100%)"
            : "var(--relay-surface-2)",
        }}
      />
      <div
        className="relative z-10 w-full flex flex-col items-center gap-4 px-6 pb-10 pt-8"
        style={{ textAlign: "center" }}
      >
        {hero.showAvatar && (
          <img
            src={avatarUrl}
            alt={`${displayName} avatar`}
            className="rounded-full object-cover shrink-0 shadow-[0_12px_40px_rgba(0,0,0,0.45)] ring-2 ring-white/25"
            style={{
              width: "96px",
              height: "96px",
            }}
          />
        )}
        {belowAvatar && showPatreon ? (
          <div className="flex w-full justify-center">{patreonEl}</div>
        ) : null}
        <div className="flex w-full max-w-lg flex-col items-center gap-2">
          <h1
            className="font-bold text-balance tracking-tight"
            style={{
              color: "var(--relay-fg)",
              fontSize: "clamp(1.5rem, 2.8vw, 2rem)",
              lineHeight: 1.15,
              fontFamily: fonts.heading,
            }}
          >
            {hero.headline}
          </h1>
          {primaryText ? (
            <p
              className="text-pretty text-[0.95rem] font-medium"
              style={{
                color: "rgba(249,250,251,0.88)",
                lineHeight: 1.45,
                fontFamily: fonts.body,
              }}
            >
              {primaryText}
            </p>
          ) : null}
          {secondaryText ? (
            <p
              className="text-pretty text-[0.8125rem]"
              style={{
                color: "rgba(249,250,251,0.65)",
                lineHeight: 1.45,
                fontFamily: fonts.body,
              }}
            >
              {secondaryText}
            </p>
          ) : null}
          {!belowAvatar && showPatreon ? patreonEl : null}
        </div>
        {theme.showTierBadges && heroMembershipTiers.length > 0 ? (
          <div className="flex max-w-lg flex-wrap justify-center gap-1.5">
            {heroMembershipTiers.map((t) => (
              <span
                key={t.id}
                className="rounded-full border px-2.5 py-0.5 text-[10px] font-medium"
                style={{
                  borderColor: "rgba(255,255,255,0.14)",
                  background: "rgba(0,0,0,0.35)",
                  color: "rgba(249,250,251,0.78)",
                  fontFamily: fonts.body,
                }}
              >
                {t.title}
              </span>
            ))}
          </div>
        ) : null}
      </div>
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
function resolveAccent(_theme: PageLayout["theme"]): string {
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

// ─── Canvas Preview ───────────────────────────────────────────────────────────

interface CanvasPreviewProps {
  layout: PageLayout;
  collections: Collection[];
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
  creatorId,
  apiLayout,
  apiCollections,
  tierOrderIds,
  tierTitleById,
  facets,
  patreonSlug,
}: CanvasPreviewProps) {
  const [breakpoint, setBreakpoint] = useState<BpKey>("desktop");
  const [viewerTier, setViewerTier] = useState<TierKey>("public");
  const [viewerMaxRank, setViewerMaxRank] = useState(-1);

  const useFacets = tierOrderIds.length > 0;

  const previewLayout = useMemo(
    () => designerPageLayoutToApi(layout, apiLayout),
    [layout, apiLayout]
  );

  const { sectionItems } = useLayoutSectionItems(
    previewLayout,
    creatorId,
    apiCollections,
    { visitor: false }
  );

  const sortedSectionItems = useMemo(() => {
    const mode = layout.theme.galleryArrangement ?? "chronological";
    const out: Record<string, GalleryItem[]> = {};
    for (const [id, items] of Object.entries(sectionItems)) {
      out[id] = sortGalleryItemsForArrangement(items, mode, tierOrderIds);
    }
    return out;
  }, [sectionItems, layout.theme.galleryArrangement, tierOrderIds]);

  const heroMembershipTiers = useMemo(() => {
    const tiers = facets?.tiers;
    if (!tiers?.length) return [];
    return [...tiers]
      .filter(
        (t) => !isFreePublicAccessTier(t) && t.tier_id !== RELAY_TIER_ALL_PATRONS
      )
      .sort((a, b) => (a.amount_cents ?? 0) - (b.amount_cents ?? 0))
      .map((t) => ({ id: t.tier_id, title: t.title.trim() }))
      .filter((x) => x.title.length > 0);
  }, [facets?.tiers]);

  const bp = BREAKPOINTS.find((b) => b.key === breakpoint)!;
  const visibleSections = layout.sections.filter((s) => s.visible);
  const radius = RADIUS_MAP[layout.theme.radius] ?? "8px";
  const accentColor = resolveAccent(layout.theme);
  const fonts = TYPOGRAPHY_FONTS[layout.theme.typography] ?? TYPOGRAPHY_FONTS.editorial;

  // Split announcements (full-bleed) from content sections (padded)
  const announcementSections = visibleSections.filter(
    (s) => s.kind === "announcement"
  ) as AnnouncementBanner[];
  const contentSections = visibleSections.filter(
    (s) => s.kind !== "announcement"
  );

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

      {/* Canvas scroll area — sticky “Viewing as” floats at top center of workspace */}
      <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="flex-1 overflow-y-auto overflow-x-hidden">
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
                  onChange={setViewerMaxRank}
                />
              ) : (
                <LegacyTierSwitcher value={viewerTier} onChange={setViewerTier} />
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
              <AnnouncementPreview key={ann.id} section={ann} fonts={fonts} />
            ))}

            {/* Hero */}
            <HeroPreview
              layout={layout}
              radius="0px"
              fonts={fonts}
              patreonSlug={patreonSlug}
              heroMembershipTiers={heroMembershipTiers}
            />

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

            {/* Content sections */}
            {contentSections.length > 0 ? (
              <div className="flex flex-col gap-10 px-6 mt-8">
                {contentSections.map((section) => (
                  <SectionDispatch
                    key={section.id}
                    section={section}
                    collections={collections}
                    showBadges={layout.theme.showTierBadges}
                    radius={radius}
                    viewerTier={viewerTier}
                    viewerMaxRank={useFacets ? viewerMaxRank : -1}
                    lockedStyle={layout.theme.lockedArtStyle}
                    accentColor={accentColor}
                    fonts={fonts}
                    sectionItems={sortedSectionItems}
                    tierOrderIds={tierOrderIds}
                    tierTitleById={tierTitleById}
                    facets={facets}
                  />
                ))}
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

