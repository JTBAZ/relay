import type { FilePatreonCookieStore } from "../auth/cookie-store.js";
import type { IngestService } from "../ingest/ingest-service.js";
import type { ApplyBatchResult, IngestPost, SyncBatchInput } from "../ingest/types.js";
import type { FilePatreonTokenStore } from "../auth/token-store.js";
import { scrapeByCookie } from "./cookie-scraper.js";
import {
  buildCampaignAndTiersFromCampaignsDoc,
  buildSyncBatchFromParts,
  mapPatreonPostToIngest,
  pickDefaultCampaignId
} from "./map-patreon-to-ingest.js";
import {
  asDataArray,
  fetchCampaignsWithTiers,
  fetchPostsPage
} from "./patreon-resource-api.js";

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
};

export class PatreonSyncService {
  private readonly tokenStore: FilePatreonTokenStore;
  private readonly cookieStore: FilePatreonCookieStore;
  private readonly ingestService: IngestService;
  private readonly fetchImpl: typeof fetch;

  public constructor(
    tokenStore: FilePatreonTokenStore,
    cookieStore: FilePatreonCookieStore,
    ingestService: IngestService,
    fetchImpl?: typeof fetch
  ) {
    this.tokenStore = tokenStore;
    this.cookieStore = cookieStore;
    this.ingestService = ingestService;
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

    const sessionId = await this.cookieStore.getSessionId(creatorId);
    let posts: IngestPost[];
    let pages: number;
    let mediaSource: "cookie" | "oauth";

    if (sessionId) {
      const cookieResult = await scrapeByCookie({
        sessionId,
        campaignId: patreonCampaignId,
        maxPages,
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
    } else {
      posts = [];
      pages = 0;
      mediaSource = "oauth";

      let nextUrl: string | null | undefined = null;
      do {
        const doc = await fetchPostsPage(fetchOpts, patreonCampaignId, nextUrl);
        pages += 1;
        const pagePosts = asDataArray(doc.data).filter((r) => r.type === "post");
        for (const r of pagePosts) {
          const p = mapPatreonPostToIngest(r);
          posts.push(p);
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
        nextUrl = doc.links?.next ?? undefined;
        if (!nextUrl && doc.meta?.pagination?.cursors?.next) {
          warnings.push("Pagination cursor in meta.pagination not wired; stopping after first page.");
          nextUrl = undefined;
        }
      } while (nextUrl && pages < maxPages);

      warnings.push(
        "No session cookie stored. Using OAuth API only (post images/attachments unavailable). " +
        "POST /api/v1/patreon/cookie with your session_id to enable media scraping."
      );
    }

    const batch = buildSyncBatchFromParts(creatorId, campaign, tiers, posts);

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
}
