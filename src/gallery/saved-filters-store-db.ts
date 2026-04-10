import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import type { PrismaClient } from "@prisma/client";
import type { SavedFiltersStore } from "./saved-filters-store.js";
import type { SavedFilterRecord, SavedFiltersRoot } from "./types.js";

function toRecord(row: {
  id: string;
  creatorId: string;
  name: string;
  query: Prisma.JsonValue;
  createdAt: Date;
}): SavedFilterRecord {
  return {
    filter_id: row.id,
    creator_id: row.creatorId,
    name: row.name,
    query: row.query as SavedFilterRecord["query"],
    created_at: row.createdAt.toISOString()
  };
}

export class DbSavedFiltersStore implements SavedFiltersStore {
  public constructor(private readonly prisma: PrismaClient) {}

  public async load(): Promise<SavedFiltersRoot> {
    const rows = await this.prisma.savedFilter.findMany({ orderBy: { createdAt: "asc" } });
    return { filters: rows.map(toRecord) };
  }

  public async save(root: SavedFiltersRoot): Promise<void> {
    const data: Prisma.SavedFilterCreateManyInput[] = root.filters.map((f) => ({
      id: f.filter_id,
      creatorId: f.creator_id,
      name: f.name,
      query: f.query as Prisma.InputJsonValue,
      createdAt: new Date(f.created_at)
    }));
    await this.prisma.$transaction(async (tx) => {
      await tx.savedFilter.deleteMany({});
      if (data.length > 0) {
        await tx.savedFilter.createMany({ data });
      }
    });
  }

  public async listForCreator(creatorId: string): Promise<SavedFilterRecord[]> {
    const rows = await this.prisma.savedFilter.findMany({
      where: { creatorId },
      orderBy: { createdAt: "asc" }
    });
    return rows.map(toRecord);
  }

  public async create(
    creatorId: string,
    name: string,
    query: SavedFilterRecord["query"]
  ): Promise<SavedFilterRecord> {
    const id = `flt_${randomUUID()}`;
    const created = await this.prisma.savedFilter.create({
      data: {
        id,
        creatorId,
        name,
        query: query as Prisma.InputJsonValue,
        createdAt: new Date()
      }
    });
    return toRecord(created);
  }

  public async delete(creatorId: string, filterId: string): Promise<boolean> {
    try {
      const r = await this.prisma.savedFilter.deleteMany({
        where: { id: filterId, creatorId }
      });
      return r.count > 0;
    } catch {
      return false;
    }
  }
}
