/**
 * @fileoverview Relay visibility overrides that mark posts as Adult (18+) for patron filtering.
 */
import {
  GalleryVisibility,
  MediaUpstreamStatus,
  PostUpstreamStatus,
  type PrismaClient
} from "@prisma/client";
import { galleryOverridesRootFromRows } from "./overrides-store-db.js";
import { resolveGalleryItemVisibility } from "./query.js";
import type { GalleryOverridesRoot } from "./types.js";

/**
 * True when any active gallery row for the post resolves to `review` (Adult 18+).
 */
export function isPostMatureFromPatronSurfaces(args: {
  overrides: GalleryOverridesRoot;
  creatorId: string;
  postId: string;
  activeMediaIds: readonly string[];
}): boolean {
  const { overrides, creatorId, postId, activeMediaIds } = args;
  const postOverride = overrides.creators[creatorId]?.posts[postId];
  if (postOverride?.visibility === "review") {
    return true;
  }
  if (activeMediaIds.length === 0) {
    return (
      resolveGalleryItemVisibility(
        creatorId,
        postId,
        `post_only_${postId}`,
        overrides
      ) === "review"
    );
  }
  return activeMediaIds.some(
    (mediaId) =>
      resolveGalleryItemVisibility(creatorId, postId, mediaId, overrides) === "review"
  );
}

function addMaturePost(
  out: Map<string, Set<string>>,
  creatorId: string,
  postId: string
): void {
  const set = out.get(creatorId) ?? new Set<string>();
  set.add(postId);
  out.set(creatorId, set);
}

function overrideRowMayBeMature(row: {
  visibility: GalleryVisibility | null;
}): boolean {
  return row.visibility === GalleryVisibility.review;
}

/**
 * Post ids rated Adult (18+) for the given creators.
 */
export async function loadMaturePostIdsByCreator(
  prisma: PrismaClient,
  creatorIds: readonly string[]
): Promise<Map<string, Set<string>>> {
  const out = new Map<string, Set<string>>();
  if (creatorIds.length === 0) {
    return out;
  }

  const overrideRows = await prisma.postOverride.findMany({
    where: { creatorId: { in: [...creatorIds] } }
  });
  if (overrideRows.length === 0) {
    return out;
  }

  const overrides = galleryOverridesRootFromRows(overrideRows);
  const candidateKeys = new Set<string>();

  for (const row of overrideRows) {
    if (!overrideRowMayBeMature(row)) {
      continue;
    }
    candidateKeys.add(`${row.creatorId}\0${row.postId}`);
  }

  if (candidateKeys.size === 0) {
    return out;
  }

  const candidatePosts = [...candidateKeys].map((key) => {
    const [creatorId, postId] = key.split("\0");
    return { creatorId, postId };
  });

  const postsWithMedia = await prisma.post.findMany({
    where: {
      upstreamStatus: PostUpstreamStatus.active,
      OR: candidatePosts.map(({ creatorId, postId }) => ({ creatorId, id: postId }))
    },
    select: {
      id: true,
      creatorId: true,
      mediaAssets: {
        where: { upstreamStatus: MediaUpstreamStatus.active },
        select: { id: true }
      }
    }
  });

  for (const post of postsWithMedia) {
    if (
      isPostMatureFromPatronSurfaces({
        overrides,
        creatorId: post.creatorId,
        postId: post.id,
        activeMediaIds: post.mediaAssets.map((m) => m.id)
      })
    ) {
      addMaturePost(out, post.creatorId, post.id);
    }
  }

  return out;
}

export function isPostExcludedByPatronMaturePref(args: {
  hideMatureContent: boolean;
  maturePostIdsByCreator: Map<string, Set<string>>;
  creatorId: string;
  postId: string;
}): boolean {
  if (!args.hideMatureContent) {
    return false;
  }
  return args.maturePostIdsByCreator.get(args.creatorId)?.has(args.postId) ?? false;
}
