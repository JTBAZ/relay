import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import type { RelayCollectionsStore } from "./collections-store.js";
import type { Collection, CollectionsRoot } from "./types.js";

function normalizeCollection(c: Collection): Collection {
  return {
    ...c,
    theme_tag_ids: Array.isArray(c.theme_tag_ids) ? c.theme_tag_ids : []
  };
}

function toCollection(
  row: {
    id: string;
    creatorId: string;
    title: string;
    description: string | null;
    coverMediaId: string | null;
    accessCeilingTierId: string | null;
    themeTagIds: string[];
    sortOrder: number;
    createdAt: Date;
    updatedAt: Date;
  },
  postRows: { postId: string; sortIndex: number }[]
): Collection {
  const ordered = [...postRows].sort((a, b) => a.sortIndex - b.sortIndex);
  return normalizeCollection({
    collection_id: row.id,
    creator_id: row.creatorId,
    title: row.title,
    description: row.description ?? undefined,
    cover_media_id: row.coverMediaId ?? undefined,
    access_ceiling_tier_id: row.accessCeilingTierId ?? undefined,
    theme_tag_ids: [...row.themeTagIds],
    post_ids: ordered.map((p) => p.postId),
    sort_order: row.sortOrder,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString()
  });
}

export class DbCollectionsStore implements RelayCollectionsStore {
  public constructor(private readonly prisma: PrismaClient) {}

  public async load(): Promise<CollectionsRoot> {
    const cols = await this.prisma.libraryCollection.findMany({
      include: { posts: true }
    });
    return {
      collections: cols.map((c) => toCollection(c, c.posts))
    };
  }

  public async listForCreator(creatorId: string): Promise<Collection[]> {
    const cols = await this.prisma.libraryCollection.findMany({
      where: { creatorId },
      include: { posts: true },
      orderBy: { sortOrder: "asc" }
    });
    return cols.map((c) => toCollection(c, c.posts));
  }

  public async getById(collectionId: string): Promise<Collection | null> {
    const col = await this.prisma.libraryCollection.findUnique({
      where: { id: collectionId },
      include: { posts: true }
    });
    return col ? toCollection(col, col.posts) : null;
  }

  public async create(
    creatorId: string,
    title: string,
    description?: string,
    extras?: {
      access_ceiling_tier_id?: string;
      theme_tag_ids?: string[];
    }
  ): Promise<Collection> {
    const existing = await this.prisma.libraryCollection.findMany({
      where: { creatorId },
      select: { sortOrder: true }
    });
    const maxOrder = existing.reduce((m, c) => Math.max(m, c.sortOrder), -1);
    const now = new Date();
    const id = `col_${randomUUID()}`;
    const created = await this.prisma.libraryCollection.create({
      data: {
        id,
        creatorId,
        title,
        description: description ?? null,
        coverMediaId: null,
        accessCeilingTierId: extras?.access_ceiling_tier_id ?? null,
        themeTagIds: extras?.theme_tag_ids?.length ? [...extras.theme_tag_ids] : [],
        sortOrder: maxOrder + 1,
        createdAt: now,
        updatedAt: now
      },
      include: { posts: true }
    });
    return toCollection(created, created.posts);
  }

  public async update(
    collectionId: string,
    patch: Partial<
      Pick<
        Collection,
        | "title"
        | "description"
        | "cover_media_id"
        | "sort_order"
        | "theme_tag_ids"
      > & { access_ceiling_tier_id?: string | null }
    >
  ): Promise<Collection | null> {
    const data: {
      title?: string;
      description?: string | null;
      coverMediaId?: string | null;
      sortOrder?: number;
      accessCeilingTierId?: string | null;
      themeTagIds?: string[];
    } = {};
    if (patch.title !== undefined) {
      data.title = patch.title;
    }
    if (patch.description !== undefined) {
      data.description = patch.description;
    }
    if (patch.cover_media_id !== undefined) {
      data.coverMediaId = patch.cover_media_id;
    }
    if (patch.sort_order !== undefined) {
      data.sortOrder = patch.sort_order;
    }
    if (patch.access_ceiling_tier_id !== undefined) {
      const v = patch.access_ceiling_tier_id;
      data.accessCeilingTierId = v === null || v === "" ? null : v;
    }
    if (patch.theme_tag_ids !== undefined) {
      data.themeTagIds = [...patch.theme_tag_ids];
    }
    if (Object.keys(data).length === 0) {
      return this.getById(collectionId);
    }
    try {
      const updated = await this.prisma.libraryCollection.update({
        where: { id: collectionId },
        data,
        include: { posts: true }
      });
      return toCollection(updated, updated.posts);
    } catch {
      return null;
    }
  }

  public async delete(collectionId: string): Promise<boolean> {
    try {
      await this.prisma.libraryCollection.delete({ where: { id: collectionId } });
      return true;
    } catch {
      return false;
    }
  }

  public async addPosts(collectionId: string, postIds: string[]): Promise<Collection | null> {
    const col = await this.prisma.libraryCollection.findUnique({
      where: { id: collectionId },
      include: { posts: true }
    });
    if (!col) {
      return null;
    }
    const existingIds = new Set(col.posts.map((p) => p.postId));
    const maxIdx = col.posts.reduce((m, p) => Math.max(m, p.sortIndex), -1);
    const toAdd = postIds.filter((id) => !existingIds.has(id));
    if (toAdd.length === 0) {
      return toCollection(col, col.posts);
    }
    await this.prisma.$transaction(
      toAdd.map((postId, i) =>
        this.prisma.collectionPost.create({
          data: {
            collectionId,
            postId,
            sortIndex: maxIdx + 1 + i
          }
        })
      )
    );
    const refreshed = await this.prisma.libraryCollection.findUniqueOrThrow({
      where: { id: collectionId },
      include: { posts: true }
    });
    return toCollection(refreshed, refreshed.posts);
  }

  public async removePosts(collectionId: string, postIds: string[]): Promise<Collection | null> {
    const col = await this.prisma.libraryCollection.findUnique({
      where: { id: collectionId },
      include: { posts: true }
    });
    if (!col) {
      return null;
    }
    const removeSet = new Set(postIds);
    await this.prisma.collectionPost.deleteMany({
      where: {
        collectionId,
        postId: { in: [...removeSet] }
      }
    });
    const refreshed = await this.prisma.libraryCollection.findUniqueOrThrow({
      where: { id: collectionId },
      include: { posts: true }
    });
    return toCollection(refreshed, refreshed.posts);
  }

  public async reorder(creatorId: string, orderedIds: string[]): Promise<void> {
    await this.prisma.$transaction(
      orderedIds.map((id, i) =>
        this.prisma.libraryCollection.updateMany({
          where: { id, creatorId },
          data: { sortOrder: i }
        })
      )
    );
  }
}
