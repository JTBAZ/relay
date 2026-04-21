import type { PrismaClient, Tier } from "@prisma/client";
import { MediaUpstreamStatus, PostUpstreamStatus } from "@prisma/client";
import type { TierRow } from "../ingest/canonical-store.js";
import {
  evaluateTierRules,
  paidUserTierIds,
  resolvePostAccessLevel,
  canAccessPost
} from "../clone/tier-rules.js";
import type { AccessLevel } from "../clone/types.js";
import type { PatronFeedBundleJson, PatronFeedTierLabel } from "./patron-feed-types.js";

const MAX_POSTS_SCAN = 800;
const DEFAULT_LIMIT = 30;
const MAX_LIMIT = 100;

export type PatronFeedFilter =
  | "all"
  | "following"
  | "free"
  | "photos"
  | "audio"
  | "writing";

export type AssemblePatronFeedArgs = {
  prisma: PrismaClient;
  patronMembershipId: string;
  viewerEmail: string | null;
  limit?: number;
  cursor?: string | null;
  filter?: PatronFeedFilter | null;
};

type CursorPayload = { t: number; id: string };

function encodeCursor(row: { publishedAt: Date; id: string }): string {
  const p: CursorPayload = { t: row.publishedAt.getTime(), id: row.id };
  return Buffer.from(JSON.stringify(p), "utf8").toString("base64url");
}

function decodeCursor(raw: string | null | undefined): CursorPayload | null {
  if (!raw?.trim()) return null;
  try {
    const json = Buffer.from(raw.trim(), "base64url").toString("utf8");
    const p = JSON.parse(json) as CursorPayload;
    if (typeof p?.t !== "number" || typeof p?.id !== "string") return null;
    return p;
  } catch {
    return null;
  }
}

function isNewer(a: { publishedAt: Date; id: string }, b: { publishedAt: Date; id: string }): boolean {
  const at = a.publishedAt.getTime();
  const bt = b.publishedAt.getTime();
  if (at !== bt) return at > bt;
  return a.id > b.id;
}

function tierToRow(t: Tier): TierRow {
  return {
    tier_id: t.relayTierId,
    creator_id: t.creatorId,
    campaign_id: t.campaignId ?? undefined,
    title: t.title,
    amount_cents: t.amountCents ?? undefined,
    upstream_updated_at: t.upstreamUpdatedAt.toISOString(),
    version_seq: t.versionSeq
  };
}

function mimeToMediaType(mime: string | null | undefined): "writing" | "photo" | "audio" | "video" {
  if (!mime) return "writing";
  const m = mime.toLowerCase();
  if (m.startsWith("image/")) return "photo";
  if (m.startsWith("audio/")) return "audio";
  if (m.startsWith("video/")) return "video";
  return "writing";
}

function accessLevelToTierLabel(
  level: AccessLevel,
  tierIds: string[]
): PatronFeedTierLabel {
  if (level === "public") return "Free";
  const joined = tierIds.join(" ").toLowerCase();
  if (joined.includes("studio")) return "Studio";
  return "Supporter";
}

function excerptFromDescription(raw: string | null | undefined, title: string): string {
  const s = (raw ?? "").replace(/\s+/g, " ").trim();
  if (!s) return title;
  return s.length > 220 ? `${s.slice(0, 217)}…` : s;
}

function parseFilter(raw: string | null | undefined): PatronFeedFilter {
  const f = raw?.trim().toLowerCase();
  if (
    f === "following" ||
    f === "free" ||
    f === "photos" ||
    f === "audio" ||
    f === "writing"
  ) {
    return f;
  }
  return "all";
}

/**
 * PE-B — DB-backed patron home bundle: follows × posts × entitlement snapshots × tier rules.
 */
export async function assemblePatronFeed(args: AssemblePatronFeedArgs): Promise<PatronFeedBundleJson> {
  const { prisma, patronMembershipId, viewerEmail } = args;
  const limit = Math.min(
    Math.max(1, args.limit ?? DEFAULT_LIMIT),
    MAX_LIMIT
  );
  const filter = args.filter ?? "all";

  const follows = await prisma.patronFollow.findMany({
    where: { patronMembershipId },
    select: { relayCreatorId: true, createdAt: true }
  });
  const followedIds = [...new Set(follows.map((f) => f.relayCreatorId))];

  const snapshots = await prisma.patronEntitlementSnapshot.findMany({
    where: {
      patronMembershipId,
      relayCreatorId: { in: followedIds }
    }
  });
  const snapByCreator = new Map(snapshots.map((s) => [s.relayCreatorId, s]));

  const tiersByCreator = new Map<string, Record<string, TierRow>>();
  if (followedIds.length > 0) {
    const tierRows = await prisma.tier.findMany({
      where: { creatorId: { in: followedIds } }
    });
    for (const t of tierRows) {
      const cat = tiersByCreator.get(t.creatorId) ?? {};
      cat[t.relayTierId] = tierToRow(t);
      tiersByCreator.set(t.creatorId, cat);
    }
  }

  const profiles = await prisma.creatorProfile.findMany({
    where: { tenant: { relayCreatorId: { in: followedIds } } },
    include: { tenant: { select: { relayCreatorId: true } } }
  });
  const profileByCreator = new Map(
    profiles
      .filter((p) => p.tenant.relayCreatorId)
      .map((p) => [p.tenant.relayCreatorId as string, p])
  );

  const postsRaw =
    followedIds.length === 0
      ? []
      : await prisma.post.findMany({
          where: {
            creatorId: { in: followedIds },
            upstreamStatus: PostUpstreamStatus.active
          },
          include: {
            campaign: { select: { name: true } },
            versions: {
              orderBy: { versionSeq: "desc" },
              take: 1
            },
            mediaAssets: {
              where: { upstreamStatus: MediaUpstreamStatus.active },
              take: 1,
              orderBy: { currentIngestedAt: "desc" }
            }
          },
          orderBy: { createdAt: "desc" },
          take: MAX_POSTS_SCAN
        });

  type Row = {
    postId: string;
    creatorId: string;
    publishedAt: Date;
    title: string;
    description: string | null;
    tierIds: string[];
    mediaType: "writing" | "photo" | "audio" | "video";
    /** Path to the small JPEG preview served by Relay, or null when no exported blob exists. */
    coverPreviewPath: string | null;
    /** Path to the full original blob served by Relay, or null when no exported blob exists. */
    coverContentPath: string | null;
    isPublicPost: boolean;
  };

  const candidates: Row[] = [];

  for (const post of postsRaw) {
    const v = post.versions[0];
    if (!v) continue;
    const snap = snapByCreator.get(post.creatorId);
    const entitled = snap?.entitledTierIds ?? [];
    const tierCatalog = tiersByCreator.get(post.creatorId) ?? {};
    const tierRules = evaluateTierRules(tierCatalog);
    const postAccess = resolvePostAccessLevel(v.tierIds, tierRules);

    // PE-C P0 — `canAccessPost` now applies `paidUserTierIds` internally so that Patreon
    // Free Tier members are treated like followers for `member_only` / `tier_gated` checks
    // (per Patreon UI semantics — "All Tiers" excludes Free Tiers). `entitled` is passed
    // unfiltered; the filtering happens inside `canAccessPost` against the catalog.
    const allowed =
      post.isPublic || canAccessPost(postAccess, entitled, tierCatalog);
    if (!allowed) {
      continue;
    }

    const media = post.mediaAssets[0];
    const mime = media?.currentMimeType;

    // PE-B / PE-C — never expose `currentUpstreamUrl` (Patreon CDN, gated by Patreon's own
    // session cookies; cross-origin <img> requests get 403/404). Route through Relay's
    // own export endpoints which serve from local export storage and respect tier access
    // (when `RELAY_EXPORT_REQUIRE_TIER_ACCESS=1`). `currentStorageKey` is the signal that
    // an export blob has actually been materialized; without it, the export endpoints would
    // 404 and we'd render a broken-image icon — fall back to a placeholder instead.
    const hasExportedBlob = Boolean(media?.id && media.currentStorageKey);
    const coverPreviewPath = hasExportedBlob
      ? `/api/v1/export/media/${encodeURIComponent(post.creatorId)}/${encodeURIComponent(media!.id)}/preview`
      : null;
    const coverContentPath = hasExportedBlob
      ? `/api/v1/export/media/${encodeURIComponent(post.creatorId)}/${encodeURIComponent(media!.id)}/content`
      : null;

    candidates.push({
      postId: post.id,
      creatorId: post.creatorId,
      publishedAt: v.publishedAt,
      title: v.title,
      description: v.description ?? null,
      tierIds: v.tierIds,
      mediaType: mimeToMediaType(mime),
      coverPreviewPath,
      coverContentPath,
      isPublicPost: post.isPublic
    });
  }

  candidates.sort((a, b) => {
    const ar = { publishedAt: a.publishedAt, id: a.postId };
    const br = { publishedAt: b.publishedAt, id: b.postId };
    if (isNewer(ar, br)) return -1;
    if (isNewer(br, ar)) return 1;
    return 0;
  });

  let filtered: Row[] = candidates;
  if (filter === "free") {
    filtered = candidates.filter((c) => {
      if (c.isPublicPost) return true;
      const tierCatalog = tiersByCreator.get(c.creatorId) ?? {};
      const tierRules = evaluateTierRules(tierCatalog);
      const postAccess = resolvePostAccessLevel(c.tierIds, tierRules);
      return postAccess.level === "public";
    });
  } else if (filter === "photos") {
    filtered = candidates.filter((c) => c.mediaType === "photo");
  } else if (filter === "audio") {
    filtered = candidates.filter((c) => c.mediaType === "audio");
  } else if (filter === "writing") {
    filtered = candidates.filter((c) => c.mediaType === "writing");
  }

  const cur = decodeCursor(args.cursor ?? null);
  let start = 0;
  if (cur) {
    const cursorRow = { publishedAt: new Date(cur.t), id: cur.id };
    start = filtered.findIndex((row) => {
      const r = { publishedAt: row.publishedAt, id: row.postId };
      return isNewer(cursorRow, r);
    });
    if (start === -1) start = filtered.length;
  }

  const page = filtered.slice(start, start + limit);
  let nextCursor: string | null = null;
  if (page.length === limit && start + limit < filtered.length) {
    const tail = page[page.length - 1];
    nextCursor = encodeCursor({ publishedAt: tail.publishedAt, id: tail.postId });
  }

  const patronProfile = await prisma.patronProfile.findUnique({
    where: { tenantMembershipId: patronMembershipId },
    select: {
      handle: true,
      displayName: true,
      avatarUrl: true
    }
  });

  const handle =
    patronProfile?.handle?.trim() ||
    (viewerEmail?.includes("@") ? viewerEmail.split("@")[0] : null) ||
    "supporter";
  const displayName =
    patronProfile?.displayName?.trim() ||
    handle;
  const avatarUrl =
    patronProfile?.avatarUrl?.trim() || "/placeholder.svg?height=80&width=80";

  const followedCreators = followedIds.map((relayCreatorId) => {
    const prof = profileByCreator.get(relayCreatorId);
    const snap = snapByCreator.get(relayCreatorId);
    const slug = prof?.publicSlug?.trim() || relayCreatorId.slice(0, 12);
    const tierIds = snap?.entitledTierIds ?? [];
    // PE-C P0 — Free Tier members and free followers both show as "Free" in the sidebar
    // (Patreon Free Tier members do not unlock paid posts, so labelling them as Supporter
    // would mis-signal access). A future "Free member" badge (Roadmap P3) can split these.
    const catalog = tiersByCreator.get(relayCreatorId) ?? {};
    const paid = paidUserTierIds(tierIds, catalog);
    const tierLabel: PatronFeedTierLabel =
      paid.length === 0 ? "Free" : "Supporter";
    return {
      id: relayCreatorId,
      handle: slug,
      displayName: prof ? slug : relayCreatorId,
      discipline: "",
      avatarUrl: "/placeholder.svg?height=40&width=40",
      isFollowed: true,
      followerCount: 0,
      postCount: 0,
      onRelay: true as const,
      patronTierLabel: tierLabel
    };
  });

  const feedPosts = page.map((c) => {
    const prof = profileByCreator.get(c.creatorId);
    const slug = prof?.publicSlug?.trim() || c.creatorId.slice(0, 12);
    const tierCatalog = tiersByCreator.get(c.creatorId) ?? {};
    const tierRules = evaluateTierRules(tierCatalog);
    const postAccess = resolvePostAccessLevel(c.tierIds, tierRules);
    const tierLabel: PatronFeedTierLabel = c.isPublicPost
      ? "Free"
      : accessLevelToTierLabel(postAccess.level, postAccess.tier_ids);

    const creator = {
      id: c.creatorId,
      handle: slug,
      displayName: slug,
      discipline: "",
      avatarUrl: "/placeholder.svg?height=40&width=40",
      isFollowed: true,
      followerCount: 0,
      postCount: 0,
      onRelay: true as const,
      patronTierLabel: tierLabel
    };

    const placeholder = "/placeholder.svg?height=600&width=1200";
    const coverImageUrl = c.coverPreviewPath ?? placeholder;
    const highResImageUrl = c.coverContentPath ?? c.coverPreviewPath ?? placeholder;

    return {
      id: c.postId,
      kind: "followed" as const,
      creator,
      title: c.title,
      excerpt: excerptFromDescription(c.description, c.title),
      description: c.description ?? undefined,
      mediaType: c.mediaType,
      coverImageUrl,
      highResImageUrl,
      publishedAt: c.publishedAt.toISOString(),
      likeCount: 0,
      commentCount: 0,
      tierLabel,
      feedCardLayout: "classic" as const
    };
  });

  return {
    feedPosts,
    discoverItems: [],
    currentViewer: {
      id: patronMembershipId,
      displayName,
      handle,
      avatarUrl,
      followingCount: followedIds.length,
      notificationCount: 0
    },
    followedCreators,
    notifications: [],
    next_cursor: nextCursor
  };
}

export { parseFilter, DEFAULT_LIMIT, MAX_LIMIT };
