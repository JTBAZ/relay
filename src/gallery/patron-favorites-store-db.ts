import type { PrismaClient } from "@prisma/client";
import { PatronFavoriteTargetKind as PrismaFavoriteKind } from "@prisma/client";
import type {
  PatronFavoriteRecord,
  PatronFavoriteTargetKind
} from "./types.js";

function toPrismaKind(kind: PatronFavoriteTargetKind): PrismaFavoriteKind {
  return kind === "post" ? PrismaFavoriteKind.post : PrismaFavoriteKind.media;
}

function fromPrismaKind(kind: PrismaFavoriteKind): PatronFavoriteTargetKind {
  return kind === PrismaFavoriteKind.post ? "post" : "media";
}

function rowToRecord(row: {
  patronMembershipId: string;
  creatorId: string;
  targetKind: PrismaFavoriteKind;
  targetId: string;
  createdAt: Date;
  snapshotTierIds?: string[];
}): PatronFavoriteRecord {
  return {
    user_id: row.patronMembershipId,
    creator_id: row.creatorId,
    target_kind: fromPrismaKind(row.targetKind),
    target_id: row.targetId,
    created_at: row.createdAt.toISOString(),
    snapshot_tier_ids: row.snapshotTierIds ?? []
  };
}

export class DbPatronFavoritesStore {
  public constructor(private readonly prisma: PrismaClient) {}

  public async listForUser(
    creatorId: string,
    userId: string
  ): Promise<PatronFavoriteRecord[]> {
    const rows = await this.prisma.patronFavorite.findMany({
      where: { creatorId, patronMembershipId: userId },
      orderBy: { createdAt: "asc" }
    });
    return rows.map(rowToRecord);
  }

  /**
   * PE-D / D29 — cross-creator favorites listing for a single Account. Resolves every patron
   * `TenantMembership` for the account, then fans the favorites query across all of them in
   * one round trip. Sorted oldest → newest like `listForUser`.
   *
   * Implemented as a 2-step query (memberships, then favorites) to avoid adding a Prisma
   * relation column to `PatronFavorite` — kept this PR's schema delta strictly additive.
   */
  public async listAllForAccount(accountId: string): Promise<PatronFavoriteRecord[]> {
    const memberships = await this.prisma.tenantMembership.findMany({
      where: { accountId },
      select: { id: true }
    });
    if (memberships.length === 0) {
      return [];
    }
    const rows = await this.prisma.patronFavorite.findMany({
      where: { patronMembershipId: { in: memberships.map((m) => m.id) } },
      orderBy: { createdAt: "asc" }
    });
    return rows.map(rowToRecord);
  }

  public async add(
    record: Omit<PatronFavoriteRecord, "created_at">
  ): Promise<PatronFavoriteRecord> {
    const targetKind = toPrismaKind(record.target_kind);
    const scope = {
      patronMembershipId: record.user_id,
      creatorId: record.creator_id,
      targetKind,
      targetId: record.target_id
    };
    const existing = await this.prisma.patronFavorite.findUnique({
      where: { patronMembershipId_creatorId_targetKind_targetId: scope }
    });
    if (existing) {
      return rowToRecord(existing);
    }
    const row = await this.prisma.patronFavorite.create({
      data: {
        patronMembershipId: record.user_id,
        creatorId: record.creator_id,
        targetKind,
        targetId: record.target_id,
        createdAt: new Date(),
        // Forensic snapshot — caller-provided current entitlement at favorite time. Empty
        // array is meaningful ("they had no entitlement when they favorited").
        snapshotTierIds: record.snapshot_tier_ids ?? []
      }
    });
    return rowToRecord(row);
  }

  public async remove(
    creatorId: string,
    userId: string,
    targetKind: PatronFavoriteTargetKind,
    targetId: string
  ): Promise<boolean> {
    const res = await this.prisma.patronFavorite.deleteMany({
      where: {
        creatorId,
        patronMembershipId: userId,
        targetKind: toPrismaKind(targetKind),
        targetId
      }
    });
    return res.count > 0;
  }
}
