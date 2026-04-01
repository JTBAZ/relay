import type { FilePatreonCookieStore } from "../auth/cookie-store.js";
import type { ExportService } from "../export/export-service.js";
import type { IngestService } from "../ingest/ingest-service.js";
import { SyncWatermarkStore } from "../ingest/sync-watermark-store.js";
import type { ApplyBatchResult, IngestPost, SyncBatchInput } from "../ingest/types.js";
import type { FilePatreonTokenStore } from "../auth/token-store.js";
import { scrapeByCookie } from "./cookie-scraper.js";
import {
  applyPatreonAccessToTierIds,
  buildCampaignAndTiersFromCampaignsDoc,
  buildSyncBatchFromParts,
  diagnosePostResource,
  mapPatreonPostToIngest,
  pickDefaultCampaignId,
  tierIdsFromPatreonPost
} from "./map-patreon-to-ingest.js";
import type { PatreonFetchOptions } from "./patreon-resource-api.js";
import {
  asDataArray,
  fetchCampaignMembers,
  fetchCampaignsWithTiers,
  fetchPostById,
  fetchPostsPage,
  indexIncluded,
  membersPageUrl,
  postsPageUrl
} from "./patreon-resource-api.js";
import type { IdentityService } from "../identity/identity-service.js";

function numericPostIdFromRelay(postId: string): string | null {
  const m = /^patreon_post_(\d+)$/.exec(postId);
  return m?.[1] ?? null;
}

function hasSyntheticTiersOnly(tierIds: string[]): boolean {
  return tierIds.length > 0 && tierIds.every((t) => t.startsWith("relay_tier_"));
}

/**
 * Enriches cookie-scraped posts from OAuth single-post fetches.
 * Fills missing descriptions AND overwrites tier_ids from OAuth — the
 * cookie path cannot see `is_public` or `attributes.tiers` reliably
 * (creator sessions always report `is_paid: false`), so OAuth is the
 * authoritative source for access/tier data.
 */
async function enrichPostsFromOAuth(
  posts: IngestPost[],
  fetchOpts: PatreonFetchOptions,
  warnings: string[]
): Promise<void> {
  const needsEnrich = posts.filter((p) => {
    const noBody = !(p.description && p.description.trim());
    const unreliableTiers = p.tier_ids.length === 0 || hasSyntheticTiersOnly(p.tier_ids);
    return noBody || unreliableTiers;
  });
  if (needsEnrich.length === 0) return;
  warnings.push(
    `Cookie scrape left ${needsEnrich.length} post(s) needing body or tier enrichment; ` +
      "trying OAuth GET /api/oauth2/v2/posts/{id}."
  );
  let filledBody = 0;
  let filledTiers = 0;
  for (const p of needsEnrich) {
    const numId = numericPostIdFromRelay(p.post_id);
    if (!numId) continue;
    try {
      const doc = await fetchPostById(fetchOpts, numId);
      const resources = asDataArray(doc.data);
      const resource = resources.find((r) => r.type === "post" && r.id === numId);
      if (!resource) continue;
      const fromOAuth = mapPatreonPostToIngest(resource);
      let enriched = false;
      if (!(p.description && p.description.trim()) && fromOAuth.description?.trim()) {
        p.description = fromOAuth.description;
        enriched = true;
        filledBody += 1;
      }
      if (fromOAuth.tier_ids.length > 0) {
        const changed = JSON.stringify(fromOAuth.tier_ids) !== JSON.stringify(p.tier_ids);
        if (changed) {
          p.tier_ids = fromOAuth.tier_ids;
          enriched = true;
          filledTiers += 1;
        }
      }
      if (enriched) {
        p.upstream_revision = `${p.upstream_revision}:oauth_enrich`;
      }
    } catch (e) {
      warnings.push(
        `OAuth enrich ${numId} failed: ${(e as Error).message.slice(0, 200)}`
      );
    }
  }
  if (filledBody > 0 || filledTiers > 0) {
    warnings.push(
      `OAuth enrichment: filled body=${filledBody}, tier_ids=${filledTiers} of ${needsEnrich.length} post(s).`
    );
  }
}

/**
 * Uses the OAuth campaign/posts list endpoint (which returns authoritative
 * `is_public` and `attributes.tiers`) to overwrite the unreliable tier_ids
 * that the cookie scraper produced. Runs in paginated batches — no per-post
 * HTTP requests needed.
 */
async function enrichTiersFromCampaignPostsList(
  posts: IngestPost[],
  campaignId: string,
  fetchOpts: PatreonFetchOptions,
  maxPages: number,
  warnings: string[]
): Promise<void> {
  const byNumId = new Map<string, IngestPost>();
  for (const p of posts) {
    const numId = numericPostIdFromRelay(p.post_id);
    if (numId) byNumId.set(numId, p);
  }
  if (byNumId.size === 0) return;
  let pages = 0;
  let enriched = 0;
  let nextUrl: string | null | undefined = null;
  do {
    const doc = await fetchPostsPage(fetchOpts, campaignId, nextUrl);
    pages += 1;
    for (const r of asDataArray(doc.data)) {
      if (r.type !== "post") continue;
      const existing = byNumId.get(r.id);
      if (!existing) continue;
      const baseTiers = tierIdsFromPatreonPost(r);
      const oauthTiers = applyPatreonAccessToTierIds(baseTiers, r.attributes ?? {});
      if (oauthTiers.length > 0 && JSON.stringify(oauthTiers) !== JSON.stringify(existing.tier_ids)) {
        existing.tier_ids = oauthTiers;
        existing.upstream_revision = `${existing.upstream_revision}:oauth_tier`;
        enriched += 1;
      }
    }
    nextUrl = doc.links?.next ?? undefined;
    if (!nextUrl) {
      const cursor = doc.meta?.pagination?.cursors?.next;
      if (cursor) {
        nextUrl = postsPageUrl(campaignId) + `&page%5Bcursor%5D=${encodeURIComponent(cursor)}`;
      }
    }
  } while (nextUrl && pages < maxPages);
  if (enriched > 0) {
    warnings.push(
      `OAuth tier enrichment (campaign posts list): updated ${enriched} of ${posts.length} post(s) across ${pages} page(s).`
    );
  }
}

export type PatreonScrapeResult = {
  creator_id: string;
  patreon_campaign_id: string;
  batch: SyncBatchInput;
  pages_fetched: number;
  posts_fetched: number;
  media_source: "cookie" | "oauth";
  warnings: string[];
  apply_result?: ApplyBatchResult;
};

export type PatreonSyncOptions = {
  /** Numeric Patreon campaign id from API. If omitted, uses the only campaign when exactly one exists. */
  campaign_id?: string;
  /** Max post list pages (25 posts per page). */
  max_post_pages?: number;
  /** If true, do not write to canonical store. */
  dry_run?: boolean;
  /**
   * Bump each post's upstream_revision so tier/access fields are re-written even when
   * Patreon content hash is unchanged (idempotent ingest otherwise skips posts).
   */
  force_refresh_post_access?: boolean;
};

export type MemberSyncResult = {
  creator_id: string;
  patreon_campaign_id: string;
  members_synced: number;
  pages_fetched: number;
  warnings: string[];
};

export class PatreonSyncService {
  private readonly tokenStore: FilePatreonTokenStore;
  private readonly cookieStore: FilePatreonCookieStore;
  private readonly ingestService: IngestService;
  private readonly watermarkStore: SyncWatermarkStore;
  private readonly exportService: ExportService | null;
  private readonly identityService: IdentityService | null;
  private readonly fetchImpl: typeof fetch;

  public constructor(
    tokenStore: FilePatreonTokenStore,
    cookieStore: FilePatreonCookieStore,
    ingestService: IngestService,
    watermarkStore: SyncWatermarkStore,
    fetchImpl?: typeof fetch,
    exportService?: ExportService,
    identityService?: IdentityService
  ) {
    this.tokenStore = tokenStore;
    this.cookieStore = cookieStore;
    this.ingestService = ingestService;
    this.watermarkStore = watermarkStore;
    this.exportService = exportService ?? null;
    this.identityService = identityService ?? null;
    this.fetchImpl = fetchImpl ?? fetch;
  }

  public async scrapeOrSync(
    creatorId: string,
    traceId: string,
    options: PatreonSyncOptions = {}
  ): Promise<PatreonScrapeResult> {
    const warnings: string[] = [];
    const cred = await this.tokenStore.getByCreatorId(creatorId);
    if (!cred) {
      throw new Error(
        "No Patreon tokens for this creator_id. Complete OAuth and POST /api/v1/auth/patreon/exchange first."
      );
    }

    const fetchOpts = { access_token: cred.access_token, fetch_impl: this.fetchImpl };

    const campaignsDoc = await fetchCampaignsWithTiers(fetchOpts);
    let patreonCampaignId = options.campaign_id?.trim();
    if (!patreonCampaignId) {
      const only = pickDefaultCampaignId(campaignsDoc);
      if (!only) {
        throw new Error(
          "Multiple Patreon campaigns found. Pass campaign_id (numeric id from the Patreon API / portal URL)."
        );
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

    const { campaign, tiers } = mapped;
    const maxPages = Math.min(Math.max(options.max_post_pages ?? 20, 1), 100);
    const watermark = await this.watermarkStore.get(creatorId, patreonCampaignId);
    // When force_refresh_post_access is set, bypass the watermark so that posts
    // ingested before the tier-mapping code was deployed are re-fetched and
    // re-written with correct tier_ids.  Without this, an empty batch is returned
    // for campaigns where all posts pre-date the last watermark.
    const stopBeforePublishedAt = options.force_refresh_post_access ? undefined : watermark;

    const sessionId = await this.cookieStore.getSessionId(creatorId);
    let posts: IngestPost[];
    let pages: number;
    let mediaSource: "cookie" | "oauth";

    if (sessionId) {
      const cookieResult = await scrapeByCookie({
        sessionId,
        campaignId: patreonCampaignId,
        maxPages,
        stopBeforePublishedAt: stopBeforePublishedAt ?? undefined,
        fetchImpl: this.fetchImpl
      });
      posts = cookieResult.posts;
      pages = cookieResult.pages_fetched;
      mediaSource = "cookie";
      warnings.push(...cookieResult.warnings);
      if (posts.length > 0) {
        const totalMedia = posts.reduce((n, p) => n + p.media.length, 0);
        warnings.push(
          `Cookie scrape: ${posts.length} posts, ${totalMedia} media items.`
        );
      }
      await enrichPostsFromOAuth(posts, fetchOpts, warnings);
      await enrichTiersFromCampaignPostsList(
        posts, patreonCampaignId, fetchOpts, maxPages, warnings
      );
    } else {
      posts = [];
      pages = 0;
      mediaSource = "oauth";

      let nextUrl: string | null | undefined = null;
      let reachedStopBefore = false;
      do {
        const doc = await fetchPostsPage(fetchOpts, patreonCampaignId, nextUrl);
        pages += 1;
        const pagePosts = asDataArray(doc.data).filter((r) => r.type === "post");
        for (const r of pagePosts) {
          const p = mapPatreonPostToIngest(r);
          if (stopBeforePublishedAt && p.published_at <= stopBeforePublishedAt) {
            reachedStopBefore = true;
            break;
          }
          posts.push(p);
          if (!p.description || p.tier_ids.length === 0) {
            warnings.push(diagnosePostResource(r));
          }
          if (p.media.length === 0) {
            const contentSnippet = typeof r.attributes?.content === "string"
              ? r.attributes.content.slice(0, 200)
              : String(r.attributes?.content ?? "(null)");
            warnings.push(
              `Post "${p.title}" (${p.post_id}): 0 media. ` +
              `embed_url=${String(r.attributes?.embed_url ?? "(null)")}; ` +
              `embed_data=${JSON.stringify(r.attributes?.embed_data ?? null).slice(0, 150)}; ` +
              `content[0:200]=${contentSnippet}`
            );
          }
        }
        if (reachedStopBefore) {
          nextUrl = undefined;
          break;
        }
        nextUrl = doc.links?.next ?? undefined;
        if (!nextUrl) {
          const cursor = doc.meta?.pagination?.cursors?.next;
          if (cursor) {
            nextUrl = postsPageUrl(patreonCampaignId) + `&page%5Bcursor%5D=${encodeURIComponent(cursor)}`;
          }
        }
      } while (nextUrl && pages < maxPages);

      warnings.push(
        "No session cookie stored. Using OAuth API only (post images/attachments unavailable). " +
        "POST /api/v1/patreon/cookie with your session_id to enable media scraping."
      );
    }

    let postsForBatch = posts;
    if (options.force_refresh_post_access && postsForBatch.length > 0) {
      const stamp = `${Date.now()}`;
      postsForBatch = postsForBatch.map((p, i) => ({
        ...p,
        upstream_revision: `${p.upstream_revision}:access:${stamp}:${i}`
      }));
    }

    const batch = buildSyncBatchFromParts(creatorId, campaign, tiers, postsForBatch);

    if (options.dry_run) {
      return {
        creator_id: creatorId,
        patreon_campaign_id: patreonCampaignId,
        batch,
        pages_fetched: pages,
        posts_fetched: posts.length,
        media_source: mediaSource,
        warnings
      };
    }

    const apply_result = await this.ingestService.runBatch(batch, traceId);
    const newestPublishedAt = postsForBatch.length > 0
      ? postsForBatch.reduce(
          (latest, p) => (p.published_at > latest ? p.published_at : latest),
          postsForBatch[0]!.published_at
        )
      : null;
    if (newestPublishedAt) {
      await this.watermarkStore.set(creatorId, patreonCampaignId, newestPublishedAt);
    }

    if (this.exportService) {
      const mediaIds = new Set<string>();
      for (const p of batch.posts ?? []) {
        for (const m of p.media) {
          if (m.upstream_url) mediaIds.add(m.media_id);
        }
      }
      let exported = 0;
      for (const mediaId of mediaIds) {
        try {
          await this.exportService.exportMedia(creatorId, mediaId);
          exported += 1;
        } catch {
          warnings.push(`Auto-export failed for ${mediaId}, skipping.`);
        }
      }
      if (exported > 0) {
        warnings.push(`Auto-exported ${exported}/${mediaIds.size} media items.`);
      }
    }

    return {
      creator_id: creatorId,
      patreon_campaign_id: patreonCampaignId,
      batch,
      pages_fetched: pages,
      posts_fetched: posts.length,
      media_source: mediaSource,
      warnings,
      apply_result
    };
  }

  /**
   * Fetches campaign members from Patreon and upserts them into the identity
   * store with their currently entitled tier ids. Requires `campaigns.members`
   * scope on the OAuth token.
   */
  public async syncMembers(
    creatorId: string,
    options: { campaign_id?: string; max_pages?: number } = {}
  ): Promise<MemberSyncResult> {
    const warnings: string[] = [];
    if (!this.identityService) {
      throw new Error("IdentityService not wired — cannot sync members.");
    }
    const cred = await this.tokenStore.getByCreatorId(creatorId);
    if (!cred) {
      throw new Error("No Patreon tokens for this creator_id.");
    }
    const fetchOpts: PatreonFetchOptions = {
      access_token: cred.access_token,
      fetch_impl: this.fetchImpl
    };
    const campaignsDoc = await fetchCampaignsWithTiers(fetchOpts);
    let campaignId = options.campaign_id?.trim();
    if (!campaignId) {
      const only = pickDefaultCampaignId(campaignsDoc);
      if (!only) {
        throw new Error("Multiple campaigns found. Pass campaign_id.");
      }
      campaignId = only;
    }
    const maxPages = Math.min(Math.max(options.max_pages ?? 20, 1), 100);
    let pages = 0;
    let synced = 0;
    let nextUrl: string | null | undefined = null;
    do {
      const doc = await fetchCampaignMembers(fetchOpts, campaignId, nextUrl);
      pages += 1;
      const included = indexIncluded(doc);
      const members = asDataArray(doc.data).filter((r) => r.type === "member");
      for (const m of members) {
        const a = m.attributes ?? {};
        const status = typeof a.patron_status === "string" ? a.patron_status : "";
        if (status !== "active_patron") continue;
        const tierLinks = m.relationships?.currently_entitled_tiers?.data;
        const tierIds: string[] = [];
        if (Array.isArray(tierLinks)) {
          for (const link of tierLinks) {
            if (link?.type === "tier" && link.id) {
              tierIds.push(`patreon_tier_${link.id}`);
            }
          }
        }
        const userLink = m.relationships?.user?.data;
        const patreonUserId =
          userLink && !Array.isArray(userLink) && userLink.type === "user"
            ? userLink.id
            : undefined;
        if (!patreonUserId) continue;
        const userRes = included.get(`user:${patreonUserId}`);
        const email =
          typeof a.email === "string" && a.email.includes("@")
            ? a.email
            : `patreon_${patreonUserId}@relay.local`;
        const fullName =
          typeof a.full_name === "string"
            ? a.full_name
            : (userRes?.attributes?.full_name as string | undefined) ?? "";
        try {
          await this.identityService!.registerPatreonFallback(
            creatorId,
            patreonUserId,
            email,
            tierIds
          );
          synced += 1;
        } catch (e) {
          warnings.push(
            `Member ${patreonUserId} (${fullName}): ${(e as Error).message.slice(0, 200)}`
          );
        }
      }
      nextUrl = doc.links?.next ?? undefined;
      if (!nextUrl) {
        const cursor = doc.meta?.pagination?.cursors?.next;
        if (cursor) {
          nextUrl =
            membersPageUrl(campaignId) +
            `&page%5Bcursor%5D=${encodeURIComponent(cursor)}`;
        }
      }
    } while (nextUrl && pages < maxPages);
    return {
      creator_id: creatorId,
      patreon_campaign_id: campaignId,
      members_synced: synced,
      pages_fetched: pages,
      warnings
    };
  }
}
