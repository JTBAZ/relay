/**
 * @fileoverview Patreon → Relay ingest coordinator: OAuth token refresh, optional cookie scrape, post sync with watermarks, member roster sync, health snapshots.
 * @description Serializes `scrapeOrSync` per creator id. Touches Patreon JSON:API, file stores, `IngestService`, optional `IdentityService` (member PII).
 * @see {@link ../jsdoc-core-entities.ts}
 * @see prisma/schema.prisma `Post`, `MediaAsset`, `Tier`, `Campaign`, identity tables via `IdentityService`
 */
import { MediaRepairStore } from "../export/media-repair-store.js";
import { postCollectionHead } from "../export/media-repair-state.js";
import { patreonPostState } from "./post-refresh-state.js";
import { resumePostSync } from "./resume-post-sync.js";
import { reconcileMembers, refreshMember } from "./reconcile-members.js";
import type { PrismaClient } from "@prisma/client";
import type { PatreonCookieStore } from "../auth/cookie-store.js";
import type { ExportService } from "../export/export-service.js";
import { enrichBatch } from "../ingest/auto-enrich.js";
import type { IngestService } from "../ingest/ingest-service.js";
import type { SyncWatermarkStoreAPI } from "../ingest/sync-watermark-store.js";
import type { ApplyBatchResult, IngestPost, SyncBatchInput } from "../ingest/types.js";
import type { PatreonAuthService } from "../auth/auth-service.js";
import type { PatreonTokenStore, PersistedPatreonTokens } from "../auth/token-store.js";
import { CookieSessionExpiredError, scrapeByCookie, scrapePostByCookieWithCompleteness } from "./cookie-scraper.js";
import {
  CreatorCampaignDisplayStore,
  type CampaignDisplaySnapshot
} from "./creator-campaign-display-store.js";
import {
  applyPatreonAccessToTierIds,
  buildCampaignAndTiersFromCampaignsDoc,
  buildSyncBatchFromParts,
  diagnosePostResource,
  extractCampaignDisplayFromCampaignsDoc,
  mapPatreonPostToIngest,
  patreonCampaignListResolutionErrorMessage,
  pickDefaultCampaignId,
  tierIdsFromPatreonPost
} from "./map-patreon-to-ingest.js";
import type { PatreonFetchOptions } from "./patreon-resource-api.js";
import {
  asDataArray,
  fetchCampaignsWithTiers,
  fetchPostById,
  fetchPostsPage,
  postsPageUrl
} from "./patreon-resource-api.js";
import type { IdentityService } from "../identity/identity-service.js";
import { createExclusivePerKeyRunner } from "../lib/run-exclusive-per-key.js";
import { patreonPostContentHash, patreonMediaContentHash } from "./post-content-revision.js";
import { normalizePatreonPostContent, flattenProseMirrorDoc } from "./post-content.js";
import { sanitizeOptionalPostDescriptionHtml } from "../security/sanitize-post-html.js";
import type {
  LastMemberSyncHealth,
  LastPostScrapeHealth,
  PatreonSyncHealthStoreAPI
} from "./patreon-sync-health-store.js";
import {
  syncPostAccessFromOAuth,
  oauthPostAccessGateFromResource,
  type SyncPostAccessFromOAuthOptions,
  type SyncPostAccessFromOAuthResult
} from "./sync-post-access-from-oauth.js";

import { PatreonRequestError } from "./oauth-request.js";
import type { PatreonPostRefresh } from "./post-refresh-state.js";
import { listCampaignPaidPatreonTierIds } from "./expand-all-patrons-tiers.js";
import { RELAY_TIER_PUBLIC } from "./relay-access-tiers.js";
import { getCreatorProfilePatreonCampaignIdForRelayCreatorDb } from "./campaign-tenant-resolve.js";
import { readSyncCompleteness, type SyncCompleteness } from "./sync-completeness.js";

export type { SyncPostAccessFromOAuthOptions, SyncPostAccessFromOAuthResult };

/** Creator OAuth token health slice for Library / sync-state consumers. */
export type PatreonOAuthHealthSnapshot = {
  availability?: "available" | "unavailable";
  credential_health_status: PersistedPatreonTokens["credential_health_status"] | "unavailable";
  access_token_expires_at: string | null;
  access_token_expired: boolean | null;
  /** True when token expires within the next 24 hours (and is not already expired). */
  access_token_expires_soon: boolean | null;
};

function buildOauthHealthSnapshot(cred: PersistedPatreonTokens): PatreonOAuthHealthSnapshot {
  const now = Date.now();
  const expMs = Date.parse(cred.access_token_expires_at);
  if (!Number.isFinite(expMs)) return { availability: "unavailable", credential_health_status: "unavailable", access_token_expires_at: null, access_token_expired: null, access_token_expires_soon: null };
  const expired = Number.isFinite(expMs) && expMs <= now;
  const soon =
    !expired && Number.isFinite(expMs) && expMs - now < 24 * 60 * 60 * 1000;
  return {
    availability: "available",
    credential_health_status: cred.credential_health_status,
    access_token_expires_at: cred.access_token_expires_at,
    access_token_expired: expired,
    access_token_expires_soon: soon
  };
}

function numericPostIdFromRelay(postId: string): string | null {
  const m = /^patreon_post_(\d+)$/.exec(postId);
  return m?.[1] ?? null;
}

type PerPostOAuthStats = {
  targets: number;
  filledBody: number;
  filledTiers: number;
};

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
  warnings: string[],
  resolvedAccess: Set<string>
): Promise<PerPostOAuthStats> {
  const needsEnrich = posts.filter((p) => {
    const noBody = !(p.description && p.description.trim());
    const unreliableTiers = !resolvedAccess.has(p.post_id);
    return noBody || unreliableTiers;
  });
  if (needsEnrich.length === 0) {
    return { targets: 0, filledBody: 0, filledTiers: 0 };
  }
  warnings.push(
    `Cookie scrape left ${needsEnrich.length} post(s) needing body or tier enrichment; ` +
      "trying OAuth GET /api/oauth2/v2/posts/{id}."
  );
  let filledBody = 0;
  let filledTiers = 0;
  for (const p of needsEnrich) {
    const numId = numericPostIdFromRelay(p.post_id);
    if (!numId) continue;
    const doc = await fetchPostById(fetchOpts, numId);
    const resources = asDataArray(doc.data);
    const resource = resources.find((r) => r.type === "post" && r.id === numId);
    if (!resource) throw new Error("Patreon returned no metadata for the requested post; retry required.");
    const fromOAuth = mapPatreonPostToIngest(resource);
    if (!(p.description && p.description.trim()) && fromOAuth.description?.trim()) {
      p.description = fromOAuth.description;
      filledBody += 1;
    }
    if (fromOAuth.tier_ids.length > 0) {
      const changed = JSON.stringify(fromOAuth.tier_ids) !== JSON.stringify(p.tier_ids);
      if (changed) {
        p.tier_ids = fromOAuth.tier_ids;
        filledTiers += 1;
      }
    }
  }
  if (filledBody > 0 || filledTiers > 0) {
    warnings.push(
      `OAuth enrichment: filled body=${filledBody}, tier_ids=${filledTiers} of ${needsEnrich.length} post(s).`
    );
  }
  return {
    targets: needsEnrich.length,
    filledBody,
    filledTiers
  };
}

/**
 * Uses the OAuth campaign/posts list endpoint (which returns authoritative
 * `is_public` and `attributes.tiers`) to overwrite the unreliable tier_ids
 * that the cookie scraper produced. Runs in paginated batches — no per-post
 * HTTP requests needed.
 *
 * The `enriched` count in warnings is the number of posts whose `tier_ids`
 * changed compared to the value before this step (cookie or per-post OAuth).
 */
type OAuthListTierStats = {
  postsUpdated: number;
  pagesFetched: number;
  /** True when at least one `fetchPostsPage` ran (posts had mappable Patreon ids). */
  attempted: boolean;
  resolvedAccess: Set<string>;
};

async function enrichTiersFromCampaignPostsList(
  posts: IngestPost[],
  campaignId: string,
  fetchOpts: PatreonFetchOptions,
  maxPages: number,
  warnings: string[]
): Promise<OAuthListTierStats> {
  const resolvedAccess = new Set<string>();
  const byNumId = new Map<string, IngestPost>();
  for (const p of posts) {
    const numId = numericPostIdFromRelay(p.post_id);
    if (numId) byNumId.set(numId, p);
  }
  if (byNumId.size === 0) {
    return { postsUpdated: 0, pagesFetched: 0, attempted: false, resolvedAccess };
  }
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
      if (oauthTiers.length > 0) resolvedAccess.add(existing.post_id);
      if (!existing.description?.trim()) {
        const body = normalizePatreonPostContent(r.attributes?.content) || flattenProseMirrorDoc(r.attributes?.content_json_string);
        if (body) existing.description = sanitizeOptionalPostDescriptionHtml(body);
      }
      if (oauthTiers.length > 0 && JSON.stringify(oauthTiers) !== JSON.stringify(existing.tier_ids)) {
        existing.tier_ids = oauthTiers;
        enriched += 1;
      }
      byNumId.delete(r.id);
    }
    if (byNumId.size === 0) break;
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
  return { postsUpdated: enriched, pagesFetched: pages, attempted: true, resolvedAccess };
}

/** Statistics on tier/body enrichment passes (cookie + OAuth list + per-post GET). */
export type TierAccessSummary = {
  media_source: "cookie" | "oauth";
  oauth_list_pass: boolean;
  oauth_list_posts_updated: number;
  oauth_list_pages_fetched: number;
  per_post_oauth_targets: number;
  per_post_filled_tiers: number;
  per_post_filled_body: number;
};

/** Successful scrape pipeline output before/after optional ingest apply. */
export type PatreonScrapeResult = {
  creator_id: string;
  patreon_campaign_id: string;
  batch: SyncBatchInput;
  pages_fetched: number;
  posts_fetched: number;
  media_source: "cookie" | "oauth";
  warnings: string[];
  tier_access_summary: TierAccessSummary;
  /** Patreon campaign avatar, banner URLs, and patron_count from OAuth campaigns doc. */
  campaign_display?: CampaignDisplaySnapshot;
  apply_result?: ApplyBatchResult;
  post_coverage?: { archive: "unknown" | "partial" | "complete"; catchup: "unknown" | "partial" | "complete" };
};

/** Options for {@link PatreonSyncService.scrapeOrSync}. */
export type PatreonSyncOptions = {
  /** Numeric Patreon campaign id from API. If omitted, uses the only campaign when exactly one exists. */
  campaign_id?: string;
  /** Same as {@link PatreonSyncStateOptions.fallback_campaign_id}. */
  fallback_campaign_id?: string;
  /** Max post list pages (25 posts per page). */
  max_post_pages?: number;
  /** If true, do not write to canonical store. */
  dry_run?: boolean;
  /**
   * Bump each post's upstream_revision so tier/access fields are re-written even when
   * Patreon content hash is unchanged (idempotent ingest otherwise skips posts).
   */
  force_refresh_post_access?: boolean;
  /** Opt local single-writer imports into persisted continuation; hosted DB sync uses it automatically. */
  resume_archive?: boolean;
};

/** Result summary for {@link PatreonSyncService.syncMembers}. */
export type MemberSyncResult = {
  creator_id: string;
  patreon_campaign_id: string;
  members_synced: number;
  pages_fetched: number;
  warnings: string[];
  coverage?: "complete" | "partial" | "blocked";
  roster?: { phase: string; last_complete_at: string | null; started_at: string; unverified_legacy_count: number; reason: string | null };
};

/** Library-facing sync snapshot: watermarks, cookie session, OAuth health, last health rows. */
export type PatreonSyncState = {
  availability?: "available" | "unavailable";
  unavailable_reason?: "missing_tokens" | "missing_binding" | "binding_mismatch";
  server_checked_at?: string;
  upstream_probe?: { availability: "available" | "unavailable"; observed_at: string | null };
  completeness?: SyncCompleteness;
  creator_id: string;
  patreon_campaign_id: string;
  /** Max `published_at` from the last applied sync batch (incremental cutoff). */
  watermark_published_at: string | null;
  /** Wall time when the watermark row was last written. */
  watermark_updated_at: string | null;
  has_cookie_session: boolean;
  /** Cookie session key lifecycle for UI (OAuth unaffected). */
  cookie_session_status?: "ok" | "expired_local" | "rejected_remote";
  /** Newest `published_at` on the first OAuth posts page (only when `probe_upstream`). */
  upstream_newest_published_at?: string | null;
  /** True when a watermark exists and upstream has a strictly newer post (probe only). */
  likely_has_newer_posts?: boolean;
  oauth: PatreonOAuthHealthSnapshot;
  last_post_scrape: LastPostScrapeHealth | null;
  last_member_sync: LastMemberSyncHealth | null;
  /** Last persisted campaign art + patron count from scrape (null if never synced or store unwired). */
  campaign_display: CampaignDisplaySnapshot | null;
};

/** Options for {@link PatreonSyncService.getSyncState}. */
export type PatreonSyncStateOptions = {
  campaign_id?: string;
  /**
   * When omitted and Patreon's GET /campaigns returns 0 or 2+ campaigns, use this
   * (`CreatorProfile.patreonCampaignId` from Relay DB) so the Library does not require
   * `NEXT_PUBLIC_RELAY_PATREON_CAMPAIGN_ID`.
   */
  fallback_campaign_id?: string;
  /** One OAuth posts page to compare newest Patreon post vs watermark. */
  probe_upstream?: boolean;
  /** Correlation id for OAuth refresh + events (optional; defaults for sync-state). */
  traceId?: string;
};

/**
 * Facade for creator Patreon connectivity: posts ingest, member sync, sync-state reads.
 * @security-audit-required Member sync paths process patron email/name from Patreon — flow through `IdentityService` only.
 */
class MediaCollectionError extends Error {
  public constructor(public readonly code: "cookie_required" | "media_collection_incomplete") {
    super(code === "cookie_required" ? "A current Patreon session is required to recover this media." : "Patreon did not provide a complete media collection.");
  }
}

export class PatreonSyncService {
  private readonly tokenStore: PatreonTokenStore;
  private readonly cookieStore: PatreonCookieStore;
  private readonly ingestService: IngestService;
  private readonly watermarkStore: SyncWatermarkStoreAPI;
  private readonly authService: PatreonAuthService;
  private readonly exportService: ExportService | null;
  private readonly identityService: IdentityService | null;
  private readonly fetchImpl: typeof fetch;
  private readonly syncHealthStore: PatreonSyncHealthStoreAPI | null;
  private readonly campaignDisplayStore: CreatorCampaignDisplayStore | null;
  private readonly prisma: PrismaClient | null;
  private readonly runScrapeOrSyncExclusive = createExclusivePerKeyRunner();

  public constructor(
    tokenStore: PatreonTokenStore,
    cookieStore: PatreonCookieStore,
    ingestService: IngestService,
    watermarkStore: SyncWatermarkStoreAPI,
    authService: PatreonAuthService,
    fetchImpl?: typeof fetch,
    exportService?: ExportService,
    identityService?: IdentityService,
    syncHealthStore?: PatreonSyncHealthStoreAPI | null,
    campaignDisplayStore?: CreatorCampaignDisplayStore | null,
    prisma?: PrismaClient | null
  ) {
    this.tokenStore = tokenStore;
    this.cookieStore = cookieStore;
    this.ingestService = ingestService;
    this.watermarkStore = watermarkStore;
    this.authService = authService;
    this.exportService = exportService ?? null;
    this.identityService = identityService ?? null;
    this.fetchImpl = fetchImpl ?? fetch;
    this.syncHealthStore = syncHealthStore ?? null;
    this.campaignDisplayStore = campaignDisplayStore ?? null;
    this.prisma = prisma ?? null;
    this.exportService?.setSourceRefresher?.((creatorId, mediaId) => this.refreshSourceForMedia(creatorId, mediaId));
  }

  public get supportsResumablePosts(): boolean { return this.watermarkStore.postProgress?.shared === true && this.ingestService.supportsSharedPatreonPostRefresh; }

  public async selectAutosyncCreators(ids: string[], cap: number): Promise<string[]> {
    return this.watermarkStore.postProgress ? this.watermarkStore.postProgress.selectCreators(ids, cap) : [...ids].sort().slice(0, cap > 0 ? cap : ids.length);
  }

  /** Persisted, creator-scoped read. Legacy probe_upstream only selects saved probe evidence. */
  public async getSyncState(
    creatorId: string,
    options: PatreonSyncStateOptions = {}
  ): Promise<PatreonSyncState> {
    const health = await this.syncHealthStore?.getForCreator(creatorId);
    const cred = await this.tokenStore.getByCreatorId(creatorId);
    const binding = this.prisma
      ? await getCreatorProfilePatreonCampaignIdForRelayCreatorDb(this.prisma, creatorId)
      : health?.upstream_probe?.campaign_id ?? health?.last_post_scrape?.last_verified_campaign_id ?? (health?.last_post_scrape?.ok ? health.last_post_scrape.patreon_campaign_id : null) ?? health?.last_member_sync?.last_verified_campaign_id ?? (health?.last_member_sync?.ok ? health.last_member_sync.patreon_campaign_id : null);
    const mismatch = Boolean(binding && options.campaign_id && binding !== options.campaign_id.trim());
    const campaignId = mismatch ? "" : binding ?? "";
    const cookie = await this.cookieStore.checkCredential(creatorId);
    const row = campaignId ? await this.watermarkStore.getRow(creatorId, campaignId) : null;
    const probe = health?.upstream_probe?.campaign_id === campaignId ? health.upstream_probe : null;
    return {
      availability: cred && campaignId ? "available" : "unavailable",
      ...(!cred ? { unavailable_reason: "missing_tokens" as const } : !campaignId ? { unavailable_reason: mismatch ? "binding_mismatch" as const : "missing_binding" as const } : {}),
      server_checked_at: new Date().toISOString(),
      creator_id: creatorId, patreon_campaign_id: campaignId,
      watermark_published_at: row?.last_synced_at ?? null, watermark_updated_at: row?.updated_at ?? null,
      has_cookie_session: cookie.status === "ok",
      ...(cookie.status !== "none" ? { cookie_session_status: cookie.status } : {}),
      oauth: cred ? buildOauthHealthSnapshot(cred) : { availability: "unavailable", credential_health_status: "unavailable", access_token_expires_at: null, access_token_expired: null, access_token_expires_soon: null },
      last_post_scrape: health?.last_post_scrape ?? null, last_member_sync: health?.last_member_sync ?? null,
      campaign_display: await this.campaignDisplayStore?.get(creatorId) ?? null,
      upstream_probe: { availability: probe ? "available" : "unavailable", observed_at: probe?.observed_at ?? null },
      completeness: await readSyncCompleteness(this.prisma, this.watermarkStore.postProgress, creatorId, campaignId),
      ...(probe ? { upstream_newest_published_at: probe.newest_published_at, likely_has_newer_posts: Boolean(row?.last_synced_at && probe.newest_published_at && probe.newest_published_at > row.last_synced_at) } : {})
    };
  }

  /** Worker/mutation-only upstream maintenance and bounded discovery probe. Never call from GET. */
  public async prepareSyncStateForAutomation(
    creatorId: string,
    options: PatreonSyncStateOptions = {}
  ): Promise<PatreonSyncState> {
    const traceForRefresh = options.traceId?.trim() || "patreon_sync_state";
    await this.authService.ensureFreshAccessForAutomation(creatorId, traceForRefresh);
    const cred = await this.tokenStore.getByCreatorId(creatorId);
    if (!cred) {
      throw new Error(
        "No Patreon tokens for this creator_id. Complete OAuth and POST /api/v1/auth/patreon/exchange first."
      );
    }
    const fetchOpts = { access_token: cred.access_token, fetch_impl: this.fetchImpl };
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

    const row = await this.watermarkStore.getRow(creatorId, patreonCampaignId);
    const cookieLocal = await this.cookieStore.getCookieLocalStatus(creatorId);
    const sessionId = await this.cookieStore.getSessionId(creatorId);
    const remoteRejection = await this.cookieStore.hasRemoteRejectionMarker(creatorId);
    const oauth = buildOauthHealthSnapshot(cred);
    const healthRow = this.syncHealthStore
      ? await this.syncHealthStore.getForCreator(creatorId)
      : null;
    const campaign_display = this.campaignDisplayStore
      ? await this.campaignDisplayStore.get(creatorId)
      : null;

    const hasCookie = Boolean(sessionId?.trim());
    if (hasCookie && remoteRejection) {
      await this.cookieStore.clearPatreonRejectedSession(creatorId, sessionId!);
    }
    let cookie_session_status: PatreonSyncState["cookie_session_status"];
    if (hasCookie) {
      cookie_session_status = "ok";
    } else if (cookieLocal === "expired_local") {
      cookie_session_status = "expired_local";
    } else if (remoteRejection) {
      cookie_session_status = "rejected_remote";
    }

    const base: PatreonSyncState = {
      creator_id: creatorId,
      patreon_campaign_id: patreonCampaignId,
      watermark_published_at: row?.last_synced_at ?? null,
      watermark_updated_at: row?.updated_at ?? null,
      has_cookie_session: hasCookie,
      ...(cookie_session_status ? { cookie_session_status } : {}),
      oauth,
      last_post_scrape: healthRow?.last_post_scrape ?? null,
      last_member_sync: healthRow?.last_member_sync ?? null,
      campaign_display
    };

    if (!options.probe_upstream) {
      return base;
    }

    const doc = await fetchPostsPage(fetchOpts, patreonCampaignId, null);
    const pagePosts = asDataArray(doc.data).filter((r) => r.type === "post");
    let upstreamNewest: string | null = null;
    for (const r of pagePosts) {
      const p = mapPatreonPostToIngest(r);
      if (!upstreamNewest || p.published_at > upstreamNewest) {
        upstreamNewest = p.published_at;
      }
    }

    const wm = base.watermark_published_at;
    const likely =
      Boolean(wm && upstreamNewest && upstreamNewest > wm);

    await this.syncHealthStore?.recordUpstreamProbe?.(creatorId, { campaign_id: patreonCampaignId,
      observed_at: new Date().toISOString(), newest_published_at: upstreamNewest });

    return {
      ...base,
      upstream_newest_published_at: upstreamNewest,
      likely_has_newer_posts: likely
    };
  }

  private async collectPostsViaOAuthOnly(opts: {
    fetchOpts: PatreonFetchOptions;
    patreonCampaignId: string;
    maxPages: number;
    stopBeforePublishedAt: string | null | undefined;
    warnings: string[];
    oauthFallback: "no_cookie" | "ttl_expired" | "cookie_rejected";
  }): Promise<{ posts: IngestPost[]; pages: number }> {
    const {
      fetchOpts,
      patreonCampaignId,
      maxPages,
      stopBeforePublishedAt,
      warnings,
      oauthFallback
    } = opts;
    const posts: IngestPost[] = [];
    let pages = 0;
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
          nextUrl =
            postsPageUrl(patreonCampaignId) + `&page%5Bcursor%5D=${encodeURIComponent(cursor)}`;
        }
      }
    } while (nextUrl && pages < maxPages);

    if (oauthFallback === "no_cookie") {
      warnings.push(
        "No session cookie stored. Using OAuth API only (post images/attachments unavailable). " +
          "POST /api/v1/patreon/cookie with your session_id to enable media scraping."
      );
    } else if (oauthFallback === "ttl_expired") {
      warnings.push(
        "Session key exceeded maximum storage age and was removed. Using OAuth API only (post images/attachments unavailable) until you re-enter your session key."
      );
    }

    return { posts, pages };
  }

  /**
   * Watermark-aware incremental sync. Serialized per `creator_id` so concurrent calls
   * (webhooks + unattended worker) do not interleave ingest for the same creator.
   * @async Note: returns `Promise` while method is not marked `async` (exclusive runner wrapper).
   * @throws {Error} Patreon HTTP, ingest, token, or campaign resolution failures from `scrapeOrSyncImpl`.
   */
  public scrapeOrSync(
    creatorId: string,
    traceId: string,
    options: PatreonSyncOptions = {}
  ): Promise<PatreonScrapeResult> {
    const id = creatorId.trim();
    return this.runScrapeOrSyncExclusive(id, async () => {
      const result = await this.scrapeOrSyncImpl(id, traceId, options);
      if (!options.dry_run && this.prisma && this.exportService?.supportsHostedRepair) {
        try { await this.repairMediaForCreator(id, 2); }
        catch { result.warnings.push("Media repair remains pending; server repair will retry."); }
      }
      return result;
    });
  }

  private async scrapeOrSyncImpl(
    creatorId: string,
    traceId: string,
    options: PatreonSyncOptions = {}
  ): Promise<PatreonScrapeResult> {
    const warnings: string[] = [];
    const expectedPatreonPostStates = options.dry_run ? undefined : await this.ingestService.getPatreonPostStates(creatorId);
    await this.authService.ensureFreshAccessForAutomation(creatorId, traceId);
    const cred = await this.tokenStore.getByCreatorId(creatorId);
    if (!cred) {
      throw new Error(
        "No Patreon tokens for this creator_id. Complete OAuth and POST /api/v1/auth/patreon/exchange first."
      );
    }

    const fetchOpts = { access_token: cred.access_token, fetch_impl: this.fetchImpl };

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

    let campaign_display: CampaignDisplaySnapshot | undefined;
    const displayFields = extractCampaignDisplayFromCampaignsDoc(campaignsDoc, patreonCampaignId);
    if (displayFields) {
      campaign_display = { ...displayFields, captured_at: new Date().toISOString() };
      if (this.campaignDisplayStore) {
        try {
          await this.campaignDisplayStore.upsert(creatorId, campaign_display);
        } catch {
          /* best-effort persistence */
        }
      }
    }

    const { campaign, tiers } = mapped;
    const maxPages = Math.min(Math.max(options.max_post_pages ?? 20, 1), 100);
    if (!options.dry_run && this.watermarkStore.postProgress && (this.watermarkStore.postProgress.shared || this.ingestService.supportsSharedPatreonPostRefresh || options.resume_archive)) {
      return resumePostSync({ creatorId, campaignId: patreonCampaignId, campaign, tiers, traceId, fetchOpts,
        ingest: this.ingestService, watermarks: this.watermarkStore, maxPages, hasCookie: Boolean(await this.cookieStore.getSessionId(creatorId)), forceAccess: options.force_refresh_post_access,
        refresh: (postId, reconciliation) => this.refreshPost(creatorId, traceId, patreonCampaignId, postId, reconciliation ? "reconciliation" : false).then(() => {}),
        ...(this.exportService ? { exportMedia: (id: string) => this.exportService!.exportMedia(creatorId, id) } : {}) });
    }
    const watermark = await this.watermarkStore.get(creatorId, patreonCampaignId);
    // When force_refresh_post_access is set, bypass the watermark so that posts
    // ingested before the tier-mapping code was deployed are re-fetched and
    // re-written with correct tier_ids.  Without this, an empty batch is returned
    // for campaigns where all posts pre-date the last watermark.
    const stopBeforePublishedAt = options.force_refresh_post_access ? undefined : watermark;

    const cookieLocal = await this.cookieStore.getCookieLocalStatus(creatorId);
    const sessionId = await this.cookieStore.getSessionId(creatorId);

    let posts: IngestPost[] = [];
    let pages = 0;
    let mediaSource: "cookie" | "oauth" = "oauth";
    let perPostOAuth: PerPostOAuthStats = {
      targets: 0,
      filledBody: 0,
      filledTiers: 0
    };
    let usedCookiePath = false;
    let patreonRejectedCookie = false;

    // Cookie scrape tier/access pipeline (OAuth wins when both paths run):
    // 1) Cookie post list — tier_ids / is_paid often unreliable for creators.
    // 2) OAuth list fills missing body and authoritative access; stop when targets are found.
    // 3) Per-post GET only for remaining body/access gaps. OAuth-only imports already have metadata.
    // 4) buildSyncBatchFromParts → IngestService.runBatch → enrichBatch (expand relay_tier_all_patrons).
    if (sessionId) {
      try {
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
        usedCookiePath = true;
        warnings.push(...cookieResult.warnings);
        if (posts.length > 0) {
          const totalMedia = posts.reduce((n, p) => n + p.media.length, 0);
          warnings.push(`Cookie scrape: ${posts.length} posts, ${totalMedia} media items.`);
        }
      } catch (e) {
        if (e instanceof CookieSessionExpiredError) {
          await this.cookieStore.markPatreonRejectedSession(creatorId, sessionId);
          patreonRejectedCookie = true;
          warnings.push(
            "Session key rejected by Patreon — removed. Falling back to OAuth-only sync."
          );
        } else {
          throw e;
        }
      }
    }

    if (!usedCookiePath) {
      const oauthFallback = patreonRejectedCookie
        ? "cookie_rejected"
        : cookieLocal === "expired_local"
          ? "ttl_expired"
          : "no_cookie";
      const o = await this.collectPostsViaOAuthOnly({
        fetchOpts,
        patreonCampaignId,
        maxPages,
        stopBeforePublishedAt,
        warnings,
        oauthFallback
      });
      posts = o.posts;
      pages = o.pages;
      mediaSource = "oauth";
    }

    let listStats: OAuthListTierStats = {
      postsUpdated: 0,
      pagesFetched: !usedCookiePath ? pages : 0,
      attempted: !usedCookiePath && posts.length > 0,
      resolvedAccess: new Set()
    };
    if (usedCookiePath && posts.length > 0) {
      listStats = await enrichTiersFromCampaignPostsList(
        posts,
        patreonCampaignId,
        fetchOpts,
        maxPages,
        warnings
      );
      perPostOAuth = await enrichPostsFromOAuth(posts, fetchOpts, warnings, listStats.resolvedAccess);
      for (const post of posts) {
        post.upstream_revision += `:sha256:${patreonPostContentHash(post)}`;
        for (const media of post.media) media.upstream_revision += `:sha256:${patreonMediaContentHash(media)}`;
      }
    }

    const tier_access_summary: TierAccessSummary = {
      media_source: mediaSource,
      oauth_list_pass: listStats.attempted,
      oauth_list_posts_updated: listStats.postsUpdated,
      oauth_list_pages_fetched: listStats.pagesFetched,
      per_post_oauth_targets: perPostOAuth.targets,
      per_post_filled_tiers: perPostOAuth.filledTiers,
      per_post_filled_body: perPostOAuth.filledBody
    };

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
      const { batch: enrichedBatch, notes } = enrichBatch(batch);
      if (notes.length > 0) {
        warnings.push(...notes);
      }
      return {
        creator_id: creatorId,
        patreon_campaign_id: patreonCampaignId,
        batch: enrichedBatch,
        pages_fetched: pages,
        posts_fetched: posts.length,
        media_source: mediaSource,
        warnings,
        tier_access_summary,
        ...(campaign_display ? { campaign_display } : {})
      };
    }

    const apply_result = await this.ingestService.runBatch(batch, traceId, undefined, [], { currentPatreonSnapshot: true, expectedPatreonPostStates });
    if (apply_result.ingest_notes?.length) {
      warnings.push(...apply_result.ingest_notes);
    }
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
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          const short = msg.length > 180 ? `${msg.slice(0, 177)}...` : msg;
          warnings.push(`Auto-export failed for ${mediaId}: ${short}`);
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
      tier_access_summary,
      ...(campaign_display ? { campaign_display } : {}),
      apply_result
    };
  }

  /** Refresh signed post work from current upstream state, independently of discovery. */
  public async refreshPost(creatorId: string, traceId: string, campaignId: string, resourceId: string, signedDeletion: boolean | "reconciliation" = false, repairOptions: { skipExport?: boolean; requireCompleteMedia?: boolean } = {}): Promise<{ head: string; collection: "empty" | "media" } | undefined> {
    if (!this.ingestService.supportsSharedPatreonPostRefresh) throw new Error("Targeted Patreon post work requires the shared atomic canonical store.");
    if (!/^[a-zA-Z0-9_-]{1,128}$/.test(resourceId) || !/^\d{1,32}$/.test(campaignId)) throw new Error("Invalid Patreon post identity.");
    const postId = `patreon_post_${resourceId}`;
    const refresh: PatreonPostRefresh = { postId, campaignId: `patreon_campaign_${campaignId}`, state: await this.ingestService.getPatreonPostState(creatorId, postId), accessSource: signedDeletion === "reconciliation" ? "reconciliation" : "targeted" };
    await this.authService.ensureFreshAccessForAutomation(creatorId, traceId);
    const cred = await this.tokenStore.getByCreatorId(creatorId);
    if (!cred) throw new Error("No Patreon tokens for this creator_id.");
    const fetchOpts = { access_token: cred.access_token, fetch_impl: this.fetchImpl };
    const campaignsDoc = await fetchCampaignsWithTiers(fetchOpts);
    const mapped = buildCampaignAndTiersFromCampaignsDoc(campaignsDoc, creatorId, campaignId);
    if (!mapped) throw new Error("Patreon campaign is unavailable for this token.");
    let doc;
    try {
      doc = await fetchPostById(fetchOpts, resourceId);
    } catch (error) {
      if (!signedDeletion || !(error instanceof PatreonRequestError) || (error.status !== 404 && error.status !== 410)) throw error;
      refresh.deletion = true;
      refresh.requireVerifiedBinding = signedDeletion === "reconciliation";
      await this.ingestService.runBatch({ creator_id: creatorId }, traceId, undefined, [], { patreonPostRefresh: refresh });
      return;
    }
    const resource = asDataArray(doc.data).find((row) => row.type === "post" && row.id === resourceId);
    const campaign = resource?.relationships?.campaign?.data;
    if (!resource || !campaign || Array.isArray(campaign) || campaign.type !== "campaign" || campaign.id !== campaignId) throw new Error("Patreon post campaign could not be verified.");
    const post = mapPatreonPostToIngest(resource);
    const gate = oauthPostAccessGateFromResource(resource, listCampaignPaidPatreonTierIds(mapped.tiers));
    post.tier_ids = gate.isPublic ? [RELAY_TIER_PUBLIC] : gate.tierIds;
    const batch = buildSyncBatchFromParts(creatorId, mapped.campaign, mapped.tiers, [post]);
    // Close stale public access before any cookie request or blob download can wait or fail.
    refresh.preserveMedia = true;
    await this.ingestService.runBatch(structuredClone(batch), traceId, undefined, [], { suppressPublicationEvents: repairOptions.requireCompleteMedia === true, currentPatreonSnapshot: true, patreonPostRefresh: refresh, verifiedPatreonCampaign: refresh.campaignId });
    const sessionId = await this.cookieStore.getSessionId(creatorId);
    if (!sessionId && repairOptions.requireCompleteMedia) throw new MediaCollectionError("cookie_required");
    if (!sessionId && post.media.length === 0) return;
    let mediaComplete = false;
    if (sessionId) {
      try {
        const cookieResult = await scrapePostByCookieWithCompleteness(sessionId, campaignId, resourceId, this.fetchImpl);
        const cookiePost = cookieResult.post;
        mediaComplete = cookieResult.complete;
        if (repairOptions.requireCompleteMedia && !mediaComplete) throw new MediaCollectionError("media_collection_incomplete");
        post.media = cookiePost.media;
        post.tag_ids = cookiePost.tag_ids;
        if (!post.description && cookiePost.description) post.description = sanitizeOptionalPostDescriptionHtml(cookiePost.description);
      } catch (error) {
        if (error instanceof CookieSessionExpiredError) await this.cookieStore.markPatreonRejectedSession(creatorId, sessionId);
        throw error;
      }
    }
    post.upstream_revision = post.upstream_revision.replace(/:sha256:.*$/, "") + `:sha256:${patreonPostContentHash(post)}`;
    for (const media of post.media) media.upstream_revision = media.upstream_revision.replace(/:sha256:.*$/, "") + `:sha256:${patreonMediaContentHash(media)}`;
    refresh.preserveMedia = Boolean(sessionId) && !mediaComplete;
    await this.ingestService.runBatch(batch, traceId, undefined, [], { suppressPublicationEvents: repairOptions.requireCompleteMedia === true, currentPatreonSnapshot: true, patreonPostRefresh: refresh, verifiedPatreonCampaign: refresh.campaignId });
    let sourceProof: { head: string; collection: "empty" | "media" } | undefined;
    if (mediaComplete) {
      const accepted = await this.ingestService.getPatreonSnapshot(creatorId);
      if (patreonPostState(accepted, creatorId, postId) !== refresh.state) throw new Error("Post changed during media collection.");
      const row = accepted.posts[creatorId]?.[postId];
      if (row) sourceProof = { head: postCollectionHead(row), collection: row.current.media_ids.length ? "media" : "empty" };
    }
    if (this.exportService && !repairOptions.skipExport) {
      for (const media of post.media) if (media.upstream_url) await this.exportService.exportMedia(creatorId, media.media_id);
    }
    return sourceProof;
  }

  private async refreshSourceForMedia(creatorId: string, mediaId: string): Promise<void> {
    if (!this.prisma || !this.ingestService.supportsSharedPatreonPostRefresh) throw new Error("Current-source repair requires shared canonical storage.");
    const media = await this.prisma.mediaAsset.findFirst({ where: { id: mediaId, creatorId, ingestOrigin: "PATREON", upstreamStatus: "active" }, select: { postIds: true } });
    const post = media ? await this.prisma.post.findFirst({ where: { id: { in: media.postIds }, creatorId, source: "PATREON", upstreamStatus: "active" }, select: { id: true, campaignId: true } }) : null;
    if (!post?.campaignId.startsWith("patreon_campaign_")) throw new Error("Current media source is unavailable.");
    await this.refreshPost(creatorId, "patreon-media-url-renewal", post.campaignId.slice(17), post.id.replace(/^patreon_post_/, ""), false, { skipExport: true, requireCompleteMedia: true });
  }

  /** Server-capable repair is independent of archive progress and newest-post probes. */
  public async repairMediaForCreator(creatorId: string, budget = 4): Promise<{ sources: number; blobs: number }> {
    if (!this.prisma || !this.ingestService.supportsSharedPatreonPostRefresh || !this.exportService?.supportsHostedRepair) throw new Error("Hosted media repair requires shared canonical storage and persistent export storage.");
    const work = new MediaRepairStore(this.prisma), hasCookie = Boolean(await this.cookieStore.getSessionId(creatorId));
    await work.seed(creatorId, hasCookie);
    let sources = 0, blobs = 0;
    const deadline = Date.now() + 90_000;
    for (let count = 0; count < Math.min(10, Math.max(1, budget)) && Date.now() < deadline; count++) {
      const source = count % 2 === 0 ? await work.claim(creatorId, "post") : null;
      if (source) {
        try {
          if (await work.retireIfObsolete(source)) continue;
          const row = await this.prisma.post.findFirst({ where: { id: source.resourceId, creatorId, source: "PATREON", upstreamStatus: "active" }, select: { campaignId: true } });
          if (!row || !row.campaignId.startsWith("patreon_campaign_")) throw new Error("media_source_unavailable");
          const result = await this.refreshPost(creatorId, "patreon-media-repair", row.campaignId.slice("patreon_campaign_".length), source.resourceId.replace(/^patreon_post_/, ""), false, { skipExport: true, requireCompleteMedia: true });
          if (!result) throw new MediaCollectionError("media_collection_incomplete");
          await work.acceptSource(source, result.head, result.collection); sources++;
          await work.seed(creatorId, hasCookie);
        } catch (error) { await work.fail(source, error instanceof MediaCollectionError ? error.code : "media_source_retry_required"); }
      } else {
        const media = await work.claim(creatorId, "media"); if (!media) continue;
        try {
          if (await work.retireIfObsolete(media)) continue;
          await this.exportService.exportMedia(creatorId, media.resourceId, media); blobs++;
        } catch (error) {
          await work.fail(media, "media_download_retry_required");
        }
      }
    }
    return { sources, blobs };
  }

  public async repairMediaCampaigns(): Promise<void> {
    if (!this.prisma || !this.ingestService.supportsSharedPatreonPostRefresh || !this.exportService?.supportsHostedRepair) throw new Error("Hosted media repair requires shared persistence and durable export storage.");
    const work = new MediaRepairStore(this.prisma);
    for (const creatorId of await work.selectCreators(await this.tokenStore.listCreatorIds())) {
      try { await this.repairMediaForCreator(creatorId); } catch {}
    }
  }

  /**
   * OAuth-only tier/access refresh: paginates Patreon post metadata, diffs against Relay DB,
   * patches only changed gates — no cookie scrape, full ingest, or media export.
   * @async
   * @throws {Error} When Prisma unwired, tokens missing, or Patreon failures.
   */
  public async syncPostAccess(
    creatorId: string,
    traceId: string,
    options: SyncPostAccessFromOAuthOptions = {}
  ): Promise<SyncPostAccessFromOAuthResult> {
    if (!this.prisma) {
      throw new Error("Database not wired — cannot sync post access.");
    }
    return syncPostAccessFromOAuth({
      creatorId,
      traceId,
      prisma: this.prisma,
      authService: this.authService,
      tokenStore: this.tokenStore,
      fetchImpl: this.fetchImpl,
      options
    });
  }

  /**
   * Fetches campaign members from Patreon and upserts them into the identity
   * store with their currently entitled tier ids.
   * Requires creator token scopes `campaigns.members` and `campaigns.members[email]` for
   * member email in `fields[member]` (see `PATREON_CREATOR_OAUTH_SCOPES` in
   * `patreon-creator-oauth-scopes.ts` and the dev connect page authorize URL).
   * @async
   * @throws {Error} When `IdentityService` unwired, tokens missing, or Patreon/DB failures.
   * @security-audit-required Processes patron email/name — must stay within `IdentityService` retention rules.
   */
  public get supportsSharedPatreonMembers(): boolean { return this.identityService?.supportsSharedPatreonMembers === true; }

  private async memberContext(creatorId: string, options: { campaign_id?: string; fallback_campaign_id?: string; traceId?: string }) {
    if (!this.identityService) throw new Error("IdentityService not wired — cannot sync members.");
    await this.authService.ensureFreshAccessForAutomation(creatorId, options.traceId ?? "patreon_sync_members");
    const cred = await this.tokenStore.getByCreatorId(creatorId);
    if (!cred) throw new Error("No Patreon tokens for this creator_id.");
    const fetchOpts = { access_token: cred.access_token, fetch_impl: this.fetchImpl };
    const campaignsDoc = await fetchCampaignsWithTiers(fetchOpts);
    const campaignId = options.campaign_id?.trim() || options.fallback_campaign_id?.trim() || pickDefaultCampaignId(campaignsDoc);
    if (!campaignId) throw new Error(patreonCampaignListResolutionErrorMessage(campaignsDoc));
    const mapped = buildCampaignAndTiersFromCampaignsDoc(campaignsDoc, creatorId, campaignId);
    if (!mapped) throw new Error("Patreon member campaign is unavailable for this token.");
    return { identity: this.identityService, creatorId, campaignId, paidTiers: new Set(listCampaignPaidPatreonTierIds(mapped.tiers)), fetch: fetchOpts };
  }

  public async refreshMember(creatorId: string, traceId: string, campaignId: string, memberId: string, signedDeletion = false): Promise<void> {
    if (!this.supportsSharedPatreonMembers) throw new Error("Signed Patreon member work requires shared transactional identity storage.");
    if (!/^[a-zA-Z0-9_-]{1,128}$/.test(memberId) || !/^\d{1,32}$/.test(campaignId)) throw new Error("Invalid Patreon member identity.");
    const context = await this.memberContext(creatorId, { campaign_id: campaignId, traceId });
    await refreshMember(context, memberId, signedDeletion);
  }

  /** Periodic roster work is independent of discovery, with per-campaign saved continuation. */
  public async reconcileMemberCampaigns(creatorId: string): Promise<Array<{ campaignId: string; result?: MemberSyncResult; error?: string }>> {
    if (!this.supportsSharedPatreonMembers || !this.identityService) throw new Error("Patreon roster jobs require shared transactional identity storage.");
    await this.authService.ensureFreshAccessForAutomation(creatorId, "patreon_member_reconciliation");
    const credential = await this.tokenStore.getByCreatorId(creatorId);
    if (!credential) throw new Error("No Patreon tokens for this creator_id.");
    const doc = await fetchCampaignsWithTiers({ access_token: credential.access_token, fetch_impl: this.fetchImpl });
    const campaigns = asDataArray(doc.data);
    if (campaigns.some((row) => row.type !== "campaign") || campaigns.length > 100) throw new Error("Patreon campaign list could not be verified.");
    const results: Array<{ campaignId: string; result?: MemberSyncResult; error?: string }> = [];
    for (const campaign of campaigns) {
      const prior = await this.identityService.mutatePatreonMembers(creatorId, campaign.id, (tx) => tx.roster());
      if (prior?.phase === "complete" && prior.lastCompleteAt && Date.parse(prior.lastCompleteAt) > Date.now() - 6 * 60 * 60 * 1000) continue;
      try {
        const result = await this.syncMembers(creatorId, { campaign_id: campaign.id, max_pages: 2, source: "scheduled_refresh" });
        results.push({ campaignId: campaign.id, result });
        if (result.coverage === "complete") await this.syncHealthStore?.recordMemberSyncSuccess({ creator_id: creatorId, patreon_campaign_id: campaign.id, members_synced: result.members_synced });
        else await this.syncHealthStore?.recordMemberSyncFailure({ creator_id: creatorId, patreon_campaign_id: campaign.id,
          error: { code: `member_roster_${result.coverage}`, message: "Patreon roster reconciliation is incomplete.", hint: "Continue member sync or resolve the reported member binding." } });
      } catch {
        results.push({ campaignId: campaign.id, error: "member_reconciliation_retry_required" });
        await this.syncHealthStore?.recordMemberSyncFailure({ creator_id: creatorId, patreon_campaign_id: campaign.id,
          error: { code: "member_reconciliation_retry_required", message: "Patreon member reconciliation needs a retry.", hint: "Retry member sync after checking the Patreon connection." } });
      }
    }
    return results;
  }

  public async syncMembers(creatorId: string, options: { campaign_id?: string; fallback_campaign_id?: string; max_pages?: number; traceId?: string; source?: "scheduled_refresh" | "webhook" | "manual_support" } = {}): Promise<MemberSyncResult> {
    const context = { ...await this.memberContext(creatorId, options), source: options.source ?? "manual_support" as const };
    return reconcileMembers(context, Math.min(Math.max(options.max_pages ?? 20, 1), 100));
  }
}
