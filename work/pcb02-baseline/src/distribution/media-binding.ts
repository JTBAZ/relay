/**
 * @fileoverview Per-destination media binding for distribution variants.
 */

import type { PrismaClient } from "@prisma/client";
import {
  buildCrossPostMediaEntries,
  type CrossPostPackageMediaEntry
} from "../extension/cross-post-media-entries.js";
import type { CreativeWorkVariantRole } from "@prisma/client";
import type { DistributionDestination } from "./platform-destinations.js";

export type MediaVersion = "full" | "preview";

export type MediaRoutingByDestination = Partial<Record<DistributionDestination, MediaVersion>>;

const SOCIAL_PROMO_DESTINATIONS = new Set<DistributionDestination>(["x", "bluesky", "deviantart"]);

export type VariantMediaBinding = {
  mediaVersion: MediaVersion;
  analyticsContentRole: "promo" | null;
};

export class VariantMediaBindingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "VariantMediaBindingError";
  }
}

function parseMediaVersion(value: unknown): MediaVersion {
  return value === "preview" ? "preview" : "full";
}

/** Reads `media_version` from variant `platform_fields` and derives promo analytics role. */
export function parseVariantMediaBinding(
  platformFields: Record<string, unknown>,
  destination: DistributionDestination
): VariantMediaBinding {
  const mediaVersion = parseMediaVersion(platformFields.media_version);
  const analyticsContentRole =
    mediaVersion === "preview" && SOCIAL_PROMO_DESTINATIONS.has(destination) ? "promo" : null;
  return { mediaVersion, analyticsContentRole };
}

/**
 * Resolves which `media_id` values belong in a destination package.
 * Preview routing uses `planPreviewMediaId` from the plan's `assistant_plan`.
 */
export function resolveVariantMediaIds(args: {
  canonicalMediaIds: string[];
  binding: VariantMediaBinding;
  planPreviewMediaId?: string | null;
}): string[] {
  const { canonicalMediaIds, binding } = args;
  if (binding.mediaVersion === "full") {
    return [...canonicalMediaIds];
  }

  const previewId = args.planPreviewMediaId?.trim() ?? "";
  if (!previewId) {
    throw new VariantMediaBindingError(
      "Preview media is required for preview routing but preview_media_id is missing."
    );
  }

  return [previewId];
}

/** Builds export-ready media rows for an explicit id list (used by package resolver). */
export async function buildMediaEntriesForPackage(
  prisma: PrismaClient,
  creatorId: string,
  mediaIds: string[]
): Promise<CrossPostPackageMediaEntry[]> {
  return buildCrossPostMediaEntries(prisma, creatorId, mediaIds);
}

/** Reads `preview_media_id` from a distribution plan's `assistant_plan`. */
export function parsePlanPreviewMediaId(assistantPlan: Record<string, unknown>): string | null {
  const raw =
    typeof assistantPlan.preview_media_id === "string" ? assistantPlan.preview_media_id.trim() : "";
  return raw || null;
}

/** Platform fields written when creating/updating a distribution variant. */
export function buildVariantMediaPlatformFields(args: {
  mediaVersion: MediaVersion;
  destination: DistributionDestination;
}): Record<string, unknown> {
  const binding = parseVariantMediaBinding(
    { media_version: args.mediaVersion },
    args.destination
  );
  const fields: Record<string, unknown> = { media_version: args.mediaVersion };
  if (binding.analyticsContentRole) {
    fields.analytics_content_role = binding.analyticsContentRole;
  }
  return fields;
}

/** Normalizes client routing map to known destinations and media versions. */
export function normalizeMediaRoutingByDestination(
  input: Record<string, string> | undefined,
  destinations: DistributionDestination[]
): MediaRoutingByDestination {
  const out: MediaRoutingByDestination = {};
  if (!input) return out;
  for (const destination of destinations) {
    const raw = input[destination]?.trim().toLowerCase();
    if (raw === "preview") out[destination] = "preview";
    else if (raw === "full") out[destination] = "full";
  }
  return out;
}

export function resolveMediaVersionForDestination(
  destination: DistributionDestination,
  routing: MediaRoutingByDestination
): MediaVersion {
  return routing[destination] ?? "full";
}

/** Merges distribution media binding into existing variant `platform_fields`. */
export function mergeVariantPlatformFieldsWithMedia(
  baseFields: Record<string, unknown>,
  destination: DistributionDestination,
  mediaVersion: MediaVersion
): Record<string, unknown> {
  return {
    ...baseFields,
    ...buildVariantMediaPlatformFields({ mediaVersion, destination })
  };
}

/** Fields stored on `PostDistributionPlan.assistant_plan` for preview routing. */
export function buildPlanMediaAssistantFields(args: {
  needsPreview?: boolean;
  previewMediaId?: string | null;
  mediaRoutingByDestination?: MediaRoutingByDestination;
}): Record<string, unknown> {
  const fields: Record<string, unknown> = {};
  if (args.needsPreview === true) fields.needs_preview = true;
  if (args.needsPreview === false) fields.needs_preview = false;
  const previewId = args.previewMediaId?.trim();
  if (previewId) fields.preview_media_id = previewId;
  if (args.mediaRoutingByDestination && Object.keys(args.mediaRoutingByDestination).length > 0) {
    fields.media_routing_by_destination = args.mediaRoutingByDestination;
  }
  return fields;
}

export function destinationsUsingPreviewRouting(
  destinations: DistributionDestination[],
  routing: MediaRoutingByDestination
): DistributionDestination[] {
  return destinations.filter((destination) => resolveMediaVersionForDestination(destination, routing) === "preview");
}

/** Maps variant `platform_fields` to a durable Platform Instance analytics role. */
export function contentVariantRoleFromPlatformFields(
  platformFields: Record<string, unknown>
): CreativeWorkVariantRole | null {
  return platformFields.analytics_content_role === "promo" ? "promo" : null;
}
