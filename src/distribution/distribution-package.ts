/**
 * @fileoverview Assemble extension/API packages from approved distribution variants.
 */

import type { PrismaClient } from "@prisma/client";
import type { CrossPostPackageMediaEntry } from "../extension/cross-post-media-entries.js";
import {
  buildDeviantArtCrossPostPackage,
  buildPatreonCrossPostPackage,
  buildRelayCrossPostPackage,
  buildXCrossPostPackage,
  type BuildDeviantArtCrossPostPackageResult,
  type BuildPatreonCrossPostPackageResult,
  type BuildXCrossPostPackageResult,
  type RelayCrossPostPackage
} from "../extension/cross-post-package.js";
import {
  buildMediaEntriesForPackage,
  parsePlanPreviewMediaId,
  parseVariantMediaBinding,
  resolveVariantMediaIds,
  VariantMediaBindingError
} from "./media-binding.js";
import {
  loadVariantForPackage,
  type DistributionVariantWire
} from "./post-distribution-service.js";
import type { DistributionDestination } from "./platform-destinations.js";

export type BuildFromAttemptResult =
  | { status: "not_found" }
  | { status: "forbidden" }
  | { status: "no_primary_creator" }
  | { status: "invalid_media_binding"; message: string }
  | { status: "ok"; destination: DistributionDestination; package: unknown; variant: DistributionVariantWire };

const X_IMAGE_MAX = 4;
const DEVIANTART_IMAGE_MAX = 1;

function limitMediaForDestination(
  media: CrossPostPackageMediaEntry[],
  destination: DistributionDestination
): CrossPostPackageMediaEntry[] {
  if (destination === "x") {
    return media.filter((m) => m.mime_type.toLowerCase().startsWith("image/")).slice(0, X_IMAGE_MAX);
  }
  if (destination === "deviantart") {
    return media.filter((m) => m.mime_type.toLowerCase().startsWith("image/")).slice(0, DEVIANTART_IMAGE_MAX);
  }
  return media;
}

async function applyVariantMediaToPackage(
  prisma: PrismaClient,
  creatorId: string,
  base: RelayCrossPostPackage,
  variant: DistributionVariantWire,
  assistantPlan: Record<string, unknown>
): Promise<RelayCrossPostPackage | { status: "invalid_media_binding"; message: string }> {
  const binding = parseVariantMediaBinding(variant.platform_fields, variant.destination);
  const canonicalMediaIds = base.media.map((row) => row.media_id);
  let resolvedIds: string[];
  try {
    resolvedIds = resolveVariantMediaIds({
      canonicalMediaIds,
      binding,
      planPreviewMediaId: parsePlanPreviewMediaId(assistantPlan)
    });
  } catch (err) {
    if (err instanceof VariantMediaBindingError) {
      return { status: "invalid_media_binding", message: err.message };
    }
    throw err;
  }

  if (binding.mediaVersion === "full" && resolvedIds.join(",") === canonicalMediaIds.join(",")) {
    return base;
  }

  const media = limitMediaForDestination(
    await buildMediaEntriesForPackage(prisma, creatorId, resolvedIds),
    variant.destination
  );
  return { ...base, media };
}

function applyVariantToPatreonPackage(
  base: Extract<BuildPatreonCrossPostPackageResult, { status: "ok" }>["package"],
  variant: DistributionVariantWire
) {
  return {
    ...base,
    title: variant.title?.trim() || base.title,
    body_text: variant.body_text?.trim() ?? base.body_text
  };
}

function applyVariantToXPackage(
  base: Extract<BuildXCrossPostPackageResult, { status: "ok" }>["package"],
  variant: DistributionVariantWire
) {
  return {
    ...base,
    post_text: variant.post_text?.trim() || base.post_text
  };
}

function applyVariantToDeviantArtPackage(
  base: Extract<BuildDeviantArtCrossPostPackageResult, { status: "ok" }>["package"],
  variant: DistributionVariantWire
) {
  return {
    ...base,
    title: variant.title?.trim() || base.title,
    body_text: variant.body_text?.trim() ?? base.body_text,
    tags: variant.tags.length > 0 ? variant.tags : base.tags
  };
}

async function finalizePackage<T extends RelayCrossPostPackage>(
  prisma: PrismaClient,
  creatorId: string,
  pkg: T,
  variant: DistributionVariantWire,
  assistantPlan: Record<string, unknown>
): Promise<T | { status: "invalid_media_binding"; message: string }> {
  const withMedia = await applyVariantMediaToPackage(prisma, creatorId, pkg, variant, assistantPlan);
  if ("status" in withMedia) {
    return withMedia;
  }
  return { ...pkg, media: withMedia.media };
}

export async function buildCrossPostPackageFromAttempt(
  prisma: PrismaClient,
  accountId: string,
  attemptId: string
): Promise<BuildFromAttemptResult> {
  const account = await prisma.account.findUnique({
    where: { id: accountId.trim() },
    select: { primaryRelayCreatorId: true }
  });
  const creatorId = account?.primaryRelayCreatorId?.trim() ?? "";
  if (!creatorId) {
    return { status: "no_primary_creator" };
  }

  const loaded = await loadVariantForPackage(prisma, creatorId, attemptId);
  if (!loaded) {
    return { status: "not_found" };
  }

  const { variant, attempt, assistant_plan } = loaded;
  const destination = variant.destination;
  const input = { postId: attempt.post_id, accountId: accountId.trim() };

  if (destination === "patreon") {
    const base = await buildPatreonCrossPostPackage(prisma, input);
    if (base.status !== "ok") return base;
    const pkg = await finalizePackage(
      prisma,
      creatorId,
      applyVariantToPatreonPackage(base.package, variant),
      variant,
      assistant_plan
    );
    if ("status" in pkg) return pkg;
    return { status: "ok", destination, package: pkg, variant };
  }
  if (destination === "x") {
    const base = await buildXCrossPostPackage(prisma, input);
    if (base.status !== "ok") return base;
    const pkg = await finalizePackage(
      prisma,
      creatorId,
      applyVariantToXPackage(base.package, variant),
      variant,
      assistant_plan
    );
    if ("status" in pkg) return pkg;
    return { status: "ok", destination, package: pkg, variant };
  }
  if (destination === "deviantart") {
    const base = await buildDeviantArtCrossPostPackage(prisma, input);
    if (base.status !== "ok") return base;
    const pkg = await finalizePackage(
      prisma,
      creatorId,
      applyVariantToDeviantArtPackage(base.package, variant),
      variant,
      assistant_plan
    );
    if ("status" in pkg) return pkg;
    return { status: "ok", destination, package: pkg, variant };
  }

  const base = await buildRelayCrossPostPackage(prisma, input);
  if (base.status !== "ok") return base;
  const pkg = await finalizePackage(
    prisma,
    creatorId,
    {
      ...base.package,
      post_text: variant.post_text?.trim() || base.package.body_text
    },
    variant,
    assistant_plan
  );
  if ("status" in pkg) return pkg;
  return {
    status: "ok",
    destination: "bluesky",
    package: pkg,
    variant
  };
}
