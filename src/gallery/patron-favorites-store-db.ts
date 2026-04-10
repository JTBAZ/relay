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
  patronUserId: string;
  creatorId: string;
  targetKind: PrismaFavoriteKind;
  targetId: string;
  createdAt: Date;
}): PatronFavoriteRecord {
  return {
    user_id: row.patronUserId,
    creator_id: row.creatorId,
    target_kind: fromPrismaKind(row.targetKind),
    target_id: row.targetId,
    created_at: row.createdAt.toISOString()
  };
}

export class DbPatronFavoritesStore {
  public constructor(private readonly prisma: PrismaClient) {}

  public async listForUser(
    creatorId: string,
    userId: string
  ): Promise<PatronFavoriteRecord[]> {
    const rows = await this.prisma.patronFavorite.findMany({
      where: { creatorId, patronUserId: userId },
      orderBy: { createdAt: "asc" }
    });
    return rows.map(rowToRecord);
  }

  public async add(
    record: Omit<PatronFavoriteRecord, "created_at">
  ): Promise<PatronFavoriteRecord> {
    const targetKind = toPrismaKind(record.target_kind);
    const scope = {
      patronUserId: record.user_id,
      creatorId: record.creator_id,
      targetKind,
      targetId: record.target_id
    };
    const existing = await this.prisma.patronFavorite.findUnique({
      where: { patronUserId_creatorId_targetKind_targetId: scope }
    });
    if (existing) {
      return rowToRecord(existing);
    }
    const row = await this.prisma.patronFavorite.create({
      data: {
        patronUserId: record.user_id,
        creatorId: record.creator_id,
        targetKind,
        targetId: record.target_id,
        createdAt: new Date()
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
        patronUserId: userId,
        targetKind: toPrismaKind(targetKind),
        targetId
      }
    });
    return res.count > 0;
  }
}
