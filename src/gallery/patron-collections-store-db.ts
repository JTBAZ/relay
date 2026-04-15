import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import type {
  PatronCollectionEntryRecord,
  PatronCollectionRecord
} from "./types.js";

function colRowToRecord(row: {
  id: string;
  patronMembershipId: string;
  creatorId: string;
  title: string;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}): PatronCollectionRecord {
  return {
    collection_id: row.id,
    user_id: row.patronMembershipId,
    creator_id: row.creatorId,
    title: row.title,
    sort_order: row.sortOrder,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString()
  };
}

function entryRowToRecord(row: {
  id: string;
  collectionId: string;
  patronMembershipId: string;
  creatorId: string;
  postId: string;
  mediaId: string;
  createdAt: Date;
}): PatronCollectionEntryRecord {
  return {
    entry_id: row.id,
    collection_id: row.collectionId,
    user_id: row.patronMembershipId,
    creator_id: row.creatorId,
    post_id: row.postId,
    media_id: row.mediaId,
    created_at: row.createdAt.toISOString()
  };
}

export class DbPatronCollectionsStore {
  public constructor(private readonly prisma: PrismaClient) {}

  public async listCollectionsWithEntries(
    creatorId: string,
    userId: string
  ): Promise<Array<PatronCollectionRecord & { entries: PatronCollectionEntryRecord[] }>> {
    const cols = await this.prisma.patronSavedCollection.findMany({
      where: { creatorId, patronMembershipId: userId },
      orderBy: [{ sortOrder: "asc" }, { title: "asc" }]
    });
    if (cols.length === 0) {
      return [];
    }
    const ids = cols.map((c) => c.id);
    const entries = await this.prisma.patronSavedCollectionEntry.findMany({
      where: { collectionId: { in: ids }, patronMembershipId: userId },
      orderBy: { createdAt: "desc" }
    });
    const byCol = new Map<string, PatronCollectionEntryRecord[]>();
    for (const e of entries) {
      const rec = entryRowToRecord(e);
      const list = byCol.get(e.collectionId) ?? [];
      list.push(rec);
      byCol.set(e.collectionId, list);
    }
    return cols.map((c) => ({
      ...colRowToRecord(c),
      entries: byCol.get(c.id) ?? []
    }));
  }

  public async createCollection(
    creatorId: string,
    userId: string,
    title: string
  ): Promise<PatronCollectionRecord> {
    const maxAgg = await this.prisma.patronSavedCollection.aggregate({
      where: { creatorId, patronMembershipId: userId },
      _max: { sortOrder: true }
    });
    const sortOrder = (maxAgg._max.sortOrder ?? -1) + 1;
    const now = new Date();
    const row = await this.prisma.patronSavedCollection.create({
      data: {
        id: `pcol_${randomUUID()}`,
        patronMembershipId: userId,
        creatorId,
        title: title.trim() || "Untitled",
        sortOrder,
        createdAt: now,
        updatedAt: now
      }
    });
    return colRowToRecord(row);
  }

  public async updateCollection(
    creatorId: string,
    userId: string,
    collectionId: string,
    patch: { title?: string; sort_order?: number }
  ): Promise<PatronCollectionRecord | null> {
    const existing = await this.prisma.patronSavedCollection.findFirst({
      where: { id: collectionId, creatorId, patronMembershipId: userId }
    });
    if (!existing) {
      return null;
    }
    const data: { title?: string; sortOrder?: number; updatedAt: Date } = {
      updatedAt: new Date()
    };
    if (typeof patch.title === "string") {
      data.title = patch.title.trim() || "Untitled";
    }
    if (typeof patch.sort_order === "number" && Number.isFinite(patch.sort_order)) {
      data.sortOrder = patch.sort_order;
    }
    const row = await this.prisma.patronSavedCollection.update({
      where: { id: collectionId },
      data
    });
    return colRowToRecord(row);
  }

  public async deleteCollection(
    creatorId: string,
    userId: string,
    collectionId: string
  ): Promise<boolean> {
    const res = await this.prisma.patronSavedCollection.deleteMany({
      where: { id: collectionId, creatorId, patronMembershipId: userId }
    });
    return res.count > 0;
  }

  public async addEntry(
    creatorId: string,
    userId: string,
    collectionId: string,
    postId: string,
    mediaId: string
  ): Promise<PatronCollectionEntryRecord> {
    const col = await this.prisma.patronSavedCollection.findFirst({
      where: { id: collectionId, creatorId, patronMembershipId: userId }
    });
    if (!col) {
      throw new Error("Collection not found.");
    }
    const dup = await this.prisma.patronSavedCollectionEntry.findUnique({
      where: {
        patronMembershipId_creatorId_collectionId_mediaId: {
          patronMembershipId: userId,
          creatorId,
          collectionId,
          mediaId
        }
      }
    });
    if (dup) {
      return entryRowToRecord(dup);
    }
    const now = new Date();
    const row = await this.prisma.patronSavedCollectionEntry.create({
      data: {
        id: `pent_${randomUUID()}`,
        collectionId,
        patronMembershipId: userId,
        creatorId,
        postId,
        mediaId,
        createdAt: now
      }
    });
    await this.prisma.patronSavedCollection.update({
      where: { id: collectionId },
      data: { updatedAt: now }
    });
    return entryRowToRecord(row);
  }

  public async removeEntry(
    creatorId: string,
    userId: string,
    collectionId: string,
    postId: string,
    mediaId: string
  ): Promise<boolean> {
    const res = await this.prisma.patronSavedCollectionEntry.deleteMany({
      where: {
        collectionId,
        patronMembershipId: userId,
        creatorId,
        postId,
        mediaId
      }
    });
    if (res.count > 0) {
      await this.prisma.patronSavedCollection.updateMany({
        where: { id: collectionId, patronMembershipId: userId, creatorId },
        data: { updatedAt: new Date() }
      });
    }
    return res.count > 0;
  }

  public async listSnippedMediaIds(
    creatorId: string,
    userId: string
  ): Promise<Set<string>> {
    const rows = await this.prisma.patronSavedCollectionEntry.findMany({
      where: { creatorId, patronMembershipId: userId },
      select: { mediaId: true }
    });
    return new Set(rows.map((r) => r.mediaId));
  }
}
