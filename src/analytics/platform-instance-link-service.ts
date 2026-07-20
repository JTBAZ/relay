/**
 * Performance intelligence Phase 9 — manual platform instance linking with URL identity.
 * @see docs/analytics/PLATFORM_ADAPTERS.md
 */

import type { PlatformInstanceLinkSource, PrismaClient } from "@prisma/client";
import {
  detectPlatformPublishedUrl,
  normalizeDistributionDestination,
  parsePlatformPublishedUrl,
  supportsPlatformIdentityLinking
} from "./platform-identity-adapters.js";
import {
  platformInstanceIdForAttempt,
  platformInstanceIdForManualLink,
  upsertPlatformInstanceFromAttempt,
  type UpsertPlatformInstanceResult
} from "./platform-instance-service.js";
import { contentVariantRoleFromPlatformFields } from "../distribution/media-binding.js";

export type PlatformInstanceLinkErrorCode =
  | "NO_TENANT"
  | "NOT_FOUND"
  | "INVALID_INPUT"
  | "UNSUPPORTED_DESTINATION"
  | "URL_DESTINATION_MISMATCH";

export type PlatformInstanceLinkWire = {
  platform_instance_id: string;
  post_id: string;
  destination: string;
  external_url: string;
  external_id: string | null;
  attempt_id: string | null;
  link_source: PlatformInstanceLinkSource;
  created: boolean;
  identity_confidence: "high" | "medium";
};

export type ConfirmPlatformInstanceLinkInput = {
  postId: string;
  destination: string;
  externalUrl: string;
  attemptId?: string | null;
  linkSource?: PlatformInstanceLinkSource;
};

async function ensureTenant(
  prisma: PrismaClient,
  relayCreatorId: string
): Promise<{ ok: true; creatorId: string } | { ok: false; code: "NO_TENANT" }> {
  const creatorId = relayCreatorId.trim();
  const tenant = await prisma.tenant.findUnique({
    where: { relayCreatorId: creatorId },
    select: { id: true }
  });
  if (!tenant) {
    return { ok: false, code: "NO_TENANT" };
  }
  return { ok: true, creatorId };
}

async function resolveAttempt(
  prisma: PrismaClient,
  creatorId: string,
  postId: string,
  destination: string,
  attemptId?: string | null
): Promise<{ id: string } | null> {
  if (attemptId?.trim()) {
    const attempt = await prisma.postDistributionAttempt.findFirst({
      where: { id: attemptId.trim(), creatorId, postId, destination },
      select: { id: true }
    });
    return attempt;
  }

  const variant = await prisma.postDistributionVariant.findFirst({
    where: { creatorId, postId, destination },
    select: { id: true }
  });
  if (!variant) return null;

  return prisma.postDistributionAttempt.findFirst({
    where: { creatorId, postId, destination, variantId: variant.id },
    orderBy: { createdAt: "desc" },
    select: { id: true }
  });
}

export async function confirmPlatformInstanceLink(
  prisma: PrismaClient,
  relayCreatorId: string,
  input: ConfirmPlatformInstanceLinkInput
): Promise<
  | { ok: true; link: PlatformInstanceLinkWire }
  | { ok: false; code: PlatformInstanceLinkErrorCode; message?: string }
> {
  const tenant = await ensureTenant(prisma, relayCreatorId);
  if (!tenant.ok) return tenant;

  const postId = input.postId.trim();
  const destination = normalizeDistributionDestination(input.destination);
  const rawUrl = input.externalUrl.trim();

  if (!postId || !destination || !rawUrl) {
    return { ok: false, code: "INVALID_INPUT", message: "post_id, destination, and external_url are required." };
  }

  if (!supportsPlatformIdentityLinking(destination)) {
    return {
      ok: false,
      code: "UNSUPPORTED_DESTINATION",
      message: "Destination does not support URL identity linking yet."
    };
  }

  const post = await prisma.post.findFirst({
    where: { id: postId, creatorId: tenant.creatorId },
    select: { id: true }
  });
  if (!post) {
    return { ok: false, code: "NOT_FOUND", message: "Post not found." };
  }

  const parsed =
    parsePlatformPublishedUrl(
      destination as "patreon" | "x" | "deviantart",
      rawUrl
    ) ?? detectPlatformPublishedUrl(rawUrl);

  if (!parsed || parsed.destination !== destination) {
    return {
      ok: false,
      code: "URL_DESTINATION_MISMATCH",
      message: "URL does not match the selected platform's published-post pattern."
    };
  }

  const attempt = await resolveAttempt(
    prisma,
    tenant.creatorId,
    postId,
    destination,
    input.attemptId
  );

  const linkSource = input.linkSource ?? "manual_url_confirm";
  let upsert: UpsertPlatformInstanceResult | null = null;

  if (attempt) {
    const attemptWithVariant = await prisma.postDistributionAttempt.findFirst({
      where: { id: attempt.id, creatorId: tenant.creatorId },
      include: { variant: { select: { platformFields: true } } }
    });
    const variantPlatformFields =
      attemptWithVariant?.variant.platformFields &&
      typeof attemptWithVariant.variant.platformFields === "object" &&
      !Array.isArray(attemptWithVariant.variant.platformFields)
        ? (attemptWithVariant.variant.platformFields as Record<string, unknown>)
        : {};
    const contentVariantRole = contentVariantRoleFromPlatformFields(variantPlatformFields);

    await prisma.postDistributionAttempt.update({
      where: { id: attempt.id },
      data: {
        externalUrl: parsed.canonical_url,
        externalId: parsed.external_id,
        status: "posted",
        completedAt: new Date()
      }
    });

    upsert = await upsertPlatformInstanceFromAttempt(prisma, {
      attemptId: attempt.id,
      creatorId: tenant.creatorId,
      postId,
      destination,
      externalUrl: parsed.canonical_url,
      externalId: parsed.external_id,
      linkSource,
      status: "active",
      contentVariantRole
    });
  } else {
    const manualId = platformInstanceIdForManualLink(postId, destination);
    const existing = await prisma.platformInstance.findUnique({
      where: { postId_destination: { postId, destination } },
      select: { id: true }
    });

    await prisma.platformInstance.upsert({
      where: { postId_destination: { postId, destination } },
      create: {
        id: manualId,
        creatorId: tenant.creatorId,
        postId,
        destination,
        externalUrl: parsed.canonical_url,
        externalId: parsed.external_id,
        attemptId: null,
        linkSource,
        status: "active",
        refreshPolicy: "conservative",
        linkedAt: new Date()
      },
      update: {
        externalUrl: parsed.canonical_url,
        externalId: parsed.external_id,
        linkSource,
        status: "active",
        updatedAt: new Date()
      }
    });

    upsert = {
      platformInstanceId: existing?.id ?? manualId,
      created: !existing
    };
  }

  if (!upsert) {
    return { ok: false, code: "INVALID_INPUT", message: "Unable to create platform instance." };
  }

  return {
    ok: true,
    link: {
      platform_instance_id: upsert.platformInstanceId,
      post_id: postId,
      destination,
      external_url: parsed.canonical_url,
      external_id: parsed.external_id,
      attempt_id: attempt?.id ?? null,
      link_source: linkSource,
      created: upsert.created,
      identity_confidence: parsed.confidence
    }
  };
}

export function normalizeCompleteDistributionIdentity(
  destination: string,
  externalUrl?: string | null,
  externalId?: string | null
): { external_url: string | null; external_id: string | null } {
  const dest = normalizeDistributionDestination(destination);
  const url = externalUrl?.trim() || null;
  if (!url || !supportsPlatformIdentityLinking(dest)) {
    return {
      external_url: url,
      external_id: externalId?.trim() || null
    };
  }

  const parsed =
    parsePlatformPublishedUrl(dest as "patreon" | "x" | "deviantart", url) ??
    detectPlatformPublishedUrl(url);

  if (!parsed || parsed.destination !== dest) {
    return {
      external_url: url,
      external_id: externalId?.trim() || null
    };
  }

  return {
    external_url: parsed.canonical_url,
    external_id: parsed.external_id ?? (externalId?.trim() || null)
  };
}

/** Re-export attempt id helper for tests documenting manual vs attempt ids. */
export { platformInstanceIdForAttempt };
