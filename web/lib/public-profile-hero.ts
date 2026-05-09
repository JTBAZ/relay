import { RELAY_API_BASE, type PageLayout, type VisitorHeroData } from "@/lib/relay-api";

/** Same export path as `exportHeroCoverUrl` in `designer-layout-bridge.ts` (single source for WYSIWYG cover). */
export function publicProfileHeroCoverExportUrl(creatorId: string, mediaId: string): string {
  return `${RELAY_API_BASE}/api/v1/export/media/${encodeURIComponent(creatorId)}/${encodeURIComponent(mediaId)}/content`;
}

export type PublicProfileHeroPatreonLinkPosition = "below_avatar" | "below_bio";

/**
 * Plain data for the shared Designer + public hero shell (no designer-mock types).
 *
 * **Avatar (WYSIWYG):** `showAvatar` is always true — the UI shows a placeholder disk when
 * `avatarUrl` is missing so layout matches between Designer and `/patron/c/*`.
 *
 * **Cover:** `showCover` mirrors public behavior: `hero.show_cover === false` hides the strip;
 * when omitted, the strip is allowed and resolves export URL → Patreon banner (see builder).
 */
export type PublicProfileHeroModel = {
  coverImageUrl: string | null;
  showCover: boolean;
  avatarUrl: string | null;
  showAvatar: true;
  headline: string;
  heroPrimary: string | null;
  heroSecondary: string | null;
  /** Shown when both hero lines are empty (e.g. visitor env tagline). */
  fallbackTagline: string | null;
  patreonSlug: string | null;
  patreonProfileHref: string | null;
  showPatreonLink: boolean;
  patreonLinkPosition: PublicProfileHeroPatreonLinkPosition;
  showBio: boolean;
  accentColor: string;
  colorScheme: PageLayout["theme"]["color_scheme"];
};

export type BuildPublicProfileHeroModelArgs = {
  pageLayout: PageLayout | null | undefined;
  visitorHero: VisitorHeroData | null | undefined;
  creatorId: string;
  /**
   * When `visitor_hero` omits URLs / display name (static hosting), callers may pass the same
   * `NEXT_PUBLIC_*` fallbacks `VisitorGalleryView` uses.
   */
  patreonBannerFallback?: string;
  avatarUrlFallback?: string;
  displayNameFallback?: string;
  /** e.g. `NEXT_PUBLIC_RELAY_VISITOR_TAGLINE` — only used in UI when hero text is empty. */
  taglineWhenHeroTextEmpty?: string;
  /**
   * Patreon vanity slug when `visitor_hero.patreon_name` is absent (e.g. designer passes
   * campaign slug from sync separately from the facets payload).
   */
  patreonVanitySlug?: string | null;
};

function nonEmpty(s: string | undefined | null): string | null {
  const t = s?.trim();
  return t ? t : null;
}

/**
 * Builds the canonical hero view model for the public profile shell (patron route + Designer preview).
 * Rules follow `VisitorGalleryView` `mergedProfile` for cover, text stacking, and Patreon link flags.
 */
export function buildPublicProfileHeroModel(
  args: BuildPublicProfileHeroModelArgs
): PublicProfileHeroModel {
  const { pageLayout, visitorHero, creatorId } = args;
  const cid = creatorId.trim();

  const bannerFromPatreon =
    nonEmpty(visitorHero?.banner_url) ?? nonEmpty(args.patreonBannerFallback);
  const avatarRaw =
    nonEmpty(visitorHero?.avatar_url) ?? nonEmpty(args.avatarUrlFallback) ?? "";

  const displayFromHero =
    nonEmpty(visitorHero?.relay_display_name) ??
    nonEmpty(visitorHero?.patreon_name) ??
    nonEmpty(args.displayNameFallback) ??
    "";

  const patreonRaw =
    nonEmpty(visitorHero?.patreon_name) ?? nonEmpty(args.patreonVanitySlug) ?? null;
  const patreonSlug =
    patreonRaw && patreonRaw.length > 0 ? patreonRaw.toLowerCase() : null;
  const patreonProfileHref = patreonSlug ? `https://www.patreon.com/${patreonSlug}` : null;

  const showHeroCover = pageLayout?.hero?.show_cover !== false;
  const coverId = pageLayout?.hero?.cover_media_id?.trim();
  const layoutCoverUrl =
    showHeroCover && coverId && cid.length > 0
      ? publicProfileHeroCoverExportUrl(cid, coverId)
      : null;

  let coverImageUrl: string | null = null;
  if (showHeroCover) {
    const resolved = layoutCoverUrl || bannerFromPatreon;
    coverImageUrl = resolved && resolved.length > 0 ? resolved : null;
  }

  const headline =
    nonEmpty(pageLayout?.hero?.title) ??
    (displayFromHero.length > 0 ? displayFromHero : null) ??
    "Gallery";

  const subTrim = pageLayout?.hero?.subtitle?.trim() ?? "";
  const bioTrim = pageLayout?.hero?.bio?.trim() ?? "";
  const showLayoutBio = pageLayout?.theme?.show_bio ?? true;

  let heroPrimary: string | null = null;
  let heroSecondary: string | null = null;
  if (showLayoutBio && bioTrim.length > 0) {
    heroPrimary = bioTrim;
    if (subTrim.length > 0 && subTrim !== bioTrim) heroSecondary = subTrim;
  } else if (subTrim.length > 0) {
    heroPrimary = subTrim;
  }

  const showPatreonLink = pageLayout?.theme?.show_patreon_link ?? true;
  const patreonLinkPosition: PublicProfileHeroPatreonLinkPosition =
    pageLayout?.theme?.patreon_link_position === "below_avatar" ? "below_avatar" : "below_bio";

  const accentTrim = pageLayout?.theme?.accent_color?.trim();
  const accentColor =
    accentTrim && accentTrim.length > 0 ? accentTrim : "#00aa6f";

  const colorScheme = pageLayout?.theme?.color_scheme ?? "dark";

  const fallbackTagline = nonEmpty(args.taglineWhenHeroTextEmpty);

  return {
    coverImageUrl,
    showCover: showHeroCover,
    avatarUrl: avatarRaw.length > 0 ? avatarRaw : null,
    showAvatar: true,
    headline,
    heroPrimary,
    heroSecondary,
    fallbackTagline,
    patreonSlug,
    patreonProfileHref,
    showPatreonLink,
    patreonLinkPosition,
    showBio: showLayoutBio,
    accentColor,
    colorScheme
  };
}
