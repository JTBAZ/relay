import type { DistributionDestination } from "@/lib/relay-api";
import { relayBrowserMediaUrl } from "@/lib/relay-api-env";

export type MediaVersion = "full" | "preview";
export type MediaRoutingByDestination = Partial<Record<DistributionDestination, MediaVersion>>;

export function mediaVersionFromPlatformFields(
  platformFields: Record<string, unknown>
): MediaVersion {
  return platformFields.media_version === "preview" ? "preview" : "full";
}

/** Explicit `media_version` on variant fields, if set. */
export function explicitMediaVersionFromPlatformFields(
  platformFields: Record<string, unknown> | undefined
): MediaVersion | null {
  if (!platformFields) return null;
  if (platformFields.media_version === "preview") return "preview";
  if (platformFields.media_version === "full") return "full";
  return null;
}

/**
 * Resolves the media version shown on send cards and used for thumb URLs.
 * Priority: variant `platform_fields` (when explicit) → `assistant_plan` routing → live UI toggles → full.
 */
export function resolveEffectiveMediaVersion(
  dest: DistributionDestination,
  args: {
    variantPlatformFields?: Record<string, unknown>;
    assistantPlan?: Record<string, unknown>;
    mediaRouting?: MediaRoutingByDestination;
  }
): MediaVersion {
  const fromVariant = explicitMediaVersionFromPlatformFields(args.variantPlatformFields);
  if (fromVariant) return fromVariant;

  if (args.assistantPlan) {
    const { mediaRouting } = hydratePreviewPlanState(args.assistantPlan);
    const fromPlan = mediaRouting[dest];
    if (fromPlan === "preview" || fromPlan === "full") return fromPlan;
  }

  const fromUi = args.mediaRouting?.[dest];
  if (fromUi === "preview" || fromUi === "full") return fromUi;

  return "full";
}

/** Same-origin export `/content` URL (Next rewrite → Relay). Prefer this for `<img>` and Previewizer. */
export function exportMediaContentUrl(creatorId: string, mediaId: string): string {
  return relayBrowserMediaUrl(
    `/api/v1/export/media/${encodeURIComponent(creatorId)}/${encodeURIComponent(mediaId)}/content`
  );
}

export function hydratePreviewPlanState(assistantPlan: Record<string, unknown>): {
  needsPreview: boolean | null;
  previewMediaId: string;
  mediaRouting: MediaRoutingByDestination;
} {
  const needsRaw = assistantPlan.needs_preview;
  const needsPreview = typeof needsRaw === "boolean" ? needsRaw : null;
  const previewMediaId =
    typeof assistantPlan.preview_media_id === "string"
      ? assistantPlan.preview_media_id.trim()
      : "";
  const mediaRouting: MediaRoutingByDestination = {};
  const routingRaw = assistantPlan.media_routing_by_destination;
  if (routingRaw && typeof routingRaw === "object" && !Array.isArray(routingRaw)) {
    for (const [dest, version] of Object.entries(routingRaw)) {
      if (version === "preview" || version === "full") {
        mediaRouting[dest as DistributionDestination] = version;
      }
    }
  }
  return { needsPreview, previewMediaId, mediaRouting };
}

export function defaultMediaRouting(
  destinations: DistributionDestination[]
): MediaRoutingByDestination {
  const out: MediaRoutingByDestination = {};
  for (const dest of destinations) out[dest] = "full";
  return out;
}

/**
 * Defaults when the artist says they need a preview/teaser.
 * Social teaser surfaces start on Preview; Patreon (member full-res) stays Full.
 * Artists can still flip any destination manually.
 */
export const DESTINATIONS_DEFAULTING_TO_PREVIEW: ReadonlySet<DistributionDestination> = new Set([
  "x",
  "deviantart",
  "bluesky",
]);

export function defaultMediaRoutingForPreviewNeed(
  destinations: DistributionDestination[]
): MediaRoutingByDestination {
  const out: MediaRoutingByDestination = {};
  for (const dest of destinations) {
    out[dest] = DESTINATIONS_DEFAULTING_TO_PREVIEW.has(dest) ? "preview" : "full";
  }
  return out;
}

export function destinationsUsingPreviewRouting(
  destinations: DistributionDestination[],
  routing: MediaRoutingByDestination
): DistributionDestination[] {
  return destinations.filter((dest) => (routing[dest] ?? "full") === "preview");
}

export function buildMediaRoutingPlanPayload(args: {
  needsPreview: boolean;
  previewMediaId: string;
  mediaRouting: MediaRoutingByDestination;
  destinations: DistributionDestination[];
}): {
  needs_preview: boolean;
  preview_media_id?: string;
  media_routing_by_destination: Record<string, MediaVersion>;
} {
  const media_routing_by_destination: Record<string, MediaVersion> = {};
  for (const dest of args.destinations) {
    media_routing_by_destination[dest] = args.mediaRouting[dest] ?? "full";
  }
  const hasPreviewRoute = destinationsUsingPreviewRouting(
    args.destinations,
    args.mediaRouting
  ).length > 0;
  return {
    needs_preview: args.needsPreview,
    media_routing_by_destination,
    ...(args.needsPreview && hasPreviewRoute && args.previewMediaId.trim()
      ? { preview_media_id: args.previewMediaId.trim() }
      : {})
  };
}

export function resolveSendCardImageUrl(args: {
  mediaVersion: MediaVersion;
  mainPreviewUrl: string;
  creatorId: string;
  previewMediaId: string;
  planAssistantPlan?: Record<string, unknown>;
}): string {
  if (args.mediaVersion !== "preview") return args.mainPreviewUrl;
  const fromPlan =
    args.planAssistantPlan && typeof args.planAssistantPlan.preview_media_id === "string"
      ? args.planAssistantPlan.preview_media_id.trim()
      : "";
  const previewId = args.previewMediaId.trim() || fromPlan;
  if (!previewId) return args.mainPreviewUrl;
  return exportMediaContentUrl(args.creatorId, previewId);
}

/** True when UI preview routing differs from what is persisted on plan variants. */
export function isMediaRoutingStale(
  destinations: DistributionDestination[],
  args: {
    variants: Array<{ destination: string; platform_fields: Record<string, unknown> }>;
    needsPreview: boolean | null;
    previewMediaId: string;
    mediaRouting: MediaRoutingByDestination;
    assistantPlan?: Record<string, unknown>;
  }
): boolean {
  if (args.needsPreview !== true) return false;

  const previewDests = destinationsUsingPreviewRouting(destinations, args.mediaRouting);
  if (previewDests.length === 0) return false;

  const hydrated = hydratePreviewPlanState(args.assistantPlan ?? {});
  if (!hydrated.previewMediaId && !args.previewMediaId.trim()) return true;

  for (const dest of previewDests) {
    const variant = args.variants.find((v) => v.destination === dest);
    if (explicitMediaVersionFromPlatformFields(variant?.platform_fields) !== "preview") {
      return true;
    }
  }

  const desiredPreviewId = args.previewMediaId.trim();
  const persistedPreviewId = hydrated.previewMediaId;
  if (desiredPreviewId && desiredPreviewId !== persistedPreviewId) return true;

  return false;
}
