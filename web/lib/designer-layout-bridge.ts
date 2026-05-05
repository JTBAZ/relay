import {
  RELAY_API_BASE,
  type PageLayout as ApiPageLayout,
  type PageSection as ApiPageSection,
  type Collection as ApiCollection,
  type LayoutMode,
  type VisitorHeroData,
  type FacetsData
} from "@/lib/relay-api";
import type {
  PageLayout as DesignerPageLayout,
  Collection as DesignerCollection,
  LibrarySection,
  SectionLayout,
  ThemeAccent
} from "@/lib/designer-mock";

function exportHeroCoverUrl(creatorId: string, mediaId: string): string {
  return `${RELAY_API_BASE}/api/v1/export/media/${encodeURIComponent(creatorId)}/${encodeURIComponent(mediaId)}/content`;
}

/** Default hero subline + bio when the saved layout has no sections yet (designer onboarding). */
export const DEFAULT_DESIGNER_SUBLINE = "Documentary photography. Land, access, light.";
export const DEFAULT_DESIGNER_BIO =
  "Documentary photographer. Long-form storytelling on access, land, and light.";

/** Paid Patreon tiers (cheapest→expensive), excludes public/free sentinels — mirrors Designer canvas tier picker. */
export function paidTierIdsFromFacets(facets: FacetsData | null | undefined): string[] {
  if (!facets?.tiers?.length) return [];
  return [...facets.tiers]
    .filter((t) => {
      if (t.tier_id === "relay_tier_public" || t.tier_id === "relay_tier_all_patrons") return false;
      if (typeof t.amount_cents === "number" && t.amount_cents === 0) return false;
      const n = t.title.trim().toLowerCase();
      if (n === "public" || n === "free") return false;
      return true;
    })
    .sort((a, b) => (a.amount_cents ?? 0) - (b.amount_cents ?? 0))
    .map((t) => t.tier_id);
}

function tierFromCollection(c: ApiCollection): import("@/lib/designer-mock").TierKey {
  if (!c.access_ceiling_tier_id?.trim()) return "public";
  return "supporter";
}

export function apiCollectionsToDesigner(collections: ApiCollection[]): DesignerCollection[] {
  return [...collections]
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((c) => ({
      slug: c.collection_id,
      label: c.title,
      itemCount: c.post_ids.length,
      tier: tierFromCollection(c)
    }));
}

function themeAccentFromApi(scheme: ApiPageLayout["theme"]["color_scheme"]): ThemeAccent {
  if (scheme === "warm") return "warm";
  if (scheme === "light") return "neutral";
  return "green";
}

export function designerSectionLayoutToApiMode(layout: SectionLayout): LayoutMode {
  if (layout === "list") return "list";
  if (layout === "masonry") return "masonry";
  if (layout === "featured") return "featured";
  return "grid";
}

function apiSectionId(id: string): string {
  if (id.startsWith("sec_")) return id;
  return `sec_${crypto.randomUUID()}`;
}

export function apiPageLayoutToDesigner(
  api: ApiPageLayout,
  collections: ApiCollection[],
  creatorId: string,
  visitorHero?: VisitorHeroData | null
): DesignerPageLayout {
  const sorted = [...api.sections].sort((a, b) => a.sort_order - b.sort_order);
  const hero = api.hero;
  const coverId = hero?.cover_media_id?.trim();
  const bannerUrl = visitorHero?.banner_url?.trim();
  const avatarUrl = visitorHero?.avatar_url?.trim();
  const displayFromHero =
    visitorHero?.relay_display_name?.trim() || visitorHero?.patreon_name?.trim() || "";
  const useCover =
    typeof hero?.show_cover === "boolean"
      ? hero.show_cover
      : Boolean(coverId || bannerUrl);
  const coverUrl =
    useCover && coverId
      ? exportHeroCoverUrl(creatorId, coverId)
      : useCover && bannerUrl
        ? bannerUrl
        : "";
  const fallbackCollectionId = collections[0]?.collection_id ?? "";

  const librarySections: LibrarySection[] = sorted.map((sec) => {
    let collectionSlug = fallbackCollectionId;
    let filterQuery: Record<string, unknown> | undefined;
    if (sec.source.type === "collection") {
      collectionSlug = sec.source.collection_id;
    } else if (sec.source.type === "filter") {
      filterQuery = { ...sec.source.query };
      collectionSlug = fallbackCollectionId;
    }

    let layout: SectionLayout = "grid";
    if (sec.layout === "masonry") layout = "masonry";
    else if (sec.layout === "list") layout = "list";
    else if (sec.layout === "featured") layout = "featured";

    const gc = sec.columns;
    const gridColumns: 2 | 3 | 4 | undefined =
      gc === 2 || gc === 3 || gc === 4 ? gc : undefined;

    return {
      kind: "library",
      id: sec.section_id,
      label: sec.title,
      collectionSlug,
      ...(filterQuery !== undefined ? { filterQuery } : {}),
      layout,
      itemLimit: sec.max_items ?? 12,
      ...(gridColumns !== undefined ? { gridColumns } : {}),
      visible: true
    };
  });

  const headline = hero?.title?.trim() || displayFromHero || "Gallery";
  const useAvatar = Boolean(avatarUrl);

  const emptyLayout = sorted.length === 0;
  const showBioDefault = api.theme.show_bio ?? true;
  const bioFromApi = hero?.bio?.trim() ?? "";
  const bioText =
    bioFromApi ||
    (emptyLayout && showBioDefault ? DEFAULT_DESIGNER_BIO : "");
  const sublineText =
    hero?.subtitle?.trim() ?? (emptyLayout ? DEFAULT_DESIGNER_SUBLINE : "");

  return {
    creatorSlug: creatorId,
    displayName: hero?.title?.trim() || displayFromHero || creatorId,
    bio: bioText,
    avatarUrl: avatarUrl || "",
    theme: {
      accent: themeAccentFromApi(api.theme.color_scheme),
      accentCustom: api.theme.accent_color ?? "#40916C",
      radius: "md",
      showBio: showBioDefault,
      showTierBadges: api.theme.show_tier_badges ?? true,
      showPatreonLink: api.theme.show_patreon_link ?? true,
      patreonLinkPosition:
        api.theme.patreon_link_position === "below_avatar" ? "below_avatar" : "below_bio",
      galleryArrangement: api.theme.gallery_arrangement === "tier" ? "tier" : "chronological",
      lockedArtStyle: "blurred",
      typography: "editorial"
    },
    hero: {
      headline,
      subline: sublineText,
      showAvatar: useAvatar,
      showCover: useCover,
      coverUrl,
      ...(coverId ? { coverMediaId: coverId } : {})
    },
    sections: librarySections,
    lastPublishedAt: null,
    published: false
  };
}

export type SeedDesignerLayoutOptions = {
  /** When non-empty, default gallery arrangement uses tier ordering for a tier-ladder-ready profile. */
  paidTierIds?: string[];
};

/**
 * When the API has no sections yet, seed the minimap with one simple chronological gallery.
 * Collections and tier galleries are creator-driven blocks the user can drag in afterwards.
 */
export function seedEmptyDesignerLayout(
  d: DesignerPageLayout,
  collections: ApiCollection[],
  options?: SeedDesignerLayoutOptions
): DesignerPageLayout {
  void options;
  const fallbackSlug = [...collections].sort((a, b) => a.sort_order - b.sort_order)[0]?.collection_id ?? "";

  return {
    ...d,
    theme: {
      ...d.theme,
      galleryArrangement: "chronological"
    },
    sections: [
      {
        kind: "library",
        id: `sec_${crypto.randomUUID()}`,
        label: "Chronological Gallery",
        collectionSlug: fallbackSlug,
        filterQuery: {},
        layout: "grid",
        itemLimit: 36,
        gridColumns: 3,
        visible: true
      }
    ]
  };
}

/** Keep shop / engagement / announcement rows client-side after a save+reload from API. */
export function mergeDesignerAfterSave(
  prev: DesignerPageLayout,
  fromApi: DesignerPageLayout
): DesignerPageLayout {
  const proto = prev.sections.filter((s) => s.kind !== "library");
  return {
    ...fromApi,
    theme: {
      ...fromApi.theme,
      showTierBadges: fromApi.theme.showTierBadges ?? prev.theme.showTierBadges,
      showBio: fromApi.theme.showBio ?? prev.theme.showBio,
      showPatreonLink: fromApi.theme.showPatreonLink ?? prev.theme.showPatreonLink,
      patreonLinkPosition: fromApi.theme.patreonLinkPosition ?? prev.theme.patreonLinkPosition,
      galleryArrangement: fromApi.theme.galleryArrangement ?? prev.theme.galleryArrangement
    },
    sections: [...fromApi.sections, ...proto]
  };
}

function resolveAccentForApi(mock: DesignerPageLayout["theme"]): {
  color_scheme: ApiPageLayout["theme"]["color_scheme"];
  accent_color?: string;
} {
  if (mock.accent === "custom") {
    return { color_scheme: "dark", accent_color: mock.accentCustom };
  }
  if (mock.accent === "warm") {
    return { color_scheme: "warm", accent_color: mock.accentCustom || "#d97706" };
  }
  if (mock.accent === "neutral") {
    return { color_scheme: "light", accent_color: mock.accentCustom || "#6b7280" };
  }
  return { color_scheme: "dark", accent_color: mock.accentCustom || "#40916C" };
}

export function designerPageLayoutToApi(
  mock: DesignerPageLayout,
  base: ApiPageLayout
): ApiPageLayout {
  const librarySections = mock.sections.filter((s): s is LibrarySection => s.kind === "library");
  const apiSections: ApiPageSection[] = librarySections.map((s, i) => {
    const source: ApiPageSection["source"] =
      s.filterQuery !== undefined
        ? { type: "filter", query: { ...s.filterQuery } }
        : { type: "collection", collection_id: s.collectionSlug };
    return {
      section_id: apiSectionId(s.id),
      title: s.label,
      source,
      layout: designerSectionLayoutToApiMode(s.layout),
      columns: s.gridColumns ?? 3,
      max_items: s.itemLimit,
      sort_order: i
    };
  });

  const { color_scheme, accent_color } = resolveAccentForApi(mock.theme);

  return {
    ...base,
    theme: {
      color_scheme,
      accent_color,
      show_bio: mock.theme.showBio,
      show_tier_badges: mock.theme.showTierBadges,
      show_patreon_link: mock.theme.showPatreonLink,
      patreon_link_position: mock.theme.patreonLinkPosition ?? "below_bio",
      gallery_arrangement: mock.theme.galleryArrangement
    },
    hero: {
      title: mock.hero.headline,
      subtitle: mock.hero.subline.trim() ? mock.hero.subline : undefined,
      show_cover: mock.hero.showCover,
      cover_media_id: mock.hero.showCover
        ? (mock.hero.coverMediaId?.trim() || base.hero?.cover_media_id)
        : undefined,
      bio: mock.bio.trim() ? mock.bio.trim() : undefined
    },
    sections: apiSections
  };
}
