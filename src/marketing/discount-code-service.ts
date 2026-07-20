/**
 * Creator-supplied Patreon discount code library (Slice 4).
 * Relay never creates Patreon coupons — codes are stored as creator-entered strings.
 */

import { Prisma, type PrismaClient } from "@prisma/client";

export const MAX_CREATOR_DISCOUNT_CODES = 50;

export type DiscountCodeIssue = { field: string; issue: string };

export class DiscountCodeValidationError extends Error {
  public override readonly name = "DiscountCodeValidationError";
  public constructor(
    message: string,
    public readonly details: DiscountCodeIssue[]
  ) {
    super(message);
  }
}

export type DiscountCodeRecord = {
  id: string;
  creator_id: string;
  label: string | null;
  code: string;
  percent_off: number;
  active: boolean;
  created_at: string;
  updated_at: string;
};

function toRecord(row: {
  id: string;
  creatorId: string;
  label: string | null;
  code: string;
  percentOff: number;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}): DiscountCodeRecord {
  return {
    id: row.id,
    creator_id: row.creatorId,
    label: row.label,
    code: row.code,
    percent_off: row.percentOff,
    active: row.active,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString()
  };
}

/** Uppercase A–Z / 0–9 / _ / - ; length 2–40. Never log the raw code at call sites. */
export function normalizeDiscountCode(raw: unknown): string {
  if (typeof raw !== "string") {
    throw new DiscountCodeValidationError("code is required.", [
      { field: "code", issue: "required" }
    ]);
  }
  const code = raw.trim().toUpperCase();
  if (code.length < 2 || code.length > 40) {
    throw new DiscountCodeValidationError("code must be 2–40 characters.", [
      { field: "code", issue: "length" }
    ]);
  }
  if (!/^[A-Z0-9][A-Z0-9_-]*$/.test(code)) {
    throw new DiscountCodeValidationError(
      "code may only use letters, digits, underscore, and hyphen.",
      [{ field: "code", issue: "charset" }]
    );
  }
  return code;
}

export function normalizePercentOff(raw: unknown): number {
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isInteger(n) || n < 1 || n > 100) {
    throw new DiscountCodeValidationError("percent_off must be an integer 1–100.", [
      { field: "percent_off", issue: "range" }
    ]);
  }
  return n;
}

export async function listCreatorDiscountCodes(
  prisma: PrismaClient,
  creatorId: string
): Promise<DiscountCodeRecord[]> {
  const rows = await prisma.creatorPatreonDiscountCode.findMany({
    where: { creatorId: creatorId.trim() },
    orderBy: [{ updatedAt: "desc" }]
  });
  return rows.map(toRecord);
}

export async function createCreatorDiscountCode(
  prisma: PrismaClient,
  input: {
    creatorId: string;
    code: unknown;
    percentOff: unknown;
    label?: unknown;
  }
): Promise<DiscountCodeRecord> {
  const creatorId = input.creatorId.trim();
  const code = normalizeDiscountCode(input.code);
  const percentOff = normalizePercentOff(input.percentOff);
  let label: string | null = null;
  if (input.label !== undefined && input.label !== null) {
    if (typeof input.label !== "string") {
      throw new DiscountCodeValidationError("label must be a string.", [
        { field: "label", issue: "type" }
      ]);
    }
    const t = input.label.trim();
    if (t.length > 80) {
      throw new DiscountCodeValidationError("label max 80 characters.", [
        { field: "label", issue: "length" }
      ]);
    }
    label = t.length ? t : null;
  }

  const count = await prisma.creatorPatreonDiscountCode.count({ where: { creatorId } });
  if (count >= MAX_CREATOR_DISCOUNT_CODES) {
    throw new DiscountCodeValidationError(
      `At most ${MAX_CREATOR_DISCOUNT_CODES} codes per creator.`,
      [{ field: "codes", issue: "max_count" }]
    );
  }

  try {
    const row = await prisma.creatorPatreonDiscountCode.create({
      data: { creatorId, code, percentOff, label, active: true }
    });
    return toRecord(row);
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      throw new DiscountCodeValidationError("That code already exists for this creator.", [
        { field: "code", issue: "duplicate" }
      ]);
    }
    throw e;
  }
}

export async function updateCreatorDiscountCode(
  prisma: PrismaClient,
  input: {
    creatorId: string;
    codeId: string;
    label?: unknown;
    percentOff?: unknown;
    active?: unknown;
  }
): Promise<DiscountCodeRecord | null> {
  const creatorId = input.creatorId.trim();
  const existing = await prisma.creatorPatreonDiscountCode.findFirst({
    where: { id: input.codeId.trim(), creatorId }
  });
  if (!existing) return null;

  const data: {
    label?: string | null;
    percentOff?: number;
    active?: boolean;
  } = {};

  if (input.label !== undefined) {
    if (input.label === null) data.label = null;
    else if (typeof input.label === "string") {
      const t = input.label.trim();
      if (t.length > 80) {
        throw new DiscountCodeValidationError("label max 80 characters.", [
          { field: "label", issue: "length" }
        ]);
      }
      data.label = t.length ? t : null;
    } else {
      throw new DiscountCodeValidationError("label must be a string or null.", [
        { field: "label", issue: "type" }
      ]);
    }
  }
  if (input.percentOff !== undefined) {
    data.percentOff = normalizePercentOff(input.percentOff);
  }
  if (input.active !== undefined) {
    if (typeof input.active !== "boolean") {
      throw new DiscountCodeValidationError("active must be a boolean.", [
        { field: "active", issue: "type" }
      ]);
    }
    data.active = input.active;
  }

  const row = await prisma.creatorPatreonDiscountCode.update({
    where: { id: existing.id },
    data
  });
  return toRecord(row);
}

/** Per-code reference counts for Studio Promos Codes / Tier Rules alignment. */
export type DiscountCodeUsageSummary = {
  discount_code_id: string;
  tier_rule_active_count: number;
  tier_rule_inactive_count: number;
  post_offer_active_count: number;
  post_offer_inactive_count: number;
};

/**
 * Pure aggregation — callers supply already-scoped reference rows for one creator.
 */
export function summarizeDiscountCodeUsage(args: {
  code_ids: readonly string[];
  tier_rules: ReadonlyArray<{ discount_code_id: string | null; active: boolean }>;
  post_offers: ReadonlyArray<{ discount_code_id: string | null; active: boolean }>;
}): DiscountCodeUsageSummary[] {
  const idSet = new Set(args.code_ids.filter(Boolean));
  const byId = new Map<string, DiscountCodeUsageSummary>();
  for (const id of idSet) {
    byId.set(id, {
      discount_code_id: id,
      tier_rule_active_count: 0,
      tier_rule_inactive_count: 0,
      post_offer_active_count: 0,
      post_offer_inactive_count: 0
    });
  }

  for (const rule of args.tier_rules) {
    const id = rule.discount_code_id?.trim();
    if (!id || !byId.has(id)) continue;
    const row = byId.get(id)!;
    if (rule.active) row.tier_rule_active_count += 1;
    else row.tier_rule_inactive_count += 1;
  }
  for (const offer of args.post_offers) {
    const id = offer.discount_code_id?.trim();
    if (!id || !byId.has(id)) continue;
    const row = byId.get(id)!;
    if (offer.active) row.post_offer_active_count += 1;
    else row.post_offer_inactive_count += 1;
  }

  return [...byId.values()].sort((a, b) =>
    a.discount_code_id.localeCompare(b.discount_code_id)
  );
}

/**
 * Creator-scoped usage counts for the discount code library (no offer bodies).
 */
export async function loadDiscountCodeUsageSummaries(
  prisma: PrismaClient,
  creatorId: string
): Promise<DiscountCodeUsageSummary[]> {
  const codes = await prisma.creatorPatreonDiscountCode.findMany({
    where: { creatorId },
    select: { id: true }
  });
  if (codes.length === 0) return [];

  const codeIds = codes.map((c) => c.id);
  const [tierRules, postOffers] = await Promise.all([
    prisma.creatorTierPromotionDefault.findMany({
      where: { creatorId, discountCodeId: { in: codeIds } },
      select: { discountCodeId: true, active: true }
    }),
    prisma.postMarketingOffer.findMany({
      where: { creatorId, discountCodeId: { in: codeIds } },
      select: { discountCodeId: true, active: true }
    })
  ]);

  return summarizeDiscountCodeUsage({
    code_ids: codeIds,
    tier_rules: tierRules.map((r) => ({
      discount_code_id: r.discountCodeId,
      active: r.active
    })),
    post_offers: postOffers.map((o) => ({
      discount_code_id: o.discountCodeId,
      active: o.active
    }))
  });
}
