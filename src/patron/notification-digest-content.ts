/**

 * Assembles digest payload: followed creators with new posts since last send.

 */



import type { PrismaClient } from "@prisma/client";

import { PostUpstreamStatus } from "@prisma/client";

import { loadHiddenPostIdsByCreator } from "../gallery/hidden-post-ids.js";

import { loadMaturePostIdsByCreator } from "../gallery/mature-post-ids.js";

import { loadPatronHideMatureContent } from "./patron-content-preferences.js";



export type DigestPostItem = {

  post_id: string;

  title: string;

  published_at: string;

  href: string;

};



export type DigestCreatorGroup = {

  relay_creator_id: string;

  display_name: string;

  posts: DigestPostItem[];

};



export type DigestContentPayload = {

  creators: DigestCreatorGroup[];

  total_posts: number;

};



function excerpt(title: string, description: string | null | undefined): string {

  const s = (description ?? "").replace(/\s+/g, " ").trim();

  if (!s) return title;

  return s.length > 120 ? `${s.slice(0, 117)}…` : s;

}



function postHref(webBase: string, publicSlug: string, postId: string): string {
  const base = webBase.replace(/\/+$/, "");
  return `${base}/${encodeURIComponent(publicSlug)}/post/${encodeURIComponent(postId)}`;
}



export async function assembleDigestContentForPatron(

  prisma: PrismaClient,

  args: {

    patronMembershipId: string;

    periodStart: Date;

    periodEnd: Date;

    webBaseUrl: string;

  }

): Promise<DigestContentPayload> {

  const follows = await prisma.patronFollow.findMany({

    where: { patronMembershipId: args.patronMembershipId },

    select: { relayCreatorId: true },

  });

  const creatorIds = [...new Set(follows.map((f) => f.relayCreatorId))];

  if (creatorIds.length === 0) {

    return { creators: [], total_posts: 0 };

  }



  const hideMatureContent = await loadPatronHideMatureContent(prisma, args.patronMembershipId);

  const [hiddenPostIdsByCreator, maturePostIdsByCreator] = await Promise.all([

    loadHiddenPostIdsByCreator(prisma, creatorIds),

    hideMatureContent

      ? loadMaturePostIdsByCreator(prisma, creatorIds)

      : Promise.resolve(new Map<string, Set<string>>())

  ]);



  const profiles = await prisma.creatorProfile.findMany({

    where: { tenant: { relayCreatorId: { in: creatorIds } } },

    include: { tenant: { select: { relayCreatorId: true } } },

  });

  const displayByCreator = new Map<string, string>();
  const slugByCreator = new Map<string, string>();

  for (const cp of profiles) {
    const id = cp.tenant.relayCreatorId;
    if (!id) continue;
    displayByCreator.set(
      id,
      cp.displayName?.trim() || cp.username?.trim() || cp.publicSlug?.trim() || "Creator"
    );
    const slug = cp.publicSlug?.trim();
    if (slug) slugByCreator.set(id, slug);
  }



  const posts = await prisma.post.findMany({

    where: {

      creatorId: { in: creatorIds },

      upstreamStatus: PostUpstreamStatus.active,

      createdAt: { gt: args.periodStart, lte: args.periodEnd },

    },

    include: {

      versions: { orderBy: { versionSeq: "desc" }, take: 1 },

      presentation: { select: { relayTitle: true, relayDescription: true } },

    },

    orderBy: { createdAt: "desc" },

    take: 200,

  });



  const byCreator = new Map<string, DigestPostItem[]>();

  for (const post of posts) {

    const v = post.versions[0];

    if (!v) continue;

    if (hiddenPostIdsByCreator.get(post.creatorId)?.has(post.id)) {

      continue;

    }

    if (hideMatureContent && maturePostIdsByCreator.get(post.creatorId)?.has(post.id)) {

      continue;

    }

    const title =

      post.presentation?.relayTitle?.trim() || v.title?.trim() || "New post";

    const list = byCreator.get(post.creatorId) ?? [];

    list.push({

      post_id: post.id,

      title: excerpt(title, post.presentation?.relayDescription ?? v.description),

      published_at: v.publishedAt.toISOString(),

      href: postHref(
        args.webBaseUrl,
        slugByCreator.get(post.creatorId) ?? post.creatorId,
        post.id
      ),

    });

    byCreator.set(post.creatorId, list);

  }



  const creators: DigestCreatorGroup[] = [];

  let total = 0;

  for (const creatorId of creatorIds) {

    const postsForCreator = byCreator.get(creatorId);

    if (!postsForCreator?.length) continue;

    total += postsForCreator.length;

    creators.push({

      relay_creator_id: creatorId,

      display_name: displayByCreator.get(creatorId) ?? "Creator",

      posts: postsForCreator,

    });

  }



  return { creators, total_posts: total };

}

