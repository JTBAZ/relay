/**
 * Tracked marketing offer redirects — `/go/:slug` (Slice 7 + Slice 9 tier defaults).
 * @see docs/studio/TRACKED_OFFER_LINKS.md
 */

import { randomBytes } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { normalizePatreonDestinationUrl, PostOfferValidationError } from "./post-offer-service.js";
import { TierPromotionDefaultValidationError } from "./tier-promotion-default-service.js";

export type OfferRedirectResolve =
  | { status: "not_found" }
  | { status: "gone"; reason: "inactive" | "missing_destination" | "invalid_destination" }
  | {
      status: "redirect";
      location: string;
      kind: "offer";
      offerId: string;
      creatorId: string;
      postId: string;
    }
  | {
      status: "redirect";
      location: string;
      kind: "tier_default";
      tierDefaultId: string;
      creatorId: string;
    };

function mintSlug(): string {
  return randomBytes(12).toString("base64url");
}

/** Hostname-only from Referer; never stores path/query. */
export function referrerHostFromHeader(referer: string | undefined | null): string | null {
  const raw = typeof referer === "string" ? referer.trim() : "";
  if (!raw) return null;
  try {
    const u = new URL(raw);
    const host = u.hostname.trim().toLowerCase();
    return host || null;
  } catch {
    return null;
  }
}

/**
 * Mint an immutable redirect slug if missing. Destination updates never rewrite the slug.
 */
export async function ensureOfferRedirectSlug(
  prisma: PrismaClient,
  args: { creatorId: string; postId: string; offerId: string }
): Promise<{ redirect_slug: string; public_path: string }> {
  const creatorId = args.creatorId.trim();
  const postId = args.postId.trim();
  const offerId = args.offerId.trim();

  const offer = await prisma.postMarketingOffer.findFirst({
    where: { id: offerId, creatorId, postId },
    select: { id: true, redirectSlug: true }
  });
  if (!offer) {
    throw new PostOfferValidationError("Offer not found for this creator/post.", [
      { field: "offer_id", issue: "not_found" }
    ]);
  }
  if (offer.redirectSlug?.trim()) {
    const slug = offer.redirectSlug.trim();
    return { redirect_slug: slug, public_path: `/go/${slug}` };
  }

  for (let attempt = 0; attempt < 5; attempt++) {
    const slug = mintSlug();
    try {
      const updated = await prisma.postMarketingOffer.update({
        where: { id: offer.id },
        data: { redirectSlug: slug },
        select: { redirectSlug: true }
      });
      const out = updated.redirectSlug?.trim() ?? slug;
      return { redirect_slug: out, public_path: `/go/${out}` };
    } catch {
      /* unique collision — retry */
    }
  }
  throw new PostOfferValidationError("Could not mint redirect slug.", [
    { field: "redirect_slug", issue: "mint_failed" }
  ]);
}

/** Mint / return immutable tracked-link slug for a tier-promotion default. */
export async function ensureTierDefaultRedirectSlug(
  prisma: PrismaClient,
  args: { creatorId: string; defaultId: string }
): Promise<{ redirect_slug: string; public_path: string }> {
  const creatorId = args.creatorId.trim();
  const defaultId = args.defaultId.trim();

  const row = await prisma.creatorTierPromotionDefault.findFirst({
    where: { id: defaultId, creatorId },
    select: { id: true, redirectSlug: true }
  });
  if (!row) {
    throw new TierPromotionDefaultValidationError("Tier default not found for this creator.", [
      { field: "default_id", issue: "not_found" }
    ]);
  }
  if (row.redirectSlug?.trim()) {
    const slug = row.redirectSlug.trim();
    return { redirect_slug: slug, public_path: `/go/${slug}` };
  }

  for (let attempt = 0; attempt < 5; attempt++) {
    const slug = mintSlug();
    try {
      const updated = await prisma.creatorTierPromotionDefault.update({
        where: { id: row.id },
        data: { redirectSlug: slug },
        select: { redirectSlug: true }
      });
      const out = updated.redirectSlug?.trim() ?? slug;
      return { redirect_slug: out, public_path: `/go/${out}` };
    } catch {
      /* unique collision — retry */
    }
  }
  throw new TierPromotionDefaultValidationError("Could not mint redirect slug.", [
    { field: "redirect_slug", issue: "mint_failed" }
  ]);
}

export async function resolveOfferRedirect(
  prisma: PrismaClient,
  slug: string
): Promise<OfferRedirectResolve> {
  const token = slug.trim();
  if (!token) return { status: "not_found" };

  const offer = await prisma.postMarketingOffer.findFirst({
    where: { redirectSlug: token },
    select: {
      id: true,
      creatorId: true,
      postId: true,
      active: true,
      patreonDestinationUrl: true
    }
  });
  if (offer) {
    if (!offer.active) return { status: "gone", reason: "inactive" };
    if (!offer.patreonDestinationUrl?.trim()) {
      return { status: "gone", reason: "missing_destination" };
    }
    try {
      const location = normalizePatreonDestinationUrl(offer.patreonDestinationUrl);
      if (!location) return { status: "gone", reason: "missing_destination" };
      return {
        status: "redirect",
        location,
        kind: "offer",
        offerId: offer.id,
        creatorId: offer.creatorId,
        postId: offer.postId
      };
    } catch {
      return { status: "gone", reason: "invalid_destination" };
    }
  }

  const tierDefault = await prisma.creatorTierPromotionDefault.findFirst({
    where: { redirectSlug: token },
    select: {
      id: true,
      creatorId: true,
      active: true,
      patreonDestinationUrl: true
    }
  });
  if (!tierDefault) return { status: "not_found" };
  if (!tierDefault.active) return { status: "gone", reason: "inactive" };
  if (!tierDefault.patreonDestinationUrl?.trim()) {
    return { status: "gone", reason: "missing_destination" };
  }
  try {
    const location = normalizePatreonDestinationUrl(tierDefault.patreonDestinationUrl);
    if (!location) return { status: "gone", reason: "missing_destination" };
    return {
      status: "redirect",
      location,
      kind: "tier_default",
      tierDefaultId: tierDefault.id,
      creatorId: tierDefault.creatorId
    };
  } catch {
    return { status: "gone", reason: "invalid_destination" };
  }
}

export async function recordOfferLinkClick(
  prisma: PrismaClient,
  args: {
    offerId: string;
    creatorId: string;
    postId: string;
    referrerHost?: string | null;
  }
): Promise<void> {
  await prisma.marketingOfferClickEvent.create({
    data: {
      offerId: args.offerId,
      creatorId: args.creatorId,
      postId: args.postId,
      referrerHost: args.referrerHost?.trim() || null
    }
  });
}

export async function recordTierDefaultLinkClick(
  prisma: PrismaClient,
  args: {
    tierDefaultId: string;
    creatorId: string;
    referrerHost?: string | null;
  }
): Promise<void> {
  await prisma.marketingTierDefaultClickEvent.create({
    data: {
      tierDefaultId: args.tierDefaultId,
      creatorId: args.creatorId,
      referrerHost: args.referrerHost?.trim() || null
    }
  });
}
