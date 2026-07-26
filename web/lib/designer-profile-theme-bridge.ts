/**
 * Round-trip Site Designer UI state ↔ API `PageLayout` (persisted draft + publish gate).
 */

import type { GalleryArrangement, LayoutMode, PageLayout, PageSection } from "@/lib/relay-api";

/** Matches DesignerView `GalleryLayout` without importing the huge module. */
export type DesignerGalleryLayout = "grid" | "masonry" | "showcase" | "editorial" | "list";

export type DesignerHeroFields = {
  relay_display_name?: string | null;
  discipline?: string | null;
  bio?: string | null;
};

export type DesignerThemeSectionInput = {
  id: string;
  title: string;
  layout: DesignerGalleryLayout;
  visible: boolean;
  order: number;
  itemIds: string[];
};

/** Profile spotlight / Featured chooser — mirrored in `DesignerView` `FeaturedBlock`. */
export type DesignerFeaturedBlock =
  | { type: "latest" }
  | { type: "collection"; collectionId: string }
  | { type: "media"; mediaId: string }
  | { type: "post"; postId: string };

export type DesignerProfileThemeInput = {
  heroStyle: "full" | "split" | "minimal" | "banner";
  showBio: boolean;
  showSocials: boolean;
  showTierBadges: boolean;
  accentColor: "emerald" | "violet" | "gold" | "rose" | "sky" | "custom";
  customAccent: string;
  defaultLayout: DesignerGalleryLayout;
  sections: DesignerThemeSectionInput[];
  featured: DesignerFeaturedBlock;
};

const ACCENT_HEX: Record<string, string> = {
  emerald: "#00c781",
  violet: "#a78bfa",
  gold: "#d4af37",
  rose: "#fb7185",
  sky: "#38bdf8"
};

export function galleryLayoutToLayoutMode(gl: DesignerGalleryLayout): LayoutMode {
  if (gl === "showcase") return "featured";
  if (gl === "editorial") return "grid";
  if (gl === "masonry") return "masonry";
  if (gl === "list") return "list";
  return "grid";
}

export function layoutModeToGalleryLayout(lm: LayoutMode): DesignerGalleryLayout {
  if (lm === "featured") return "showcase";
  if (lm === "masonry") return "masonry";
  if (lm === "list") return "list";
  return "grid";
}

function defaultLayoutArrangement(defaultLayout: DesignerGalleryLayout): GalleryArrangement {
  return defaultLayout === "masonry" ? "tier" : "chronological";
}

function sanitizeSectionKey(id: string): string {
  return id.replace(/[^a-zA-Z0-9_]/g, "_").slice(0, 64) || "section";
}

function resolvePageSectionId(
  sec: DesignerThemeSectionInput,
  previousSorted: PageSection[],
  fallbackIndex: number
): PageSection | undefined {
  if (sec.id.startsWith("collection-")) {
    const collectionId = sec.id.slice("collection-".length);
    return previousSorted.find(
      (p) => p.source.type === "collection" && p.source.collection_id === collectionId
    );
  }
  if (sec.id.startsWith("manual-")) {
    const sid = sec.id.slice("manual-".length);
    return previousSorted.find((p) => p.section_id === sid);
  }
  if (sec.id.startsWith("filter-")) {
    const sid = sec.id.slice("filter-".length);
    return previousSorted.find((p) => p.section_id === sid);
  }
  /**
   * `sectionsFromLiveLibrary` / starter sections use bare ids until hydrated from GET layout.
   * Do not use `previousSorted[fallbackIndex]` here: a leading collection (or reordering) would
   * bind the wrong row and lose `layout` (e.g. Featured showcase → grid on the public page).
   * Match the Nth filter in sort order, else the Nth manual section.
   */
  const filtersInOrder = previousSorted.filter((p) => p.source.type === "filter");
  const manualsInOrder = previousSorted.filter((p) => p.source.type === "manual");
  if (sec.id === "featured") {
    return filtersInOrder[0] ?? manualsInOrder[0];
  }
  if (sec.id === "gallery") {
    return filtersInOrder[1] ?? manualsInOrder[1];
  }
  if (sec.id === "process") {
    return filtersInOrder[2] ?? manualsInOrder[2];
  }
  return previousSorted[fallbackIndex];
}

function firstMediaIdForPost(
  postId: string,
  catalog: Record<string, { postId: string }>
): string | undefined {
  for (const [mid, m] of Object.entries(catalog)) {
    if (m.postId === postId) return mid;
  }
  return undefined;
}

function itemIdsForCollection(
  collectionId: string,
  collections: Array<{ collection_id: string; post_ids: string[] }>,
  catalog: Record<string, { postId: string }>
): string[] {
  const col = collections.find((c) => c.collection_id === collectionId);
  if (!col) return [];
  const ids: string[] = [];
  for (const pid of col.post_ids) {
    const mid = firstMediaIdForPost(pid, catalog);
    if (mid) ids.push(mid);
  }
  return ids.slice(0, 48);
}

/**
 * Spotlight row = first visible non-collection section (“Featured” slot in the default template).
 * After layout hydration, ids are `filter-*` / `manual-*`, so we cannot key off `id === "featured"`.
 */
export function pickDesignerSpotlightSection(
  allSections: DesignerThemeSectionInput[]
): DesignerThemeSectionInput | undefined {
  const visible = allSections.filter((s) => s.visible).sort((a, b) => a.order - b.order);
  const candidates = visible.filter((s) => !s.id.startsWith("collection-"));
  if (candidates.length === 0) return undefined;
  const minOrder = Math.min(...candidates.map((s) => s.order));
  return candidates.find((s) => s.order === minOrder);
}

export function isDesignerSpotlightSection(
  section: DesignerThemeSectionInput,
  allSections: DesignerThemeSectionInput[]
): boolean {
  if (section.id === "featured") return true;
  const spotlight = pickDesignerSpotlightSection(allSections);
  return spotlight !== undefined && spotlight.id === section.id;
}

function pickPageLayoutSpotlightSection(layout: PageLayout): PageSection | undefined {
  const sorted = [...layout.sections].sort((a, b) => a.sort_order - b.sort_order);
  const candidates = sorted.filter((s) => s.source.type !== "collection");
  if (candidates.length === 0) return undefined;
  const minOrder = Math.min(...candidates.map((s) => s.sort_order));
  return candidates.find((s) => s.sort_order === minOrder);
}

export function featuredBlockFromPageLayoutSpotlight(
  spotlight: PageSection | undefined,
  mediaCatalog: Record<string, { postId: string }>
): DesignerFeaturedBlock {
  if (!spotlight) return { type: "latest" };
  const src = spotlight.source;
  if (src.type === "filter") {
    return { type: "latest" };
  }
  if (src.type === "collection") {
    return { type: "collection", collectionId: src.collection_id };
  }
  const ids = src.post_ids.filter((p) => Boolean(p?.trim()));
  if (ids.length === 1) {
    return { type: "post", postId: ids[0]! };
  }
  if (ids.length === 0) {
    return { type: "latest" };
  }
  const firstPid = ids[0]!;
  return firstMediaIdForPost(firstPid, mediaCatalog)
    ? { type: "post", postId: firstPid }
    : { type: "latest" };
}

function pageSectionSourceForFeatured(
  featured: DesignerFeaturedBlock,
  mediaPostId: (mediaId: string) => string | undefined,
  collections: Array<{ collection_id: string; post_ids: string[] }>
): PageSection["source"] {
  if (featured.type === "latest") {
    return { type: "filter", query: {} };
  }
  if (featured.type === "post") {
    const pid = featured.postId.trim();
    return { type: "manual", post_ids: pid ? [pid] : [] };
  }
  if (featured.type === "media") {
    const pid = mediaPostId(featured.mediaId);
    return { type: "manual", post_ids: pid ? [pid] : [] };
  }
  if (featured.type === "collection") {
    const col = collections.find((c) => c.collection_id === featured.collectionId);
    const postIds = col?.post_ids?.slice(0, 48).filter(Boolean) ?? [];
    return { type: "manual", post_ids: postIds };
  }
  return { type: "filter", query: {} };
}

function designerSectionToPageSection(
  sec: DesignerThemeSectionInput,
  sectionId: string,
  mediaPostId: (mediaId: string) => string | undefined
): PageSection {
  const layout = galleryLayoutToLayoutMode(sec.layout);
  const sort_order = sec.order;
  if (sec.id.startsWith("collection-")) {
    const collectionId = sec.id.slice("collection-".length);
    return {
      section_id: sectionId,
      title: sec.title,
      source: { type: "collection", collection_id: collectionId },
      layout,
      sort_order
    };
  }
  const postIds = Array.from(
    new Set(
      sec.itemIds
        .map((mid) => mediaPostId(mid))
        .filter((pid): pid is string => Boolean(pid && pid.length > 0))
    )
  );
  return {
    section_id: sectionId,
    title: sec.title,
    source: { type: "manual", post_ids: postIds },
    layout,
    sort_order
  };
}

export function buildPageLayoutFromDesignerState(args: {
  creatorId: string;
  theme: DesignerProfileThemeInput;
  hero: DesignerHeroFields | null;
  mediaCatalog: Record<string, { postId: string }>;
  collections: Array<{ collection_id: string; post_ids: string[] }>;
  previousLayout?: PageLayout | null;
}): PageLayout {
  const { creatorId, theme, hero, mediaCatalog, collections, previousLayout } = args;
  const accentHex =
    theme.accentColor === "custom"
      ? theme.customAccent.trim() || "#00c781"
      : ACCENT_HEX[theme.accentColor] ?? "#00c781";

  const previousSorted = [...(previousLayout?.sections ?? [])].sort(
    (a, b) => a.sort_order - b.sort_order
  );

  const visibleSections = theme.sections
    .filter((s) => s.visible)
    .sort((a, b) => a.order - b.order);

  const mediaPostId = (mediaId: string) => mediaCatalog[mediaId]?.postId;

  const sections: PageSection[] = visibleSections.map((sec, index) => {
    const matched = resolvePageSectionId(sec, previousSorted, index);
    const sectionId =
      matched?.section_id ??
      (sec.id.startsWith("manual-") ? sec.id.slice("manual-".length) : null) ??
      (sec.id.startsWith("filter-") ? sec.id.slice("filter-".length) : null) ??
      `sec_${sanitizeSectionKey(sec.id)}`;
    const layoutLm = galleryLayoutToLayoutMode(sec.layout);
    const sort_order = sec.order;

    if (isDesignerSpotlightSection(sec, theme.sections)) {
      return {
        section_id: sectionId,
        title: sec.title,
        source: pageSectionSourceForFeatured(theme.featured, mediaPostId, collections),
        layout: layoutLm,
        sort_order
      };
    }

    if (matched?.source.type === "filter") {
      return {
        section_id: sectionId,
        title: sec.title,
        source: matched.source,
        layout: layoutLm,
        sort_order
      };
    }
    return designerSectionToPageSection(sec, sectionId, mediaPostId);
  });

  const title = hero?.relay_display_name?.trim() || "Creator";
  const subtitle = hero?.discipline?.trim() || undefined;
  const bio = theme.showBio ? hero?.bio?.trim() || undefined : undefined;

  return {
    creator_id: creatorId.trim(),
    theme: {
      color_scheme: "dark",
      accent_color: accentHex,
      show_bio: theme.showBio,
      show_tier_badges: theme.showTierBadges,
      show_patreon_link: theme.showSocials,
      patreon_link_position: "below_bio",
      gallery_arrangement: defaultLayoutArrangement(theme.defaultLayout)
    },
    hero: {
      title,
      subtitle,
      bio,
      show_cover: theme.heroStyle !== "minimal"
    },
    sections,
    updated_at: new Date().toISOString()
  };
}

export function profileThemePatchFromPageLayout(
  layout: PageLayout,
  mediaCatalog: Record<string, { postId: string }>,
  collections: Array<{ collection_id: string; post_ids: string[] }>
): Pick<
  DesignerProfileThemeInput,
  | "showBio"
  | "showSocials"
  | "showTierBadges"
  | "accentColor"
  | "customAccent"
  | "defaultLayout"
  | "sections"
  | "featured"
> & {
  heroStyle: DesignerProfileThemeInput["heroStyle"];
} {
  const accent = layout.theme.accent_color?.trim() ?? "";
  let accentColor: DesignerProfileThemeInput["accentColor"] = "emerald";
  let customAccent = "#00c781";
  if (accent) {
    const entry = Object.entries(ACCENT_HEX).find(([, hex]) => hex.toLowerCase() === accent.toLowerCase());
    if (entry) {
      accentColor = entry[0] as DesignerProfileThemeInput["accentColor"];
    } else {
      accentColor = "custom";
      customAccent = accent;
    }
  }

  const defaultLayout: DesignerGalleryLayout = layout.theme.gallery_arrangement === "tier" ? "masonry" : "grid";

  const sections: DesignerThemeSectionInput[] = [...layout.sections]
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((sec) => {
      const layoutGl = layoutModeToGalleryLayout(sec.layout);
      if (sec.source.type === "collection") {
        const cid = sec.source.collection_id;
        return {
          id: `collection-${cid}`,
          title: sec.title,
          layout: layoutGl,
          visible: true,
          order: sec.sort_order,
          itemIds: itemIdsForCollection(cid, collections, mediaCatalog)
        };
      }
      if (sec.source.type === "manual") {
        const itemIds = sec.source.post_ids
          .map((pid) => firstMediaIdForPost(pid, mediaCatalog))
          .filter((id): id is string => Boolean(id));
        return {
          id: `manual-${sec.section_id}`,
          title: sec.title,
          layout: layoutGl,
          visible: true,
          order: sec.sort_order,
          itemIds
        };
      }
      return {
        id: `filter-${sec.section_id}`,
        title: sec.title,
        layout: layoutGl,
        visible: true,
        order: sec.sort_order,
        itemIds: []
      };
    });

  const heroStyle: DesignerProfileThemeInput["heroStyle"] =
    layout.hero?.show_cover === false ? "minimal" : "full";

  const spotlightSec = pickPageLayoutSpotlightSection(layout);
  const featured = featuredBlockFromPageLayoutSpotlight(spotlightSec, mediaCatalog);

  return {
    heroStyle,
    showBio: layout.theme.show_bio ?? true,
    showSocials: layout.theme.show_patreon_link ?? true,
    showTierBadges: layout.theme.show_tier_badges ?? true,
    accentColor,
    customAccent,
    defaultLayout,
    featured,
    sections
  };
}
