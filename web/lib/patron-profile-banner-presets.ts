/**
 * Default patron profile cover — single Relay-branded ink-wash banner.
 * Served from /patron-profile/banners/patron-banner-default.png (3:1).
 *
 * When `banner_url` is unset on PatronProfile, use this asset.
 * Custom uploads override via `banner_url` on the profile record.
 */

export const PATRON_PROFILE_DEFAULT_BANNER_SRC =
  "/patron-profile/banners/patron-banner-default.png";

/** Cover image URL: custom upload wins; otherwise the default banner. */
export function resolvePatronProfileBannerSrc(args: {
  bannerUrl: string | null | undefined;
  handle?: string | null | undefined;
}): { src: string } {
  void args.handle;
  const custom = args.bannerUrl?.trim();
  if (custom) {
    return { src: custom };
  }
  return { src: PATRON_PROFILE_DEFAULT_BANNER_SRC };
}
