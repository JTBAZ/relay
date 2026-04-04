import express, { Request, Response } from "express";
import { randomUUID } from "node:crypto";
import { PatreonAuthService } from "./auth/auth-service.js";
import { FilePatreonCookieStore } from "./auth/cookie-store.js";
import { PatreonClient } from "./auth/patreon-client.js";
import { FilePatreonTokenStore } from "./auth/token-store.js";
import { errorEnvelope, successEnvelope } from "./contracts/api.js";
import { InMemoryEventBus } from "./events/event-bus.js";
import { FileCanonicalStore } from "./ingest/canonical-store.js";
import { FileDeadLetterQueue } from "./ingest/dlq.js";
import { IngestService } from "./ingest/ingest-service.js";
import { IngestRetryQueue } from "./ingest/retry-queue.js";
import { SyncWatermarkStore } from "./ingest/sync-watermark-store.js";
import { validateIngestBatchBody } from "./ingest/validate-body.js";
import { TokenEncryption } from "./lib/crypto.js";
import { ExportService } from "./export/export-service.js";
import { FileExportIndex } from "./export/export-index.js";
import { DEFAULT_EXPORT_FETCH_RETRY_POLICY } from "./export/types.js";
import {
  buildMediaManifest,
  buildPostMap,
  buildTierMap
} from "./export/manifests.js";
import { GalleryService } from "./gallery/gallery-service.js";
import { FileGalleryOverridesStore } from "./gallery/overrides-store.js";
import { FileCollectionsStore } from "./gallery/collections-store.js";
import { postFitsAccessCeiling } from "./gallery/tier-access.js";
import { FilePageLayoutStore } from "./gallery/layout-store.js";
import { FileSavedFiltersStore } from "./gallery/saved-filters-store.js";
import { FilePatronFavoritesStore } from "./gallery/patron-favorites-store.js";
import { FilePatronCollectionsStore } from "./gallery/patron-collections-store.js";
import { validatePatronFavoriteTarget } from "./gallery/patron-favorites-validate.js";
import { validatePatronCollectionEntry } from "./gallery/patron-collections-validate.js";
import { TriageService } from "./gallery/triage-service.js";
import { resolveLayoutPosts } from "./gallery/layout-to-clone.js";
import { patronMayFetchMediaExport } from "./gallery/patron-media-access.js";
import { parseGalleryLimit, queryStringList } from "./gallery/parse-query.js";
import type {
  PatronFavoriteTargetKind,
  PostVisibility,
  SavedFilterRecord
} from "./gallery/types.js";
import type { SessionToken } from "./identity/types.js";

function normalizeGalleryVisibilityFilter(
  raw: string | undefined
): PostVisibility | "all" | undefined {
  if (!raw) return undefined;
  if (raw === "all") return "all";
  if (raw === "flagged") return "review";
  if (raw === "visible" || raw === "hidden" || raw === "review") return raw;
  return undefined;
}

/**
 * Read at request time: `main.ts` loads dotenv *after* this module is first imported, so a
 * module-level `process.env` snapshot would always see `RELAY_DEV_VISITOR_TIER_SIM` unset.
 */
function devVisitorTierSimEnabled(): boolean {
  return process.env.RELAY_DEV_VISITOR_TIER_SIM === "true";
}

/** When visitor catalog + dev flag + `dev_sim_patron`, redaction uses a fake session (tier_ids from `simulate_tier_ids`). */
function resolveVisitorPatronSessionForRedaction(args: {
  visitor: boolean;
  creatorId: string;
  devSimPatron: boolean;
  simulateTierIds: string[];
  bearerSession: SessionToken | null;
}): SessionToken | null {
  const { visitor, creatorId, devSimPatron, simulateTierIds, bearerSession } = args;
  if (!visitor || !devVisitorTierSimEnabled() || !devSimPatron) {
    return bearerSession;
  }
  return {
    token: "relay_dev_tier_sim",
    user_id: "relay_dev_tier_sim",
    creator_id: creatorId,
    tier_ids: simulateTierIds,
    expires_at: "2099-01-01T00:00:00.000Z"
  };
}

function normalizeGalleryVisibilityBody(vis: unknown): PostVisibility | null {
  if (vis === "flagged") return "review";
  if (vis === "visible" || vis === "hidden" || vis === "review") return vis;
  return null;
}
import { FileAnalyticsStore } from "./analytics/analytics-store.js";
import { ActionCenterService } from "./analytics/action-center-service.js";
import { CloneService } from "./clone/clone-service.js";
import { FileCloneSiteStore } from "./clone/clone-store.js";
import { IdentityService } from "./identity/identity-service.js";
import { FileIdentityStore } from "./identity/identity-store.js";
import { checkPostAccess, filterAccessiblePosts } from "./identity/access-guard.js";
import { PaymentService } from "./payments/payment-service.js";
import { FilePaymentStore } from "./payments/payment-store.js";
import { StripeAdapter, PayPalAdapter } from "./payments/provider-adapter.js";
import type { TierProductMapping, BillingInterval, PaymentProvider } from "./payments/types.js";
import { exchangePatreonPatronOAuth } from "./patreon/patreon-patron-oauth.js";
import { CreatorCampaignDisplayStore } from "./patreon/creator-campaign-display-store.js";
import { PatreonSyncHealthStore } from "./patreon/patreon-sync-health-store.js";
import { PatreonSyncService } from "./patreon/patreon-sync-service.js";
import { classifySyncError } from "./patreon/sync-error-copy.js";
import { processPatreonWebhook } from "./webhooks/patreon-webhook.js";
import { CampaignService } from "./migrate/campaign-service.js";
import { FileMigrationStore } from "./migrate/migration-store.js";
import type { TierMapping } from "./migrate/types.js";
import { DeployService } from "./deploy/deploy-service.js";
import { FileDeployStore } from "./deploy/deploy-store.js";
import { VercelAdapter, NetlifyAdapter } from "./deploy/deploy-adapter.js";
import type { DeployProvider } from "./deploy/types.js";

export type AppConfig = {
  /** Patreon "Client ID" from the developer portal (register-clients). */
  patreon_client_id?: string;
  /** Patreon "Client Secret" from the developer portal. */
  patreon_client_secret?: string;
  /** Defaults to https://www.patreon.com/api/oauth2/token */
  patreon_token_url?: string;
  /** Base64 AES-256 key used to encrypt Patreon tokens at rest (generate e.g. openssl rand -base64 32). */
  relay_token_encryption_key?: string;
  credential_store_path?: string;
  cookie_store_path?: string;
  ingest_canonical_path?: string;
  ingest_dlq_path?: string;
  patreon_sync_watermark_path?: string;
  /** Last post/member sync outcomes for creator-facing health (v1 local JSON). */
  patreon_sync_health_path?: string;
  /** Patreon campaign avatar, banner, patron_count snapshot (default `.relay-data/creator_campaign_display.json`). */
  creator_campaign_display_path?: string;
  /**
   * Public gallery hero title (same meaning as web `NEXT_PUBLIC_RELAY_CREATOR_DISPLAY_NAME`).
   * Returned in `GET /api/v1/gallery/facets?visitor=true` as `visitor_hero.relay_display_name`.
   */
  relay_creator_display_name?: string;
  ingest_retry_policy?: { max_attempts: number; base_delay_ms: number };
  export_storage_root?: string;
  gallery_post_overrides_path?: string;
  gallery_saved_filters_path?: string;
  /** Patron favorites (post + media targets); default `.relay-data/patron_favorites.json`. */
  patron_favorites_store_path?: string;
  /** Patron-owned snip collections; default `.relay-data/patron_collections.json`. */
  patron_collections_store_path?: string;
  collections_store_path?: string;
  page_layout_store_path?: string;
  analytics_store_path?: string;
  analytics_confidence_threshold?: number;
  clone_store_path?: string;
  identity_store_path?: string;
  payment_store_path?: string;
  migration_store_path?: string;
  deploy_store_path?: string;
  stripe_secret_key?: string;
  stripe_webhook_secret?: string;
  paypal_client_id?: string;
  paypal_client_secret?: string;
  fetch_impl?: typeof fetch;
  /**
   * When true, `GET /api/v1/export/media/.../content` requires tier entitlement
   * (or public post) matching `clone/tier-rules` + patron session.
   * Default: env `RELAY_EXPORT_REQUIRE_TIER_ACCESS=1`, else false (Library thumbnails keep working).
   */
  export_require_tier_access?: boolean;
  /** Overrides defaults in `DEFAULT_EXPORT_FETCH_RETRY_POLICY` (export download retries). */
  export_fetch_retry_policy?: Partial<{
    max_attempts: number;
    base_delay_ms: number;
    timeout_ms: number;
  }>;
};

export type CreateAppResult = {
  app: express.Application;
  eventBus: InMemoryEventBus;
  ingestService: IngestService;
  ingestQueue: IngestRetryQueue;
  dlq: FileDeadLetterQueue;
  exportService: ExportService;
  galleryService: GalleryService;
  triageService: TriageService;
  collectionsStore: FileCollectionsStore;
  layoutStore: FilePageLayoutStore;
  actionCenterService: ActionCenterService;
  cloneService: CloneService;
  identityService: IdentityService;
  paymentService: PaymentService;
  campaignService: CampaignService;
  deployService: DeployService;
  patreonSyncService: PatreonSyncService;
};

function required(value: string | undefined, key: string): string {
  if (!value) {
    throw new Error(`Missing required config: ${key}`);
  }
  return value;
}

function traceIdFrom(req: Request): string {
  const headerValue = req.header("x-trace-id");
  return headerValue ?? `trace_${randomUUID()}`;
}

function validateRequiredFields(
  payload: Record<string, unknown>,
  fields: string[]
): Array<{ field: string; issue: string }> {
  const missing: Array<{ field: string; issue: string }> = [];
  for (const field of fields) {
    if (typeof payload[field] !== "string" || String(payload[field]).trim() === "") {
      missing.push({ field, issue: "missing" });
    }
  }
  return missing;
}

function parseQueryTruthy(value: unknown): boolean {
  if (value === true) {
    return true;
  }
  if (Array.isArray(value)) {
    return value.some((v) => parseQueryTruthy(v));
  }
  if (typeof value === "string") {
    const s = value.trim().toLowerCase();
    return s === "1" || s === "true" || s === "yes";
  }
  return false;
}

export function createApp(config: AppConfig): CreateAppResult {
  const encryption = new TokenEncryption(
    required(config.relay_token_encryption_key, "relay_token_encryption_key")
  );
  const tokenStore = new FilePatreonTokenStore(
    config.credential_store_path ?? ".relay-data/patreon_credentials.json",
    encryption
  );
  const eventBus = new InMemoryEventBus();
  const canonicalStore = new FileCanonicalStore(
    config.ingest_canonical_path ?? ".relay-data/canonical.json"
  );
  const dlq = new FileDeadLetterQueue(config.ingest_dlq_path ?? ".relay-data/ingest_dlq.json");
  const ingestService = new IngestService(canonicalStore, eventBus);
  const retryPolicy = config.ingest_retry_policy ?? {
    max_attempts: 5,
    base_delay_ms: 100
  };
  const ingestQueue = new IngestRetryQueue(
    retryPolicy,
    async (batch, traceId, jobId) => {
      await ingestService.runBatch(batch, traceId, jobId);
    },
    dlq
  );
  const exportStorageRoot = config.export_storage_root ?? ".relay-data/exports";
  const exportIndex = new FileExportIndex(exportStorageRoot);
  const exportFetchRetryPolicy = {
    ...DEFAULT_EXPORT_FETCH_RETRY_POLICY,
    ...config.export_fetch_retry_policy
  };
  const exportService = new ExportService(
    canonicalStore,
    exportIndex,
    exportStorageRoot,
    config.fetch_impl,
    exportFetchRetryPolicy
  );
  const galleryOverridesStore = new FileGalleryOverridesStore(
    config.gallery_post_overrides_path ?? ".relay-data/gallery_post_overrides.json"
  );
  const savedFiltersStore = new FileSavedFiltersStore(
    config.gallery_saved_filters_path ?? ".relay-data/gallery_saved_filters.json"
  );
  const patronFavoritesStore = new FilePatronFavoritesStore(
    config.patron_favorites_store_path ?? ".relay-data/patron_favorites.json"
  );
  const patronCollectionsStore = new FilePatronCollectionsStore(
    config.patron_collections_store_path ?? ".relay-data/patron_collections.json"
  );
  const collectionsStore = new FileCollectionsStore(
    config.collections_store_path ?? ".relay-data/collections.json"
  );
  const layoutStore = new FilePageLayoutStore(
    config.page_layout_store_path ?? ".relay-data/page_layout.json"
  );
  const galleryService = new GalleryService(canonicalStore, exportIndex, galleryOverridesStore);
  galleryService.setCollections(collectionsStore);
  const triageService = new TriageService(canonicalStore, exportIndex);
  const analyticsStore = new FileAnalyticsStore(
    config.analytics_store_path ?? ".relay-data/analytics.json"
  );
  const actionCenterService = new ActionCenterService(
    analyticsStore,
    canonicalStore,
    eventBus,
    {
      confidence_threshold: config.analytics_confidence_threshold ?? 0.5
    }
  );
  const cloneStore = new FileCloneSiteStore(
    config.clone_store_path ?? ".relay-data/clone_sites.json"
  );
  const cloneService = new CloneService(canonicalStore, exportIndex, cloneStore);
  const identityStore = new FileIdentityStore(
    config.identity_store_path ?? ".relay-data/identity.json"
  );
  const identityService = new IdentityService(identityStore);
  const exportRequireTierAccess =
    typeof config.export_require_tier_access === "boolean"
      ? config.export_require_tier_access
      : process.env.RELAY_EXPORT_REQUIRE_TIER_ACCESS === "1";
  const paymentStore = new FilePaymentStore(
    config.payment_store_path ?? ".relay-data/payments.json"
  );
  const paymentAdapters = new Map<string, InstanceType<typeof StripeAdapter> | InstanceType<typeof PayPalAdapter>>();
  paymentAdapters.set(
    "stripe",
    new StripeAdapter(
      config.stripe_secret_key ?? "sk_test_placeholder",
      config.stripe_webhook_secret ?? "whsec_placeholder"
    )
  );
  paymentAdapters.set(
    "paypal",
    new PayPalAdapter(
      config.paypal_client_id ?? "paypal_test_id",
      config.paypal_client_secret ?? "paypal_test_secret"
    )
  );
  const paymentService = new PaymentService(paymentStore, cloneService, paymentAdapters);
  const migrationStore = new FileMigrationStore(
    config.migration_store_path ?? ".relay-data/migrations.json"
  );
  const campaignService = new CampaignService(migrationStore, eventBus);

  const deployStore = new FileDeployStore(
    config.deploy_store_path ?? ".relay-data/deploys.json"
  );
  const deployAdapters = new Map<string, import("./deploy/deploy-adapter.js").DeployAdapterInterface>();
  deployAdapters.set("vercel", new VercelAdapter());
  deployAdapters.set("netlify", new NetlifyAdapter());
  const deployService = new DeployService(deployStore, cloneService, deployAdapters);

  const cookieStore = new FilePatreonCookieStore(
    config.cookie_store_path ?? ".relay-data/patreon_cookies.json",
    encryption
  );
  const watermarkStore = new SyncWatermarkStore(
    config.patreon_sync_watermark_path ?? ".relay-data/patreon_sync_watermarks.json"
  );
  const patreonSyncHealthStore = new PatreonSyncHealthStore(
    config.patreon_sync_health_path ?? ".relay-data/patreon_sync_health.json"
  );
  const creatorCampaignDisplayStore = new CreatorCampaignDisplayStore(
    config.creator_campaign_display_path ?? ".relay-data/creator_campaign_display.json"
  );

  const patreonClient = new PatreonClient({
    client_id: required(config.patreon_client_id, "patreon_client_id"),
    client_secret: required(config.patreon_client_secret, "patreon_client_secret"),
    token_url: config.patreon_token_url ?? "https://www.patreon.com/api/oauth2/token",
    fetch_impl: config.fetch_impl
  });
  const authService = new PatreonAuthService(patreonClient, tokenStore, eventBus);
  const patreonSyncService = new PatreonSyncService(
    tokenStore,
    cookieStore,
    ingestService,
    watermarkStore,
    config.fetch_impl,
    exportService,
    identityService,
    patreonSyncHealthStore,
    creatorCampaignDisplayStore
  );

  const app = express();
  app.use(express.json());
  app.use((req, res, next) => {
    // Echo Origin when present so cross-origin fetch() with Authorization works in strict
    // browsers (wildcard is not allowed for credentialed-style requests in some cases).
    const origin = req.header("Origin");
    res.setHeader("Access-Control-Allow-Origin", origin?.trim() || "*");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,PATCH,DELETE,OPTIONS");
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Content-Type, X-Trace-Id, Authorization"
    );
    if (req.method === "OPTIONS") {
      return res.sendStatus(204);
    }
    next();
  });

  app.get("/", (_req: Request, res: Response) => {
    res.type("html").send(`<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"/><title>Relay API</title></head>
<body style="font-family:system-ui,sans-serif;max-width:32rem;margin:2rem;line-height:1.5">
  <h1>Relay API</h1>
  <p>You are on the <strong>Express backend</strong> (this port). There is no page at <code>/</code> by default — opening this URL in a browser used to show &quot;Cannot GET /&quot;.</p>
  <ul>
    <li><a href="/api/v1/health">GET /api/v1/health</a> — JSON health check</li>
  </ul>
  <p>The <strong>gallery / Patreon connect UI</strong> is the Next.js app: run <code>npm run dev</code> in the <code>web/</code> folder (e.g. <code>http://localhost:3001</code>).</p>
  <p><code>NEXT_PUBLIC_RELAY_API_URL</code> in <code>web/.env.local</code> should point here (e.g. <code>http://127.0.0.1:8787</code>) with <strong>no trailing slash</strong>.</p>
</body>
</html>`);
  });

  app.get("/api/v1/health", (req: Request, res: Response) => {
    const traceId = traceIdFrom(req);
    return res.status(200).json(
      successEnvelope(
        {
          status: "ok"
        },
        traceId
      )
    );
  });

  app.post("/api/v1/auth/patreon/exchange", async (req: Request, res: Response) => {
    const traceId = traceIdFrom(req);
    const body = (req.body ?? {}) as Record<string, unknown>;
    const details = validateRequiredFields(body, ["creator_id", "code", "redirect_uri"]);
    if (details.length > 0) {
      return res
        .status(400)
        .json(errorEnvelope("VALIDATION_ERROR", "Invalid request payload.", traceId, details));
    }

    try {
      const result = await authService.exchangeCodeAndPersist(
        body.creator_id as string,
        body.code as string,
        body.redirect_uri as string,
        traceId
      );
      return res.status(200).json(successEnvelope(result, traceId));
    } catch (error) {
      return res
        .status(502)
        .json(errorEnvelope("UPSTREAM_AUTH_ERROR", (error as Error).message, traceId));
    }
  });

  /**
   * Patron OAuth: exchange code with Patreon, GET /v2/identity, sync `tier_ids` like member
   * sync (`patreon_tier_*`), issue Relay session. Does not store Patreon tokens in the
   * creator credential file.
   */
  app.post("/api/v1/auth/patreon/patron/exchange", async (req: Request, res: Response) => {
    const traceId = traceIdFrom(req);
    const body = (req.body ?? {}) as Record<string, unknown>;
    const details = validateRequiredFields(body, [
      "creator_id",
      "patreon_campaign_numeric_id",
      "code",
      "redirect_uri"
    ]);
    if (details.length > 0) {
      return res
        .status(400)
        .json(errorEnvelope("VALIDATION_ERROR", "Invalid request payload.", traceId, details));
    }
    const campaignNumeric = String(body.patreon_campaign_numeric_id).trim();
    if (!/^\d+$/.test(campaignNumeric)) {
      return res.status(400).json(
        errorEnvelope(
          "VALIDATION_ERROR",
          "patreon_campaign_numeric_id must be Patreon's numeric campaign id.",
          traceId,
          [{ field: "patreon_campaign_numeric_id", issue: "invalid" }]
        )
      );
    }
    const fetchImpl = config.fetch_impl ?? globalThis.fetch;
    try {
      const { user, session } = await exchangePatreonPatronOAuth({
        code: body.code as string,
        redirectUri: body.redirect_uri as string,
        creatorId: body.creator_id as string,
        patreonCampaignNumericId: campaignNumeric,
        patreonClient,
        identityService,
        fetchImpl
      });
      return res.status(200).json(
        successEnvelope(
          {
            token: session.token,
            user_id: session.user_id,
            tier_ids: session.tier_ids,
            expires_at: session.expires_at,
            auth_provider: user.auth_provider,
            patreon_user_id: user.patreon_user_id
          },
          traceId
        )
      );
    } catch (error) {
      return res
        .status(502)
        .json(errorEnvelope("UPSTREAM_AUTH_ERROR", (error as Error).message, traceId));
    }
  });

  app.post("/api/v1/auth/patreon/refresh", async (req: Request, res: Response) => {
    const traceId = traceIdFrom(req);
    const body = (req.body ?? {}) as Record<string, unknown>;
    const details = validateRequiredFields(body, ["creator_id"]);
    if (details.length > 0) {
      return res
        .status(400)
        .json(errorEnvelope("VALIDATION_ERROR", "Invalid request payload.", traceId, details));
    }

    try {
      const result = await authService.refreshAndRotate(body.creator_id as string, traceId);
      return res.status(200).json(successEnvelope(result, traceId));
    } catch (error) {
      const code = (error as Error).message.includes("not found")
        ? "NOT_FOUND"
        : "UPSTREAM_AUTH_ERROR";
      const status = code === "NOT_FOUND" ? 404 : 502;
      return res.status(status).json(errorEnvelope(code, (error as Error).message, traceId));
    }
  });

  app.get("/api/v1/patreon/sync-state", async (req: Request, res: Response) => {
    const traceId = traceIdFrom(req);
    const creatorId =
      typeof req.query.creator_id === "string" ? req.query.creator_id.trim() : "";
    if (!creatorId) {
      return res.status(400).json(
        errorEnvelope(
          "VALIDATION_ERROR",
          "Missing creator_id query parameter.",
          traceId,
          [{ field: "creator_id", issue: "required" }]
        )
      );
    }
    const campaignId =
      typeof req.query.campaign_id === "string" ? req.query.campaign_id.trim() : undefined;
    const probeUpstream =
      req.query.probe_upstream === "true" || req.query.probe_upstream === "1";

    try {
      const state = await patreonSyncService.getSyncState(creatorId, {
        campaign_id: campaignId || undefined,
        probe_upstream: probeUpstream
      });
      return res.status(200).json(successEnvelope(state, traceId));
    } catch (err: unknown) {
      const msg = (err as Error).message;
      const notFound =
        msg.includes("No Patreon tokens") || msg.includes("Creator credentials not found");
      return res
        .status(notFound ? 404 : 502)
        .json(errorEnvelope(notFound ? "NOT_FOUND" : "PATREON_SYNC_STATE_ERROR", msg, traceId));
    }
  });

  app.post("/api/v1/patreon/scrape", async (req: Request, res: Response) => {
    const traceId = traceIdFrom(req);
    const body = (req.body ?? {}) as Record<string, unknown>;
    const details = validateRequiredFields(body, ["creator_id"]);
    if (details.length > 0) {
      return res
        .status(400)
        .json(errorEnvelope("VALIDATION_ERROR", "Invalid request payload.", traceId, details));
    }
    const creatorId = body.creator_id as string;
    const campaignId = typeof body.campaign_id === "string" ? body.campaign_id.trim() : undefined;
    const dryRun = body.dry_run === true;
    const includeBatch = body.include_batch === true;
    const maxPostPages =
      typeof body.max_post_pages === "number" && Number.isFinite(body.max_post_pages)
        ? body.max_post_pages
        : undefined;
    const forceRefreshPostAccess = body.force_refresh_post_access === true;

    try {
      const result = await patreonSyncService.scrapeOrSync(creatorId, traceId, {
        campaign_id: campaignId || undefined,
        dry_run: dryRun,
        max_post_pages: maxPostPages,
        force_refresh_post_access: forceRefreshPostAccess
      });
      const batch = result.batch;
      const mediaTotal = batch.posts?.reduce((n, p) => n + p.media.length, 0) ?? 0;
      const samplePosts = (batch.posts ?? []).slice(0, 8).map((p) => ({
        post_id: p.post_id,
        title: p.title,
        published_at: p.published_at,
        tier_ids: p.tier_ids,
        media_count: p.media.length,
        media_preview: p.media.slice(0, 4).map((m) => ({
          media_id: m.media_id,
          upstream_url: m.upstream_url ?? null,
          mime_type: m.mime_type ?? null
        }))
      }));
      const payload: Record<string, unknown> = {
        creator_id: result.creator_id,
        patreon_campaign_id: result.patreon_campaign_id,
        media_source: result.media_source,
        tier_access_summary: result.tier_access_summary,
        pages_fetched: result.pages_fetched,
        posts_fetched: result.posts_fetched,
        summary: {
          campaigns: batch.campaigns?.length ?? 0,
          tiers: batch.tiers?.length ?? 0,
          posts: batch.posts?.length ?? 0,
          media_items: mediaTotal
        },
        warnings: result.warnings,
        sample_posts: samplePosts
      };
      if (result.apply_result) payload.apply_result = result.apply_result;
      if (result.campaign_display) payload.campaign_display = result.campaign_display;
      if (includeBatch) payload.batch = batch;
      try {
        await patreonSyncHealthStore.recordPostScrapeSuccess({
          creator_id: creatorId,
          patreon_campaign_id: result.patreon_campaign_id,
          posts_fetched: result.posts_fetched,
          posts_written: result.apply_result?.posts_written,
          warnings: result.warnings
        });
      } catch {
        /* best-effort health persistence */
      }
      return res.status(200).json(successEnvelope(payload, traceId));
    } catch (err: unknown) {
      const msg = (err as Error).message;
      const notFound =
        msg.includes("No Patreon tokens") || msg.includes("Creator credentials not found");
      const classified = classifySyncError(msg);
      try {
        await patreonSyncHealthStore.recordPostScrapeFailure({
          creator_id: creatorId,
          patreon_campaign_id: campaignId,
          error: {
            code: classified.code,
            message: msg.slice(0, 400),
            hint: classified.hint
          }
        });
      } catch {
        /* best-effort */
      }
      return res
        .status(notFound ? 404 : 502)
        .json(errorEnvelope(notFound ? "NOT_FOUND" : "PATREON_SCRAPE_ERROR", msg, traceId));
    }
  });

  app.post("/api/v1/patreon/sync-members", async (req: Request, res: Response) => {
    const traceId = traceIdFrom(req);
    const body = (req.body ?? {}) as Record<string, unknown>;
    const details = validateRequiredFields(body, ["creator_id"]);
    if (details.length > 0) {
      return res
        .status(400)
        .json(errorEnvelope("VALIDATION_ERROR", "Invalid request payload.", traceId, details));
    }
    try {
      const result = await patreonSyncService.syncMembers(
        body.creator_id as string,
        {
          campaign_id: typeof body.campaign_id === "string" ? body.campaign_id.trim() : undefined,
          max_pages: typeof body.max_pages === "number" ? body.max_pages : undefined
        }
      );
      try {
        await patreonSyncHealthStore.recordMemberSyncSuccess({
          creator_id: body.creator_id as string,
          patreon_campaign_id: result.patreon_campaign_id,
          members_synced: result.members_synced
        });
      } catch {
        /* best-effort */
      }
      return res.status(200).json(successEnvelope(result, traceId));
    } catch (err: unknown) {
      const msg = (err as Error).message;
      const notFound = msg.includes("No Patreon tokens");
      const classified = classifySyncError(msg);
      const mCampaign =
        typeof body.campaign_id === "string" ? body.campaign_id.trim() : undefined;
      try {
        await patreonSyncHealthStore.recordMemberSyncFailure({
          creator_id: body.creator_id as string,
          patreon_campaign_id: mCampaign,
          error: {
            code: classified.code,
            message: msg.slice(0, 400),
            hint: classified.hint
          }
        });
      } catch {
        /* best-effort */
      }
      return res
        .status(notFound ? 404 : 502)
        .json(errorEnvelope(notFound ? "NOT_FOUND" : "MEMBER_SYNC_ERROR", msg, traceId));
    }
  });

  app.post("/api/v1/webhooks/patreon", async (req: Request, res: Response) => {
    const traceId = traceIdFrom(req);
    const body = (req.body ?? {}) as Record<string, unknown>;
    try {
      const result = await processPatreonWebhook(
        {
          creator_id: typeof body.creator_id === "string" ? body.creator_id : undefined,
          campaign_id: typeof body.campaign_id === "string" ? body.campaign_id : undefined,
          event_type: typeof body.event_type === "string" ? body.event_type : undefined
        },
        traceId,
        patreonSyncService
      );
      if (!result.accepted) {
        return res
          .status(400)
          .json(errorEnvelope("VALIDATION_ERROR", result.reason ?? "Invalid webhook payload.", traceId));
      }
      return res.status(202).json(successEnvelope(result, traceId));
    } catch (err: unknown) {
      return res
        .status(502)
        .json(errorEnvelope("PATREON_WEBHOOK_ERROR", (err as Error).message, traceId));
    }
  });

  app.post("/api/v1/patreon/cookie", async (req: Request, res: Response) => {
    const traceId = traceIdFrom(req);
    const body = (req.body ?? {}) as Record<string, unknown>;
    const details = validateRequiredFields(body, ["creator_id", "session_id"]);
    if (details.length > 0) {
      return res
        .status(400)
        .json(errorEnvelope("VALIDATION_ERROR", "creator_id and session_id are required.", traceId, details));
    }
    const creatorId = (body.creator_id as string).trim();
    const sessionId = (body.session_id as string).trim();
    await cookieStore.upsert(creatorId, sessionId);
    return res.status(200).json(
      successEnvelope({ creator_id: creatorId, status: "stored" }, traceId)
    );
  });

  app.delete("/api/v1/patreon/cookie", async (req: Request, res: Response) => {
    const traceId = traceIdFrom(req);
    const body = (req.body ?? {}) as Record<string, unknown>;
    const details = validateRequiredFields(body, ["creator_id"]);
    if (details.length > 0) {
      return res
        .status(400)
        .json(errorEnvelope("VALIDATION_ERROR", "creator_id is required.", traceId, details));
    }
    const creatorId = (body.creator_id as string).trim();
    const removed = await cookieStore.remove(creatorId);
    return res.status(200).json(
      successEnvelope({ creator_id: creatorId, removed }, traceId)
    );
  });

  app.get("/api/v1/patreon/cookie/status", async (req: Request, res: Response) => {
    const traceId = traceIdFrom(req);
    const creatorId = typeof req.query.creator_id === "string" ? req.query.creator_id.trim() : "";
    if (!creatorId) {
      return res
        .status(400)
        .json(errorEnvelope("VALIDATION_ERROR", "creator_id is required.", traceId, [
          { field: "creator_id", issue: "missing" }
        ]));
    }
    const has = (await cookieStore.getSessionId(creatorId)) !== null;
    return res.status(200).json(
      successEnvelope({ creator_id: creatorId, has_cookie: has }, traceId)
    );
  });

  app.post("/api/v1/ingest/batches", async (req: Request, res: Response) => {
    const traceId = traceIdFrom(req);
    const parsed = validateIngestBatchBody(req.body);
    if (!parsed.ok) {
      return res
        .status(400)
        .json(errorEnvelope("VALIDATION_ERROR", "Invalid ingest batch.", traceId, parsed.details));
    }

    const processSync = String(req.query.process_sync) === "true";
    if (processSync) {
      const result = await ingestService.runBatch(parsed.batch, traceId);
      return res.status(200).json(successEnvelope(result, traceId));
    }

    const jobId = `job_${randomUUID()}`;
    ingestQueue.enqueue({
      id: jobId,
      creator_id: parsed.batch.creator_id,
      trace_id: traceId,
      batch: parsed.batch,
      attempts: 0
    });
    void ingestQueue.drain();
    return res
      .status(202)
      .json(successEnvelope({ job_id: jobId, status: "queued" }, traceId));
  });

  app.post("/api/v1/export/media", async (req: Request, res: Response) => {
    const traceId = traceIdFrom(req);
    const body = (req.body ?? {}) as Record<string, unknown>;
    const details = validateRequiredFields(body, ["creator_id", "media_id"]);
    if (details.length > 0) {
      return res
        .status(400)
        .json(errorEnvelope("VALIDATION_ERROR", "Invalid export request.", traceId, details));
    }
    try {
      const result = await exportService.exportMedia(
        body.creator_id as string,
        body.media_id as string
      );
      return res.status(200).json(successEnvelope(result, traceId));
    } catch (error) {
      const message = (error as Error).message;
      if (message.includes("not found") || message.includes("Not found")) {
        return res.status(404).json(errorEnvelope("NOT_FOUND", message, traceId));
      }
      if (message.includes("upstream_url")) {
        return res
          .status(400)
          .json(errorEnvelope("VALIDATION_ERROR", message, traceId));
      }
      return res.status(502).json(errorEnvelope("EXPORT_ERROR", message, traceId));
    }
  });

  app.get("/api/v1/export/manifests/media-manifest", async (req: Request, res: Response) => {
    const traceId = traceIdFrom(req);
    const creatorId = typeof req.query.creator_id === "string" ? req.query.creator_id : "";
    if (!creatorId.trim()) {
      return res
        .status(400)
        .json(
          errorEnvelope("VALIDATION_ERROR", "creator_id is required.", traceId, [
            { field: "creator_id", issue: "missing" }
          ])
        );
    }
    const snapshot = await canonicalStore.load();
    const index = await exportIndex.load(creatorId);
    const manifest = buildMediaManifest(creatorId, snapshot, index);
    return res.status(200).json(successEnvelope(manifest, traceId));
  });

  app.get("/api/v1/export/manifests/post-map", async (req: Request, res: Response) => {
    const traceId = traceIdFrom(req);
    const creatorId = typeof req.query.creator_id === "string" ? req.query.creator_id : "";
    if (!creatorId.trim()) {
      return res
        .status(400)
        .json(
          errorEnvelope("VALIDATION_ERROR", "creator_id is required.", traceId, [
            { field: "creator_id", issue: "missing" }
          ])
        );
    }
    const snapshot = await canonicalStore.load();
    return res.status(200).json(successEnvelope(buildPostMap(creatorId, snapshot), traceId));
  });

  app.get("/api/v1/export/manifests/tier-map", async (req: Request, res: Response) => {
    const traceId = traceIdFrom(req);
    const creatorId = typeof req.query.creator_id === "string" ? req.query.creator_id : "";
    if (!creatorId.trim()) {
      return res
        .status(400)
        .json(
          errorEnvelope("VALIDATION_ERROR", "creator_id is required.", traceId, [
            { field: "creator_id", issue: "missing" }
          ])
        );
    }
    const snapshot = await canonicalStore.load();
    return res.status(200).json(successEnvelope(buildTierMap(creatorId, snapshot), traceId));
  });

  app.post("/api/v1/export/manifests/materialize", async (req: Request, res: Response) => {
    const traceId = traceIdFrom(req);
    const body = (req.body ?? {}) as Record<string, unknown>;
    const details = validateRequiredFields(body, ["creator_id"]);
    if (details.length > 0) {
      return res
        .status(400)
        .json(errorEnvelope("VALIDATION_ERROR", "Invalid request.", traceId, details));
    }
    const result = await exportService.materializeManifests(body.creator_id as string);
    return res.status(200).json(successEnvelope(result, traceId));
  });

  app.post("/api/v1/export/verify", async (req: Request, res: Response) => {
    const traceId = traceIdFrom(req);
    const body = (req.body ?? {}) as Record<string, unknown>;
    const details = validateRequiredFields(body, ["creator_id", "media_id"]);
    if (details.length > 0) {
      return res
        .status(400)
        .json(errorEnvelope("VALIDATION_ERROR", "Invalid verify request.", traceId, details));
    }
    try {
      const match = await exportService.verifyIntegrity(
        body.creator_id as string,
        body.media_id as string
      );
      return res.status(200).json(successEnvelope({ match }, traceId));
    } catch {
      return res.status(200).json(successEnvelope({ match: false }, traceId));
    }
  });

  app.get("/api/v1/export/library-zip", async (req, res) => {
    const traceId = traceIdFrom(req);
    const creatorId =
      typeof req.query.creator_id === "string" ? req.query.creator_id.trim() : "";
    if (!creatorId) {
      return res
        .status(400)
        .json(
          errorEnvelope("VALIDATION_ERROR", "creator_id is required.", traceId, [
            { field: "creator_id", issue: "missing" }
          ])
        );
    }
    try {
      if (await exportService.isLibraryZipEmpty(creatorId)) {
        return res
          .status(404)
          .json(
            errorEnvelope(
              "NOT_FOUND",
              "No exported media for this creator. Run export or Patreon sync first.",
              traceId
            )
          );
      }
      const missingBlobs = await exportService.listMissingLibraryZipBlobs(creatorId);
      if (missingBlobs.length > 0) {
        const examples = missingBlobs.slice(0, 5).join("; ");
        return res.status(502).json(
          errorEnvelope(
            "EXPORT_ZIP_ERROR",
            `Library ZIP skipped: ${missingBlobs.length} export file(s) missing on disk (stale export index vs. storage). Re-export or remove bad index rows. Examples: ${examples}`,
            traceId
          )
        );
      }
      const safeName = creatorId.replace(/[^\w.-]+/g, "_") || "library";
      res.setHeader("Content-Type", "application/zip");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="relay-library-${safeName}.zip"`
      );
      res.setHeader("Cache-Control", "private, no-store");
      await exportService.pipeLibraryZip(creatorId, res);
    } catch (err: unknown) {
      const e = err as Error & { code?: string };
      if (!res.headersSent) {
        return res
          .status(502)
          .json(errorEnvelope("EXPORT_ZIP_ERROR", e.message ?? "Zip failed.", traceId));
      }
      res.end();
    }
  });

  app.get("/api/v1/export/media/:creator_id/:media_id/content", async (req, res) => {
    const traceId = traceIdFrom(req);
    try {
      const record = await exportService.getExportRecord(req.params.creator_id, req.params.media_id);
      if (!record) {
        return res
          .status(404)
          .json(errorEnvelope("NOT_FOUND", "Exported media not found.", traceId));
      }
      if (exportRequireTierAccess) {
        const snapshot = await canonicalStore.load();
        const bearer = req.header("authorization")?.replace(/^Bearer\s+/i, "").trim() ?? "";
        const session = bearer ? await identityService.resolveSession(bearer) : null;
        const gate = patronMayFetchMediaExport({
          snapshot,
          creatorId: req.params.creator_id,
          mediaId: req.params.media_id,
          session
        });
        if (!gate.allowed) {
          return res
            .status(403)
            .json(errorEnvelope("FORBIDDEN", gate.reason, traceId));
        }
      }
      const bytes = await exportService.readBlob(req.params.creator_id, req.params.media_id);
      const mime = record.mime_type ?? "application/octet-stream";
      res.setHeader("content-type", mime);
      res.setHeader("cache-control", "public, max-age=3600");
      res.setHeader("etag", `"${record.sha256}"`);
      return res.status(200).send(bytes);
    } catch (error) {
      return res
        .status(404)
        .json(errorEnvelope("NOT_FOUND", (error as Error).message, traceId));
    }
  });

  app.get("/api/v1/gallery/items", async (req: Request, res: Response) => {
    const traceId = traceIdFrom(req);
    const creatorId = typeof req.query.creator_id === "string" ? req.query.creator_id.trim() : "";
    if (!creatorId) {
      return res
        .status(400)
        .json(
          errorEnvelope("VALIDATION_ERROR", "creator_id is required.", traceId, [
            { field: "creator_id", issue: "missing" }
          ])
        );
    }
    const q = typeof req.query.q === "string" ? req.query.q : undefined;
    const tag_ids = queryStringList(req, "tag_ids");
    const tier_ids = queryStringList(req, "tier_ids");
    const media_type = typeof req.query.media_type === "string" ? req.query.media_type : undefined;
    const published_after =
      typeof req.query.published_after === "string" ? req.query.published_after : undefined;
    const published_before =
      typeof req.query.published_before === "string" ? req.query.published_before : undefined;
    const cursor = typeof req.query.cursor === "string" ? req.query.cursor : undefined;
    const visitor = parseQueryTruthy(req.query.visitor);
    const visibilityRaw = typeof req.query.visibility === "string" ? req.query.visibility : undefined;
    const visibility = visitor ? undefined : normalizeGalleryVisibilityFilter(visibilityRaw);
    const sortRaw = typeof req.query.sort === "string" ? req.query.sort : undefined;
    const sort = sortRaw === "visibility" || sortRaw === "published" ? sortRaw : undefined;
    const displayRaw = typeof req.query.display === "string" ? req.query.display.trim() : undefined;
    const display =
      displayRaw === "post_primary" || displayRaw === "all_media" ? displayRaw : undefined;
    const textOnlyRaw =
      typeof req.query.text_only_posts === "string" ? req.query.text_only_posts.trim() : undefined;
    const text_only_posts =
      textOnlyRaw === "include" || textOnlyRaw === "exclude" ? textOnlyRaw : undefined;
    const limit = parseGalleryLimit(req);

    const bearer = req.header("authorization")?.replace(/^Bearer\s+/i, "").trim() ?? "";
    let patronSession = bearer ? await identityService.resolveSession(bearer) : null;
    const devSimPatron = parseQueryTruthy(req.query.dev_sim_patron);
    const simulate_tier_ids = queryStringList(req, "simulate_tier_ids");
    patronSession = resolveVisitorPatronSessionForRedaction({
      visitor,
      creatorId,
      devSimPatron,
      simulateTierIds: simulate_tier_ids,
      bearerSession: patronSession
    });

    const result = await galleryService.list({
      creator_id: creatorId,
      q,
      tag_ids: tag_ids.length ? tag_ids : undefined,
      tier_ids: tier_ids.length ? tier_ids : undefined,
      media_type,
      published_after,
      published_before,
      visitor_catalog: visitor,
      visibility,
      sort,
      display,
      text_only_posts,
      cursor,
      limit,
      patron_session: patronSession
    });
    res.setHeader("Cache-Control", "private, no-store");
    return res.status(200).json(successEnvelope(result, traceId));
  });

  app.get("/api/v1/gallery/facets", async (req: Request, res: Response) => {
    const traceId = traceIdFrom(req);
    const creatorId = typeof req.query.creator_id === "string" ? req.query.creator_id.trim() : "";
    if (!creatorId) {
      return res
        .status(400)
        .json(
          errorEnvelope("VALIDATION_ERROR", "creator_id is required.", traceId, [
            { field: "creator_id", issue: "missing" }
          ])
        );
    }
    const visitor = parseQueryTruthy(req.query.visitor);
    const facets = await galleryService.facets(creatorId, { visitor_catalog: visitor });
    let payload: typeof facets & { visitor_hero?: Record<string, string> } = facets;
    if (visitor) {
      const snap = await creatorCampaignDisplayStore.get(creatorId);
      const relayName = config.relay_creator_display_name?.trim();
      payload = {
        ...facets,
        visitor_hero: {
          ...(relayName ? { relay_display_name: relayName } : {}),
          ...(snap?.patreon_name ? { patreon_name: snap.patreon_name } : {}),
          ...(snap?.image_url ? { banner_url: snap.image_url } : {}),
          ...(snap?.image_small_url ? { avatar_url: snap.image_small_url } : {})
        }
      };
    }
    res.setHeader("Cache-Control", "private, no-store");
    return res.status(200).json(successEnvelope(payload, traceId));
  });

  app.get("/api/v1/gallery/post-detail", async (req: Request, res: Response) => {
    const traceId = traceIdFrom(req);
    const creatorId = typeof req.query.creator_id === "string" ? req.query.creator_id.trim() : "";
    const postId = typeof req.query.post_id === "string" ? req.query.post_id.trim() : "";
    const details = [];
    if (!creatorId) details.push({ field: "creator_id", issue: "missing" });
    if (!postId) details.push({ field: "post_id", issue: "missing" });
    if (details.length > 0) {
      return res
        .status(400)
        .json(errorEnvelope("VALIDATION_ERROR", "creator_id and post_id are required.", traceId, details));
    }
    const visitor = parseQueryTruthy(req.query.visitor);
    const bearer = req.header("authorization")?.replace(/^Bearer\s+/i, "").trim() ?? "";
    let patronSession = bearer ? await identityService.resolveSession(bearer) : null;
    const devSimPatron = parseQueryTruthy(req.query.dev_sim_patron);
    const simulate_tier_ids = queryStringList(req, "simulate_tier_ids");
    patronSession = resolveVisitorPatronSessionForRedaction({
      visitor,
      creatorId,
      devSimPatron,
      simulateTierIds: simulate_tier_ids,
      bearerSession: patronSession
    });
    const detail = await galleryService.postDetail(creatorId, postId, {
      visitor_catalog: visitor,
      patron_session: patronSession
    });
    if (!detail) {
      return res.status(404).json(errorEnvelope("NOT_FOUND", "Post not found.", traceId));
    }
    res.setHeader("Cache-Control", "private, no-store");
    return res.status(200).json(successEnvelope(detail, traceId));
  });

  function parsePatronFavoriteTargetKind(raw: unknown): PatronFavoriteTargetKind | null {
    if (raw === "post" || raw === "media") {
      return raw;
    }
    return null;
  }

  /** Bearer patron session or 401 response (caller returns). */
  async function requirePatronBearerSession(
    req: Request,
    res: Response,
    traceId: string
  ): Promise<SessionToken | null> {
    const bearer = req.header("authorization")?.replace(/^Bearer\s+/i, "").trim() ?? "";
    if (!bearer) {
      res
        .status(401)
        .json(errorEnvelope("AUTH_ERROR", "Bearer token required.", traceId));
      return null;
    }
    const session = await identityService.resolveSession(bearer);
    if (!session) {
      res
        .status(401)
        .json(errorEnvelope("AUTH_ERROR", "Invalid or expired session.", traceId));
      return null;
    }
    return session;
  }

  app.get("/api/v1/patron/favorites", async (req: Request, res: Response) => {
    const traceId = traceIdFrom(req);
    const creatorId = typeof req.query.creator_id === "string" ? req.query.creator_id.trim() : "";
    if (!creatorId) {
      return res
        .status(400)
        .json(
          errorEnvelope("VALIDATION_ERROR", "creator_id is required.", traceId, [
            { field: "creator_id", issue: "missing" }
          ])
        );
    }
    const session = await requirePatronBearerSession(req, res, traceId);
    if (!session) {
      return;
    }
    if (session.creator_id !== creatorId) {
      return res
        .status(403)
        .json(errorEnvelope("FORBIDDEN", "Session is not scoped to this creator.", traceId));
    }
    const items = await patronFavoritesStore.listForUser(creatorId, session.user_id);
    res.setHeader("Cache-Control", "private, no-store");
    return res.status(200).json(successEnvelope({ items }, traceId));
  });

  app.put("/api/v1/patron/favorites", async (req: Request, res: Response) => {
    const traceId = traceIdFrom(req);
    const body = (req.body ?? {}) as Record<string, unknown>;
    const details = validateRequiredFields(body, ["creator_id", "target_kind", "target_id"]);
    if (details.length > 0) {
      return res
        .status(400)
        .json(errorEnvelope("VALIDATION_ERROR", "Invalid request.", traceId, details));
    }
    const creatorId = String(body.creator_id).trim();
    const targetId = String(body.target_id).trim();
    const targetKind = parsePatronFavoriteTargetKind(body.target_kind);
    if (!targetKind) {
      return res.status(400).json(
        errorEnvelope("VALIDATION_ERROR", "target_kind must be post or media.", traceId, [
          { field: "target_kind", issue: "invalid" }
        ])
      );
    }
    if (!targetId) {
      return res.status(400).json(
        errorEnvelope("VALIDATION_ERROR", "target_id must be non-empty.", traceId, [
          { field: "target_id", issue: "invalid" }
        ])
      );
    }
    const session = await requirePatronBearerSession(req, res, traceId);
    if (!session) {
      return;
    }
    if (session.creator_id !== creatorId) {
      return res
        .status(403)
        .json(errorEnvelope("FORBIDDEN", "Session is not scoped to this creator.", traceId));
    }
    const snapshot = await canonicalStore.load();
    const v = validatePatronFavoriteTarget(snapshot, creatorId, targetKind, targetId);
    if (!v.ok) {
      return res.status(400).json(
        errorEnvelope("VALIDATION_ERROR", v.message, traceId, [{ field: "target_id", issue: "not_found" }])
      );
    }
    const item = await patronFavoritesStore.add({
      user_id: session.user_id,
      creator_id: creatorId,
      target_kind: targetKind,
      target_id: targetId
    });
    res.setHeader("Cache-Control", "private, no-store");
    return res.status(200).json(successEnvelope({ item }, traceId));
  });

  app.delete("/api/v1/patron/favorites", async (req: Request, res: Response) => {
    const traceId = traceIdFrom(req);
    const body = (req.body ?? {}) as Record<string, unknown>;
    const qCreator =
      typeof req.query.creator_id === "string" ? req.query.creator_id.trim() : "";
    const qKind = parsePatronFavoriteTargetKind(req.query.target_kind);
    const qTarget =
      typeof req.query.target_id === "string" ? req.query.target_id.trim() : "";
    const creatorId =
      (typeof body.creator_id === "string" ? body.creator_id.trim() : "") || qCreator;
    const targetKind = parsePatronFavoriteTargetKind(body.target_kind) ?? qKind;
    const targetId =
      (typeof body.target_id === "string" ? body.target_id.trim() : "") || qTarget;
    if (!creatorId || !targetKind || !targetId) {
      const miss: Array<{ field: string; issue: string }> = [];
      if (!creatorId) {
        miss.push({ field: "creator_id", issue: "missing" });
      }
      if (!targetKind) {
        miss.push({ field: "target_kind", issue: "missing" });
      }
      if (!targetId) {
        miss.push({ field: "target_id", issue: "missing" });
      }
      return res.status(400).json(
        errorEnvelope(
          "VALIDATION_ERROR",
          "creator_id, target_kind, and target_id are required (body or query).",
          traceId,
          miss
        )
      );
    }
    const session = await requirePatronBearerSession(req, res, traceId);
    if (!session) {
      return;
    }
    if (session.creator_id !== creatorId) {
      return res
        .status(403)
        .json(errorEnvelope("FORBIDDEN", "Session is not scoped to this creator.", traceId));
    }
    const removed = await patronFavoritesStore.remove(
      creatorId,
      session.user_id,
      targetKind,
      targetId
    );
    if (!removed) {
      return res.status(404).json(errorEnvelope("NOT_FOUND", "Favorite not found.", traceId));
    }
    res.setHeader("Cache-Control", "private, no-store");
    return res.status(200).json(successEnvelope({ deleted: true }, traceId));
  });

  app.get("/api/v1/patron/collections", async (req: Request, res: Response) => {
    const traceId = traceIdFrom(req);
    const creatorId = typeof req.query.creator_id === "string" ? req.query.creator_id.trim() : "";
    if (!creatorId) {
      return res
        .status(400)
        .json(
          errorEnvelope("VALIDATION_ERROR", "creator_id is required.", traceId, [
            { field: "creator_id", issue: "missing" }
          ])
        );
    }
    const session = await requirePatronBearerSession(req, res, traceId);
    if (!session) {
      return;
    }
    if (session.creator_id !== creatorId) {
      return res
        .status(403)
        .json(errorEnvelope("FORBIDDEN", "Session is not scoped to this creator.", traceId));
    }
    const collections = await patronCollectionsStore.listCollectionsWithEntries(
      creatorId,
      session.user_id
    );
    res.setHeader("Cache-Control", "private, no-store");
    return res.status(200).json(successEnvelope({ collections }, traceId));
  });

  app.post("/api/v1/patron/collections", async (req: Request, res: Response) => {
    const traceId = traceIdFrom(req);
    const body = (req.body ?? {}) as Record<string, unknown>;
    const details = validateRequiredFields(body, ["creator_id", "title"]);
    if (details.length > 0) {
      return res
        .status(400)
        .json(errorEnvelope("VALIDATION_ERROR", "Invalid request.", traceId, details));
    }
    const creatorId = String(body.creator_id).trim();
    const title = String(body.title);
    const session = await requirePatronBearerSession(req, res, traceId);
    if (!session) {
      return;
    }
    if (session.creator_id !== creatorId) {
      return res
        .status(403)
        .json(errorEnvelope("FORBIDDEN", "Session is not scoped to this creator.", traceId));
    }
    const created = await patronCollectionsStore.createCollection(
      creatorId,
      session.user_id,
      title
    );
    res.setHeader("Cache-Control", "private, no-store");
    return res.status(201).json(successEnvelope({ collection: created }, traceId));
  });

  app.patch("/api/v1/patron/collections/:collection_id", async (req: Request, res: Response) => {
    const traceId = traceIdFrom(req);
    const body = (req.body ?? {}) as Record<string, unknown>;
    const details = validateRequiredFields(body, ["creator_id"]);
    if (details.length > 0) {
      return res
        .status(400)
        .json(errorEnvelope("VALIDATION_ERROR", "Invalid request.", traceId, details));
    }
    const creatorId = String(body.creator_id).trim();
    const session = await requirePatronBearerSession(req, res, traceId);
    if (!session) {
      return;
    }
    if (session.creator_id !== creatorId) {
      return res
        .status(403)
        .json(errorEnvelope("FORBIDDEN", "Session is not scoped to this creator.", traceId));
    }
    const patch: { title?: string; sort_order?: number } = {};
    if (typeof body.title === "string") {
      patch.title = body.title;
    }
    if (body.sort_order !== undefined && body.sort_order !== null) {
      const n = Number(body.sort_order);
      if (Number.isFinite(n)) {
        patch.sort_order = n;
      }
    }
    if (patch.title === undefined && patch.sort_order === undefined) {
      return res.status(400).json(
        errorEnvelope("VALIDATION_ERROR", "Provide title and/or sort_order.", traceId, [
          { field: "body", issue: "empty_patch" }
        ])
      );
    }
    const updated = await patronCollectionsStore.updateCollection(
      creatorId,
      session.user_id,
      req.params.collection_id,
      patch
    );
    if (!updated) {
      return res.status(404).json(errorEnvelope("NOT_FOUND", "Collection not found.", traceId));
    }
    res.setHeader("Cache-Control", "private, no-store");
    return res.status(200).json(successEnvelope({ collection: updated }, traceId));
  });

  app.delete("/api/v1/patron/collections/:collection_id", async (req: Request, res: Response) => {
    const traceId = traceIdFrom(req);
    const creatorId =
      typeof req.query.creator_id === "string" ? req.query.creator_id.trim() : "";
    if (!creatorId) {
      return res
        .status(400)
        .json(
          errorEnvelope("VALIDATION_ERROR", "creator_id is required.", traceId, [
            { field: "creator_id", issue: "missing" }
          ])
        );
    }
    const session = await requirePatronBearerSession(req, res, traceId);
    if (!session) {
      return;
    }
    if (session.creator_id !== creatorId) {
      return res
        .status(403)
        .json(errorEnvelope("FORBIDDEN", "Session is not scoped to this creator.", traceId));
    }
    const ok = await patronCollectionsStore.deleteCollection(
      creatorId,
      session.user_id,
      req.params.collection_id
    );
    if (!ok) {
      return res.status(404).json(errorEnvelope("NOT_FOUND", "Collection not found.", traceId));
    }
    res.setHeader("Cache-Control", "private, no-store");
    return res.status(200).json(successEnvelope({ deleted: true }, traceId));
  });

  app.post("/api/v1/patron/collections/:collection_id/entries", async (req: Request, res: Response) => {
    const traceId = traceIdFrom(req);
    const body = (req.body ?? {}) as Record<string, unknown>;
    const details = validateRequiredFields(body, ["creator_id", "post_id", "media_id"]);
    if (details.length > 0) {
      return res
        .status(400)
        .json(errorEnvelope("VALIDATION_ERROR", "Invalid request.", traceId, details));
    }
    const creatorId = String(body.creator_id).trim();
    const postId = String(body.post_id).trim();
    const mediaId = String(body.media_id).trim();
    const session = await requirePatronBearerSession(req, res, traceId);
    if (!session) {
      return;
    }
    if (session.creator_id !== creatorId) {
      return res
        .status(403)
        .json(errorEnvelope("FORBIDDEN", "Session is not scoped to this creator.", traceId));
    }
    const snapshot = await canonicalStore.load();
    const v = validatePatronCollectionEntry(snapshot, creatorId, postId, mediaId);
    if (!v.ok) {
      return res.status(400).json(
        errorEnvelope("VALIDATION_ERROR", v.message, traceId, [
          { field: "post_id", issue: v.code === "MEDIA_POST_MISMATCH" ? "mismatch" : "not_found" }
        ])
      );
    }
    try {
      const entry = await patronCollectionsStore.addEntry(
        creatorId,
        session.user_id,
        req.params.collection_id,
        postId,
        mediaId
      );
      res.setHeader("Cache-Control", "private, no-store");
      return res.status(200).json(successEnvelope({ entry }, traceId));
    } catch {
      return res.status(404).json(errorEnvelope("NOT_FOUND", "Collection not found.", traceId));
    }
  });

  app.delete("/api/v1/patron/collections/:collection_id/entries", async (req: Request, res: Response) => {
    const traceId = traceIdFrom(req);
    const body = (req.body ?? {}) as Record<string, unknown>;
    const qCreator =
      typeof req.query.creator_id === "string" ? req.query.creator_id.trim() : "";
    const qPost = typeof req.query.post_id === "string" ? req.query.post_id.trim() : "";
    const qMedia = typeof req.query.media_id === "string" ? req.query.media_id.trim() : "";
    const creatorId =
      (typeof body.creator_id === "string" ? body.creator_id.trim() : "") || qCreator;
    const postId = (typeof body.post_id === "string" ? body.post_id.trim() : "") || qPost;
    const mediaId = (typeof body.media_id === "string" ? body.media_id.trim() : "") || qMedia;
    if (!creatorId || !postId || !mediaId) {
      const miss: Array<{ field: string; issue: string }> = [];
      if (!creatorId) {
        miss.push({ field: "creator_id", issue: "missing" });
      }
      if (!postId) {
        miss.push({ field: "post_id", issue: "missing" });
      }
      if (!mediaId) {
        miss.push({ field: "media_id", issue: "missing" });
      }
      return res.status(400).json(
        errorEnvelope(
          "VALIDATION_ERROR",
          "creator_id, post_id, and media_id are required (body or query).",
          traceId,
          miss
        )
      );
    }
    const session = await requirePatronBearerSession(req, res, traceId);
    if (!session) {
      return;
    }
    if (session.creator_id !== creatorId) {
      return res
        .status(403)
        .json(errorEnvelope("FORBIDDEN", "Session is not scoped to this creator.", traceId));
    }
    const removed = await patronCollectionsStore.removeEntry(
      creatorId,
      session.user_id,
      req.params.collection_id,
      postId,
      mediaId
    );
    if (!removed) {
      return res.status(404).json(errorEnvelope("NOT_FOUND", "Entry not found.", traceId));
    }
    res.setHeader("Cache-Control", "private, no-store");
    return res.status(200).json(successEnvelope({ deleted: true }, traceId));
  });

  /**
   * Artist tag changes are persisted only in `gallery_post_overrides` (add/remove deltas).
   * Patreon re-ingest updates `canonical.json` post `tag_ids`; effective tags = base + overrides
   * (see `effectiveTags` in `gallery/query.ts`). Do not write tag deltas into canonical here.
   */
  app.post("/api/v1/gallery/media/bulk-tags", async (req: Request, res: Response) => {
    const traceId = traceIdFrom(req);
    const body = (req.body ?? {}) as Record<string, unknown>;
    const baseDetails = validateRequiredFields(body, ["creator_id"]);
    if (baseDetails.length > 0) {
      return res
        .status(400)
        .json(errorEnvelope("VALIDATION_ERROR", "Invalid request.", traceId, baseDetails));
    }
    const addRaw = body.add_tag_ids;
    const remRaw = body.remove_tag_ids;
    const add_tag_ids = Array.isArray(addRaw)
      ? addRaw.filter((x): x is string => typeof x === "string")
      : [];
    const remove_tag_ids = Array.isArray(remRaw)
      ? remRaw.filter((x): x is string => typeof x === "string")
      : [];
    const creatorId = body.creator_id as string;

    const mtRaw = body.media_targets;
    const media_targets: { post_id: string; media_id: string }[] = [];
    if (Array.isArray(mtRaw)) {
      for (const x of mtRaw) {
        if (!x || typeof x !== "object") {
          continue;
        }
        const o = x as Record<string, unknown>;
        if (typeof o.post_id === "string" && typeof o.media_id === "string") {
          media_targets.push({ post_id: o.post_id, media_id: o.media_id });
        }
      }
    }

    if (media_targets.length > 0) {
      const validTargets = media_targets.filter(
        (t) => t.media_id.trim().length > 0 && !t.media_id.startsWith("post_only_")
      );
      if (validTargets.length === 0) {
        return res.status(400).json(
          errorEnvelope(
            "VALIDATION_ERROR",
            "media_targets must include at least one real asset (not post_only_*).",
            traceId,
            [{ field: "media_targets", issue: "invalid" }]
          )
        );
      }
      await galleryOverridesStore.mergeBulkMediaTagDelta(creatorId, validTargets, {
        add_tag_ids,
        remove_tag_ids
      });
      return res.status(200).json(
        successEnvelope({ updated_media_targets: validTargets.length }, traceId)
      );
    }

    const postIdsRaw = body.post_ids;
    if (!Array.isArray(postIdsRaw) || !postIdsRaw.every((x) => typeof x === "string")) {
      return res.status(400).json(
        errorEnvelope("VALIDATION_ERROR", "post_ids or media_targets required.", traceId, [
          { field: "post_ids", issue: "invalid" }
        ])
      );
    }
    const post_ids = [...new Set(postIdsRaw as string[])];
    for (const postId of post_ids) {
      await galleryOverridesStore.mergePostTagDelta(creatorId, postId, {
        add_tag_ids,
        remove_tag_ids
      });
    }
    return res
      .status(200)
      .json(
        successEnvelope({ updated_post_count: post_ids.length }, traceId)
      );
  });

  app.get("/api/v1/gallery/saved-filters", async (req: Request, res: Response) => {
    const traceId = traceIdFrom(req);
    const creatorId = typeof req.query.creator_id === "string" ? req.query.creator_id.trim() : "";
    if (!creatorId) {
      return res
        .status(400)
        .json(
          errorEnvelope("VALIDATION_ERROR", "creator_id is required.", traceId, [
            { field: "creator_id", issue: "missing" }
          ])
        );
    }
    const items = await savedFiltersStore.listForCreator(creatorId);
    return res.status(200).json(successEnvelope({ items }, traceId));
  });

  app.post("/api/v1/gallery/saved-filters", async (req: Request, res: Response) => {
    const traceId = traceIdFrom(req);
    const body = (req.body ?? {}) as Record<string, unknown>;
    const details = validateRequiredFields(body, ["creator_id", "name"]);
    if (details.length > 0) {
      return res
        .status(400)
        .json(errorEnvelope("VALIDATION_ERROR", "Invalid request.", traceId, details));
    }
    const query = (typeof body.query === "object" && body.query !== null
      ? body.query
      : {}) as SavedFilterRecord["query"];
    const created = await savedFiltersStore.create(
      body.creator_id as string,
      String(body.name),
      query
    );
    return res.status(201).json(successEnvelope(created, traceId));
  });

  app.delete("/api/v1/gallery/saved-filters/:filter_id", async (req: Request, res: Response) => {
    const traceId = traceIdFrom(req);
    const creatorId = typeof req.query.creator_id === "string" ? req.query.creator_id.trim() : "";
    if (!creatorId) {
      return res
        .status(400)
        .json(
          errorEnvelope("VALIDATION_ERROR", "creator_id is required.", traceId, [
            { field: "creator_id", issue: "missing" }
          ])
        );
    }
    const ok = await savedFiltersStore.delete(creatorId, req.params.filter_id);
    if (!ok) {
      return res.status(404).json(errorEnvelope("NOT_FOUND", "Filter not found.", traceId));
    }
    return res.status(200).json(successEnvelope({ deleted: true }, traceId));
  });

  // --- Triage & Visibility endpoints ---

  app.post("/api/v1/gallery/triage/analyze", async (req: Request, res: Response) => {
    const traceId = traceIdFrom(req);
    const body = (req.body ?? {}) as Record<string, unknown>;
    const details = validateRequiredFields(body, ["creator_id"]);
    if (details.length > 0) {
      return res
        .status(400)
        .json(errorEnvelope("VALIDATION_ERROR", "Invalid request.", traceId, details));
    }
    const result = await triageService.analyze(body.creator_id as string);
    return res.status(200).json(successEnvelope(result, traceId));
  });

  app.post("/api/v1/gallery/triage/auto-flag", async (req: Request, res: Response) => {
    const traceId = traceIdFrom(req);
    const body = (req.body ?? {}) as Record<string, unknown>;
    const details = validateRequiredFields(body, ["creator_id"]);
    if (details.length > 0) {
      return res
        .status(400)
        .json(errorEnvelope("VALIDATION_ERROR", "Invalid request.", traceId, details));
    }
    const categoriesRaw = body.categories;
    const categories = Array.isArray(categoriesRaw)
      ? categoriesRaw.filter((x): x is string => typeof x === "string")
      : undefined;
    const result = await triageService.autoFlag(
      body.creator_id as string,
      galleryOverridesStore,
      categories
    );
    return res.status(200).json(successEnvelope(result, traceId));
  });

  /** Gallery visibility is stored in `gallery_post_overrides`, not canonical ingest rows. */
  app.post("/api/v1/gallery/visibility", async (req: Request, res: Response) => {
    const traceId = traceIdFrom(req);
    const body = (req.body ?? {}) as Record<string, unknown>;
    const details = validateRequiredFields(body, ["creator_id"]);
    let postIdsRaw: string[] = [];
    if (body.post_ids === undefined) {
      postIdsRaw = [];
    } else if (
      Array.isArray(body.post_ids) &&
      (body.post_ids as unknown[]).every((x) => typeof x === "string")
    ) {
      postIdsRaw = body.post_ids as string[];
    } else {
      return res.status(400).json(
        errorEnvelope("VALIDATION_ERROR", "post_ids must be an array of strings.", traceId, [
          { field: "post_ids", issue: "invalid" }
        ])
      );
    }
    const mediaTargetsRaw = body.media_targets;
    const mediaTargets: { post_id: string; media_id: string }[] = [];
    if (mediaTargetsRaw !== undefined) {
      if (!Array.isArray(mediaTargetsRaw)) {
        return res.status(400).json(
          errorEnvelope("VALIDATION_ERROR", "media_targets must be an array.", traceId, [
            { field: "media_targets", issue: "invalid" }
          ])
        );
      }
      for (const entry of mediaTargetsRaw) {
        if (!entry || typeof entry !== "object") {
          return res.status(400).json(
            errorEnvelope("VALIDATION_ERROR", "Invalid media_targets entry.", traceId, [
              { field: "media_targets", issue: "invalid" }
            ])
          );
        }
        const rec = entry as Record<string, unknown>;
        if (typeof rec.post_id !== "string" || typeof rec.media_id !== "string") {
          return res.status(400).json(
            errorEnvelope("VALIDATION_ERROR", "Each media_targets item needs post_id and media_id.", traceId, [
              { field: "media_targets", issue: "invalid" }
            ])
          );
        }
        mediaTargets.push({ post_id: rec.post_id, media_id: rec.media_id });
      }
    }
    if (postIdsRaw.length === 0 && mediaTargets.length === 0) {
      return res.status(400).json(
        errorEnvelope("VALIDATION_ERROR", "Provide post_ids and/or media_targets.", traceId, [
          { field: "post_ids", issue: "empty" }
        ])
      );
    }
    const vNorm = normalizeGalleryVisibilityBody(body.visibility);
    if (!vNorm) {
      return res.status(400).json(
        errorEnvelope("VALIDATION_ERROR", "visibility must be visible, hidden, or review.", traceId, [
          { field: "visibility", issue: "invalid" }
        ])
      );
    }
    if (details.length > 0) {
      return res
        .status(400)
        .json(errorEnvelope("VALIDATION_ERROR", "Invalid request.", traceId, details));
    }
    const creatorId = body.creator_id as string;
    const v = vNorm;
    if (postIdsRaw.length > 0) {
      await galleryOverridesStore.setVisibility(creatorId, postIdsRaw as string[], v);
    }
    if (mediaTargets.length > 0) {
      await galleryOverridesStore.setMediaVisibility(
        creatorId,
        mediaTargets.map((t) => ({ ...t, visibility: v }))
      );
    }
    return res.status(200).json(
      successEnvelope(
        {
          updated_post_count: postIdsRaw.length,
          updated_media_count: mediaTargets.length
        },
        traceId
      )
    );
  });

  // --- Collections endpoints ---

  app.get("/api/v1/gallery/collections", async (req: Request, res: Response) => {
    const traceId = traceIdFrom(req);
    const creatorId = typeof req.query.creator_id === "string" ? req.query.creator_id.trim() : "";
    if (!creatorId) {
      return res
        .status(400)
        .json(errorEnvelope("VALIDATION_ERROR", "creator_id is required.", traceId, [
          { field: "creator_id", issue: "missing" }
        ]));
    }
    let items = await collectionsStore.listForCreator(creatorId);
    if (parseQueryTruthy(req.query.visitor)) {
      const allowed = await galleryService.visitorVisiblePostIdSet(creatorId);
      items = items.map((col) => ({
        ...col,
        post_ids: col.post_ids.filter((pid) => allowed.has(pid))
      }));
    }
    return res.status(200).json(successEnvelope({ items }, traceId));
  });

  app.post("/api/v1/gallery/collections", async (req: Request, res: Response) => {
    const traceId = traceIdFrom(req);
    const body = (req.body ?? {}) as Record<string, unknown>;
    const details = validateRequiredFields(body, ["creator_id", "title"]);
    if (details.length > 0) {
      return res
        .status(400)
        .json(errorEnvelope("VALIDATION_ERROR", "Invalid request.", traceId, details));
    }
    const extras: {
      access_ceiling_tier_id?: string;
      theme_tag_ids?: string[];
    } = {};
    if (typeof body.access_ceiling_tier_id === "string" && body.access_ceiling_tier_id.trim()) {
      extras.access_ceiling_tier_id = body.access_ceiling_tier_id.trim();
    }
    if (Array.isArray(body.theme_tag_ids)) {
      const tags = body.theme_tag_ids
        .filter((x): x is string => typeof x === "string")
        .map((s) => s.trim())
        .filter(Boolean);
      if (tags.length) extras.theme_tag_ids = tags;
    }
    const created = await collectionsStore.create(
      body.creator_id as string,
      body.title as string,
      typeof body.description === "string" ? body.description : undefined,
      Object.keys(extras).length > 0 ? extras : undefined
    );
    return res.status(201).json(successEnvelope(created, traceId));
  });

  app.patch("/api/v1/gallery/collections/:collection_id", async (req: Request, res: Response) => {
    const traceId = traceIdFrom(req);
    const body = (req.body ?? {}) as Record<string, unknown>;
    const patch: Record<string, unknown> = {};
    if (typeof body.title === "string") patch.title = body.title;
    if (typeof body.description === "string") patch.description = body.description;
    if (typeof body.cover_media_id === "string") patch.cover_media_id = body.cover_media_id;
    if (typeof body.sort_order === "number") patch.sort_order = body.sort_order;
    if (body.access_ceiling_tier_id !== undefined) {
      if (
        body.access_ceiling_tier_id === null ||
        (typeof body.access_ceiling_tier_id === "string" && !body.access_ceiling_tier_id.trim())
      ) {
        (patch as { access_ceiling_tier_id?: string | null }).access_ceiling_tier_id = null;
      } else if (typeof body.access_ceiling_tier_id === "string") {
        (patch as { access_ceiling_tier_id?: string }).access_ceiling_tier_id =
          body.access_ceiling_tier_id.trim();
      }
    }
    if (Array.isArray(body.theme_tag_ids)) {
      (patch as { theme_tag_ids?: string[] }).theme_tag_ids = body.theme_tag_ids
        .filter((x): x is string => typeof x === "string")
        .map((s) => s.trim())
        .filter(Boolean);
    }
    const updated = await collectionsStore.update(req.params.collection_id, patch as Parameters<typeof collectionsStore.update>[1]);
    if (!updated) {
      return res.status(404).json(errorEnvelope("NOT_FOUND", "Collection not found.", traceId));
    }
    return res.status(200).json(successEnvelope(updated, traceId));
  });

  app.delete("/api/v1/gallery/collections/:collection_id", async (req: Request, res: Response) => {
    const traceId = traceIdFrom(req);
    const ok = await collectionsStore.delete(req.params.collection_id);
    if (!ok) {
      return res.status(404).json(errorEnvelope("NOT_FOUND", "Collection not found.", traceId));
    }
    return res.status(200).json(successEnvelope({ deleted: true }, traceId));
  });

  app.post("/api/v1/gallery/collections/:collection_id/posts", async (req: Request, res: Response) => {
    const traceId = traceIdFrom(req);
    const body = (req.body ?? {}) as Record<string, unknown>;
    const postIds = body.post_ids;
    if (!Array.isArray(postIds) || !postIds.every((x) => typeof x === "string")) {
      return res.status(400).json(
        errorEnvelope("VALIDATION_ERROR", "post_ids array required.", traceId, [
          { field: "post_ids", issue: "invalid" }
        ])
      );
    }
    const col = await collectionsStore.getById(req.params.collection_id);
    if (!col) {
      return res.status(404).json(errorEnvelope("NOT_FOUND", "Collection not found.", traceId));
    }
    const snapshot = await canonicalStore.load();
    const ceiling = col.access_ceiling_tier_id;
    const incoming = postIds as string[];
    let toAdd = incoming;
    const rejected: { post_id: string; reason: string }[] = [];
    if (ceiling && ceiling.length > 0) {
      toAdd = [];
      for (const pid of incoming) {
        if (postFitsAccessCeiling(snapshot, col.creator_id, pid, ceiling)) {
          toAdd.push(pid);
        } else {
          rejected.push({ post_id: pid, reason: "incompatible_with_access_ceiling" });
        }
      }
    }
    const updated = await collectionsStore.addPosts(req.params.collection_id, toAdd);
    if (!updated) {
      return res.status(404).json(errorEnvelope("NOT_FOUND", "Collection not found.", traceId));
    }
    return res
      .status(200)
      .json(successEnvelope({ collection: updated, rejected_post_ids: rejected }, traceId));
  });

  app.delete("/api/v1/gallery/collections/:collection_id/posts", async (req: Request, res: Response) => {
    const traceId = traceIdFrom(req);
    const body = (req.body ?? {}) as Record<string, unknown>;
    const postIds = body.post_ids;
    if (!Array.isArray(postIds) || !postIds.every((x) => typeof x === "string")) {
      return res.status(400).json(
        errorEnvelope("VALIDATION_ERROR", "post_ids array required.", traceId, [
          { field: "post_ids", issue: "invalid" }
        ])
      );
    }
    const updated = await collectionsStore.removePosts(req.params.collection_id, postIds as string[]);
    if (!updated) {
      return res.status(404).json(errorEnvelope("NOT_FOUND", "Collection not found.", traceId));
    }
    return res.status(200).json(successEnvelope(updated, traceId));
  });

  app.post("/api/v1/gallery/collections/reorder", async (req: Request, res: Response) => {
    const traceId = traceIdFrom(req);
    const body = (req.body ?? {}) as Record<string, unknown>;
    const details = validateRequiredFields(body, ["creator_id"]);
    const ordered = body.ordered_collection_ids;
    if (!Array.isArray(ordered) || !ordered.every((x) => typeof x === "string")) {
      return res.status(400).json(
        errorEnvelope("VALIDATION_ERROR", "ordered_collection_ids array required.", traceId, [
          { field: "ordered_collection_ids", issue: "invalid" }
        ])
      );
    }
    if (details.length > 0) {
      return res
        .status(400)
        .json(errorEnvelope("VALIDATION_ERROR", "Invalid request.", traceId, details));
    }
    await collectionsStore.reorder(body.creator_id as string, ordered as string[]);
    return res.status(200).json(successEnvelope({ reordered: true }, traceId));
  });

  // --- Page Layout endpoints ---

  app.get("/api/v1/gallery/layout", async (req: Request, res: Response) => {
    const traceId = traceIdFrom(req);
    const creatorId = typeof req.query.creator_id === "string" ? req.query.creator_id.trim() : "";
    if (!creatorId) {
      return res
        .status(400)
        .json(errorEnvelope("VALIDATION_ERROR", "creator_id is required.", traceId, [
          { field: "creator_id", issue: "missing" }
        ]));
    }
    const layout = await layoutStore.load(creatorId);
    return res.status(200).json(successEnvelope(layout, traceId));
  });

  app.put("/api/v1/gallery/layout", async (req: Request, res: Response) => {
    const traceId = traceIdFrom(req);
    const body = (req.body ?? {}) as Record<string, unknown>;
    const details = validateRequiredFields(body, ["creator_id"]);
    if (details.length > 0) {
      return res
        .status(400)
        .json(errorEnvelope("VALIDATION_ERROR", "Invalid request.", traceId, details));
    }
    await layoutStore.save(body.creator_id as string, body as never);
    const layout = await layoutStore.load(body.creator_id as string);
    return res.status(200).json(successEnvelope(layout, traceId));
  });

  app.post("/api/v1/gallery/layout/sections", async (req: Request, res: Response) => {
    const traceId = traceIdFrom(req);
    const body = (req.body ?? {}) as Record<string, unknown>;
    const details = validateRequiredFields(body, ["creator_id", "title"]);
    if (details.length > 0) {
      return res
        .status(400)
        .json(errorEnvelope("VALIDATION_ERROR", "Invalid request.", traceId, details));
    }
    const section = await layoutStore.addSection(body.creator_id as string, {
      title: body.title as string,
      source: (body.source as never) ?? { type: "manual", post_ids: [] },
      layout: (body.layout as "grid" | "masonry" | "list") ?? "grid",
      columns: typeof body.columns === "number" ? body.columns : undefined,
      max_items: typeof body.max_items === "number" ? body.max_items : undefined
    });
    return res.status(201).json(successEnvelope(section, traceId));
  });

  app.patch("/api/v1/gallery/layout/sections/:section_id", async (req: Request, res: Response) => {
    const traceId = traceIdFrom(req);
    const body = (req.body ?? {}) as Record<string, unknown>;
    const creatorId = typeof body.creator_id === "string" ? body.creator_id.trim() : "";
    if (!creatorId) {
      return res
        .status(400)
        .json(errorEnvelope("VALIDATION_ERROR", "creator_id is required.", traceId, [
          { field: "creator_id", issue: "missing" }
        ]));
    }
    const updated = await layoutStore.updateSection(creatorId, req.params.section_id, body as never);
    if (!updated) {
      return res.status(404).json(errorEnvelope("NOT_FOUND", "Section not found.", traceId));
    }
    return res.status(200).json(successEnvelope(updated, traceId));
  });

  app.delete("/api/v1/gallery/layout/sections/:section_id", async (req: Request, res: Response) => {
    const traceId = traceIdFrom(req);
    const creatorId = typeof req.query.creator_id === "string" ? req.query.creator_id.trim() : "";
    if (!creatorId) {
      return res
        .status(400)
        .json(errorEnvelope("VALIDATION_ERROR", "creator_id is required.", traceId, [
          { field: "creator_id", issue: "missing" }
        ]));
    }
    const ok = await layoutStore.removeSection(creatorId, req.params.section_id);
    if (!ok) {
      return res.status(404).json(errorEnvelope("NOT_FOUND", "Section not found.", traceId));
    }
    return res.status(200).json(successEnvelope({ deleted: true }, traceId));
  });

  app.post("/api/v1/gallery/layout/sections/reorder", async (req: Request, res: Response) => {
    const traceId = traceIdFrom(req);
    const body = (req.body ?? {}) as Record<string, unknown>;
    const details = validateRequiredFields(body, ["creator_id"]);
    const ordered = body.ordered_section_ids;
    if (!Array.isArray(ordered) || !ordered.every((x) => typeof x === "string")) {
      return res.status(400).json(
        errorEnvelope("VALIDATION_ERROR", "ordered_section_ids array required.", traceId, [
          { field: "ordered_section_ids", issue: "invalid" }
        ])
      );
    }
    if (details.length > 0) {
      return res
        .status(400)
        .json(errorEnvelope("VALIDATION_ERROR", "Invalid request.", traceId, details));
    }
    await layoutStore.reorderSections(body.creator_id as string, ordered as string[]);
    return res.status(200).json(successEnvelope({ reordered: true }, traceId));
  });

  // --- Publish endpoint ---

  app.post("/api/v1/gallery/publish", async (req: Request, res: Response) => {
    const traceId = traceIdFrom(req);
    const body = (req.body ?? {}) as Record<string, unknown>;
    const details = validateRequiredFields(body, ["creator_id"]);
    if (details.length > 0) {
      return res
        .status(400)
        .json(errorEnvelope("VALIDATION_ERROR", "Invalid request.", traceId, details));
    }
    const creatorId = body.creator_id as string;
    const baseUrl = typeof body.base_url === "string" ? body.base_url : "https://example.com";

    try {
      const layout = await layoutStore.load(creatorId);
      const snapshot = await canonicalStore.load();
      const index = await exportIndex.load(creatorId);
      const ov = await galleryOverridesStore.load();
      const cols = await collectionsStore.listForCreator(creatorId);

      const resolvedPosts = resolveLayoutPosts(layout, creatorId, snapshot, index, ov, cols);

      // Generate clone using the existing pipeline, then replace posts with layout-ordered ones
      const model = await cloneService.generate(creatorId, baseUrl);
      const layoutPostIds = new Set(resolvedPosts.map((p) => p.post_id));
      const layoutClonePosts = resolvedPosts.map((rp) => ({
        post_id: rp.post_id,
        slug: rp.slug,
        title: rp.title,
        published_at: rp.published_at,
        tag_ids: rp.tag_ids,
        access: rp.access,
        media: rp.media
      }));
      // Append any posts from clone that weren't in layout (visible, not in any section)
      const remaining = model.posts.filter((p) => !layoutPostIds.has(p.post_id));
      model.posts = [...layoutClonePosts, ...remaining];

      const preflight = {
        site_id: model.site_id,
        section_count: layout.sections.length,
        total_posts: model.posts.length,
        layout_posts: layoutClonePosts.length,
        remaining_posts: remaining.length,
        total_media: model.total_media,
        tiers: model.tiers.map((t) => ({ tier_id: t.tier_id, title: t.title }))
      };

      return res.status(200).json(successEnvelope(preflight, traceId));
    } catch (err) {
      return res
        .status(500)
        .json(errorEnvelope("PUBLISH_ERROR", (err as Error).message, traceId));
    }
  });

  app.post("/api/v1/analytics/generate", async (req: Request, res: Response) => {
    const traceId = traceIdFrom(req);
    const body = (req.body ?? {}) as Record<string, unknown>;
    const details = validateRequiredFields(body, ["creator_id"]);
    if (details.length > 0) {
      return res
        .status(400)
        .json(errorEnvelope("VALIDATION_ERROR", "Invalid request.", traceId, details));
    }
    const result = await actionCenterService.generateAndStore(
      body.creator_id as string,
      traceId
    );
    return res.status(200).json(successEnvelope(result, traceId));
  });

  app.get("/api/v1/action-center/cards", async (req: Request, res: Response) => {
    const traceId = traceIdFrom(req);
    const creatorId = typeof req.query.creator_id === "string" ? req.query.creator_id.trim() : "";
    if (!creatorId) {
      return res
        .status(400)
        .json(
          errorEnvelope("VALIDATION_ERROR", "creator_id is required.", traceId, [
            { field: "creator_id", issue: "missing" }
          ])
        );
    }
    const impact_area =
      typeof req.query.impact_area === "string" ? req.query.impact_area : undefined;
    const confidence_min =
      typeof req.query.confidence_min === "string"
        ? Number.parseFloat(req.query.confidence_min)
        : undefined;
    const cursor = typeof req.query.cursor === "string" ? req.query.cursor : undefined;
    const limitRaw = typeof req.query.limit === "string" ? Number.parseInt(req.query.limit, 10) : 20;
    const limit = Math.min(Math.max(1, Number.isFinite(limitRaw) ? limitRaw : 20), 100);

    const result = await actionCenterService.listCards(creatorId, {
      impact_area,
      confidence_min,
      cursor,
      limit
    });
    return res.status(200).json(successEnvelope(result, traceId));
  });

  app.post(
    "/api/v1/action-center/cards/:recommendation_id/accept",
    async (req: Request, res: Response) => {
      const traceId = traceIdFrom(req);
      const body = (req.body ?? {}) as Record<string, unknown>;
      const details = validateRequiredFields(body, ["creator_id"]);
      if (details.length > 0) {
        return res
          .status(400)
          .json(errorEnvelope("VALIDATION_ERROR", "Invalid request.", traceId, details));
      }
      const card = await actionCenterService.accept(
        body.creator_id as string,
        req.params.recommendation_id,
        typeof body.notes === "string" ? body.notes : undefined,
        traceId
      );
      if (!card) {
        return res
          .status(404)
          .json(errorEnvelope("NOT_FOUND", "Recommendation not found.", traceId));
      }
      return res.status(200).json(
        successEnvelope(
          {
            recommendation_id: card.recommendation_id,
            status: card.status
          },
          traceId
        )
      );
    }
  );

  app.post(
    "/api/v1/action-center/cards/:recommendation_id/execute",
    async (req: Request, res: Response) => {
      const traceId = traceIdFrom(req);
      const body = (req.body ?? {}) as Record<string, unknown>;
      const details = validateRequiredFields(body, ["creator_id", "action_type"]);
      if (details.length > 0) {
        return res
          .status(400)
          .json(errorEnvelope("VALIDATION_ERROR", "Invalid request.", traceId, details));
      }
      const options =
        typeof body.options === "object" && body.options !== null
          ? (body.options as Record<string, unknown>)
          : {};
      const action = await actionCenterService.execute(
        body.creator_id as string,
        req.params.recommendation_id,
        body.action_type as string,
        options,
        traceId
      );
      if (!action) {
        return res
          .status(404)
          .json(errorEnvelope("NOT_FOUND", "Recommendation not found.", traceId));
      }
      return res.status(200).json(
        successEnvelope(
          {
            recommendation_id: action.recommendation_id,
            action_job_id: action.action_job_id,
            execution_status: action.execution_status
          },
          traceId
        )
      );
    }
  );

  app.post(
    "/api/v1/action-center/cards/:recommendation_id/dismiss",
    async (req: Request, res: Response) => {
      const traceId = traceIdFrom(req);
      const body = (req.body ?? {}) as Record<string, unknown>;
      const details = validateRequiredFields(body, ["creator_id"]);
      if (details.length > 0) {
        return res
          .status(400)
          .json(errorEnvelope("VALIDATION_ERROR", "Invalid request.", traceId, details));
      }
      const reasonCode =
        typeof body.reason_code === "string" ? body.reason_code : "no_reason";
      const card = await actionCenterService.dismiss(
        body.creator_id as string,
        req.params.recommendation_id,
        reasonCode,
        traceId
      );
      if (!card) {
        return res
          .status(404)
          .json(errorEnvelope("NOT_FOUND", "Recommendation not found.", traceId));
      }
      return res.status(200).json(
        successEnvelope(
          {
            recommendation_id: card.recommendation_id,
            status: card.status
          },
          traceId
        )
      );
    }
  );

  app.get(
    "/api/v1/action-center/cards/:recommendation_id/explanation",
    async (req: Request, res: Response) => {
      const traceId = traceIdFrom(req);
      const creatorId =
        typeof req.query.creator_id === "string" ? req.query.creator_id.trim() : "";
      if (!creatorId) {
        return res
          .status(400)
          .json(
            errorEnvelope("VALIDATION_ERROR", "creator_id is required.", traceId, [
              { field: "creator_id", issue: "missing" }
            ])
          );
      }
      const data = await actionCenterService.explain(
        creatorId,
        req.params.recommendation_id
      );
      if (!data) {
        return res
          .status(404)
          .json(errorEnvelope("NOT_FOUND", "Recommendation not found.", traceId));
      }
      return res.status(200).json(successEnvelope(data, traceId));
    }
  );

  app.get("/api/v1/metrics/summary", async (req: Request, res: Response) => {
    const traceId = traceIdFrom(req);
    const creatorId =
      typeof req.query.creator_id === "string" ? req.query.creator_id.trim() : "";
    if (!creatorId) {
      return res
        .status(400)
        .json(
          errorEnvelope("VALIDATION_ERROR", "creator_id is required.", traceId, [
            { field: "creator_id", issue: "missing" }
          ])
        );
    }
    const summary = await actionCenterService.metricsSummary(creatorId);
    return res.status(200).json(successEnvelope(summary, traceId));
  });

  app.post("/api/v1/clone/generate", async (req: Request, res: Response) => {
    const traceId = traceIdFrom(req);
    const body = (req.body ?? {}) as Record<string, unknown>;
    const details = validateRequiredFields(body, ["creator_id"]);
    if (details.length > 0) {
      return res
        .status(400)
        .json(errorEnvelope("VALIDATION_ERROR", "Invalid request.", traceId, details));
    }
    const baseUrl =
      typeof body.base_url === "string" && body.base_url.trim()
        ? body.base_url.trim()
        : "https://preview.relay.local";
    const model = await cloneService.generate(body.creator_id as string, baseUrl);
    return res.status(200).json(
      successEnvelope(
        {
          site_id: model.site_id,
          creator_id: model.creator_id,
          generated_at: model.generated_at,
          base_url: model.base_url,
          tiers_count: model.tiers.length,
          posts_count: model.posts.length,
          total_media: model.total_media
        },
        traceId
      )
    );
  });

  app.get("/api/v1/clone/site", async (req: Request, res: Response) => {
    const traceId = traceIdFrom(req);
    const creatorId =
      typeof req.query.creator_id === "string" ? req.query.creator_id.trim() : "";
    if (!creatorId) {
      return res
        .status(400)
        .json(
          errorEnvelope("VALIDATION_ERROR", "creator_id is required.", traceId, [
            { field: "creator_id", issue: "missing" }
          ])
        );
    }
    const model = await cloneService.getLatest(creatorId);
    if (!model) {
      return res
        .status(404)
        .json(errorEnvelope("NOT_FOUND", "No clone site generated yet.", traceId));
    }
    return res.status(200).json(successEnvelope(model, traceId));
  });

  app.get("/api/v1/clone/preview-pages", async (req: Request, res: Response) => {
    const traceId = traceIdFrom(req);
    const creatorId =
      typeof req.query.creator_id === "string" ? req.query.creator_id.trim() : "";
    if (!creatorId) {
      return res
        .status(400)
        .json(
          errorEnvelope("VALIDATION_ERROR", "creator_id is required.", traceId, [
            { field: "creator_id", issue: "missing" }
          ])
        );
    }
    const pages = await cloneService.previewPages(creatorId);
    if (!pages) {
      return res
        .status(404)
        .json(errorEnvelope("NOT_FOUND", "No clone site generated yet.", traceId));
    }
    return res.status(200).json(successEnvelope({ items: pages }, traceId));
  });

  app.get("/api/v1/clone/parity", async (req: Request, res: Response) => {
    const traceId = traceIdFrom(req);
    const creatorId =
      typeof req.query.creator_id === "string" ? req.query.creator_id.trim() : "";
    if (!creatorId) {
      return res
        .status(400)
        .json(
          errorEnvelope("VALIDATION_ERROR", "creator_id is required.", traceId, [
            { field: "creator_id", issue: "missing" }
          ])
        );
    }
    const result = await cloneService.parityCheck(creatorId);
    return res.status(200).json(successEnvelope(result, traceId));
  });

  app.post("/api/v1/identity/register", async (req: Request, res: Response) => {
    const traceId = traceIdFrom(req);
    const body = (req.body ?? {}) as Record<string, unknown>;
    const details = validateRequiredFields(body, ["creator_id", "email", "password"]);
    if (details.length > 0) {
      return res
        .status(400)
        .json(errorEnvelope("VALIDATION_ERROR", "Invalid request.", traceId, details));
    }
    const tierIds = Array.isArray(body.tier_ids)
      ? (body.tier_ids as string[]).filter((x): x is string => typeof x === "string")
      : [];
    try {
      const user = await identityService.register(
        body.creator_id as string,
        body.email as string,
        body.password as string,
        tierIds
      );
      return res.status(201).json(
        successEnvelope(
          {
            user_id: user.user_id,
            creator_id: user.creator_id,
            email: user.email,
            auth_provider: user.auth_provider,
            tier_ids: user.tier_ids
          },
          traceId
        )
      );
    } catch (error) {
      return res
        .status(409)
        .json(errorEnvelope("CONFLICT", (error as Error).message, traceId));
    }
  });

  app.post("/api/v1/identity/register-patreon", async (req: Request, res: Response) => {
    const traceId = traceIdFrom(req);
    const body = (req.body ?? {}) as Record<string, unknown>;
    const details = validateRequiredFields(body, [
      "creator_id",
      "patreon_user_id",
      "email"
    ]);
    if (details.length > 0) {
      return res
        .status(400)
        .json(errorEnvelope("VALIDATION_ERROR", "Invalid request.", traceId, details));
    }
    const tierIds = Array.isArray(body.tier_ids)
      ? (body.tier_ids as string[]).filter((x): x is string => typeof x === "string")
      : [];
    const user = await identityService.registerPatreonFallback(
      body.creator_id as string,
      body.patreon_user_id as string,
      body.email as string,
      tierIds
    );
    return res.status(201).json(
      successEnvelope(
        {
          user_id: user.user_id,
          creator_id: user.creator_id,
          email: user.email,
          auth_provider: user.auth_provider,
          tier_ids: user.tier_ids
        },
        traceId
      )
    );
  });

  app.post("/api/v1/identity/login", async (req: Request, res: Response) => {
    const traceId = traceIdFrom(req);
    const body = (req.body ?? {}) as Record<string, unknown>;
    const details = validateRequiredFields(body, ["creator_id", "email", "password"]);
    if (details.length > 0) {
      return res
        .status(400)
        .json(errorEnvelope("VALIDATION_ERROR", "Invalid request.", traceId, details));
    }
    try {
      const session = await identityService.login(
        body.creator_id as string,
        body.email as string,
        body.password as string
      );
      return res.status(200).json(
        successEnvelope(
          {
            token: session.token,
            user_id: session.user_id,
            tier_ids: session.tier_ids,
            expires_at: session.expires_at
          },
          traceId
        )
      );
    } catch (error) {
      return res
        .status(401)
        .json(errorEnvelope("AUTH_ERROR", (error as Error).message, traceId));
    }
  });

  app.post("/api/v1/identity/login-patreon", async (req: Request, res: Response) => {
    const traceId = traceIdFrom(req);
    const body = (req.body ?? {}) as Record<string, unknown>;
    const details = validateRequiredFields(body, ["creator_id", "patreon_user_id"]);
    if (details.length > 0) {
      return res
        .status(400)
        .json(errorEnvelope("VALIDATION_ERROR", "Invalid request.", traceId, details));
    }
    try {
      const session = await identityService.loginPatreonFallback(
        body.creator_id as string,
        body.patreon_user_id as string
      );
      return res.status(200).json(
        successEnvelope(
          {
            token: session.token,
            user_id: session.user_id,
            tier_ids: session.tier_ids,
            expires_at: session.expires_at
          },
          traceId
        )
      );
    } catch (error) {
      return res
        .status(401)
        .json(errorEnvelope("AUTH_ERROR", (error as Error).message, traceId));
    }
  });

  app.post("/api/v1/identity/logout", async (req: Request, res: Response) => {
    const traceId = traceIdFrom(req);
    const token = req.header("authorization")?.replace("Bearer ", "");
    if (!token) {
      return res
        .status(400)
        .json(errorEnvelope("VALIDATION_ERROR", "Bearer token required.", traceId));
    }
    await identityService.logout(token);
    return res.status(200).json(successEnvelope({ logged_out: true }, traceId));
  });

  app.get("/api/v1/clone/posts/:post_id", async (req: Request, res: Response) => {
    const traceId = traceIdFrom(req);
    const creatorId =
      typeof req.query.creator_id === "string" ? req.query.creator_id.trim() : "";
    if (!creatorId) {
      return res
        .status(400)
        .json(
          errorEnvelope("VALIDATION_ERROR", "creator_id is required.", traceId, [
            { field: "creator_id", issue: "missing" }
          ])
        );
    }
    const site = await cloneService.getLatest(creatorId);
    if (!site) {
      return res
        .status(404)
        .json(errorEnvelope("NOT_FOUND", "No clone site.", traceId));
    }
    const post = site.posts.find((p) => p.post_id === req.params.post_id);
    if (!post) {
      return res
        .status(404)
        .json(errorEnvelope("NOT_FOUND", "Post not found.", traceId));
    }
    const bearer = req.header("authorization")?.replace("Bearer ", "") ?? null;
    const session = bearer ? await identityService.resolveSession(bearer) : null;
    const check = checkPostAccess(post, session, creatorId);
    if (!check.allowed) {
      return res
        .status(403)
        .json(errorEnvelope("FORBIDDEN", check.reason, traceId));
    }
    return res.status(200).json(successEnvelope(post, traceId));
  });

  app.get("/api/v1/clone/accessible-posts", async (req: Request, res: Response) => {
    const traceId = traceIdFrom(req);
    const creatorId =
      typeof req.query.creator_id === "string" ? req.query.creator_id.trim() : "";
    if (!creatorId) {
      return res
        .status(400)
        .json(
          errorEnvelope("VALIDATION_ERROR", "creator_id is required.", traceId, [
            { field: "creator_id", issue: "missing" }
          ])
        );
    }
    const site = await cloneService.getLatest(creatorId);
    if (!site) {
      return res
        .status(404)
        .json(errorEnvelope("NOT_FOUND", "No clone site.", traceId));
    }
    const bearer = req.header("authorization")?.replace("Bearer ", "") ?? null;
    const session = bearer ? await identityService.resolveSession(bearer) : null;
    const accessible = filterAccessiblePosts(site, session);
    return res.status(200).json(
      successEnvelope(
        { items: accessible, total: site.posts.length, accessible_count: accessible.length },
        traceId
      )
    );
  });

  app.post("/api/v1/payments/mappings", async (req: Request, res: Response) => {
    const traceId = traceIdFrom(req);
    const body = (req.body ?? {}) as Record<string, unknown>;
    const details = validateRequiredFields(body, [
      "creator_id",
      "tier_id",
      "provider",
      "product_id",
      "price_id",
      "currency"
    ]);
    if (details.length > 0) {
      return res
        .status(400)
        .json(errorEnvelope("VALIDATION_ERROR", "Invalid mapping.", traceId, details));
    }
    const mapping: TierProductMapping = {
      tier_id: body.tier_id as string,
      provider: body.provider as PaymentProvider,
      product_id: body.product_id as string,
      price_id: body.price_id as string,
      currency: body.currency as string,
      amount_cents:
        typeof body.amount_cents === "number" ? body.amount_cents : 0,
      billing_interval:
        (body.billing_interval as BillingInterval) ?? "month",
      tax_behavior:
        body.tax_behavior === "inclusive" ? "inclusive" : "exclusive"
    };
    const config = await paymentService.addMapping(
      body.creator_id as string,
      mapping
    );
    return res.status(200).json(
      successEnvelope(
        {
          creator_id: config.creator_id,
          mappings_count: config.mappings.length,
          live_mode: config.live_mode
        },
        traceId
      )
    );
  });

  app.get("/api/v1/payments/config", async (req: Request, res: Response) => {
    const traceId = traceIdFrom(req);
    const creatorId =
      typeof req.query.creator_id === "string" ? req.query.creator_id.trim() : "";
    if (!creatorId) {
      return res
        .status(400)
        .json(
          errorEnvelope("VALIDATION_ERROR", "creator_id is required.", traceId, [
            { field: "creator_id", issue: "missing" }
          ])
        );
    }
    const cfg = await paymentService.getConfig(creatorId);
    if (!cfg) {
      return res
        .status(404)
        .json(errorEnvelope("NOT_FOUND", "No payment config.", traceId));
    }
    return res.status(200).json(successEnvelope(cfg, traceId));
  });

  app.post("/api/v1/payments/preflight", async (req: Request, res: Response) => {
    const traceId = traceIdFrom(req);
    const body = (req.body ?? {}) as Record<string, unknown>;
    const details = validateRequiredFields(body, ["creator_id"]);
    if (details.length > 0) {
      return res
        .status(400)
        .json(errorEnvelope("VALIDATION_ERROR", "Invalid request.", traceId, details));
    }
    const result = await paymentService.preflight(body.creator_id as string);
    return res.status(200).json(successEnvelope(result, traceId));
  });

  app.post("/api/v1/payments/checkout", async (req: Request, res: Response) => {
    const traceId = traceIdFrom(req);
    const body = (req.body ?? {}) as Record<string, unknown>;
    const details = validateRequiredFields(body, [
      "creator_id",
      "tier_id",
      "user_id",
      "email"
    ]);
    if (details.length > 0) {
      return res
        .status(400)
        .json(errorEnvelope("VALIDATION_ERROR", "Invalid checkout.", traceId, details));
    }
    const dryRun = body.dry_run === true;
    try {
      const result = await paymentService.checkout(
        body.creator_id as string,
        body.tier_id as string,
        body.user_id as string,
        body.email as string,
        dryRun
      );
      return res.status(200).json(successEnvelope(result, traceId));
    } catch (error) {
      const message = (error as Error).message;
      if (message.includes("not found") || message.includes("No payment")) {
        return res
          .status(404)
          .json(errorEnvelope("NOT_FOUND", message, traceId));
      }
      if (message.includes("blocked")) {
        return res
          .status(400)
          .json(errorEnvelope("LIVE_MODE_BLOCKED", message, traceId));
      }
      return res
        .status(500)
        .json(errorEnvelope("CHECKOUT_ERROR", message, traceId));
    }
  });

  app.post("/api/v1/payments/live-mode", async (req: Request, res: Response) => {
    const traceId = traceIdFrom(req);
    const body = (req.body ?? {}) as Record<string, unknown>;
    const details = validateRequiredFields(body, ["creator_id"]);
    if (details.length > 0) {
      return res
        .status(400)
        .json(errorEnvelope("VALIDATION_ERROR", "Invalid request.", traceId, details));
    }
    const live = body.live === true;
    const config = await paymentService.setLiveMode(
      body.creator_id as string,
      live
    );
    if (!config) {
      return res
        .status(404)
        .json(errorEnvelope("NOT_FOUND", "No payment config.", traceId));
    }
    return res
      .status(200)
      .json(successEnvelope({ live_mode: config.live_mode }, traceId));
  });

  app.post("/api/v1/migrations/campaigns", async (req: Request, res: Response) => {
    const traceId = traceIdFrom(req);
    const body = (req.body ?? {}) as Record<string, unknown>;
    const details = validateRequiredFields(body, [
      "creator_id",
      "message_subject",
      "message_body_template"
    ]);
    if (details.length > 0) {
      return res
        .status(400)
        .json(errorEnvelope("VALIDATION_ERROR", "Invalid request.", traceId, details));
    }
    const tierMappings = Array.isArray(body.tier_mappings)
      ? (body.tier_mappings as TierMapping[])
      : [];
    const recipients = Array.isArray(body.recipients)
      ? (body.recipients as Array<{
          member_id: string;
          email: string;
          source_tier_id: string;
        }>)
      : [];
    const campaign = await campaignService.create(
      body.creator_id as string,
      tierMappings,
      recipients,
      body.message_subject as string,
      body.message_body_template as string,
      traceId
    );
    return res.status(201).json(
      successEnvelope(
        {
          campaign_id: campaign.campaign_id,
          status: campaign.status,
          total_recipients: campaign.total_recipients,
          total_suppressed: campaign.total_suppressed
        },
        traceId
      )
    );
  });

  app.post(
    "/api/v1/migrations/campaigns/:campaign_id/preflight",
    async (req: Request, res: Response) => {
      const traceId = traceIdFrom(req);
      const result = await campaignService.preflight(req.params.campaign_id);
      return res.status(200).json(successEnvelope(result, traceId));
    }
  );

  app.post(
    "/api/v1/migrations/campaigns/:campaign_id/send",
    async (req: Request, res: Response) => {
      const traceId = traceIdFrom(req);
      const body = (req.body ?? {}) as Record<string, unknown>;
      const batchSize =
        typeof body.batch_size === "number" ? body.batch_size : 100;
      const baseUrl =
        typeof body.base_url === "string" && body.base_url.trim()
          ? body.base_url.trim()
          : "https://preview.relay.local";
      try {
        const result = await campaignService.sendBatch(
          req.params.campaign_id,
          batchSize,
          baseUrl,
          traceId
        );
        return res.status(200).json(successEnvelope(result, traceId));
      } catch (error) {
        const message = (error as Error).message;
        if (message.includes("not found") || message.includes("Not found")) {
          return res
            .status(404)
            .json(errorEnvelope("NOT_FOUND", message, traceId));
        }
        return res
          .status(400)
          .json(errorEnvelope("CAMPAIGN_ERROR", message, traceId));
      }
    }
  );

  app.get(
    "/api/v1/migrations/campaigns/:campaign_id",
    async (req: Request, res: Response) => {
      const traceId = traceIdFrom(req);
      const campaign = await campaignService.getCampaign(req.params.campaign_id);
      if (!campaign) {
        return res
          .status(404)
          .json(errorEnvelope("NOT_FOUND", "Campaign not found.", traceId));
      }
      return res.status(200).json(
        successEnvelope(
          {
            campaign_id: campaign.campaign_id,
            creator_id: campaign.creator_id,
            status: campaign.status,
            total_recipients: campaign.total_recipients,
            total_suppressed: campaign.total_suppressed,
            batches_sent: campaign.batches_sent,
            bounce_count: campaign.bounce_count,
            complaint_count: campaign.complaint_count,
            click_count: campaign.click_count,
            resubscribe_count: campaign.resubscribe_count
          },
          traceId
        )
      );
    }
  );

  app.get(
    "/api/v1/migrations/campaigns/:campaign_id/preview",
    async (req: Request, res: Response) => {
      const traceId = traceIdFrom(req);
      const preview = await campaignService.getPreview(req.params.campaign_id);
      if (!preview) {
        return res
          .status(404)
          .json(errorEnvelope("NOT_FOUND", "Campaign not found.", traceId));
      }
      return res.status(200).json(successEnvelope(preview, traceId));
    }
  );

  app.post("/api/v1/migrations/suppression", async (req: Request, res: Response) => {
    const traceId = traceIdFrom(req);
    const body = (req.body ?? {}) as Record<string, unknown>;
    const details = validateRequiredFields(body, ["creator_id"]);
    if (details.length > 0) {
      return res
        .status(400)
        .json(errorEnvelope("VALIDATION_ERROR", "Invalid request.", traceId, details));
    }
    const emails = Array.isArray(body.emails)
      ? (body.emails as string[]).filter((x): x is string => typeof x === "string")
      : [];
    await migrationStore.addToSuppression(body.creator_id as string, emails);
    return res
      .status(200)
      .json(successEnvelope({ added: emails.length }, traceId));
  });

  app.post(
    "/api/v1/migrations/campaigns/:campaign_id/bounce",
    async (req: Request, res: Response) => {
      const traceId = traceIdFrom(req);
      const body = (req.body ?? {}) as Record<string, unknown>;
      const email = typeof body.email === "string" ? body.email : "";
      await campaignService.recordBounce(req.params.campaign_id, email);
      return res
        .status(200)
        .json(successEnvelope({ recorded: true }, traceId));
    }
  );

  app.post(
    "/api/v1/migrations/campaigns/:campaign_id/complaint",
    async (req: Request, res: Response) => {
      const traceId = traceIdFrom(req);
      const body = (req.body ?? {}) as Record<string, unknown>;
      const email = typeof body.email === "string" ? body.email : "";
      await campaignService.recordComplaint(req.params.campaign_id, email);
      return res
        .status(200)
        .json(successEnvelope({ recorded: true }, traceId));
    }
  );

  app.post(
    "/api/v1/migrations/campaigns/:campaign_id/click",
    async (req: Request, res: Response) => {
      const traceId = traceIdFrom(req);
      const body = (req.body ?? {}) as Record<string, unknown>;
      await campaignService.recordClick(
        req.params.campaign_id,
        typeof body.member_id === "string" ? body.member_id : "",
        typeof body.tier_id === "string" ? body.tier_id : "",
        traceId
      );
      return res
        .status(200)
        .json(successEnvelope({ recorded: true }, traceId));
    }
  );

  app.post(
    "/api/v1/migrations/campaigns/:campaign_id/resubscribe",
    async (req: Request, res: Response) => {
      const traceId = traceIdFrom(req);
      const body = (req.body ?? {}) as Record<string, unknown>;
      await campaignService.recordResubscribe(
        req.params.campaign_id,
        typeof body.member_id === "string" ? body.member_id : "",
        typeof body.tier_id === "string" ? body.tier_id : "",
        typeof body.payment_provider === "string" ? body.payment_provider : "",
        traceId
      );
      return res
        .status(200)
        .json(successEnvelope({ recorded: true }, traceId));
    }
  );

  // ── Deploy routes ──────────────────────────────────────────────

  app.post("/api/v1/deploy/build", async (req: Request, res: Response) => {
    const traceId = traceIdFrom(req);
    try {
      const body = (req.body ?? {}) as Record<string, unknown>;
      const creatorId = typeof body.creator_id === "string" ? body.creator_id : "";
      const provider = (typeof body.provider === "string" ? body.provider : "vercel") as DeployProvider;
      const domain = typeof body.domain === "string" ? body.domain : undefined;
      const deployment = await deployService.buildAndPreview(creatorId, provider, domain);
      return res.status(201).json(successEnvelope(deployment, traceId));
    } catch (err: unknown) {
      return res
        .status(400)
        .json(errorEnvelope("DEPLOY_ERROR", (err as Error).message, traceId));
    }
  });

  app.post(
    "/api/v1/deploy/:deployment_id/dns-check",
    async (req: Request, res: Response) => {
      const traceId = traceIdFrom(req);
      try {
        const result = await deployService.checkDns(req.params.deployment_id);
        return res.status(200).json(successEnvelope(result, traceId));
      } catch (err: unknown) {
        return res
          .status(400)
          .json(errorEnvelope("DEPLOY_ERROR", (err as Error).message, traceId));
      }
    }
  );

  app.post(
    "/api/v1/deploy/:deployment_id/approve",
    async (req: Request, res: Response) => {
      const traceId = traceIdFrom(req);
      try {
        const deployment = await deployService.approve(req.params.deployment_id);
        return res.status(200).json(successEnvelope(deployment, traceId));
      } catch (err: unknown) {
        return res
          .status(400)
          .json(errorEnvelope("DEPLOY_ERROR", (err as Error).message, traceId));
      }
    }
  );

  app.post(
    "/api/v1/deploy/:deployment_id/launch",
    async (req: Request, res: Response) => {
      const traceId = traceIdFrom(req);
      try {
        const deployment = await deployService.launch(req.params.deployment_id);
        return res.status(200).json(successEnvelope(deployment, traceId));
      } catch (err: unknown) {
        return res
          .status(400)
          .json(errorEnvelope("DEPLOY_ERROR", (err as Error).message, traceId));
      }
    }
  );

  app.post("/api/v1/deploy/rollback", async (req: Request, res: Response) => {
    const traceId = traceIdFrom(req);
    try {
      const body = (req.body ?? {}) as Record<string, unknown>;
      const creatorId = typeof body.creator_id === "string" ? body.creator_id : "";
      const rolled = await deployService.rollback(creatorId);
      return res.status(200).json(successEnvelope(rolled, traceId));
    } catch (err: unknown) {
      return res
        .status(400)
        .json(errorEnvelope("DEPLOY_ERROR", (err as Error).message, traceId));
    }
  });

  app.get("/api/v1/deploy/active/:creator_id", async (req: Request, res: Response) => {
    const traceId = traceIdFrom(req);
    const dep = await deployService.getActive(req.params.creator_id);
    if (!dep) {
      return res.status(404).json(errorEnvelope("NOT_FOUND", "No active deployment.", traceId));
    }
    return res.status(200).json(successEnvelope(dep, traceId));
  });

  app.get("/api/v1/deploy/list/:creator_id", async (req: Request, res: Response) => {
    const traceId = traceIdFrom(req);
    const list = await deployService.listDeployments(req.params.creator_id);
    return res.status(200).json(successEnvelope(list, traceId));
  });

  app.get(
    "/api/v1/deploy/:deployment_id",
    async (req: Request, res: Response) => {
      const traceId = traceIdFrom(req);
      const dep = await deployService.getDeployment(req.params.deployment_id);
      if (!dep) {
        return res.status(404).json(errorEnvelope("NOT_FOUND", "Deployment not found.", traceId));
      }
      return res.status(200).json(successEnvelope(dep, traceId));
    }
  );

  return {
    app,
    eventBus,
    ingestService,
    ingestQueue,
    dlq,
    exportService,
    galleryService,
    triageService,
    collectionsStore,
    layoutStore,
    actionCenterService,
    cloneService,
    identityService,
    paymentService,
    campaignService,
    deployService,
    patreonSyncService
  };
}
