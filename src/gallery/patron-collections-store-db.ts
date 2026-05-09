/**
 * @fileoverview Postgres-backed patron saved collections + entries (snips feature).
 * @see ./patron-collections-store.ts JSON twin
 * @see prisma/schema.prisma `PatronSavedCollection`, `PatronSavedCollectionEntry`
 */

import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import type {
  PatronCollectionEntryRecord,
  PatronCollectionRecord
} from "./types.js";

/**
 * @description Maps patron saved collection row to wire {@link PatronCollectionRecord}.
 */
function colRowToRecord(row: {
  id: string;
  patronMembershipId: string;
  creatorId: string;
  title: string;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
  isPublic?: boolean;
}): PatronCollectionRecord {
  return {
    collection_id: row.id,
    user_id: row.patronMembershipId,
    creator_id: row.creatorId,
    title: row.title,
    sort_order: row.sortOrder,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
    is_public: row.isPublic ?? false
  };
}

/**
 * @description Maps patron saved collection entry row to wire {@link PatronCollectionEntryRecord}.
 */
function entryRowToRecord(row: {
  id: string;
  collectionId: string;
  patronMembershipId: string;
  creatorId: string;
  postId: string;
  mediaId: string;
  createdAt: Date;
  snapshotTierIds?: string[];
}): PatronCollectionEntryRecord {
  return {
    entry_id: row.id,
    collection_id: row.collectionId,
    user_id: row.patronMembershipId,
    creator_id: row.creatorId,
    post_id: row.postId,
    media_id: row.mediaId,
    created_at: row.createdAt.toISOString(),
    snapshot_tier_ids: row.snapshotTierIds ?? []
  };
}

/**
 * @description Prisma implementation for patron snips stores.
 * @async Methods reject on DB errors.
 * @throws {"Collection not found."} From {@link addEntry} when collection guard fails.
 * @security-audit-required Account-wide listing requires trusted `accountId`; per-row ops must align membership ids with session.
 */
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

  /**
   * PE-D / D29 — cross-creator collection listing for a single Account. Resolves every patron
   * `TenantMembership` for the account and fans the collection + entries query across all of
   * them. Same shape as `listCollectionsWithEntries` so list/render code stays uniform.
   *
   * Implemented as a 2-step query (memberships → collections) to avoid adding a Prisma
   * relation column to `PatronSavedCollection` — keeps the schema delta strictly additive.
   */
  public async listAllCollectionsWithEntriesForAccount(
    accountId: string
  ): Promise<Array<PatronCollectionRecord & { entries: PatronCollectionEntryRecord[] }>> {
    const memberships = await this.prisma.tenantMembership.findMany({
      where: { accountId },
      select: { id: true }
    });
    if (memberships.length === 0) {
      return [];
    }
    const membershipIds = memberships.map((m) => m.id);
    const cols = await this.prisma.patronSavedCollection.findMany({
      where: { patronMembershipId: { in: membershipIds } },
      orderBy: [{ sortOrder: "asc" }, { title: "asc" }]
    });
    if (cols.length === 0) {
      return [];
    }
    const ids = cols.map((c) => c.id);
    const entries = await this.prisma.patronSavedCollectionEntry.findMany({
      where: { collectionId: { in: ids } },
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
    patch: { title?: string; sort_order?: number; is_public?: boolean }
  ): Promise<PatronCollectionRecord | null> {
    const existing = await this.prisma.patronSavedCollection.findFirst({
      where: { id: collectionId, creatorId, patronMembershipId: userId }
    });
    if (!existing) {
      return null;
    }
    const data: {
      title?: string;
      sortOrder?: number;
      isPublic?: boolean;
      updatedAt: Date;
    } = {
      updatedAt: new Date()
    };
    if (typeof patch.title === "string") {
      data.title = patch.title.trim() || "Untitled";
    }
    if (typeof patch.sort_order === "number" && Number.isFinite(patch.sort_order)) {
      data.sortOrder = patch.sort_order;
    }
    if (typeof patch.is_public === "boolean") {
      data.isPublic = patch.is_public;
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
    mediaId: string,
    options?: { snapshot_tier_ids?: readonly string[] }
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
        createdAt: now,
        // Forensic snapshot at save time — never consulted for live access decisions (D29).
        snapshotTierIds: [...(options?.snapshot_tier_ids ?? [])]
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
