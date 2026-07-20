/** Product destinations for Active Posts presence (matches chip kit). */
export const PRESENCE_PRODUCT_DESTINATIONS = [
  "patreon",
  "x",
  "deviantart",
  "bluesky",
] as const;

export type PresenceProductDestination = (typeof PRESENCE_PRODUCT_DESTINATIONS)[number];

function isProductDestination(value: string): value is PresenceProductDestination {
  return (PRESENCE_PRODUCT_DESTINATIONS as readonly string[]).includes(value);
}

/** Minimal shape matching `GalleryItem.distribution_summary`. */
export type DistributionSummaryLike = {
  destinations?: Array<{
    destination: string;
    attempt_status?: string | null;
    external_url?: string | null;
  }>;
} | null | undefined;

export type PresentDestination = {
  destination: PresenceProductDestination;
  external_url: string | null;
};

export type PresenceLists = {
  present: PresentDestination[];
  missing: PresenceProductDestination[];
};

/** Align with GalleryGridTile: posted attempt or non-empty external URL. */
export function isDestinationPresent(row: {
  attempt_status?: string | null;
  external_url?: string | null;
}): boolean {
  const url = row.external_url?.trim();
  return row.attempt_status === "posted" || Boolean(url);
}

/**
 * Map a live distribution summary onto Present / Ghost destination lists.
 * Product destinations with no posted/url row are Ghost (including draft/sent-only).
 */
export function summaryToPresence(
  summary: DistributionSummaryLike,
  allDestinations: readonly PresenceProductDestination[] = PRESENCE_PRODUCT_DESTINATIONS
): PresenceLists {
  const bestByDest = new Map<
    PresenceProductDestination,
    { attempt_status: string | null; external_url: string | null }
  >();

  for (const row of summary?.destinations ?? []) {
    if (!isProductDestination(row.destination)) continue;
    const next = {
      attempt_status: row.attempt_status ?? null,
      external_url: row.external_url?.trim() || null,
    };
    const prev = bestByDest.get(row.destination);
    if (!prev || (!isDestinationPresent(prev) && isDestinationPresent(next))) {
      bestByDest.set(row.destination, next);
    }
  }

  const present: PresentDestination[] = [];
  const missing: PresenceProductDestination[] = [];

  for (const dest of allDestinations) {
    const row = bestByDest.get(dest);
    if (row && isDestinationPresent(row)) {
      present.push({ destination: dest, external_url: row.external_url });
    } else {
      missing.push(dest);
    }
  }

  return { present, missing };
}

/** Media ids suitable for `/studio/autopost?media_ids=` (skip text-only stubs). */
export function autopostMediaIdsFromItems(
  items: Array<{ media_id: string }>
): string[] {
  return items
    .map((it) => it.media_id.trim())
    .filter((id) => id.length > 0 && !id.startsWith("post_only_"));
}
