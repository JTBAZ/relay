/**
 * Creator live tier-promotion defaults (Slice 9).
 */

import { Prisma, type PrismaClient } from "@prisma/client";
import { normalizePatreonDestinationUrl, PostOfferValidationError } from "./post-offer-service.js";

export const TIER_PROMO_SEGMENT_UNPERMISSIONED = "unpermissioned";

export type TierDefaultIssue = { field: string; issue: string };

export class TierPromotionDefaultValidationError extends Error {
  public override readonly name = "TierPromotionDefaultValidationError";
  public constructor(
    message: string,
    public readonly details: TierDefaultIssue[]
  ) {
    super(message);
  }
}

export type TierPromotionDefaultRecord = {
  id: string;
  creator_id: string;
  gate_relay_tier_id: string;
  segment: string;
  discount_code_id: string | null;
  headline: string;
  cta_text: string;
  patreon_destination_url: string | null;
  redirect_slug: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
  discount_code?: {
    id: string;
    code: string;
    percent_off: number;
    active: boolean;
    label: string | null;
  } | null;
  code_missing?: boolean;
};

function toRecord(row: {
  id: string;
  creatorId: string;
  gateRelayTierId: string;
  segment: string;
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
}): TierPromotionDefaultRecord {
  const base: TierPromotionDefaultRecord = {
    id: row.id,
    creator_id: row.creatorId,
    gate_relay_tier_id: row.gateRelayTierId,
    segment: row.segment,
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

function normalizeGateRelayTierId(raw: unknown): string {
  if (typeof raw !== "string" || !raw.trim()) {
    throw new TierPromotionDefaultValidationError("gate_relay_tier_id is required.", [
      { field: "gate_relay_tier_id", issue: "required" }
    ]);
  }
  const id = raw.trim();
  if (id.length > 120) {
    throw new TierPromotionDefaultValidationError("gate_relay_tier_id max 120 characters.", [
      { field: "gate_relay_tier_id", issue: "length" }
    ]);
  }
  return id;
}

function normalizeSegment(raw: unknown): string {
  if (raw === undefined || raw === null || raw === "") {
    return TIER_PROMO_SEGMENT_UNPERMISSIONED;
  }
  if (typeof raw !== "string" || raw.trim() !== TIER_PROMO_SEGMENT_UNPERMISSIONED) {
    throw new TierPromotionDefaultValidationError(
      'segment must be "unpermissioned".',
      [{ field: "segment", issue: "invalid" }]
    );
  }
  return TIER_PROMO_SEGMENT_UNPERMISSIONED;
}

export async function listCreatorTierPromotionDefaults(
  prisma: PrismaClient,
  creatorId: string
): Promise<TierPromotionDefaultRecord[]> {
  const rows = await prisma.creatorTierPromotionDefault.findMany({
    where: { creatorId: creatorId.trim() },
    include: { discountCode: true },
    orderBy: [{ gateRelayTierId: "asc" }]
  });
  return rows.map(toRecord);
}

export async function upsertCreatorTierPromotionDefault(
  prisma: PrismaClient,
  input: {
    creatorId: string;
    gateRelayTierId: unknown;
    segment?: unknown;
    discountCodeId?: unknown;
    headline?: unknown;
    ctaText?: unknown;
    patreonDestinationUrl?: unknown;
    active?: unknown;
  }
): Promise<TierPromotionDefaultRecord> {
  const creatorId = input.creatorId.trim();
  const gateRelayTierId = normalizeGateRelayTierId(input.gateRelayTierId);
  const segment = normalizeSegment(input.segment);

  let discountCodeId: string | null | undefined = undefined;
  if (input.discountCodeId !== undefined) {
    if (input.discountCodeId === null || input.discountCodeId === "") {
      discountCodeId = null;
    } else if (typeof input.discountCodeId === "string") {
      const code = await prisma.creatorPatreonDiscountCode.findFirst({
        where: { id: input.discountCodeId.trim(), creatorId }
      });
      if (!code) {
        throw new TierPromotionDefaultValidationError(
          "discount_code_id not found for this creator.",
          [{ field: "discount_code_id", issue: "not_found" }]
        );
      }
      discountCodeId = code.id;
    } else {
      throw new TierPromotionDefaultValidationError(
        "discount_code_id must be a string or null.",
        [{ field: "discount_code_id", issue: "type" }]
      );
    }
  }

  let headline = "";
  if (input.headline !== undefined) {
    if (typeof input.headline !== "string") {
      throw new TierPromotionDefaultValidationError("headline must be a string.", [
        { field: "headline", issue: "type" }
      ]);
    }
    headline = input.headline.trim();
    if (headline.length > 200) {
      throw new TierPromotionDefaultValidationError("headline max 200 characters.", [
        { field: "headline", issue: "length" }
      ]);
    }
  }

  let ctaText = "";
  if (input.ctaText !== undefined) {
    if (typeof input.ctaText !== "string") {
      throw new TierPromotionDefaultValidationError("cta_text must be a string.", [
        { field: "cta_text", issue: "type" }
      ]);
    }
    ctaText = input.ctaText.trim();
    if (ctaText.length > 120) {
      throw new TierPromotionDefaultValidationError("cta_text max 120 characters.", [
        { field: "cta_text", issue: "length" }
      ]);
    }
  }

  let patreonDestinationUrl: string | null | undefined = undefined;
  if (input.patreonDestinationUrl !== undefined) {
    try {
      patreonDestinationUrl = normalizePatreonDestinationUrl(input.patreonDestinationUrl);
    } catch (e) {
      if (e instanceof PostOfferValidationError) {
        throw new TierPromotionDefaultValidationError(e.message, e.details);
      }
      throw e;
    }
  }

  let active = true;
  if (input.active !== undefined) {
    if (typeof input.active !== "boolean") {
      throw new TierPromotionDefaultValidationError("active must be a boolean.", [
        { field: "active", issue: "type" }
      ]);
    }
    active = input.active;
  }

  const existing = await prisma.creatorTierPromotionDefault.findUnique({
    where: {
      creatorId_gateRelayTierId_segment: { creatorId, gateRelayTierId, segment }
    }
  });

  try {
    const row = existing
      ? await prisma.creatorTierPromotionDefault.update({
          where: { id: existing.id },
          data: {
            ...(discountCodeId !== undefined ? { discountCodeId } : {}),
            ...(input.headline !== undefined ? { headline } : {}),
            ...(input.ctaText !== undefined ? { ctaText } : {}),
            ...(patreonDestinationUrl !== undefined ? { patreonDestinationUrl } : {}),
            ...(input.active !== undefined ? { active } : {})
          },
          include: { discountCode: true }
        })
      : await prisma.creatorTierPromotionDefault.create({
          data: {
            creatorId,
            gateRelayTierId,
            segment,
            discountCodeId: discountCodeId ?? null,
            headline,
            ctaText,
            patreonDestinationUrl: patreonDestinationUrl ?? null,
            active
          },
          include: { discountCode: true }
        });
    return toRecord(row);
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      throw new TierPromotionDefaultValidationError(
        "An active default already exists for this gate tier and segment.",
        [{ field: "gate_relay_tier_id", issue: "duplicate" }]
      );
    }
    throw e;
  }
}

export async function deleteCreatorTierPromotionDefault(
  prisma: PrismaClient,
  input: { creatorId: string; defaultId: string }
): Promise<boolean> {
  const existing = await prisma.creatorTierPromotionDefault.findFirst({
    where: { id: input.defaultId.trim(), creatorId: input.creatorId.trim() },
    select: { id: true }
  });
  if (!existing) return false;
  await prisma.creatorTierPromotionDefault.delete({ where: { id: existing.id } });
  return true;
}
