/**
 * @fileoverview Relay visibility overrides that exclude posts from patron surfaces.
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
 * True when every active gallery row for the post resolves to `hidden`
 * (post-level override or per-asset overrides via bulk visibility).
 */
export function isPostHiddenFromPatronSurfaces(args: {
  overrides: GalleryOverridesRoot;
  creatorId: string;
  postId: string;
  activeMediaIds: readonly string[];
}): boolean {
  const { overrides, creatorId, postId, activeMediaIds } = args;
  const postOverride = overrides.creators[creatorId]?.posts[postId];
  if (postOverride?.visibility === "hidden") {
    return true;
  }
  if (activeMediaIds.length === 0) {
    return (
      resolveGalleryItemVisibility(
        creatorId,
        postId,
        `post_only_${postId}`,
        overrides
      ) === "hidden"
    );
  }
  return activeMediaIds.every(
    (mediaId) =>
      resolveGalleryItemVisibility(creatorId, postId, mediaId, overrides) === "hidden"
  );
}

function addHiddenPost(
  out: Map<string, Set<string>>,
  creatorId: string,
  postId: string
): void {
  const set = out.get(creatorId) ?? new Set<string>();
  set.add(postId);
  out.set(creatorId, set);
}

/**
 * Post ids excluded from patron feed/detail/permission for the given creators.
 * Honors asset-level hides from `POST /api/v1/gallery/visibility` media_targets.
 */
export async function loadHiddenPostIdsByCreator(
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
    if (row.visibility !== GalleryVisibility.hidden) {
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
      isPostHiddenFromPatronSurfaces({
        overrides,
        creatorId: post.creatorId,
        postId: post.id,
        activeMediaIds: post.mediaAssets.map((m) => m.id)
      })
    ) {
      addHiddenPost(out, post.creatorId, post.id);
    }
  }

  return out;
}

/**
 * Post ids with post-level `visibility=hidden` overrides only (legacy helper).
 */
export function hiddenPostIdsFromOverridesRoot(
  overrides: GalleryOverridesRoot,
  creatorId: string
): Set<string> {
  const hidden = new Set<string>();
  const posts = overrides.creators[creatorId]?.posts ?? {};
  for (const [postId, ov] of Object.entries(posts)) {
    if (ov.visibility === "hidden") {
      hidden.add(postId);
    }
  }
  return hidden;
}
