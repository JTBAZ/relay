/**
 * Per-post / per-persona marketing offers (Slice 4).
 */

import type { PrismaClient } from "@prisma/client";
import { isAudiencePersonaKey } from "../gallery/tier-preview-settings.js";

export type OfferIssue = { field: string; issue: string };

export class PostOfferValidationError extends Error {
  public override readonly name = "PostOfferValidationError";
  public constructor(
    message: string,
    public readonly details: OfferIssue[]
  ) {
    super(message);
  }
}

export type PostMarketingOfferRecord = {
  id: string;
  creator_id: string;
  post_id: string;
  audience_key: string;
  discount_code_id: string | null;
  headline: string;
  cta_text: string;
  patreon_destination_url: string | null;
  /** Immutable tracked-link slug when minted; null until ensure. */
  redirect_slug: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
  /** Present when joined; null / missing_code when code was removed. */
  discount_code?: {
    id: string;
    code: string;
    percent_off: number;
    active: boolean;
    label: string | null;
  } | null;
  code_missing?: boolean;
};

const PATREON_HOST_RE = /(^|\.)patreon\.com$/i;
const IPV4_HOST_RE = /^\d{1,3}(\.\d{1,3}){3}$/;
const IPV6_HOST_RE = /^\[?[0-9a-f:]+\]?$/i;

/** Allow only https://…patreon.com/… destinations (Slice 7 hostile-URL rules). */
export function normalizePatreonDestinationUrl(raw: unknown): string | null {
  if (raw === undefined || raw === null || raw === "") return null;
  if (typeof raw !== "string") {
    throw new PostOfferValidationError("patreon_destination_url must be a string.", [
      { field: "patreon_destination_url", issue: "type" }
    ]);
  }
  const trimmed = raw.trim();
  if (!trimmed || trimmed.startsWith("/") || !/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed)) {
    throw new PostOfferValidationError("patreon_destination_url must be an absolute https URL.", [
      { field: "patreon_destination_url", issue: "relative_or_scheme" }
    ]);
  }
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new PostOfferValidationError("patreon_destination_url is not a valid URL.", [
      { field: "patreon_destination_url", issue: "invalid_url" }
    ]);
  }
  if (url.protocol !== "https:") {
    throw new PostOfferValidationError("patreon_destination_url must use https.", [
      { field: "patreon_destination_url", issue: "https_required" }
    ]);
  }
  if (url.username || url.password) {
    throw new PostOfferValidationError("patreon_destination_url must not include credentials.", [
      { field: "patreon_destination_url", issue: "credentials_forbidden" }
    ]);
  }
  const host = url.hostname.trim().toLowerCase();
  if (!host || IPV4_HOST_RE.test(host) || IPV6_HOST_RE.test(host)) {
    throw new PostOfferValidationError("patreon_destination_url must not use an IP host.", [
      { field: "patreon_destination_url", issue: "ip_literal" }
    ]);
  }
  if (!PATREON_HOST_RE.test(host)) {
    throw new PostOfferValidationError(
      "patreon_destination_url must be a patreon.com host.",
      [{ field: "patreon_destination_url", issue: "host_not_allowed" }]
    );
  }
  return url.toString();
}

function toRecord(
  row: {
    id: string;
    creatorId: string;
    postId: string;
    audienceKey: string;
    discountCodeId: string | null;
    headline: string;
    ctaText: string;
    patreonDestinationUrl: string | null;
    redirectSlug?: string | null;
    active: boolean;
    createdAt: Date;
    updatedAt: Date;
    discountCode?: {
      id: string;
      code: string;
      percentOff: number;
      active: boolean;
      label: string | null;
    } | null;
  }
): PostMarketingOfferRecord {
  const base: PostMarketingOfferRecord = {
    id: row.id,
    creator_id: row.creatorId,
    post_id: row.postId,
    audience_key: row.audienceKey,
    discount_code_id: row.discountCodeId,
    headline: row.headline,
    cta_text: row.ctaText,
    patreon_destination_url: row.patreonDestinationUrl,
    redirect_slug: row.redirectSlug?.trim() || null,
    active: row.active,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString()
  };
  if (row.discountCodeId && !row.discountCode) {
    base.discount_code = null;
    base.code_missing = true;
  } else if (row.discountCode) {
    base.discount_code = {
      id: row.discountCode.id,
      code: row.discountCode.code,
      percent_off: row.discountCode.percentOff,
      active: row.discountCode.active,
      label: row.discountCode.label
    };
    base.code_missing = false;
  }
  return base;
}

export async function listPostMarketingOffers(
  prisma: PrismaClient,
  creatorId: string,
  postId: string
): Promise<PostMarketingOfferRecord[]> {
  const owned = await prisma.post.findFirst({
    where: { id: postId.trim(), creatorId: creatorId.trim() },
    select: { id: true }
  });
  if (!owned) return [];

  const rows = await prisma.postMarketingOffer.findMany({
    where: { creatorId: creatorId.trim(), postId: postId.trim() },
    include: { discountCode: true },
    orderBy: [{ audienceKey: "asc" }]
  });
  return rows.map(toRecord);
}

export async function upsertPostMarketingOffer(
  prisma: PrismaClient,
  input: {
    creatorId: string;
    postId: string;
    audienceKey: unknown;
    discountCodeId?: unknown;
    headline?: unknown;
    ctaText?: unknown;
    patreonDestinationUrl?: unknown;
    active?: unknown;
  }
): Promise<PostMarketingOfferRecord> {
  const creatorId = input.creatorId.trim();
  const postId = input.postId.trim();

  if (typeof input.audienceKey !== "string" || !isAudiencePersonaKey(input.audienceKey)) {
    throw new PostOfferValidationError("Invalid audience_key persona.", [
      { field: "audience_key", issue: "invalid" }
    ]);
  }
  const audienceKey = input.audienceKey.trim();

  const owned = await prisma.post.findFirst({
    where: { id: postId, creatorId },
    select: { id: true }
  });
  if (!owned) {
    throw new PostOfferValidationError("Post not found for this creator.", [
      { field: "post_id", issue: "not_found" }
    ]);
  }

  let discountCodeId: string | null | undefined = undefined;
  if (input.discountCodeId !== undefined) {
    if (input.discountCodeId === null || input.discountCodeId === "") {
      discountCodeId = null;
    } else if (typeof input.discountCodeId === "string") {
      const code = await prisma.creatorPatreonDiscountCode.findFirst({
        where: { id: input.discountCodeId.trim(), creatorId }
      });
      if (!code) {
        throw new PostOfferValidationError("discount_code_id not found for this creator.", [
          { field: "discount_code_id", issue: "not_found" }
        ]);
      }
      discountCodeId = code.id;
    } else {
      throw new PostOfferValidationError("discount_code_id must be a string or null.", [
        { field: "discount_code_id", issue: "type" }
      ]);
    }
  }

  let headline = "";
  if (input.headline !== undefined) {
    if (typeof input.headline !== "string") {
      throw new PostOfferValidationError("headline must be a string.", [
        { field: "headline", issue: "type" }
      ]);
    }
    headline = input.headline.trim();
    if (headline.length > 200) {
      throw new PostOfferValidationError("headline max 200 characters.", [
        { field: "headline", issue: "length" }
      ]);
    }
  }

  let ctaText = "";
  if (input.ctaText !== undefined) {
    if (typeof input.ctaText !== "string") {
      throw new PostOfferValidationError("cta_text must be a string.", [
        { field: "cta_text", issue: "type" }
      ]);
    }
    ctaText = input.ctaText.trim();
    if (ctaText.length > 120) {
      throw new PostOfferValidationError("cta_text max 120 characters.", [
        { field: "cta_text", issue: "length" }
      ]);
    }
  }

  const patreonDestinationUrl =
    input.patreonDestinationUrl !== undefined
      ? normalizePatreonDestinationUrl(input.patreonDestinationUrl)
      : undefined;

  let active = true;
  if (input.active !== undefined) {
    if (typeof input.active !== "boolean") {
      throw new PostOfferValidationError("active must be a boolean.", [
        { field: "active", issue: "type" }
      ]);
    }
    active = input.active;
  }

  const existing = await prisma.postMarketingOffer.findUnique({
    where: {
      creatorId_postId_audienceKey: { creatorId, postId, audienceKey }
    }
  });

  const row = existing
    ? await prisma.postMarketingOffer.update({
        where: { id: existing.id },
        data: {
          ...(discountCodeId !== undefined ? { discountCodeId } : {}),
          ...(input.headline !== undefined ? { headline } : {}),
          ...(input.ctaText !== undefined ? { ctaText } : {}),
          ...(patreonDestinationUrl !== undefined
            ? { patreonDestinationUrl }
            : {}),
          ...(input.active !== undefined ? { active } : {})
        },
        include: { discountCode: true }
      })
    : await prisma.postMarketingOffer.create({
        data: {
          creatorId,
          postId,
          audienceKey,
          discountCodeId: discountCodeId ?? null,
          headline,
          ctaText,
          patreonDestinationUrl: patreonDestinationUrl ?? null,
          active
        },
        include: { discountCode: true }
      });

  return toRecord(row);
}
