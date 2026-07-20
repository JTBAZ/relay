import type {
  CreatorPromoSlotTargetKind,
  Prisma,
  PrismaClient
} from "@prisma/client";
import {
  resolveTipEligibility,
  type TipEligibilityReason,
  type TipEligibilityResult
} from "../tips/tip-eligibility.js";

export type CreatorPromoSlotRank = 1 | 2 | 3 | 4 | 5;

export type CreatorPromoSlotTipEligibilityWire = {
  eligible: boolean;
  reasons: TipEligibilityReason[];
};

export type CreatorPromoSlotRow = {
  promo_piece_id: string;
  slot_rank: CreatorPromoSlotRank;
  target_kind: CreatorPromoSlotTargetKind;
  target_id: string;
  post_id?: string;
  title?: string;
  thumb_url_path?: string;
  label?: string | null;
  metadata?: unknown | null;
  tip_eligible: boolean;
  tip_eligibility: CreatorPromoSlotTipEligibilityWire;
};
export type CreatorPromoSlotsReadModel = {
  creator_id: string;
  slots: CreatorPromoSlotRow[];
};

export type CreatorPromoSlotPutRow = {
  slot_rank: number;
  target_kind: CreatorPromoSlotTargetKind;
  target_id: string;
  label?: string | null;
  metadata?: Prisma.InputJsonValue | null;
};

export type CreatorPromoSlotIssue = {
  field: string;
  issue: string;
};

export class CreatorPromoSlotValidationError extends Error {
  public override readonly name = "CreatorPromoSlotValidationError";

  public constructor(
    message: string,
    public readonly details: CreatorPromoSlotIssue[]
  ) {
    super(message);
  }
}

export class CreatorPromoSlotTargetNotFoundError extends Error {
  public override readonly name = "CreatorPromoSlotTargetNotFoundError";

  public constructor(
    message: string,
    public readonly details: CreatorPromoSlotIssue[]
  ) {
    super(message);
  }
}

type SanitizedPromoSlotPutRow = {
  /** Compact rank after validation (1…N in input order). */
  slot_rank: CreatorPromoSlotRank;
  target_kind: CreatorPromoSlotTargetKind;
  target_id: string;
  label: string | null;
  /** null = leave existing metadata; undefined in put means null on create. */
  metadata: Prisma.InputJsonValue | null;
  metadataProvided: boolean;
};

function normalizeCreatorId(creatorId: string): string {
  return creatorId.trim();
}

function toRankLiteral(value: number): CreatorPromoSlotRank {
  return value as CreatorPromoSlotRank;
}

type MediaThumbSource = {
  id: string;
  currentMimeType?: string | null;
  currentStorageKey?: string | null;
  currentUpstreamUrl?: string | null;
};

/**
 * Owner-facing gallery thumb path (same contract as `gallery/query.ts`).
 * Storage keys / upstream URLs are not HTTP paths — never return those here.
 */
function exportThumbUrlPath(
  creatorId: string,
  media: MediaThumbSource | null | undefined
): string | undefined {
  if (!media?.id) return undefined;
  const hasExport = Boolean(
    media.currentStorageKey?.trim() || media.currentUpstreamUrl?.trim()
  );
  if (!hasExport || !media.currentMimeType?.startsWith("image/")) {
    return undefined;
  }
  return `/api/v1/export/media/${encodeURIComponent(creatorId)}/${encodeURIComponent(media.id)}/thumb`;
}

function targetKey(kind: CreatorPromoSlotTargetKind, targetId: string): string {
  return `${kind}:${targetId}`;
}

/**
 * Validate put rows, reject duplicate targets, and compact ranks to 1…N
 * in ascending input-rank order (stable presentation order).
 */
function validatePutRows(rows: CreatorPromoSlotPutRow[]): SanitizedPromoSlotPutRow[] {
  if (rows.length > 5) {
    throw new CreatorPromoSlotValidationError(
      "A maximum of 5 promo slots may be saved.",
      [{ field: "slots", issue: "max_5" }]
    );
  }

  const details: CreatorPromoSlotIssue[] = [];
  const seenRanks = new Set<number>();
  const seenTargets = new Set<string>();
  const staged: Array<{
    idx: number;
    inputRank: number;
    target_kind: CreatorPromoSlotTargetKind;
    target_id: string;
    label: string | null;
    metadata: Prisma.InputJsonValue | null;
    metadataProvided: boolean;
  }> = [];

  rows.forEach((row, idx) => {
    const rank = Number(row.slot_rank);
    if (!Number.isInteger(rank) || rank < 1 || rank > 5) {
      details.push({
        field: `slots[${idx}].slot_rank`,
        issue: "must_be_integer_between_1_and_5"
      });
      return;
    }
    if (seenRanks.has(rank)) {
      details.push({
        field: `slots[${idx}].slot_rank`,
        issue: "duplicate_rank"
      });
      return;
    }
    seenRanks.add(rank);

    const kind = row.target_kind;
    if (kind !== "post" && kind !== "media") {
      details.push({
        field: `slots[${idx}].target_kind`,
        issue: "must_be_post_or_media"
      });
      return;
    }

    const targetId = typeof row.target_id === "string" ? row.target_id.trim() : "";
    if (!targetId) {
      details.push({
        field: `slots[${idx}].target_id`,
        issue: "required"
      });
      return;
    }

    const key = targetKey(kind, targetId);
    if (seenTargets.has(key)) {
      details.push({
        field: `slots[${idx}].target_id`,
        issue: "duplicate_target"
      });
      return;
    }
    seenTargets.add(key);

    const label =
      row.label == null
        ? null
        : typeof row.label === "string"
          ? row.label.trim() || null
          : null;
    if (row.label != null && typeof row.label !== "string") {
      details.push({
        field: `slots[${idx}].label`,
        issue: "must_be_string_or_null"
      });
      return;
    }

    staged.push({
      idx,
      inputRank: rank,
      target_kind: kind,
      target_id: targetId,
      label,
      metadata: row.metadata === undefined ? null : row.metadata,
      metadataProvided: row.metadata !== undefined
    });
  });

  if (details.length > 0) {
    throw new CreatorPromoSlotValidationError("Invalid promo slot payload.", details);
  }

  staged.sort((a, b) => a.inputRank - b.inputRank || a.idx - b.idx);
  return staged.map((row, orderIdx) => ({
    slot_rank: toRankLiteral(orderIdx + 1),
    target_kind: row.target_kind,
    target_id: row.target_id,
    label: row.label,
    metadata: row.metadata,
    metadataProvided: row.metadataProvided
  }));
}

async function assertTargetsExistForCreator(
  prisma: PrismaClient,
  creatorId: string,
  rows: SanitizedPromoSlotPutRow[]
): Promise<void> {
  const postIds = rows
    .filter((r) => r.target_kind === "post")
    .map((r) => r.target_id);
  const mediaIds = rows
    .filter((r) => r.target_kind === "media")
    .map((r) => r.target_id);

  const [posts, media] = await Promise.all([
    postIds.length > 0
      ? prisma.post.findMany({
          where: { id: { in: postIds }, creatorId },
          select: { id: true }
        })
      : Promise.resolve([] as Array<{ id: string }>),
    mediaIds.length > 0
      ? prisma.mediaAsset.findMany({
          where: { id: { in: mediaIds }, creatorId },
          select: { id: true }
        })
      : Promise.resolve([] as Array<{ id: string }>)
  ]);

  const postSet = new Set(posts.map((p) => p.id));
  const mediaSet = new Set(media.map((m) => m.id));
  const missing: CreatorPromoSlotIssue[] = [];
  for (let i = 0; i < rows.length; i += 1) {
    const r = rows[i]!;
    if (r.target_kind === "post" && !postSet.has(r.target_id)) {
      missing.push({
        field: `slots[${i}].target_id`,
        issue: "post_not_found_for_creator"
      });
    }
    if (r.target_kind === "media" && !mediaSet.has(r.target_id)) {
      missing.push({
        field: `slots[${i}].target_id`,
        issue: "media_not_found_for_creator"
      });
    }
  }

  if (missing.length > 0) {
    throw new CreatorPromoSlotTargetNotFoundError(
      "One or more promo targets were not found for this creator.",
      missing
    );
  }
}

export async function getCreatorPromoSlots(
  prisma: PrismaClient,
  relayCreatorId: string
): Promise<CreatorPromoSlotsReadModel> {
  const creatorId = normalizeCreatorId(relayCreatorId);
  if (!creatorId) {
    throw new CreatorPromoSlotValidationError("creator_id required.", [
      { field: "creator_id", issue: "required" }
    ]);
  }

  const rows = await prisma.creatorPromoSlot.findMany({
    where: { creatorId },
    orderBy: { slotRank: "asc" },
    select: {
      id: true,
      slotRank: true,
      targetKind: true,
      targetId: true,
      label: true,
      metadata: true,
      tipEligible: true
    }
  });
  if (rows.length === 0) {
    return { creator_id: creatorId, slots: [] };
  }

  const mediaTargetIds = rows
    .filter((row) => row.targetKind === "media")
    .map((row) => row.targetId);
  const postTargetIds = rows
    .filter((row) => row.targetKind === "post")
    .map((row) => row.targetId);

  const mediaRows =
    mediaTargetIds.length > 0
      ? await prisma.mediaAsset.findMany({
          where: { id: { in: mediaTargetIds }, creatorId },
          select: {
            id: true,
            primaryPostId: true,
            currentMimeType: true,
            currentStorageKey: true,
            currentUpstreamUrl: true
          }
        })
      : [];

  const mediaById = new Map(mediaRows.map((m) => [m.id, m]));
  const resolvedPostIds = new Set(postTargetIds);
  for (const media of mediaRows) {
    if (media.primaryPostId) {
      resolvedPostIds.add(media.primaryPostId);
    }
  }

  const postRows =
    resolvedPostIds.size > 0
      ? await prisma.post.findMany({
          where: { id: { in: [...resolvedPostIds] }, creatorId },
          select: {
            id: true,
            versions: {
              orderBy: { publishedAt: "desc" },
              take: 1,
              select: { title: true }
            },
            mediaAssets: {
              orderBy: { currentIngestedAt: "desc" },
              take: 1,
              select: {
                id: true,
                currentMimeType: true,
                currentStorageKey: true,
                currentUpstreamUrl: true
              }
            }
          }
        })
      : [];
  const postById = new Map(postRows.map((p) => [p.id, p]));

  const slots: CreatorPromoSlotRow[] = [];
  for (const row of rows) {
    let base: Omit<CreatorPromoSlotRow, "tip_eligible" | "tip_eligibility">;
    if (row.targetKind === "post") {
      const post = postById.get(row.targetId);
      base = {
        promo_piece_id: row.id,
        slot_rank: toRankLiteral(row.slotRank),
        target_kind: "post",
        target_id: row.targetId,
        post_id: post?.id,
        title: post?.versions[0]?.title ?? undefined,
        thumb_url_path: exportThumbUrlPath(creatorId, post?.mediaAssets[0]),
        label: row.label,
        metadata: row.metadata ?? null
      };
    } else {
      const media = mediaById.get(row.targetId);
      const post = media?.primaryPostId ? postById.get(media.primaryPostId) : undefined;
      base = {
        promo_piece_id: row.id,
        slot_rank: toRankLiteral(row.slotRank),
        target_kind: "media",
        target_id: row.targetId,
        post_id: post?.id,
        title: post?.versions[0]?.title ?? undefined,
        thumb_url_path:
          exportThumbUrlPath(creatorId, media) ??
          exportThumbUrlPath(creatorId, post?.mediaAssets[0]),
        label: row.label,
        metadata: row.metadata ?? null
      };
    }

    const tipEligibility = await tipEligibilityForSlot(prisma, {
      creatorId,
      postId: base.post_id ?? (row.targetKind === "post" ? row.targetId : null)
    });
    slots.push({
      ...base,
      tip_eligible: row.tipEligible ?? true,
      tip_eligibility: {
        eligible: tipEligibility.eligible,
        reasons: tipEligibility.reasons
      }
    });
  }

  return { creator_id: creatorId, slots };
}

async function tipEligibilityForSlot(
  prisma: PrismaClient,
  args: { creatorId: string; postId: string | null | undefined }
): Promise<TipEligibilityResult> {
  const postId = args.postId?.trim();
  if (!postId) {
    return {
      eligible: false,
      reasons: ["not_in_promo_pool"],
      promo_slot_id: null,
      creator_id: args.creatorId
    };
  }
  return resolveTipEligibility(prisma, {
    creatorId: args.creatorId,
    postId
  });
}

export async function putCreatorPromoSlots(
  prisma: PrismaClient,
  relayCreatorId: string,
  rows: CreatorPromoSlotPutRow[]
): Promise<CreatorPromoSlotsReadModel> {
  const creatorId = normalizeCreatorId(relayCreatorId);
  if (!creatorId) {
    throw new CreatorPromoSlotValidationError("creator_id required.", [
      { field: "creator_id", issue: "required" }
    ]);
  }

  const sanitized = validatePutRows(rows);
  await assertTargetsExistForCreator(prisma, creatorId, sanitized);

  const existing = await prisma.creatorPromoSlot.findMany({
    where: { creatorId },
    select: {
      id: true,
      targetKind: true,
      targetId: true,
      label: true,
      metadata: true,
      tipEligible: true
    }
  });
  const existingByTarget = new Map(
    existing.map((row) => [targetKey(row.targetKind, row.targetId), row] as const)
  );

  await prisma.$transaction(async (tx) => {
    await tx.creatorPromoSlot.deleteMany({ where: { creatorId } });
    for (const row of sanitized) {
      const prior = existingByTarget.get(targetKey(row.target_kind, row.target_id));
      const metadata =
        row.metadataProvided
          ? row.metadata
          : prior
            ? (prior.metadata as Prisma.InputJsonValue | null)
            : null;
      await tx.creatorPromoSlot.create({
        data: {
          ...(prior ? { id: prior.id } : {}),
          creatorId,
          slotRank: row.slot_rank,
          targetKind: row.target_kind,
          targetId: row.target_id,
          label: row.label,
          tipEligible: prior?.tipEligible ?? true,
          ...(metadata !== null && metadata !== undefined ? { metadata } : {})
        }
      });
    }
  });

  return getCreatorPromoSlots(prisma, creatorId);
}

/**
 * Toggle Tips eligibility for one Promo Pool slot (MB-7).
 */
export async function patchCreatorPromoSlotTipEligible(
  prisma: PrismaClient,
  relayCreatorId: string,
  promoPieceId: string,
  tipEligible: boolean
): Promise<CreatorPromoSlotRow> {
  const creatorId = normalizeCreatorId(relayCreatorId);
  const id = promoPieceId.trim();
  if (!creatorId || !id) {
    throw new CreatorPromoSlotValidationError("creator_id and promo piece id required.", [
      { field: !creatorId ? "creator_id" : "id", issue: "required" }
    ]);
  }

  const updated = await prisma.creatorPromoSlot.updateMany({
    where: { id, creatorId },
    data: { tipEligible }
  });
  if (updated.count === 0) {
    throw new CreatorPromoSlotTargetNotFoundError("Promo slot not found for this creator.", [
      { field: "id", issue: "not_found" }
    ]);
  }

  const model = await getCreatorPromoSlots(prisma, creatorId);
  const slot = model.slots.find((s) => s.promo_piece_id === id);
  if (!slot) {
    throw new CreatorPromoSlotTargetNotFoundError("Promo slot not found after update.", [
      { field: "id", issue: "not_found" }
    ]);
  }
  return slot;
}
