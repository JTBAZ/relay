import type {
  CreatorPromoSlotTargetKind,
  Prisma,
  PrismaClient
} from "@prisma/client";

export type CreatorPromoSlotRank = 1 | 2 | 3 | 4 | 5;

export type CreatorPromoSlotRow = {
  slot_rank: CreatorPromoSlotRank;
  target_kind: CreatorPromoSlotTargetKind;
  target_id: string;
  post_id?: string;
  title?: string;
  thumb_url_path?: string;
  label?: string | null;
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
  slot_rank: CreatorPromoSlotRank;
  target_kind: CreatorPromoSlotTargetKind;
  target_id: string;
  label: string | null;
  metadata: Prisma.InputJsonValue | null;
};

function normalizeCreatorId(creatorId: string): string {
  return creatorId.trim();
}

function toRankLiteral(value: number): CreatorPromoSlotRank {
  return value as CreatorPromoSlotRank;
}

function firstDefined<T>(...values: Array<T | null | undefined>): T | undefined {
  for (const value of values) {
    if (value !== undefined && value !== null) return value;
  }
  return undefined;
}

function validatePutRows(rows: CreatorPromoSlotPutRow[]): SanitizedPromoSlotPutRow[] {
  if (rows.length > 5) {
    throw new CreatorPromoSlotValidationError(
      "A maximum of 5 promo slots may be saved.",
      [{ field: "slots", issue: "max_5" }]
    );
  }

  const details: CreatorPromoSlotIssue[] = [];
  const seenRanks = new Set<number>();
  const out: SanitizedPromoSlotPutRow[] = [];

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

    out.push({
      slot_rank: toRankLiteral(rank),
      target_kind: kind,
      target_id: targetId,
      label,
      metadata: row.metadata === undefined ? null : row.metadata
    });
  });

  if (details.length > 0) {
    throw new CreatorPromoSlotValidationError("Invalid promo slot payload.", details);
  }
  return out;
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
      slotRank: true,
      targetKind: true,
      targetId: true,
      label: true
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
              select: { currentStorageKey: true, currentUpstreamUrl: true }
            }
          }
        })
      : [];
  const postById = new Map(postRows.map((p) => [p.id, p]));

  const slots: CreatorPromoSlotRow[] = rows.map((row) => {
    if (row.targetKind === "post") {
      const post = postById.get(row.targetId);
      return {
        slot_rank: toRankLiteral(row.slotRank),
        target_kind: "post",
        target_id: row.targetId,
        post_id: post?.id,
        title: post?.versions[0]?.title ?? undefined,
        thumb_url_path: firstDefined(
          post?.mediaAssets[0]?.currentStorageKey,
          post?.mediaAssets[0]?.currentUpstreamUrl
        ),
        label: row.label
      };
    }

    const media = mediaById.get(row.targetId);
    const post = media?.primaryPostId ? postById.get(media.primaryPostId) : undefined;
    return {
      slot_rank: toRankLiteral(row.slotRank),
      target_kind: "media",
      target_id: row.targetId,
      post_id: post?.id,
      title: post?.versions[0]?.title ?? undefined,
      thumb_url_path: firstDefined(
        media?.currentStorageKey,
        media?.currentUpstreamUrl,
        post?.mediaAssets[0]?.currentStorageKey,
        post?.mediaAssets[0]?.currentUpstreamUrl
      ),
      label: row.label
    };
  });

  return { creator_id: creatorId, slots };
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

  await prisma.$transaction(async (tx) => {
    await tx.creatorPromoSlot.deleteMany({ where: { creatorId } });
    for (const row of sanitized) {
      await tx.creatorPromoSlot.create({
        data: {
          creatorId,
          slotRank: row.slot_rank,
          targetKind: row.target_kind,
          targetId: row.target_id,
          label: row.label,
          ...(row.metadata !== null ? { metadata: row.metadata } : {})
        }
      });
    }
  });

  return getCreatorPromoSlots(prisma, creatorId);
}
