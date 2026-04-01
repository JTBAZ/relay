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
import {
  buildMediaManifest,
  buildPostMap,
  buildTierMap
} from "./export/manifests.js";
import { GalleryService } from "./gallery/gallery-service.js";
import { FileGalleryOverridesStore } from "./gallery/overrides-store.js";
import { FileCollectionsStore } from "./gallery/collections-store.js";
import { FilePageLayoutStore } from "./gallery/layout-store.js";
import { FileSavedFiltersStore } from "./gallery/saved-filters-store.js";
import { TriageService } from "./gallery/triage-service.js";
import { resolveLayoutPosts } from "./gallery/layout-to-clone.js";
import { parseGalleryLimit, queryStringList } from "./gallery/parse-query.js";
import type { PostVisibility, SavedFilterRecord } from "./gallery/types.js";
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
import { PatreonSyncService } from "./patreon/patreon-sync-service.js";
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
  ingest_retry_policy?: { max_attempts: number; base_delay_ms: number };
  export_storage_root?: string;
  gallery_post_overrides_path?: string;
  gallery_saved_filters_path?: string;
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
  const exportService = new ExportService(
    canonicalStore,
    exportIndex,
    exportStorageRoot,
    config.fetch_impl
  );
  const galleryOverridesStore = new FileGalleryOverridesStore(
    config.gallery_post_overrides_path ?? ".relay-data/gallery_post_overrides.json"
  );
  const savedFiltersStore = new FileSavedFiltersStore(
    config.gallery_saved_filters_path ?? ".relay-data/gallery_saved_filters.json"
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
    identityService
  );

  const app = express();
  app.use(express.json());
  app.use((req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,PATCH,DELETE,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Trace-Id");
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
      if (includeBatch) payload.batch = batch;
      return res.status(200).json(successEnvelope(payload, traceId));
    } catch (err: unknown) {
      const msg = (err as Error).message;
      const notFound =
        msg.includes("No Patreon tokens") || msg.includes("Creator credentials not found");
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
      return res.status(200).json(successEnvelope(result, traceId));
    } catch (err: unknown) {
      const msg = (err as Error).message;
      const notFound = msg.includes("No Patreon tokens");
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

  app.get("/api/v1/export/media/:creator_id/:media_id/content", async (req, res) => {
    const traceId = traceIdFrom(req);
    try {
      const record = await exportService.getExportRecord(req.params.creator_id, req.params.media_id);
      if (!record) {
        return res
          .status(404)
          .json(errorEnvelope("NOT_FOUND", "Exported media not found.", traceId));
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
    const visibilityRaw = typeof req.query.visibility === "string" ? req.query.visibility : undefined;
    const visibility = (visibilityRaw === "visible" || visibilityRaw === "hidden" || visibilityRaw === "flagged" || visibilityRaw === "all")
      ? visibilityRaw
      : undefined;
    const sortRaw = typeof req.query.sort === "string" ? req.query.sort : undefined;
    const sort = sortRaw === "visibility" || sortRaw === "published" ? sortRaw : undefined;
    const limit = parseGalleryLimit(req);

    const result = await galleryService.list({
      creator_id: creatorId,
      q,
      tag_ids: tag_ids.length ? tag_ids : undefined,
      tier_ids: tier_ids.length ? tier_ids : undefined,
      media_type,
      published_after,
      published_before,
      visibility,
      sort,
      cursor,
      limit
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
    const facets = await galleryService.facets(creatorId);
    res.setHeader("Cache-Control", "private, no-store");
    return res.status(200).json(successEnvelope(facets, traceId));
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
    const detail = await galleryService.postDetail(creatorId, postId);
    if (!detail) {
      return res.status(404).json(errorEnvelope("NOT_FOUND", "Post not found.", traceId));
    }
    res.setHeader("Cache-Control", "private, no-store");
    return res.status(200).json(successEnvelope(detail, traceId));
  });

  app.post("/api/v1/gallery/media/bulk-tags", async (req: Request, res: Response) => {
    const traceId = traceIdFrom(req);
    const body = (req.body ?? {}) as Record<string, unknown>;
    const baseDetails = validateRequiredFields(body, ["creator_id"]);
    const postIdsRaw = body.post_ids;
    if (!Array.isArray(postIdsRaw) || !postIdsRaw.every((x) => typeof x === "string")) {
      return res.status(400).json(
        errorEnvelope("VALIDATION_ERROR", "post_ids array required.", traceId, [
          { field: "post_ids", issue: "invalid" }
        ])
      );
    }
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
    const vis = body.visibility;
    if (vis !== "visible" && vis !== "hidden" && vis !== "flagged") {
      return res.status(400).json(
        errorEnvelope("VALIDATION_ERROR", "visibility must be visible, hidden, or flagged.", traceId, [
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
    const v = vis as PostVisibility;
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
    const items = await collectionsStore.listForCreator(creatorId);
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
    const created = await collectionsStore.create(
      body.creator_id as string,
      body.title as string,
      typeof body.description === "string" ? body.description : undefined
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
    const updated = await collectionsStore.addPosts(req.params.collection_id, postIds as string[]);
    if (!updated) {
      return res.status(404).json(errorEnvelope("NOT_FOUND", "Collection not found.", traceId));
    }
    return res.status(200).json(successEnvelope(updated, traceId));
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
