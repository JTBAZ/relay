/**
 * @fileoverview Assemble extension/API packages from approved distribution variants.
 */

import type { PrismaClient } from "@prisma/client";
import {
  buildDeviantArtCrossPostPackage,
  buildPatreonCrossPostPackage,
  buildRelayCrossPostPackage,
  buildXCrossPostPackage,
  type BuildDeviantArtCrossPostPackageResult,
  type BuildPatreonCrossPostPackageResult,
  type BuildXCrossPostPackageResult
} from "../extension/cross-post-package.js";
import {
  loadVariantForPackage,
  type DistributionVariantWire
} from "./post-distribution-service.js";
import type { DistributionDestination } from "./platform-destinations.js";

export type BuildFromAttemptResult =
  | { status: "not_found" }
  | { status: "forbidden" }
  | { status: "no_primary_creator" }
  | { status: "ok"; destination: DistributionDestination; package: unknown; variant: DistributionVariantWire };

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

  const { variant, attempt } = loaded;
  const destination = variant.destination;
  const input = { postId: attempt.post_id, accountId: accountId.trim() };

  if (destination === "patreon") {
    const base = await buildPatreonCrossPostPackage(prisma, input);
    if (base.status !== "ok") return base;
    return {
      status: "ok",
      destination,
      package: applyVariantToPatreonPackage(base.package, variant),
      variant
    };
  }
  if (destination === "x") {
    const base = await buildXCrossPostPackage(prisma, input);
    if (base.status !== "ok") return base;
    return {
      status: "ok",
      destination,
      package: applyVariantToXPackage(base.package, variant),
      variant
    };
  }
  if (destination === "deviantart") {
    const base = await buildDeviantArtCrossPostPackage(prisma, input);
    if (base.status !== "ok") return base;
    return {
      status: "ok",
      destination,
      package: applyVariantToDeviantArtPackage(base.package, variant),
      variant
    };
  }

  const base = await buildRelayCrossPostPackage(prisma, input);
  if (base.status !== "ok") return base;
  return {
    status: "ok",
    destination: "bluesky",
    package: {
      ...base.package,
      post_text: variant.post_text?.trim() || base.package.body_text
    },
    variant
  };
}
