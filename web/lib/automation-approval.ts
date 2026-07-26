/**
 * Automations approval helpers (VS6 / B15) — plan ordering + preview routing.
 * Keep free of React so unit tests stay light.
 */

import type { DistributionDestination } from "@/lib/relay-api";
import type { MediaRoutingByDestination } from "@/lib/distribution-media-routing";
import { buildMediaRoutingPlanPayload } from "@/lib/distribution-media-routing";
import type { AutomationDestination } from "@/lib/automation-api";

/** Preview routing for Automations: Patreon stays full; social targets use preview. */
export function buildAutomationPreviewMediaRouting(
  destinations: AutomationDestination[]
): MediaRoutingByDestination {
  const out: MediaRoutingByDestination = {};
  for (const dest of destinations) {
    out[dest as DistributionDestination] = dest === "patreon" ? "full" : "preview";
  }
  return out;
}

/**
 * Build createPostDistributionPlan media fields.
 * Throws if preview routing is required but previewMediaId is missing (AU-09).
 */
export function buildAutomationPlanCreateBody(args: {
  destinations: AutomationDestination[];
  draftId: string;
  previewMediaId: string | null | undefined;
}): {
  destinations: AutomationDestination[];
  source_draft_id: string;
  needs_preview: boolean;
  preview_media_id?: string;
  media_routing_by_destination: Record<string, "full" | "preview">;
} {
  const destinations = args.destinations.filter(Boolean);
  const mediaRouting = buildAutomationPreviewMediaRouting(destinations);
  const previewMediaId = (args.previewMediaId ?? "").trim();
  const needsPreview = destinations.some((d) => d !== "patreon");

  if (needsPreview && !previewMediaId) {
    throw new Error(
      "preview_media_id is required when any destination uses preview routing"
    );
  }

  const routingPayload = buildMediaRoutingPlanPayload({
    needsPreview,
    previewMediaId,
    mediaRouting,
    destinations: destinations as DistributionDestination[]
  });

  return {
    destinations,
    source_draft_id: args.draftId,
    ...routingPayload
  };
}
