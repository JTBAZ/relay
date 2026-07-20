/**
 * Audience & Promotion — shared TypeScript contracts (Slice 0).
 *
 * Types only. No React, no fetch, no side effects.
 * @see docs/studio/AUDIENCE_PROMOTION_CONVERSION.md
 * @see docs/architecture/adr/004-pilot-three-layer-permissions.md
 */

import type { GalleryItem, PostVisibility, TierFacet } from "@/lib/relay-api";

/** Hero drilldown body mode — overview keeps packaging; audience_promotion is the new workspace. */
export type HeroWorkspaceMode = "overview" | "audience_promotion";

/** In-rail tabs for the height-capped Audience & Promotion control surface. */
export type AudiencePromotionTab = "access" | "simulator" | "promotion";

/**
 * Simulator / offer targeting key.
 * - `anonymous` — logged-out / open-web visitor (not a fallback mock tier label).
 * - `tier:${relayTierId}` — a real synced compose/facet tier id.
 *
 * Never invent labels like Basic / Advanced / Goku Rank.
 */
export type AudiencePersonaKey = "anonymous" | `tier:${string}`;

/** Persisted per-persona preview treatment (`PostPresentation.tier_preview_settings`). */
export type PreviewTreatment =
  | "default"
  | "partial-unblur"
  | "free-cta"
  | "partial-unlock";

/**
 * Layer A — Patreon / Relay billing gate as a minimum-tier model.
 * Higher tiers are implied; do not present as an arbitrary multi-select matrix.
 */
export type MinimumTierAccessState = {
  is_public: boolean;
  /** Compose/catalog tier id when gated; null when public. */
  minimum_tier_id: string | null;
  /** Upstream `tier_ids` before minimum-tier normalization (honesty banner). */
  upstream_tier_ids: string[];
  /** Optional API source marker (e.g. PATREON | RELAY). */
  source?: string;
};

/** Layer C — Relay presentation visibility only (never stores tier ids). */
export type RelayPresentationState = {
  visibility: PostVisibility;
};

/** Ladder row for Access checklist UI (Slice 2). */
export type TierLadderRowState = "minimum" | "implied" | "locked_out" | "public";

export type TierLadderRow = {
  tier_id: string;
  label: string;
  amount_cents: number | null;
  state: TierLadderRowState;
};

/** Props for the in-Hero Audience & Promotion panel (Slice 1+). */
export type AudiencePromotionPanelProps = {
  creatorId: string;
  postId: string;
  /** All gallery rows for this post (visibility body must use every asset). */
  postItems: GalleryItem[];
  selectedItem: GalleryItem | null;
  tiers: TierFacet[];
  studioWriteBlocked: boolean;
  onRefresh: () => Promise<void>;
};

/** v1 shape for `PostPresentation.tierPreviewSettings` (Slice 3). */
export type TierPreviewSettingsV1 = {
  schema_version: 1;
  personas: Partial<
    Record<
      AudiencePersonaKey,
      {
        preview_style: PreviewTreatment;
        cta_text: string;
      }
    >
  >;
};

/** Parse a persona key; returns null if malformed. */
export function parseAudiencePersonaKey(raw: string): AudiencePersonaKey | null {
  const t = raw.trim();
  if (t === "anonymous") return "anonymous";
  if (t.startsWith("tier:") && t.length > "tier:".length) {
    return t as AudiencePersonaKey;
  }
  return null;
}

/** Build a tier persona key from a relay/compose tier id. */
export function tierPersonaKey(relayTierId: string): AudiencePersonaKey {
  return `tier:${relayTierId.trim()}`;
}

export function isAnonymousPersona(key: AudiencePersonaKey): boolean {
  return key === "anonymous";
}
