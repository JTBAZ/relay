/**
 * @fileoverview Postgres-backed gallery overrides (`post_overrides` aggregate flattened rows).
 * @description `save()` replaces all rows transactionally—parity with overwriting legacy JSON root files.
 * @see ./overrides-store.ts File-backed twin + migrations helpers
 * @see prisma/schema.prisma `PostOverride`
 * @security-audit-required Global `load`/`save` without tenant filter—admin/migration callers only unless RLS enforced at DB.
 */

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
      if (r.discoveryEligible) {
        slot.discovery_eligible = true;
      } else {
        delete slot.discovery_eligible;
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

/** Build an overrides aggregate from scoped `postOverride` rows (creator-filtered reads). */
export function galleryOverridesRootFromRows(
  rows: Awaited<ReturnType<PrismaClient["postOverride"]["findMany"]>>
): GalleryOverridesRoot {
  return rootFromRows(rows);
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
        visibility: po.visibility !== undefined ? postVisibilityToEnum(po.visibility) : null,
        discoveryEligible: po.discovery_eligible === true
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
 * @description Prisma implementation of {@link GalleryOverridesStore}.
 * @todo `load()` scans entire table—consider creator-scoped APIs before huge multi-tenant volume.
 * @throws {Error} Prisma errors propagate from transactions and upserts.
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

  /**
   * Row-scoped atomic merge (PILOT-012 Gate F): the legacy implementation did a
   * full-table `load()` → mutate → `save()` (global `deleteMany({})` + recreate),
   * so any two concurrent override writes raced and the loser's rows — including
   * `visibility=hidden` — were silently dropped. All mutators now upsert only
   * their own row and only their own fields (same pattern as
   * {@link DbGalleryOverridesStore.setDiscoveryEligible}).
   */
  public async mergePostTagDelta(
    creatorId: string,
    postId: string,
    delta: { add_tag_ids: string[]; remove_tag_ids: string[] }
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const row = await tx.postOverride.findUnique({
        where: { creatorId_postId_mediaId: { creatorId, postId, mediaId: "" } }
      });
      const addSet = new Set(row?.addTagIds ?? []);
      const remSet = new Set(row?.removeTagIds ?? []);
      for (const t of delta.add_tag_ids) {
        addSet.add(t);
        remSet.delete(t);
      }
      for (const t of delta.remove_tag_ids) {
        remSet.add(t);
        addSet.delete(t);
      }
      await tx.postOverride.upsert({
        where: { creatorId_postId_mediaId: { creatorId, postId, mediaId: "" } },
        create: {
          creatorId,
          postId,
          mediaId: "",
          addTagIds: [...addSet],
          removeTagIds: [...remSet],
          visibility: null,
          discoveryEligible: false
        },
        update: {
          addTagIds: [...addSet],
          removeTagIds: [...remSet]
        }
      });
    });
  }

  public async mergeBulkMediaTagDelta(
    creatorId: string,
    targets: { post_id: string; media_id: string }[],
    delta: { add_tag_ids: string[]; remove_tag_ids: string[] }
  ): Promise<void> {
    if (targets.length === 0) {
      return;
    }
    const seen = new Set<string>();
    await this.prisma.$transaction(async (tx) => {
      for (const { post_id: postId, media_id: mediaId } of targets) {
        if (!mediaId || mediaId.startsWith("post_only_")) {
          continue;
        }
        const key = `${postId}\0${mediaId}`;
        if (seen.has(key)) {
          continue;
        }
        seen.add(key);
        const row = await tx.postOverride.findUnique({
          where: { creatorId_postId_mediaId: { creatorId, postId, mediaId } }
        });
        const addSet = new Set(row?.addTagIds ?? []);
        const remSet = new Set(row?.removeTagIds ?? []);
        for (const t of delta.add_tag_ids) {
          addSet.add(t);
          remSet.delete(t);
        }
        for (const t of delta.remove_tag_ids) {
          remSet.add(t);
          addSet.delete(t);
        }
        const emptied =
          addSet.size === 0 && remSet.size === 0 && (row == null || row.visibility === null);
        if (emptied) {
          if (row) {
            await tx.postOverride.delete({
              where: { creatorId_postId_mediaId: { creatorId, postId, mediaId } }
            });
          }
          continue;
        }
        await tx.postOverride.upsert({
          where: { creatorId_postId_mediaId: { creatorId, postId, mediaId } },
          create: {
            creatorId,
            postId,
            mediaId,
            addTagIds: [...addSet],
            removeTagIds: [...remSet],
            visibility: null
          },
          update: {
            addTagIds: [...addSet],
            removeTagIds: [...remSet]
          }
        });
      }
    });
  }

  /**
   * Atomic per-row visibility upsert. Touches only the `visibility` column so
   * concurrent tag merges on the same row cannot drop a hide (Gate F).
   */
  public async setVisibility(
    creatorId: string,
    postIds: string[],
    visibility: PostVisibility
  ): Promise<void> {
    const v = postVisibilityToEnum(visibility);
    for (const postId of postIds) {
      await this.prisma.postOverride.upsert({
        where: { creatorId_postId_mediaId: { creatorId, postId, mediaId: "" } },
        create: {
          creatorId,
          postId,
          mediaId: "",
          addTagIds: [],
          removeTagIds: [],
          visibility: v,
          discoveryEligible: false
        },
        update: { visibility: v }
      });
    }
  }

  public async setMediaVisibility(
    creatorId: string,
    entries: { post_id: string; media_id: string; visibility: PostVisibility }[]
  ): Promise<void> {
    if (entries.length === 0) {
      return;
    }
    for (const { post_id: postId, media_id: mediaId, visibility } of entries) {
      const v = postVisibilityToEnum(visibility);
      await this.prisma.postOverride.upsert({
        where: { creatorId_postId_mediaId: { creatorId, postId, mediaId } },
        create: {
          creatorId,
          postId,
          mediaId,
          addTagIds: [],
          removeTagIds: [],
          visibility: v
        },
        update: { visibility: v }
      });
    }
  }

  public async setDiscoveryEligible(
    creatorId: string,
    postId: string,
    eligible: boolean
  ): Promise<void> {
    // Direct upsert -- avoids the load+save round trip and keeps the discovery flag write
    // atomic so concurrent tag/visibility edits don't clobber it.
    await this.prisma.postOverride.upsert({
      where: {
        creatorId_postId_mediaId: {
          creatorId,
          postId,
          mediaId: ""
        }
      },
      create: {
        creatorId,
        postId,
        mediaId: "",
        addTagIds: [],
        removeTagIds: [],
        visibility: null,
        discoveryEligible: eligible
      },
      update: { discoveryEligible: eligible }
    });
  }
}
