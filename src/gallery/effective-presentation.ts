import type { Prisma } from "@prisma/client";

/**
 * Relay-only presentation overlay for a post (mirrors `PostPresentation` without Prisma types).
 * Loaded from DB and merged at read time with canonical / `PostVersion` snapshot data.
 */
export type PostPresentationOverlay = {
  relay_title?: string | null;
  relay_description?: string | null;
  media_order?: string[];
  tier_preview_settings?: Prisma.JsonValue | null;
};

/** Ingest-aligned base for merging (snapshot `PostRow.current` subset). */
export type SnapshotPresentationBase = {
  title: string;
  description?: string;
  /** Ordered media ids from latest applicable version (`media_ids` in snapshots). */
  media_ids: string[];
};

/** Result of merging Patreon-origin base + optional Relay overlay. */
export type EffectiveMergedPostPresentation = {
  title: string;
  description?: string;
  media_ids_ordered: string[];
  tier_preview_settings?: Prisma.JsonValue | null;
};

/**
 * Order media ids: Relay `media_order` wins for ids present in base; trailing base ids preserve
 * newly ingested assets not listed in the overlay.
 */
export function effectiveMediaIdsOrder(baseMediaIds: string[], overlayOrder: string[] | undefined): string[] {
  if (!overlayOrder || overlayOrder.length === 0) {
    return [...baseMediaIds];
  }
  const baseSet = new Set(baseMediaIds);
  const out: string[] = [];
  const seen = new Set<string>();
  for (const id of overlayOrder) {
    if (!id || seen.has(id)) continue;
    if (baseSet.has(id)) {
      out.push(id);
      seen.add(id);
    }
  }
  for (const id of baseMediaIds) {
    if (!seen.has(id)) out.push(id);
  }
  return out;
}

/**
 * Merge append-only ingest fields with optional Relay `PostPresentation`.
 * Unset overlay fields inherit from base; `tier_preview_settings` only appears when overlay supplies it.
 */
export function mergePostPresentation(
  base: SnapshotPresentationBase,
  overlay: PostPresentationOverlay | null | undefined
): EffectiveMergedPostPresentation {
  const title =
    overlay?.relay_title != null && String(overlay.relay_title).trim() !== ""
      ? String(overlay.relay_title)
      : base.title;

  let description = base.description;
  if (overlay && "relay_description" in overlay && overlay.relay_description != null) {
    description =
      overlay.relay_description === "" ? undefined : String(overlay.relay_description);
  }

  const media_ids_ordered = effectiveMediaIdsOrder(base.media_ids, overlay?.media_order);

  let tier_preview_settings: EffectiveMergedPostPresentation["tier_preview_settings"];
  let hasTierPreview = false;
  if (overlay && "tier_preview_settings" in overlay) {
    tier_preview_settings = overlay.tier_preview_settings ?? null;
    hasTierPreview = true;
  }

  return {
    title,
    ...(description !== undefined ? { description } : {}),
    media_ids_ordered,
    ...(hasTierPreview ? { tier_preview_settings } : {})
  };
}
