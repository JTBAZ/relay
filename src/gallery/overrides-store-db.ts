import { GalleryVisibility, type Prisma, type PrismaClient } from "@prisma/client";
import {
  compactMediaOverride,
  migrateGalleryLegacyVisibilityInPlace,
  type GalleryOverridesStore
} from "./overrides-store.js";
import type { GalleryOverridesRoot, MediaOverride, PostVisibility } from "./types.js";

function postVisibilityToEnum(v: PostVisibility): GalleryVisibility {
  if (v === "visible") return GalleryVisibility.visible;
  if (v === "hidden") return GalleryVisibility.hidden;
  return GalleryVisibility.review;
}

function enumToPostVisibility(v: GalleryVisibility): PostVisibility {
  switch (v) {
    case GalleryVisibility.visible:
      return "visible";
    case GalleryVisibility.hidden:
      return "hidden";
    default:
      return "review";
  }
}

function rootFromRows(rows: Awaited<ReturnType<PrismaClient["postOverride"]["findMany"]>>): GalleryOverridesRoot {
  const sorted = [...rows].sort((a, b) => {
    if (a.creatorId !== b.creatorId) {
      return a.creatorId.localeCompare(b.creatorId);
    }
    if (a.postId !== b.postId) {
      return a.postId.localeCompare(b.postId);
    }
    if (a.mediaId === "" && b.mediaId !== "") {
      return -1;
    }
    if (a.mediaId !== "" && b.mediaId === "") {
      return 1;
    }
    return a.mediaId.localeCompare(b.mediaId);
  });
  const root: GalleryOverridesRoot = { creators: {} };
  for (const r of sorted) {
    if (!root.creators[r.creatorId]) {
      root.creators[r.creatorId] = { posts: {} };
    }
    const posts = root.creators[r.creatorId]!.posts;
    const postId = r.postId;
    const slot = posts[postId] ?? { add_tag_ids: [], remove_tag_ids: [] };
    if (r.mediaId === "") {
      slot.add_tag_ids = [...r.addTagIds];
      slot.remove_tag_ids = [...r.removeTagIds];
      if (r.visibility !== null) {
        slot.visibility = enumToPostVisibility(r.visibility);
      } else {
        delete slot.visibility;
      }
    } else {
      const media = { ...(slot.media ?? {}) };
      const mo: MediaOverride = {};
      if (r.visibility !== null) {
        mo.visibility = enumToPostVisibility(r.visibility);
      }
      if (r.addTagIds.length > 0) {
        mo.add_tag_ids = [...r.addTagIds];
      }
      if (r.removeTagIds.length > 0) {
        mo.remove_tag_ids = [...r.removeTagIds];
      }
      const compact = compactMediaOverride(mo);
      if (compact) {
        media[r.mediaId] = compact;
      } else {
        delete media[r.mediaId];
      }
      if (Object.keys(media).length > 0) {
        slot.media = media;
      } else {
        delete slot.media;
      }
    }
    posts[postId] = slot;
  }
  migrateGalleryLegacyVisibilityInPlace(root);
  return root;
}

function flattenRoot(root: GalleryOverridesRoot): Prisma.PostOverrideCreateManyInput[] {
  const out: Prisma.PostOverrideCreateManyInput[] = [];
  for (const [creatorId, c] of Object.entries(root.creators)) {
    for (const [postId, po] of Object.entries(c.posts)) {
      out.push({
        creatorId,
        postId,
        mediaId: "",
        addTagIds: po.add_tag_ids ?? [],
        removeTagIds: po.remove_tag_ids ?? [],
        visibility: po.visibility !== undefined ? postVisibilityToEnum(po.visibility) : null
      });
      for (const [mediaId, mo] of Object.entries(po.media ?? {})) {
        const compact = compactMediaOverride(mo);
        if (!compact) {
          continue;
        }
        out.push({
          creatorId,
          postId,
          mediaId,
          addTagIds: compact.add_tag_ids ?? [],
          removeTagIds: compact.remove_tag_ids ?? [],
          visibility: compact.visibility !== undefined ? postVisibilityToEnum(compact.visibility) : null
        });
      }
    }
  }
  return out;
}

/**
 * Postgres-backed gallery overrides. `save()` replaces **all** override rows (same as overwriting the JSON file).
 */
export class DbGalleryOverridesStore implements GalleryOverridesStore {
  public constructor(private readonly prisma: PrismaClient) {}

  public async load(): Promise<GalleryOverridesRoot> {
    const rows = await this.prisma.postOverride.findMany();
    return rootFromRows(rows);
  }

  public async save(root: GalleryOverridesRoot): Promise<void> {
    const rows = flattenRoot(root);
    await this.prisma.$transaction(async (tx) => {
      await tx.postOverride.deleteMany({});
      if (rows.length > 0) {
        await tx.postOverride.createMany({ data: rows });
      }
    });
  }

  public async mergePostTagDelta(
    creatorId: string,
    postId: string,
    delta: { add_tag_ids: string[]; remove_tag_ids: string[] }
  ): Promise<void> {
    const root = await this.load();
    if (!root.creators[creatorId]) {
      root.creators[creatorId] = { posts: {} };
    }
    const existing = root.creators[creatorId].posts[postId] ?? {
      add_tag_ids: [],
      remove_tag_ids: []
    };
    const addSet = new Set(existing.add_tag_ids);
    const remSet = new Set(existing.remove_tag_ids);
    for (const t of delta.add_tag_ids) {
      addSet.add(t);
      remSet.delete(t);
    }
    for (const t of delta.remove_tag_ids) {
      remSet.add(t);
      addSet.delete(t);
    }
    root.creators[creatorId].posts[postId] = {
      add_tag_ids: [...addSet],
      remove_tag_ids: [...remSet],
      ...(existing.visibility !== undefined ? { visibility: existing.visibility } : {}),
      ...(existing.media && Object.keys(existing.media).length > 0 ? { media: existing.media } : {})
    };
    await this.save(root);
  }

  public async mergeBulkMediaTagDelta(
    creatorId: string,
    targets: { post_id: string; media_id: string }[],
    delta: { add_tag_ids: string[]; remove_tag_ids: string[] }
  ): Promise<void> {
    if (targets.length === 0) {
      return;
    }
    const root = await this.load();
    if (!root.creators[creatorId]) {
      root.creators[creatorId] = { posts: {} };
    }
    const seen = new Set<string>();
    for (const { post_id: pid, media_id: mediaId } of targets) {
      if (!mediaId || mediaId.startsWith("post_only_")) {
        continue;
      }
      const key = `${pid}\0${mediaId}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      if (!root.creators[creatorId].posts[pid]) {
        root.creators[creatorId].posts[pid] = { add_tag_ids: [], remove_tag_ids: [] };
      }
      const existing = root.creators[creatorId].posts[pid];
      const media = { ...(existing.media ?? {}) };
      const prev = media[mediaId] ?? {};
      const addSet = new Set(prev.add_tag_ids ?? []);
      const remSet = new Set(prev.remove_tag_ids ?? []);
      for (const t of delta.add_tag_ids) {
        addSet.add(t);
        remSet.delete(t);
      }
      for (const t of delta.remove_tag_ids) {
        remSet.add(t);
        addSet.delete(t);
      }
      const next: MediaOverride = {
        ...(prev.visibility !== undefined ? { visibility: prev.visibility } : {}),
        ...(addSet.size > 0 ? { add_tag_ids: [...addSet] } : {}),
        ...(remSet.size > 0 ? { remove_tag_ids: [...remSet] } : {})
      };
      const compact = compactMediaOverride(next);
      if (compact) {
        media[mediaId] = compact;
      } else {
        delete media[mediaId];
      }
      if (Object.keys(media).length === 0) {
        delete existing.media;
      } else {
        existing.media = media;
      }
      root.creators[creatorId].posts[pid] = existing;
    }
    await this.save(root);
  }

  public async setVisibility(
    creatorId: string,
    postIds: string[],
    visibility: PostVisibility
  ): Promise<void> {
    const root = await this.load();
    if (!root.creators[creatorId]) {
      root.creators[creatorId] = { posts: {} };
    }
    for (const postId of postIds) {
      const existing = root.creators[creatorId].posts[postId] ?? {
        add_tag_ids: [],
        remove_tag_ids: []
      };
      existing.visibility = visibility;
      root.creators[creatorId].posts[postId] = existing;
    }
    await this.save(root);
  }

  public async setMediaVisibility(
    creatorId: string,
    entries: { post_id: string; media_id: string; visibility: PostVisibility }[]
  ): Promise<void> {
    if (entries.length === 0) {
      return;
    }
    const root = await this.load();
    if (!root.creators[creatorId]) {
      root.creators[creatorId] = { posts: {} };
    }
    for (const { post_id: postId, media_id: mediaId, visibility } of entries) {
      const existing = root.creators[creatorId].posts[postId] ?? {
        add_tag_ids: [],
        remove_tag_ids: []
      };
      const media = { ...(existing.media ?? {}) };
      media[mediaId] = { ...(media[mediaId] ?? {}), visibility };
      existing.media = media;
      root.creators[creatorId].posts[postId] = existing;
    }
    await this.save(root);
  }
}
