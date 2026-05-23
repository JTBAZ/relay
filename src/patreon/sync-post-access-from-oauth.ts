/**
 * OAuth-only Patreon post access sync: paginate campaign posts metadata, diff tier gates
 * against Relay DB, patch only deltas — no cookie scrape, ingest batch, or media export.
 */
import { PostSource, type PrismaClient } from "@prisma/client";
import type { PatreonAuthService } from "../auth/auth-service.js";
import type { PatreonTokenStore } from "../auth/token-store.js";
import { tierStableId } from "../ingest/canonical-store-db.js";
import type { IngestTier } from "../ingest/types.js";
import { updatePostAudienceTierGate } from "../relay/update-post-audience-tier-gate.js";
import {
  expandAllPatronsTierIds,
  listCampaignPaidPatreonTierIds
} from "./expand-all-patrons-tiers.js";
import {
  applyPatreonAccessToTierIds,
  buildCampaignAndTiersFromCampaignsDoc,
  patreonCampaignListResolutionErrorMessage,
  pickDefaultCampaignId,
  tierIdsFromPatreonPost
} from "./map-patreon-to-ingest.js";
import type { PatreonFetchOptions } from "./patreon-resource-api.js";
import {
  asDataArray,
  fetchCampaignsWithTiers,
  fetchPostsPage,
  postsPageUrl
} from "./patreon-resource-api.js";
import { RELAY_TIER_PUBLIC } from "./relay-access-tiers.js";
import type { JsonApiResource } from "./jsonapi-types.js";

export type PostAccessGate = {
  isPublic: boolean;
  tierIds: string[];
};

export type SyncPostAccessFromOAuthOptions = {
  campaign_id?: string;
  fallback_campaign_id?: string;
  max_post_pages?: number;
};

export type SyncPostAccessFromOAuthResult = {
  creator_id: string;
  patreon_campaign_id: string;
  pages_fetched: number;
  oauth_posts_seen: number;
  relay_posts_matched: number;
  posts_updated: number;
  posts_unchanged: number;
  warnings: string[];
};

function relayPostIdFromPatreonNumericId(numericId: string): string {
  return `patreon_post_${numericId}`;
}

/** Normalize tier gate for stable OAuth ↔ DB comparison (incl. all_patrons expansion). */
export function normalizePostAccessGate(
  tierIds: string[],
  isPublic: boolean | undefined,
  paidPatreonTierIds: string[]
): PostAccessGate {
  let ids = expandAllPatronsTierIds([...tierIds], paidPatreonTierIds);
  if (ids.length === 1 && ids[0] === RELAY_TIER_PUBLIC) {
    return { isPublic: true, tierIds: [] };
  }
  if (isPublic === true && ids.length === 0) {
    return { isPublic: true, tierIds: [] };
  }
  const unique = [...new Set(ids.filter((id) => id !== RELAY_TIER_PUBLIC))].sort((a, b) =>
    a.localeCompare(b)
  );
  return { isPublic: false, tierIds: unique };
}

export function oauthPostAccessGateFromResource(
  resource: JsonApiResource,
  paidPatreonTierIds: string[]
): PostAccessGate {
  const base = tierIdsFromPatreonPost(resource);
  const tierIds = applyPatreonAccessToTierIds(base, resource.attributes ?? {});
  return normalizePostAccessGate(tierIds, undefined, paidPatreonTierIds);
}

export function postAccessGatesEqual(a: PostAccessGate, b: PostAccessGate): boolean {
  if (a.isPublic !== b.isPublic) return false;
  if (a.tierIds.length !== b.tierIds.length) return false;
  return a.tierIds.every((id, i) => id === b.tierIds[i]);
}

async function upsertCampaignTiers(
  prisma: PrismaClient,
  creatorId: string,
  campaignRelayId: string,
  tiers: IngestTier[]
): Promise<void> {
  for (const t of tiers) {
    const id = tierStableId(creatorId, t.tier_id);
    await prisma.tier.upsert({
      where: { id },
      create: {
        id,
        creatorId,
        relayTierId: t.tier_id,
        providerTierId: t.tier_id,
        campaignId: t.campaign_id ?? campaignRelayId,
        title: t.title,
        amountCents: t.amount_cents ?? null,
        upstreamUpdatedAt: new Date(t.upstream_updated_at),
        versionSeq: 1
      },
      update: {
        title: t.title,
        amountCents: t.amount_cents ?? null,
        campaignId: t.campaign_id ?? campaignRelayId,
        upstreamUpdatedAt: new Date(t.upstream_updated_at)
      }
    });
  }
}

export async function syncPostAccessFromOAuth(args: {
  creatorId: string;
  traceId: string;
  prisma: PrismaClient;
  authService: PatreonAuthService;
  tokenStore: PatreonTokenStore;
  fetchImpl: typeof fetch;
  options?: SyncPostAccessFromOAuthOptions;
}): Promise<SyncPostAccessFromOAuthResult> {
  const { creatorId, traceId, prisma, authService, tokenStore, fetchImpl } = args;
  const options = args.options ?? {};
  const warnings: string[] = [];

  await authService.ensureFreshAccessForAutomation(creatorId, traceId);
  const cred = await tokenStore.getByCreatorId(creatorId);
  if (!cred) {
    throw new Error(
      "No Patreon tokens for this creator_id. Complete OAuth and POST /api/v1/auth/patreon/exchange first."
    );
  }

  const fetchOpts: PatreonFetchOptions = {
    access_token: cred.access_token,
    fetch_impl: fetchImpl
  };

  const campaignsDoc = await fetchCampaignsWithTiers(fetchOpts);
  let patreonCampaignId =
    options.campaign_id?.trim() || options.fallback_campaign_id?.trim();
  if (!patreonCampaignId) {
    const only = pickDefaultCampaignId(campaignsDoc);
    if (!only) {
      throw new Error(patreonCampaignListResolutionErrorMessage(campaignsDoc));
    }
    patreonCampaignId = only;
  }

  const mapped = buildCampaignAndTiersFromCampaignsDoc(
    campaignsDoc,
    creatorId,
    patreonCampaignId
  );
  if (!mapped) {
    throw new Error(`Campaign ${patreonCampaignId} not found on Patreon for this token.`);
  }

  const paidPatreonTierIds = listCampaignPaidPatreonTierIds(mapped.tiers);
  await upsertCampaignTiers(prisma, creatorId, mapped.campaign.campaign_id, mapped.tiers);

  const existingPosts = await prisma.post.findMany({
    where: { creatorId, source: PostSource.PATREON },
    include: {
      versions: { orderBy: { versionSeq: "desc" }, take: 1 }
    }
  });
  const relayById = new Map(existingPosts.map((p) => [p.id, p]));

  const maxPages = Math.min(Math.max(options.max_post_pages ?? 100, 1), 100);
  let pages = 0;
  let oauthPostsSeen = 0;
  let relayPostsMatched = 0;
  let postsUpdated = 0;
  let postsUnchanged = 0;
  let nextUrl: string | null | undefined = null;

  do {
    const doc = await fetchPostsPage(fetchOpts, patreonCampaignId, nextUrl);
    pages += 1;
    for (const r of asDataArray(doc.data)) {
      if (r.type !== "post" || !r.id) continue;
      oauthPostsSeen += 1;
      const relayPostId = relayPostIdFromPatreonNumericId(String(r.id));
      const existing = relayById.get(relayPostId);
      if (!existing) continue;
      relayPostsMatched += 1;

      const oauthGate = oauthPostAccessGateFromResource(r, paidPatreonTierIds);
      const dbTierIds = existing.versions[0]?.tierIds ?? [];
      const dbGate = normalizePostAccessGate(dbTierIds, existing.isPublic, paidPatreonTierIds);

      if (postAccessGatesEqual(oauthGate, dbGate)) {
        postsUnchanged += 1;
        continue;
      }

      await updatePostAudienceTierGate(prisma, {
        creatorId,
        postId: relayPostId,
        tierIds: oauthGate.tierIds,
        isPublic: oauthGate.isPublic
      });
      postsUpdated += 1;
    }

    nextUrl = doc.links?.next ?? undefined;
    if (!nextUrl) {
      const cursor = doc.meta?.pagination?.cursors?.next;
      if (cursor) {
        nextUrl =
          postsPageUrl(patreonCampaignId) + `&page%5Bcursor%5D=${encodeURIComponent(cursor)}`;
      }
    }
  } while (nextUrl && pages < maxPages);

  if (pages >= maxPages && nextUrl) {
    warnings.push(
      `Stopped after ${maxPages} OAuth page(s); older posts may remain unchanged. Run again or raise max_post_pages (cap 100).`
    );
  }
  if (postsUpdated > 0) {
    warnings.push(
      `OAuth post-access diff: updated ${postsUpdated} post(s); ${postsUnchanged} unchanged; ${oauthPostsSeen - relayPostsMatched} Patreon post(s) not yet in Relay.`
    );
  } else {
    warnings.push(
      `OAuth post-access diff: no tier gate changes (${postsUnchanged} matched post(s) already aligned).`
    );
  }

  return {
    creator_id: creatorId,
    patreon_campaign_id: patreonCampaignId,
    pages_fetched: pages,
    oauth_posts_seen: oauthPostsSeen,
    relay_posts_matched: relayPostsMatched,
    posts_updated: postsUpdated,
    posts_unchanged: postsUnchanged,
    warnings
  };
}
