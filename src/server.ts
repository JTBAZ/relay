import express, { Request, Response } from "express";
import { randomUUID } from "node:crypto";
import { dirname, join } from "node:path";
import { PatreonAuthService } from "./auth/auth-service.js";
import {
  getPatreonOAuthStateSecret,
  signCreatorPatreonOAuthState,
  verifyCreatorPatreonOAuthState
} from "./auth/patreon-creator-oauth-state.js";
import { FilePatreonCookieStore } from "./auth/cookie-store.js";
import { PatreonClient } from "./auth/patreon-client.js";
import { DbPatreonTokenStore } from "./auth/token-store-db.js";
import { FilePatreonTokenStore, type PatreonTokenStore } from "./auth/token-store.js";
import { errorEnvelope, successEnvelope } from "./contracts/api.js";
import { DbEventBus } from "./events/event-bus-db.js";
import { InMemoryEventBus, type RelayEventBus } from "./events/event-bus.js";
import { FileCanonicalStore } from "./ingest/canonical-store.js";
import { DbCanonicalStore } from "./ingest/canonical-store-db.js";
import { DbDeadLetterQueue } from "./ingest/dlq-db.js";
import { FileDeadLetterQueue, type DeadLetterQueue } from "./ingest/dlq.js";
import { recordSupabaseSyncOutcome } from "./health/auth-route-metrics.js";
import { evaluatePlatformOperationsHealth } from "./health/platform-operations-metrics.js";
import { evaluatePart1aGates } from "./auth/part1a-gate-metrics.js";
import { evaluateIngestHealthGates } from "./ingest/ingest-health-metrics.js";
import { IngestService } from "./ingest/ingest-service.js";
import { IngestRetryQueue } from "./ingest/retry-queue.js";
import { SyncWatermarkStore } from "./ingest/sync-watermark-store.js";
import { DbSyncWatermarkStore } from "./ingest/sync-watermark-store-db.js";
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
import { DbGalleryOverridesStore } from "./gallery/overrides-store-db.js";
import {
  FileCollectionsStore,
  type RelayCollectionsStore
} from "./gallery/collections-store.js";
import { DbCollectionsStore } from "./gallery/collections-store-db.js";
import { postFitsAccessCeiling } from "./gallery/tier-access.js";
import { FilePageLayoutStore, type RelayPageLayoutStore } from "./gallery/layout-store.js";
import { DbPageLayoutStore } from "./gallery/layout-store-db.js";
import { FileSavedFiltersStore } from "./gallery/saved-filters-store.js";
import { DbSavedFiltersStore } from "./gallery/saved-filters-store-db.js";
import { FilePatronFavoritesStore } from "./gallery/patron-favorites-store.js";
import { DbPatronFavoritesStore } from "./gallery/patron-favorites-store-db.js";
import { FilePatronCollectionsStore } from "./gallery/patron-collections-store.js";
import { DbPatronCollectionsStore } from "./gallery/patron-collections-store-db.js";
import { validatePatronFavoriteTarget } from "./gallery/patron-favorites-validate.js";
import { validatePatronCollectionEntry } from "./gallery/patron-collections-validate.js";
import { TriageService } from "./gallery/triage-service.js";
import { resolveLayoutPosts } from "./gallery/layout-to-clone.js";
import {
  findPostIdForExportedMedia,
  patronMayFetchMediaExport
} from "./gallery/patron-media-access.js";
import { buildPatronEntitlementHealthPayload } from "./gallery/entitlement-degraded.js";
import { evaluatePostPermission } from "./gallery/post-permission.js";
import { resolveGalleryItemVisibility } from "./gallery/query.js";
import { buildVisitorPreviewImage } from "./export/visitor-preview.js";
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
import { DbAnalyticsStore } from "./analytics/analytics-store-db.js";
import { FileAnalyticsStore } from "./analytics/analytics-store.js";
import { ActionCenterService } from "./analytics/action-center-service.js";
import {
  evaluateInsightJobHealth,
  recordAnalyticsGenerateAttempt,
  recordAnalyticsGenerateFailure,
  recordAnalyticsGenerateSuccess
} from "./analytics/insight-job-metrics.js";
import {
  evaluateExportRetrievalHealth,
  recordContentDeliveryFailure,
  recordContentDeliverySuccess,
  recordExportMediaAttempt,
  recordExportMediaFailure,
  recordExportMediaSuccess,
  recordIntegritySampleResults,
  recordPreviewDeliveryFailure,
  recordPreviewDeliverySuccess,
  recordVerifyResult
} from "./export/export-retrieval-metrics.js";
import { provisionCreatorWorkspace } from "./creator/provision-creator-workspace.js";
import {
  normalizePublicSlugCandidate,
  validatePublicSlugFormat
} from "./creator/public-slug.js";
import { CloneService } from "./clone/clone-service.js";
import { DbCloneSiteStore } from "./clone/clone-store-db.js";
import { FileCloneSiteStore } from "./clone/clone-store.js";
import {
  assertCreatorRelayMutationAllowed,
  relayCreatorSecretBypassesOAuthBind
} from "./identity/creator-route-guard.js";
import { IdentityService } from "./identity/identity-service.js";
import { DbIdentityStore, PatreonAccountLinkConflictError } from "./identity/identity-store-db.js";
import { FileIdentityStore } from "./identity/identity-store.js";
import {
  accountOwnsRelayCreatorId,
  relayCreatorIdExists
} from "./identity/account-creator-ownership.js";
import {
  getAccountIdForSession,
  loadPatronAuthContext,
  patronMayAccessCreator
} from "./identity/patron-auth-context.js";
import {
  ensurePatronMembershipForSupabaseAccount,
  upsertAccountForSupabaseUser
} from "./identity/supabase-account.js";
import { getSupabaseUserFromAccessToken } from "./lib/supabase-auth.js";
import type { PrismaClient } from "@prisma/client";
import { checkPostAccess, filterAccessiblePosts } from "./identity/access-guard.js";
import {
  clearActiveRoleCookie,
  clearSessionCookie,
  readSessionCookie,
  setSessionCookie
} from "./identity/session-cookie.js";
import { setActiveRoleCookieForNewSession } from "./identity/set-active-role-cookie-for-session.js";
import { resolveTenantBySlug } from "./identity/resolve-tenant.js";
import {
  applyRelayAccountRlsIfPresent,
  requireAccount,
  sendRelayAuthError
} from "./identity/require-account.js";

function relayCookieDualWriteJson(): boolean {
  return process.env.RELAY_COOKIE_SESSION_DUAL_WRITE !== "0";
}

/** When dual-write is off, JSON responses omit `token` (cookie-only transport). */
function applyDualWriteToken<T extends Record<string, unknown>>(payload: T & { token?: string }): T {
  if (relayCookieDualWriteJson()) return payload;
  const { token: _omit, ...rest } = payload;
  return rest as T;
}
import { PaymentService } from "./payments/payment-service.js";
import { DbPaymentStore } from "./payments/payment-store-db.js";
import { FilePaymentStore } from "./payments/payment-store.js";
import { StripeAdapter, PayPalAdapter } from "./payments/provider-adapter.js";
import type { TierProductMapping, BillingInterval, PaymentProvider } from "./payments/types.js";
import { exchangePatreonPatronOAuth } from "./patreon/patreon-patron-oauth.js";
import { CreatorCampaignDisplayStore } from "./patreon/creator-campaign-display-store.js";
import {
  type PatreonSyncHealthStoreAPI,
  PatreonSyncHealthStore
} from "./patreon/patreon-sync-health-store.js";
import { DbPatreonSyncHealthStore } from "./patreon/patreon-sync-health-store-db.js";
import { PatreonSyncService } from "./patreon/patreon-sync-service.js";
import { classifySyncError } from "./patreon/sync-error-copy.js";
import {
  ensureCreatorProfilePatreonCampaignId,
  resolvePatreonWebhookCampaignOwnership
} from "./patreon/campaign-tenant-resolve.js";
import { syncCreatorProfilePatreonCampaignFromOAuthToken } from "./patreon/creator-oauth-campaign-sync.js";
import { PatreonCampaignCreatorIndex } from "./patreon/patreon-campaign-creator-index.js";
import { PatreonMemberSyncCoordinator } from "./patreon/patreon-member-sync-coordinator.js";
import {
  ensurePatreonPlatformWebhook,
  resolvePublicWebhookBaseFromEnv,
  type EnsureWebhookResult
} from "./patreon/patreon-webhook-registration.js";
import {
  dispatchVerifiedPatreonPlatformPayload,
  extractCampaignIdFromPatreonWebhookPayload
} from "./patreon/patreon-webhook-platform.js";
import { PatreonWebhookMetadataStore } from "./patreon/patreon-webhook-metadata-store.js";
import { verifyPatreonWebhookSignature } from "./patreon/patreon-webhook-signature.js";
import { processPatreonWebhookStub } from "./webhooks/patreon-webhook.js";
import { loadPatronRelayFeedBundleFromRepo } from "./patron/load-patron-relay-feed-bundle.js";
import { CampaignService } from "./migrate/campaign-service.js";
import { DbMigrationStore } from "./migrate/migration-store-db.js";
import { FileMigrationStore } from "./migrate/migration-store.js";
import type { TierMapping } from "./migrate/types.js";
import { DeployService } from "./deploy/deploy-service.js";
import { DbDeployStore } from "./deploy/deploy-store-db.js";
import { FileDeployStore } from "./deploy/deploy-store.js";
import { VercelAdapter, NetlifyAdapter } from "./deploy/deploy-adapter.js";
import type { DeployProvider } from "./deploy/types.js";
import { registerPipelineParityRoutes } from "./dev/pipeline-parity-routes.js";

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
  /** `patreon_campaign_numeric_id` → Relay `creator_id` (webhook routing). Default `.relay-data/patreon_campaign_creator_index.json`. */
  patreon_campaign_creator_index_path?: string;
  /** Encrypted Patreon webhook secrets + opaque delivery tokens. Default `.relay-data/patreon_webhook_metadata.json`. */
  patreon_webhook_metadata_path?: string;
  /**
   * Public base URL for registered webhook URIs (no trailing slash), e.g. `https://relay.example.com`.
   * Falls back to `RELAY_PUBLIC_WEBHOOK_BASE_URL` / `PUBLIC_WEBHOOK_BASE_URL` when unset.
   */
  public_webhook_base_url?: string;
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
  /**
   * When true, use `DbIdentityStore` (Postgres) instead of `FileIdentityStore`.
   * Default: env `RELAY_DB_STORE_IDENTITY` is `1` / `true` / `yes`.
   * **Required** when the DB identity store is on: pass the shared `PrismaClient` from `src/lib/db.ts` (see `main.ts`).
   */
  relay_db_store_identity?: boolean;
  /**
   * When true, use `DbCanonicalStore` (Postgres) instead of `FileCanonicalStore` / `canonical.json`.
   * Default: env `RELAY_DB_STORE_CANONICAL` is `1` / `true` / `yes`.
   */
  relay_db_store_canonical?: boolean;
  /**
   * When true, use `DbSyncWatermarkStore` (`sync_cursors`) instead of watermark JSON.
   * Default: env `RELAY_DB_STORE_WATERMARK` is `1` / `true` / `yes`.
   */
  relay_db_store_watermark?: boolean;
  /**
   * When true, use `DbPatreonSyncHealthStore` (`creator_sync_states`) instead of sync health JSON.
   * Default: env `RELAY_DB_STORE_SYNC_HEALTH` is `1` / `true` / `yes`.
   */
  relay_db_store_sync_health?: boolean;
  /**
   * When true, use `DbGalleryOverridesStore` (`post_overrides`) instead of gallery_post_overrides.json.
   * Default: env `RELAY_DB_STORE_OVERRIDES` is `1` / `true` / `yes`.
   */
  relay_db_store_overrides?: boolean;
  /**
   * When true, use `DbCollectionsStore` instead of collections.json.
   * Default: env `RELAY_DB_STORE_COLLECTIONS` is `1` / `true` / `yes`.
   */
  relay_db_store_collections?: boolean;
  /**
   * When true, use `DbSavedFiltersStore` instead of gallery_saved_filters.json.
   * Default: env `RELAY_DB_STORE_SAVED_FILTERS` is `1` / `true` / `yes`.
   */
  relay_db_store_saved_filters?: boolean;
  /**
   * When true, use `DbPageLayoutStore` instead of page_layout.json.
   * Default: env `RELAY_DB_STORE_LAYOUT` is `1` / `true` / `yes`.
   */
  relay_db_store_layout?: boolean;
  /**
   * When true, use `DbDeadLetterQueue` (`job_runs`) instead of `ingest_dlq.json`.
   * Default: env `RELAY_DB_STORE_DLQ` is `1` / `true` / `yes`.
   */
  relay_db_store_dlq?: boolean;
  /**
   * When true, use `DbEventBus` (`outbox_events`) alongside in-memory `getAll()` buffer.
   * Default: env `RELAY_DB_STORE_EVENTS` is `1` / `true` / `yes`.
   */
  relay_db_store_events?: boolean;
  /**
   * When true, use `DbPatronFavoritesStore` + `DbPatronCollectionsStore` instead of patron JSON files.
   * Default: env `RELAY_DB_STORE_PATRON_ENGAGEMENT` is `1` / `true` / `yes`.
   */
  relay_db_store_patron_engagement?: boolean;
  /**
   * When true, use `DbAnalyticsStore` instead of `analytics.json`.
   * Default: env `RELAY_DB_STORE_ANALYTICS` is `1` / `true` / `yes`.
   */
  relay_db_store_analytics?: boolean;
  /**
   * When true, use `DbCloneSiteStore` instead of `clone_sites.json`.
   * Default: env `RELAY_DB_STORE_CLONE` is `1` / `true` / `yes`.
   */
  relay_db_store_clone?: boolean;
  /**
   * When true, use `DbPaymentStore` instead of `payments.json`.
   * Default: env `RELAY_DB_STORE_PAYMENTS` is `1` / `true` / `yes`.
   */
  relay_db_store_payments?: boolean;
  /**
   * When true, use `DbMigrationStore` instead of `migrations.json`.
   * Default: env `RELAY_DB_STORE_MIGRATION` is `1` / `true` / `yes`.
   */
  relay_db_store_migration?: boolean;
  /**
   * When true, use `DbDeployStore` instead of `deploys.json`.
   * Default: env `RELAY_DB_STORE_DEPLOY` is `1` / `true` / `yes`.
   */
  relay_db_store_deploy?: boolean;
  /**
   * When true, use `DbPatreonTokenStore` (`OAuthCredential` / `ProviderAccount`) instead of
   * `patreon_credentials.json`. Default: env `RELAY_DB_STORE_CREATOR_OAUTH` is `1` / `true` / `yes`.
   * Requires `prisma` and applied migrations; enable after identity DB or run OAuth exchange to seed rows.
   */
  relay_db_store_creator_oauth?: boolean;
  prisma?: PrismaClient;
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
  eventBus: RelayEventBus;
  ingestService: IngestService;
  ingestQueue: IngestRetryQueue;
  dlq: DeadLetterQueue;
  exportService: ExportService;
  galleryService: GalleryService;
  triageService: TriageService;
  collectionsStore: RelayCollectionsStore;
  layoutStore: RelayPageLayoutStore;
  actionCenterService: ActionCenterService;
  cloneService: CloneService;
  identityService: IdentityService;
  paymentService: PaymentService;
  campaignService: CampaignService;
  deployService: DeployService;
  patreonSyncService: PatreonSyncService;
  tokenStore: PatreonTokenStore;
  patreonSyncHealthStore: PatreonSyncHealthStoreAPI;
  patreonCampaignCreatorIndex: PatreonCampaignCreatorIndex;
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

function bearerAccessTokenFromRequest(req: Request): string | undefined {
  const raw = req.header("authorization");
  if (typeof raw !== "string") return undefined;
  const m = /^Bearer\s+(\S+)/i.exec(raw.trim());
  return m?.[1];
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

/** Env flag: `1` / `true` / `yes` (case-insensitive). */
function relayEnvTruthy(raw: string | undefined): boolean {
  if (raw === undefined || raw.trim() === "") {
    return false;
  }
  const s = raw.trim().toLowerCase();
  return s === "1" || s === "true" || s === "yes";
}

function useDbIdentityStore(config: AppConfig): boolean {
  if (typeof config.relay_db_store_identity === "boolean") {
    return config.relay_db_store_identity;
  }
  return relayEnvTruthy(process.env.RELAY_DB_STORE_IDENTITY);
}

function useDbCanonicalStore(config: AppConfig): boolean {
  if (typeof config.relay_db_store_canonical === "boolean") {
    return config.relay_db_store_canonical;
  }
  return relayEnvTruthy(process.env.RELAY_DB_STORE_CANONICAL);
}

function useDbSyncWatermarkStore(config: AppConfig): boolean {
  if (typeof config.relay_db_store_watermark === "boolean") {
    return config.relay_db_store_watermark;
  }
  return relayEnvTruthy(process.env.RELAY_DB_STORE_WATERMARK);
}

function useDbPatreonSyncHealthStore(config: AppConfig): boolean {
  if (typeof config.relay_db_store_sync_health === "boolean") {
    return config.relay_db_store_sync_health;
  }
  return relayEnvTruthy(process.env.RELAY_DB_STORE_SYNC_HEALTH);
}

function useDbGalleryOverridesStore(config: AppConfig): boolean {
  if (typeof config.relay_db_store_overrides === "boolean") {
    return config.relay_db_store_overrides;
  }
  return relayEnvTruthy(process.env.RELAY_DB_STORE_OVERRIDES);
}

function useDbCollectionsStore(config: AppConfig): boolean {
  if (typeof config.relay_db_store_collections === "boolean") {
    return config.relay_db_store_collections;
  }
  return relayEnvTruthy(process.env.RELAY_DB_STORE_COLLECTIONS);
}

function useDbSavedFiltersStore(config: AppConfig): boolean {
  if (typeof config.relay_db_store_saved_filters === "boolean") {
    return config.relay_db_store_saved_filters;
  }
  return relayEnvTruthy(process.env.RELAY_DB_STORE_SAVED_FILTERS);
}

function useDbPageLayoutStore(config: AppConfig): boolean {
  if (typeof config.relay_db_store_layout === "boolean") {
    return config.relay_db_store_layout;
  }
  return relayEnvTruthy(process.env.RELAY_DB_STORE_LAYOUT);
}

function useDbDlqStore(config: AppConfig): boolean {
  if (typeof config.relay_db_store_dlq === "boolean") {
    return config.relay_db_store_dlq;
  }
  return relayEnvTruthy(process.env.RELAY_DB_STORE_DLQ);
}

function useDbEventBus(config: AppConfig): boolean {
  if (typeof config.relay_db_store_events === "boolean") {
    return config.relay_db_store_events;
  }
  return relayEnvTruthy(process.env.RELAY_DB_STORE_EVENTS);
}

function useDbAnalyticsStore(config: AppConfig): boolean {
  if (typeof config.relay_db_store_analytics === "boolean") {
    return config.relay_db_store_analytics;
  }
  return relayEnvTruthy(process.env.RELAY_DB_STORE_ANALYTICS);
}

function useDbPatronEngagementStore(config: AppConfig): boolean {
  if (typeof config.relay_db_store_patron_engagement === "boolean") {
    return config.relay_db_store_patron_engagement;
  }
  return relayEnvTruthy(process.env.RELAY_DB_STORE_PATRON_ENGAGEMENT);
}

function useDbCloneStore(config: AppConfig): boolean {
  if (typeof config.relay_db_store_clone === "boolean") {
    return config.relay_db_store_clone;
  }
  return relayEnvTruthy(process.env.RELAY_DB_STORE_CLONE);
}

function useDbPaymentStore(config: AppConfig): boolean {
  if (typeof config.relay_db_store_payments === "boolean") {
    return config.relay_db_store_payments;
  }
  return relayEnvTruthy(process.env.RELAY_DB_STORE_PAYMENTS);
}

function useDbMigrationStore(config: AppConfig): boolean {
  if (typeof config.relay_db_store_migration === "boolean") {
    return config.relay_db_store_migration;
  }
  return relayEnvTruthy(process.env.RELAY_DB_STORE_MIGRATION);
}

function useDbDeployStore(config: AppConfig): boolean {
  if (typeof config.relay_db_store_deploy === "boolean") {
    return config.relay_db_store_deploy;
  }
  return relayEnvTruthy(process.env.RELAY_DB_STORE_DEPLOY);
}

function useDbCreatorOAuthStore(config: AppConfig): boolean {
  if (typeof config.relay_db_store_creator_oauth === "boolean") {
    return config.relay_db_store_creator_oauth;
  }
  return relayEnvTruthy(process.env.RELAY_DB_STORE_CREATOR_OAUTH);
}

function anyRelayDbStoreEnabled(config: AppConfig): boolean {
  return (
    useDbIdentityStore(config) ||
    useDbCanonicalStore(config) ||
    useDbSyncWatermarkStore(config) ||
    useDbPatreonSyncHealthStore(config) ||
    useDbGalleryOverridesStore(config) ||
    useDbCollectionsStore(config) ||
    useDbSavedFiltersStore(config) ||
    useDbPageLayoutStore(config) ||
    useDbDlqStore(config) ||
    useDbEventBus(config) ||
    useDbAnalyticsStore(config) ||
    useDbPatronEngagementStore(config) ||
    useDbCloneStore(config) ||
    useDbPaymentStore(config) ||
    useDbMigrationStore(config) ||
    useDbDeployStore(config) ||
    useDbCreatorOAuthStore(config)
  );
}

export function createApp(config: AppConfig): CreateAppResult {
  const encryption = new TokenEncryption(
    required(config.relay_token_encryption_key, "relay_token_encryption_key")
  );
  if (anyRelayDbStoreEnabled(config) && !config.prisma) {
    throw new Error(
      "createApp: config.prisma is required when any database-backed Relay store is enabled " +
        "(RELAY_DB_STORE_IDENTITY, RELAY_DB_STORE_CANONICAL, RELAY_DB_STORE_WATERMARK, RELAY_DB_STORE_SYNC_HEALTH, " +
        "RELAY_DB_STORE_OVERRIDES, RELAY_DB_STORE_COLLECTIONS, RELAY_DB_STORE_SAVED_FILTERS, RELAY_DB_STORE_LAYOUT, " +
        "RELAY_DB_STORE_DLQ, RELAY_DB_STORE_EVENTS, RELAY_DB_STORE_ANALYTICS, RELAY_DB_STORE_PATRON_ENGAGEMENT, " +
        "RELAY_DB_STORE_CLONE, RELAY_DB_STORE_PAYMENTS, RELAY_DB_STORE_MIGRATION, RELAY_DB_STORE_DEPLOY, " +
        "RELAY_DB_STORE_CREATOR_OAUTH). " +
        "Import `prisma` from `./lib/db.js` in `main.ts` and pass it on AppConfig."
    );
  }
  const credentialStorePath = config.credential_store_path ?? ".relay-data/patreon_credentials.json";
  const relayDataDir = dirname(credentialStorePath);
  const patreonCampaignIndexPath =
    config.patreon_campaign_creator_index_path ??
    join(relayDataDir, "patreon_campaign_creator_index.json");
  const patreonWebhookMetadataPath =
    config.patreon_webhook_metadata_path ?? join(relayDataDir, "patreon_webhook_metadata.json");

  const tokenStore: PatreonTokenStore = useDbCreatorOAuthStore(config)
    ? new DbPatreonTokenStore(config.prisma!, encryption)
    : new FilePatreonTokenStore(credentialStorePath, encryption);
  const eventBus: RelayEventBus = useDbEventBus(config)
    ? new DbEventBus(config.prisma!)
    : new InMemoryEventBus();
  const canonicalStore = useDbCanonicalStore(config)
    ? new DbCanonicalStore(config.prisma!)
    : new FileCanonicalStore(config.ingest_canonical_path ?? ".relay-data/canonical.json");
  const dlq: DeadLetterQueue = useDbDlqStore(config)
    ? new DbDeadLetterQueue(config.prisma!)
    : new FileDeadLetterQueue(config.ingest_dlq_path ?? ".relay-data/ingest_dlq.json");
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
    exportFetchRetryPolicy,
    undefined,
    async (creatorId: string) => {
      const cred = await tokenStore.getByCreatorId(creatorId);
      const t = cred?.access_token?.trim();
      return t ? t : null;
    }
  );
  const galleryOverridesStore = useDbGalleryOverridesStore(config)
    ? new DbGalleryOverridesStore(config.prisma!)
    : new FileGalleryOverridesStore(
        config.gallery_post_overrides_path ?? ".relay-data/gallery_post_overrides.json"
      );
  const savedFiltersStore = useDbSavedFiltersStore(config)
    ? new DbSavedFiltersStore(config.prisma!)
    : new FileSavedFiltersStore(
        config.gallery_saved_filters_path ?? ".relay-data/gallery_saved_filters.json"
      );
  const patronFavoritesStore = useDbPatronEngagementStore(config)
    ? new DbPatronFavoritesStore(config.prisma!)
    : new FilePatronFavoritesStore(
        config.patron_favorites_store_path ?? ".relay-data/patron_favorites.json"
      );
  const patronCollectionsStore = useDbPatronEngagementStore(config)
    ? new DbPatronCollectionsStore(config.prisma!)
    : new FilePatronCollectionsStore(
        config.patron_collections_store_path ?? ".relay-data/patron_collections.json"
      );
  const collectionsStore = useDbCollectionsStore(config)
    ? new DbCollectionsStore(config.prisma!)
    : new FileCollectionsStore(config.collections_store_path ?? ".relay-data/collections.json");
  const layoutStore = useDbPageLayoutStore(config)
    ? new DbPageLayoutStore(config.prisma!)
    : new FilePageLayoutStore(config.page_layout_store_path ?? ".relay-data/page_layout.json");
  const galleryService = new GalleryService(canonicalStore, exportIndex, galleryOverridesStore);
  galleryService.setCollections(collectionsStore);
  const triageService = new TriageService(canonicalStore, exportIndex);
  const analyticsStore = useDbAnalyticsStore(config)
    ? new DbAnalyticsStore(config.prisma!)
    : new FileAnalyticsStore(config.analytics_store_path ?? ".relay-data/analytics.json");
  const actionCenterService = new ActionCenterService(
    analyticsStore,
    canonicalStore,
    eventBus,
    {
      confidence_threshold: config.analytics_confidence_threshold ?? 0.5
    }
  );
  const cloneStore = useDbCloneStore(config)
    ? new DbCloneSiteStore(config.prisma!)
    : new FileCloneSiteStore(config.clone_store_path ?? ".relay-data/clone_sites.json");
  const cloneService = new CloneService(canonicalStore, exportIndex, cloneStore);
  const identityStore = useDbIdentityStore(config)
    ? new DbIdentityStore(config.prisma!)
    : new FileIdentityStore(config.identity_store_path ?? ".relay-data/identity.json");
  const identityService = new IdentityService(identityStore);
  const exportRequireTierAccess =
    typeof config.export_require_tier_access === "boolean"
      ? config.export_require_tier_access
      : process.env.RELAY_EXPORT_REQUIRE_TIER_ACCESS === "1";
  const paymentStore = useDbPaymentStore(config)
    ? new DbPaymentStore(config.prisma!)
    : new FilePaymentStore(config.payment_store_path ?? ".relay-data/payments.json");
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
  const migrationStore = useDbMigrationStore(config)
    ? new DbMigrationStore(config.prisma!)
    : new FileMigrationStore(config.migration_store_path ?? ".relay-data/migrations.json");
  const campaignService = new CampaignService(migrationStore, eventBus);

  const deployStore = useDbDeployStore(config)
    ? new DbDeployStore(config.prisma!)
    : new FileDeployStore(config.deploy_store_path ?? ".relay-data/deploys.json");
  const deployAdapters = new Map<string, import("./deploy/deploy-adapter.js").DeployAdapterInterface>();
  deployAdapters.set("vercel", new VercelAdapter());
  deployAdapters.set("netlify", new NetlifyAdapter());
  const deployService = new DeployService(deployStore, cloneService, deployAdapters);

  const cookieStore = new FilePatreonCookieStore(
    config.cookie_store_path ?? ".relay-data/patreon_cookies.json",
    encryption
  );
  const watermarkStore = useDbSyncWatermarkStore(config)
    ? new DbSyncWatermarkStore(config.prisma!)
    : new SyncWatermarkStore(
        config.patreon_sync_watermark_path ?? ".relay-data/patreon_sync_watermarks.json"
      );
  const patreonSyncHealthStore = useDbPatreonSyncHealthStore(config)
    ? new DbPatreonSyncHealthStore(config.prisma!)
    : new PatreonSyncHealthStore(
        config.patreon_sync_health_path ?? ".relay-data/patreon_sync_health.json"
      );
  const patreonCampaignCreatorIndex = new PatreonCampaignCreatorIndex(patreonCampaignIndexPath);
  const patreonWebhookMetadataStore = new PatreonWebhookMetadataStore(
    patreonWebhookMetadataPath,
    encryption
  );
  const creatorCampaignDisplayStore = new CreatorCampaignDisplayStore(
    config.creator_campaign_display_path ?? ".relay-data/creator_campaign_display.json"
  );

  const patreonClient = new PatreonClient({
    client_id: required(config.patreon_client_id, "PATREON_CLIENT_ID"),
    client_secret: required(config.patreon_client_secret, "PATREON_CLIENT_SECRET"),
    token_url: config.patreon_token_url ?? "https://www.patreon.com/api/oauth2/token",
    fetch_impl: config.fetch_impl
  });
  const authService = new PatreonAuthService(patreonClient, tokenStore, eventBus);
  const patreonSyncService = new PatreonSyncService(
    tokenStore,
    cookieStore,
    ingestService,
    watermarkStore,
    authService,
    config.fetch_impl,
    exportService,
    identityService,
    patreonSyncHealthStore,
    creatorCampaignDisplayStore
  );
  const patreonMemberSyncCoordinator = new PatreonMemberSyncCoordinator(
    patreonSyncService,
    patreonSyncHealthStore,
    60_000
  );

  const publicWebhookBaseResolved =
    config.public_webhook_base_url?.trim() || resolvePublicWebhookBaseFromEnv();
  const publicWebhookBaseConfigured = Boolean(publicWebhookBaseResolved?.trim());
  if (!publicWebhookBaseConfigured) {
    // eslint-disable-next-line no-console -- intentional startup visibility for production misconfiguration
    console.warn(
      "[relay] RELAY_PUBLIC_WEBHOOK_BASE_URL is not set — Patreon platform webhooks cannot be registered. " +
        "Set RELAY_PUBLIC_WEBHOOK_BASE_URL (or PUBLIC_WEBHOOK_BASE_URL) to your public Relay API origin in production."
    );
  }

  const app = express();

  const patreonPlatformRawBody = express.raw({
    type: (req) =>
      String(req.headers["content-type"] ?? "")
        .toLowerCase()
        .includes("json"),
    limit: "6mb"
  });

  // PUBLIC: Patreon-signed platform webhook; authenticated by opaque URL token + x-patreon-signature (no session).
  app.post(
    "/api/v1/webhooks/patreon/platform/:opaqueToken",
    patreonPlatformRawBody,
    async (req: Request, res: Response) => {
      const traceId = traceIdFrom(req);
      const opaque =
        typeof req.params.opaqueToken === "string" ? req.params.opaqueToken.trim() : "";
      if (!opaque) {
        return res
          .status(400)
          .json(errorEnvelope("VALIDATION_ERROR", "Missing webhook token.", traceId));
      }
      const creatorId = await patreonWebhookMetadataStore.getCreatorIdForOpaqueToken(opaque);
      if (!creatorId) {
        return res
          .status(404)
          .json(errorEnvelope("NOT_FOUND", "Unknown webhook delivery token.", traceId));
      }
      const meta = await patreonWebhookMetadataStore.getByCreatorId(creatorId);
      const secret = meta
        ? patreonWebhookMetadataStore.decryptWebhookSecret(meta)
        : null;
      if (!secret) {
        return res.status(503).json(
          errorEnvelope(
            "WEBHOOK_NOT_READY",
            "Webhook is not registered or secret is missing. POST /api/v1/patreon/webhooks/register.",
            traceId
          )
        );
      }
      const raw = req.body;
      if (!Buffer.isBuffer(raw)) {
        return res
          .status(400)
          .json(errorEnvelope("VALIDATION_ERROR", "Expected raw JSON body.", traceId));
      }
      const sig = req.header("x-patreon-signature");
      if (!verifyPatreonWebhookSignature(raw, sig, secret)) {
        return res
          .status(401)
          .json(errorEnvelope("UNAUTHORIZED", "Invalid Patreon webhook signature.", traceId));
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw.toString("utf8"));
      } catch {
        return res
          .status(400)
          .json(errorEnvelope("VALIDATION_ERROR", "Invalid JSON body.", traceId));
      }
      const eventHeader = req.header("x-patreon-event");
      const campaignFromPayload = extractCampaignIdFromPatreonWebhookPayload(parsed);
      const ownership = await resolvePatreonWebhookCampaignOwnership({
        creatorIdFromRoute: creatorId,
        campaignNumericId: campaignFromPayload,
        fileIndexGetCreatorId: (id) => patreonCampaignCreatorIndex.getCreatorId(id),
        prisma: config.prisma
      });
      if (!ownership.ok) {
        return res.status(409).json(
          errorEnvelope(
            "WEBHOOK_CAMPAIGN_MISMATCH",
            ownership.reason === "creator_profile"
              ? "Campaign in webhook payload does not match CreatorProfile ownership for this delivery URL."
              : "Campaign in webhook payload does not match this delivery URL's creator.",
            traceId
          )
        );
      }
      try {
        await dispatchVerifiedPatreonPlatformPayload({
          creatorId,
          eventHeader,
          campaignId: campaignFromPayload,
          traceId,
          syncService: patreonSyncService,
          memberCoordinator: patreonMemberSyncCoordinator
        });
        return res.status(202).json(successEnvelope({ accepted: true }, traceId));
      } catch (err: unknown) {
        return res
          .status(502)
          .json(errorEnvelope("PATREON_WEBHOOK_ERROR", (err as Error).message, traceId));
      }
    }
  );

  app.use(express.json());
  app.use((req, res, next) => {
    // Echo Origin when present. `fetch(..., { credentials: "include" })` (GR-T0-1 session cookies)
    // requires a concrete Allow-Origin + Access-Control-Allow-Credentials — wildcard alone fails CORS.
    const origin = req.header("Origin")?.trim();
    if (origin) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Access-Control-Allow-Credentials", "true");
    } else {
      res.setHeader("Access-Control-Allow-Origin", "*");
    }
    res.setHeader(
      "Access-Control-Allow-Methods",
      "GET,HEAD,POST,PUT,PATCH,DELETE,OPTIONS"
    );
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Content-Type, X-Trace-Id, Authorization, X-Relay-Pipeline-Parity-Secret"
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
    <li><a href="/api/v1/health/ingest">GET /api/v1/health/ingest</a> — ingest + DLQ metrics (Workstream B)</li>
    <li><a href="/api/v1/health/part1a">GET /api/v1/health/part1a</a> — Part 1 A OAuth / token refresh gates</li>
    <li><a href="/api/v1/health/analytics">GET /api/v1/health/analytics</a> — insight job counters (Workstream E)</li>
    <li><a href="/api/v1/health/export">GET /api/v1/health/export</a> — export retrieval + integrity metrics (Workstream C)</li>
    <li><a href="/api/v1/health/platform">GET /api/v1/health/platform</a> — DB, OAuth, patron snapshots, Supabase sync counters (MIG-51)</li>
  </ul>
  <p>The <strong>gallery / Patreon connect UI</strong> is the Next.js app: run <code>npm run dev</code> in the <code>web/</code> folder (default <code>http://localhost:3000</code>).</p>
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

  app.get("/api/v1/health/ingest", async (req: Request, res: Response) => {
    const traceId = traceIdFrom(req);
    try {
      const pendingRetryJobs = ingestQueue.pendingCount();
      const dlqRecordCount = await dlq.count();
      const gates = await evaluateIngestHealthGates({
        pendingRetryJobs,
        dlqRecordCount
      });
      const status =
        gates.alerts.length > 0 ? ("degraded" as const) : ("ok" as const);
      return res.status(200).json(
        successEnvelope(
          {
            status,
            ...gates
          },
          traceId
        )
      );
    } catch (err) {
      return res.status(500).json(
        errorEnvelope(
          "INTERNAL_ERROR",
          err instanceof Error ? err.message : String(err),
          traceId
        )
      );
    }
  });

  app.get("/api/v1/health/part1a", (req: Request, res: Response) => {
    const traceId = traceIdFrom(req);
    const gates = evaluatePart1aGates();
    const status = gates.alerts.length > 0 ? ("degraded" as const) : ("ok" as const);
    return res.status(200).json(
      successEnvelope(
        {
          status,
          ...gates
        },
        traceId
      )
    );
  });

  app.get("/api/v1/health/analytics", (req: Request, res: Response) => {
    const traceId = traceIdFrom(req);
    const gates = evaluateInsightJobHealth();
    const status = gates.alerts.length > 0 ? ("degraded" as const) : ("ok" as const);
    return res.status(200).json(
      successEnvelope(
        {
          status,
          ...gates
        },
        traceId
      )
    );
  });

  app.get("/api/v1/health/export", (req: Request, res: Response) => {
    const traceId = traceIdFrom(req);
    const gates = evaluateExportRetrievalHealth();
    const status = gates.alerts.length > 0 ? ("degraded" as const) : ("ok" as const);
    return res.status(200).json(
      successEnvelope(
        {
          status,
          ...gates
        },
        traceId
      )
    );
  });

  /** MIG-51 — Operations scrape target: DB connections, OAuth health, patron snapshot age, auth route counters. */
  app.get("/api/v1/health/platform", async (req: Request, res: Response) => {
    const traceId = traceIdFrom(req);
    try {
      const payload = await evaluatePlatformOperationsHealth(config.prisma);
      return res.status(200).json(successEnvelope(payload, traceId));
    } catch (err) {
      return res.status(500).json(
        errorEnvelope(
          "INTERNAL_ERROR",
          err instanceof Error ? err.message : String(err),
          traceId
        )
      );
    }
  });

  /**
   * MT-011 / MT-034 — Issue signed Patreon OAuth `state` for `creator_id` bound to the Bearer session’s `Account`.
   * MT-034: `creator_id` must equal `Account.primaryRelayCreatorId` (provision via `POST /api/v1/creator/workspace`).
   * Client passes `state` to Patreon authorize and back to `POST /api/v1/auth/patreon/exchange` when
   * `RELAY_ENFORCE_CREATOR_OAUTH_BIND=1`.
   */
  app.post("/api/v1/auth/patreon/creator/prepare", async (req: Request, res: Response) => {
    const traceId = traceIdFrom(req);
    const body = (req.body ?? {}) as Record<string, unknown>;
    const details = validateRequiredFields(body, ["creator_id"]);
    if (details.length > 0) {
      return res
        .status(400)
        .json(errorEnvelope("VALIDATION_ERROR", "Invalid request payload.", traceId, details));
    }
    if (!getPatreonOAuthStateSecret()) {
      return res.status(503).json(
        errorEnvelope(
          "SERVICE_UNAVAILABLE",
          "RELAY_PATREON_OAUTH_STATE_SECRET must be set (min 16 characters) to issue OAuth state.",
          traceId
        )
      );
    }
    if (!config.prisma) {
      return res.status(503).json(
        errorEnvelope(
          "SERVICE_UNAVAILABLE",
          "Database required to bind OAuth state to an account.",
          traceId
        )
      );
    }
    const session = await requirePatronBearerSession(req, res, traceId);
    if (!session) {
      return;
    }
    const accountId = await getAccountIdForSession(config.prisma, session);
    if (!accountId) {
      return res
        .status(403)
        .json(errorEnvelope("FORBIDDEN", "Session is not linked to an account.", traceId));
    }
    const creatorId = String(body.creator_id).trim();
    const owns = await accountOwnsRelayCreatorId(config.prisma, accountId, creatorId);
    if (!owns) {
      return res.status(403).json(
        errorEnvelope(
          "FORBIDDEN",
          "creator_id does not match this account's studio. Call POST /api/v1/creator/workspace first.",
          traceId,
          [{ field: "creator_id", issue: "not_owned" }]
        )
      );
    }
    try {
      const { state, expiresAtIso } = signCreatorPatreonOAuthState({ accountId, creatorId });
      return res.status(200).json(
        successEnvelope(
          {
            state,
            creator_id: creatorId,
            expires_at: expiresAtIso
          },
          traceId
        )
      );
    } catch (e) {
      return res.status(503).json(
        errorEnvelope(
          "SERVICE_UNAVAILABLE",
          e instanceof Error ? e.message : String(e),
          traceId
        )
      );
    }
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

    const creatorId = String(body.creator_id).trim();

    if (relayEnvTruthy(process.env.RELAY_ENFORCE_CREATOR_OAUTH_BIND)) {
      if (!relayCreatorSecretBypassesOAuthBind(req)) {
        if (!config.prisma) {
          return res.status(503).json(
            errorEnvelope(
              "SERVICE_UNAVAILABLE",
              "Database required when RELAY_ENFORCE_CREATOR_OAUTH_BIND is enabled.",
              traceId
            )
          );
        }
        const session = await requirePatronBearerSession(req, res, traceId);
        if (!session) {
          return;
        }
        const accountId = await getAccountIdForSession(config.prisma, session);
        if (!accountId) {
          return res
            .status(403)
            .json(errorEnvelope("FORBIDDEN", "Session is not linked to an account.", traceId));
        }
        const stateRaw = typeof body.state === "string" ? body.state.trim() : "";
        if (!stateRaw) {
          return res.status(400).json(
            errorEnvelope("VALIDATION_ERROR", "Invalid request payload.", traceId, [
              { field: "state", issue: "missing" }
            ])
          );
        }
        const v = verifyCreatorPatreonOAuthState(stateRaw, accountId, creatorId);
        if (!v.ok) {
          return res.status(403).json(
            errorEnvelope(
              "FORBIDDEN",
              `OAuth state verification failed (${v.reason}).`,
              traceId
            )
          );
        }
        const ownsExchange = await accountOwnsRelayCreatorId(
          config.prisma,
          accountId,
          creatorId
        );
        if (!ownsExchange) {
          return res.status(403).json(
            errorEnvelope(
              "FORBIDDEN",
              "creator_id does not match this account's studio.",
              traceId,
              [{ field: "creator_id", issue: "not_owned" }]
            )
          );
        }
      }
    }

    try {
      const result = await authService.exchangeCodeAndPersist(
        creatorId,
        body.code as string,
        body.redirect_uri as string,
        traceId
      );

      let patreonCampaignId: string | null = null;
      let campaignDiscoveryError: string | null = null;
      let attemptedCampaignSync = false;

      if (config.prisma && useDbCreatorOAuthStore(config)) {
        const tokens = await tokenStore.getByCreatorId(creatorId);
        if (tokens?.access_token) {
          attemptedCampaignSync = true;
          try {
            const snap = await syncCreatorProfilePatreonCampaignFromOAuthToken({
              prisma: config.prisma,
              relayCreatorId: creatorId,
              accessToken: tokens.access_token,
              fetchImpl: config.fetch_impl ?? globalThis.fetch
            });
            patreonCampaignId = snap.patreonCampaignId;
            if (snap.patreonCampaignId == null) {
              campaignDiscoveryError =
                "No single Patreon campaign resolved — choose a default campaign before webhooks can be registered.";
            }
          } catch (e) {
            campaignDiscoveryError = e instanceof Error ? e.message : String(e);
          }
        }
      }

      const shouldRunWebhookEnsure = !attemptedCampaignSync || patreonCampaignId != null;

      let webhookResult: EnsureWebhookResult | null = null;
      if (shouldRunWebhookEnsure) {
        try {
          webhookResult = await ensurePatreonPlatformWebhook({
            creatorId: creatorId.trim(),
            tokenStore,
            webhookMetaStore: patreonWebhookMetadataStore,
            campaignIndex: patreonCampaignCreatorIndex,
            publicWebhookBaseUrl: publicWebhookBaseResolved,
            fetchImpl: config.fetch_impl ?? globalThis.fetch,
            prisma: config.prisma,
            tokenEncryption: encryption
          });
        } catch {
          webhookResult = null;
        }
      }

      const payload = {
        ...result,
        ...(patreonCampaignId != null ? { patreon_campaign_id: patreonCampaignId } : {}),
        ...(campaignDiscoveryError != null ? { campaign_discovery_error: campaignDiscoveryError } : {}),
        webhook: webhookResult
          ? webhookResult.ok
            ? {
                status: "ok" as const,
                webhook_id: webhookResult.webhook_id,
                uri: webhookResult.uri
              }
            : {
                status: "failed" as const,
                reason: webhookResult.reason,
                detail: webhookResult.detail
              }
          : { status: "skipped" as const }
      };
      return res.status(200).json(successEnvelope(payload, traceId));
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
  // PUBLIC: Patreon OAuth redirect callback; issues session on success (no prior session required).
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
      setSessionCookie(res, session.token, { expiresAtIso: session.expires_at });
      await setActiveRoleCookieForNewSession(res, config.prisma, session, session.expires_at);
      return res.status(200).json(
        successEnvelope(
          applyDualWriteToken({
            token: session.token,
            user_id: session.user_id,
            tier_ids: session.tier_ids,
            expires_at: session.expires_at,
            auth_provider: user.auth_provider,
            patreon_user_id: user.patreon_user_id
          }),
          traceId
        )
      );
    } catch (error) {
      if (error instanceof PatreonAccountLinkConflictError) {
        return res
          .status(409)
          .json(errorEnvelope("CONFLICT", (error as Error).message, traceId));
      }
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
        probe_upstream: probeUpstream,
        traceId
      });
      const whMeta = await patreonWebhookMetadataStore.getByCreatorId(creatorId);
      return res.status(200).json(
        successEnvelope(
          {
            ...state,
            webhook_registration: patreonWebhookMetadataStore.getPublicSummary(whMeta),
            public_webhook_base_configured: publicWebhookBaseConfigured
          },
          traceId
        )
      );
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

    if (
      !(await assertCreatorRelayMutationAllowed(
        req,
        res,
        traceId,
        config.prisma,
        creatorId.trim()
      ))
    ) {
      return;
    }

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
      if (!dryRun) {
        const idx = await patreonCampaignCreatorIndex.upsert(
          result.patreon_campaign_id,
          creatorId.trim()
        );
        if (!idx.ok) {
          // eslint-disable-next-line no-console -- ops visibility for multi-tenant safety
          console.warn(
            `[patreon] campaign index collision: campaign=${result.patreon_campaign_id} ` +
              `creator=${creatorId} existing_creator=${idx.existing_creator_id}`
          );
        }
        if (config.prisma) {
          try {
            await ensureCreatorProfilePatreonCampaignId(config.prisma, {
              relayCreatorId: creatorId.trim(),
              patreonCampaignId: result.patreon_campaign_id
            });
          } catch {
            /* best-effort — profile may not exist for file-only flows */
          }
        }
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
    const syncCreatorId = (body.creator_id as string).trim();
    if (
      !(await assertCreatorRelayMutationAllowed(
        req,
        res,
        traceId,
        config.prisma,
        syncCreatorId
      ))
    ) {
      return;
    }
    try {
      const result = await patreonSyncService.syncMembers(
        body.creator_id as string,
        {
          campaign_id: typeof body.campaign_id === "string" ? body.campaign_id.trim() : undefined,
          max_pages: typeof body.max_pages === "number" ? body.max_pages : undefined,
          traceId
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
      const idx = await patreonCampaignCreatorIndex.upsert(
        result.patreon_campaign_id,
        (body.creator_id as string).trim()
      );
      if (!idx.ok) {
        // eslint-disable-next-line no-console -- ops visibility for multi-tenant safety
        console.warn(
          `[patreon] campaign index collision: campaign=${result.patreon_campaign_id} ` +
            `creator=${body.creator_id} existing_creator=${idx.existing_creator_id}`
        );
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

  app.post("/api/v1/patreon/webhooks/register", async (req: Request, res: Response) => {
    const traceId = traceIdFrom(req);
    const body = (req.body ?? {}) as Record<string, unknown>;
    const details = validateRequiredFields(body, ["creator_id"]);
    if (details.length > 0) {
      return res
        .status(400)
        .json(errorEnvelope("VALIDATION_ERROR", "Invalid request payload.", traceId, details));
    }
    const creatorId = (body.creator_id as string).trim();
    if (
      !(await assertCreatorRelayMutationAllowed(
        req,
        res,
        traceId,
        config.prisma,
        creatorId
      ))
    ) {
      return;
    }
    try {
      const result = await ensurePatreonPlatformWebhook({
        creatorId,
        tokenStore,
        webhookMetaStore: patreonWebhookMetadataStore,
        campaignIndex: patreonCampaignCreatorIndex,
        publicWebhookBaseUrl: publicWebhookBaseResolved,
        fetchImpl: config.fetch_impl ?? globalThis.fetch,
        prisma: config.prisma,
        tokenEncryption: encryption
      });
      if (!result.ok) {
        if (result.reason === "no_public_base") {
          return res.status(400).json(
            errorEnvelope(
              "CONFIG_ERROR",
              "Set RELAY_PUBLIC_WEBHOOK_BASE_URL (or public_webhook_base_url) to your public Relay API origin.",
              traceId
            )
          );
        }
        if (result.reason === "no_tokens") {
          return res.status(404).json(errorEnvelope("NOT_FOUND", "No Patreon tokens for creator.", traceId));
        }
        if (result.reason === "multi_campaign") {
          return res.status(409).json(
            errorEnvelope(
              "AMBIGUOUS_CAMPAIGN",
              result.detail ??
                "Multiple Patreon campaigns — set a default campaign before registering webhooks.",
              traceId
            )
          );
        }
        return res.status(502).json(
          errorEnvelope("PATREON_WEBHOOK_REGISTER_ERROR", result.detail ?? "Registration failed.", traceId)
        );
      }
      return res.status(200).json(
        successEnvelope(
          { creator_id: creatorId, webhook_id: result.webhook_id, uri: result.uri },
          traceId
        )
      );
    } catch (err: unknown) {
      return res
        .status(502)
        .json(errorEnvelope("PATREON_WEBHOOK_REGISTER_ERROR", (err as Error).message, traceId));
    }
  });

  app.post("/api/v1/webhooks/patreon", async (req: Request, res: Response) => {
    const traceId = traceIdFrom(req);
    const body = (req.body ?? {}) as Record<string, unknown>;
    try {
      const result = await processPatreonWebhookStub(
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
    // When DB is configured, refuse to store a cookie under a `creator_id` that doesn't
    // map to a real Tenant. This prevents the legacy `dev_creator` placeholder (and any
    // other typos) from silently saving a cookie that the scrape will never look up.
    if (config.prisma) {
      const known = await relayCreatorIdExists(config.prisma, creatorId);
      if (!known) {
        return res.status(404).json(
          errorEnvelope(
            "UNKNOWN_CREATOR_ID",
            "creator_id does not match any provisioned studio. Call POST /api/v1/creator/workspace first to provision your relay_creator_id, then retry.",
            traceId,
            [{ field: "creator_id", issue: "unknown" }]
          )
        );
      }
    }
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

    if (
      !(await assertCreatorRelayMutationAllowed(
        req,
        res,
        traceId,
        config.prisma,
        parsed.batch.creator_id
      ))
    ) {
      return;
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
    recordExportMediaAttempt();
    const exportCreatorId = (body.creator_id as string).trim();
    if (
      !(await assertCreatorRelayMutationAllowed(
        req,
        res,
        traceId,
        config.prisma,
        exportCreatorId
      ))
    ) {
      return;
    }
    try {
      const result = await exportService.exportMedia(
        exportCreatorId,
        body.media_id as string
      );
      recordExportMediaSuccess();
      return res.status(200).json(successEnvelope(result, traceId));
    } catch (error) {
      recordExportMediaFailure();
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
    const matCreatorId = (body.creator_id as string).trim();
    if (
      !(await assertCreatorRelayMutationAllowed(
        req,
        res,
        traceId,
        config.prisma,
        matCreatorId
      ))
    ) {
      return;
    }
    const result = await exportService.materializeManifests(matCreatorId);
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
    const verifyCreatorId = (body.creator_id as string).trim();
    if (
      !(await assertCreatorRelayMutationAllowed(
        req,
        res,
        traceId,
        config.prisma,
        verifyCreatorId
      ))
    ) {
      return;
    }
    try {
      const match = await exportService.verifyIntegrity(
        verifyCreatorId,
        body.media_id as string
      );
      recordVerifyResult(match);
      return res.status(200).json(successEnvelope({ match }, traceId));
    } catch {
      recordVerifyResult(false);
      return res.status(200).json(successEnvelope({ match: false }, traceId));
    }
  });

  app.post("/api/v1/export/integrity-sample", async (req: Request, res: Response) => {
    const traceId = traceIdFrom(req);
    const body = (req.body ?? {}) as Record<string, unknown>;
    const details = validateRequiredFields(body, ["creator_id"]);
    if (details.length > 0) {
      return res
        .status(400)
        .json(errorEnvelope("VALIDATION_ERROR", "Invalid request.", traceId, details));
    }
    const creatorId = body.creator_id as string;
    if (
      !(await assertCreatorRelayMutationAllowed(
        req,
        res,
        traceId,
        config.prisma,
        creatorId.trim()
      ))
    ) {
      return;
    }
    const limitRaw = body.limit;
    const limit =
      typeof limitRaw === "number"
        ? limitRaw
        : typeof limitRaw === "string"
          ? Number.parseInt(limitRaw, 10)
          : 10;
    const capped = Math.min(Math.max(1, Number.isFinite(limit) ? limit : 10), 50);
    try {
      const sample = await exportService.sampleIntegrityChecks(creatorId, capped);
      const fail = sample.mismatched.length;
      const ok = sample.matched;
      recordIntegritySampleResults(ok, fail);
      return res.status(200).json(
        successEnvelope(
          {
            creator_id: creatorId,
            limit_requested: capped,
            checked: sample.checked,
            matched: sample.matched,
            mismatched: sample.mismatched
          },
          traceId
        )
      );
    } catch (err) {
      return res.status(500).json(
        errorEnvelope(
          "INTEGRITY_SAMPLE_ERROR",
          err instanceof Error ? err.message : String(err),
          traceId
        )
      );
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
        recordContentDeliveryFailure();
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
          recordContentDeliveryFailure();
          return res
            .status(403)
            .json(errorEnvelope("FORBIDDEN", gate.reason, traceId));
        }
      }
      const bytes = await exportService.readBlob(req.params.creator_id, req.params.media_id);
      recordContentDeliverySuccess();
      const mime = record.mime_type ?? "application/octet-stream";
      res.setHeader("content-type", mime);
      res.setHeader("cache-control", "public, max-age=3600");
      res.setHeader("etag", `"${record.sha256}"`);
      return res.status(200).send(bytes);
    } catch (error) {
      recordContentDeliveryFailure();
      return res
        .status(404)
        .json(errorEnvelope("NOT_FOUND", (error as Error).message, traceId));
    }
  });

  /** Blurred, resized still for visitor tier teasers — no patron tier check; denied when row is hidden. */
  app.get("/api/v1/export/media/:creator_id/:media_id/preview", async (req, res) => {
    const traceId = traceIdFrom(req);
    try {
      const creatorId = req.params.creator_id;
      const mediaId = req.params.media_id;
      const record = await exportService.getExportRecord(creatorId, mediaId);
      if (!record) {
        recordPreviewDeliveryFailure();
        return res
          .status(404)
          .json(errorEnvelope("NOT_FOUND", "Exported media not found.", traceId));
      }
      const snapshot = await canonicalStore.load();
      const overrides = await galleryOverridesStore.load();
      const postId = findPostIdForExportedMedia(snapshot, creatorId, mediaId);
      if (!postId) {
        recordPreviewDeliveryFailure();
        return res.status(404).json(errorEnvelope("NOT_FOUND", "Post not found.", traceId));
      }
      const vis = resolveGalleryItemVisibility(creatorId, postId, mediaId, overrides);
      if (vis === "hidden") {
        recordPreviewDeliveryFailure();
        return res.status(404).json(errorEnvelope("NOT_FOUND", "Not found.", traceId));
      }
      const bytes = await exportService.readBlob(creatorId, mediaId);
      const mime = record.mime_type ?? "application/octet-stream";
      const preview = await buildVisitorPreviewImage(bytes, mime);
      if (!preview) {
        recordPreviewDeliveryFailure();
        return res
          .status(415)
          .json(
            errorEnvelope(
              "PREVIEW_UNSUPPORTED",
              "Preview not available for this media type or processing failed.",
              traceId
            )
          );
      }
      recordPreviewDeliverySuccess();
      res.setHeader("content-type", "image/jpeg");
      res.setHeader("cache-control", "public, max-age=600");
      return res.status(200).send(preview);
    } catch (error) {
      recordPreviewDeliveryFailure();
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

  /** MIG-41 — Tier permission for a canonical post (Bearer session optional). */
  app.get("/api/v1/patron/permission/post", async (req: Request, res: Response) => {
    const traceId = traceIdFrom(req);
    const creatorId = typeof req.query.creator_id === "string" ? req.query.creator_id.trim() : "";
    const postId = typeof req.query.post_id === "string" ? req.query.post_id.trim() : "";
    const details: { field: string; issue: string }[] = [];
    if (!creatorId) details.push({ field: "creator_id", issue: "missing" });
    if (!postId) details.push({ field: "post_id", issue: "missing" });
    if (details.length > 0) {
      return res
        .status(400)
        .json(errorEnvelope("VALIDATION_ERROR", "creator_id and post_id are required.", traceId, details));
    }
    const bearer = req.header("authorization")?.replace(/^Bearer\s+/i, "").trim() ?? "";
    const session = bearer ? await identityService.resolveSession(bearer) : null;
    const snapshot = await canonicalStore.load();
    const perm = evaluatePostPermission({ snapshot, creatorId, postId, session });
    if (!perm) {
      return res.status(404).json(errorEnvelope("NOT_FOUND", "Post not found.", traceId));
    }
    res.setHeader("Cache-Control", "private, no-store");
    return res.status(200).json(successEnvelope(perm, traceId));
  });

  /** MIG-42 — Patron entitlement freshness vs last DB snapshot (Bearer required). */
  app.get("/api/v1/patron/entitlements/health", async (req: Request, res: Response) => {
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
    if (!(await requirePatronForCreatorId(req, res, traceId, session, creatorId))) {
      return;
    }
    const prisma = config.prisma;
    if (!prisma) {
      const payload = buildPatronEntitlementHealthPayload({ storage: "file", row: null });
      res.setHeader("Cache-Control", "private, no-store");
      return res.status(200).json(successEnvelope(payload, traceId));
    }
    const row = await prisma.patronEntitlementSnapshot.findUnique({
      where: {
        patronMembershipId_relayCreatorId: {
          patronMembershipId: session.user_id,
          relayCreatorId: creatorId
        }
      },
      select: { asOf: true, staleAfter: true }
    });
    const payload = buildPatronEntitlementHealthPayload({
      storage: "postgres",
      row
    });
    if (payload.degraded) {
      res.setHeader("X-Relay-Entitlement-Degraded", "1");
    }
    res.setHeader("Cache-Control", "private, no-store");
    return res.status(200).json(successEnvelope(payload, traceId));
  });

  function parsePatronFavoriteTargetKind(raw: unknown): PatronFavoriteTargetKind | null {
    if (raw === "post" || raw === "media") {
      return raw;
    }
    return null;
  }

  /**
   * Bearer **opaque** Relay session (Prisma `Session`) — not a Supabase JWT.
   * Session strategy: `docs/architecture/multi-tenant-cloud-runtime.md` § Identity and sessions (MIG-13).
   */
  async function requirePatronBearerSession(
    req: Request,
    res: Response,
    traceId: string
  ): Promise<SessionToken | null> {
    const bearer = req.header("authorization")?.replace(/^Bearer\s+/i, "").trim() ?? "";
    const fromCookie = readSessionCookie(req)?.trim() ?? "";
    const opaque = bearer || fromCookie;
    if (!opaque) {
      res
        .status(401)
        .json(errorEnvelope("AUTH_ERROR", "Bearer token required.", traceId));
      return null;
    }
    const session = await identityService.resolveSession(opaque);
    if (!session) {
      res
        .status(401)
        .json(errorEnvelope("AUTH_ERROR", "Invalid or expired session.", traceId));
      return null;
    }
    if (config.prisma) {
      await applyRelayAccountRlsIfPresent(config.prisma, session);
    }
    return session;
  }

  /** MT-009 — multi-membership allowlist vs single `session.creator_id`. */
  async function requirePatronForCreatorId(
    req: Request,
    res: Response,
    traceId: string,
    session: SessionToken,
    creatorId: string
  ): Promise<boolean> {
    const ctx = await loadPatronAuthContext(config.prisma ?? null, session);
    if (!patronMayAccessCreator(ctx, creatorId)) {
      res
        .status(403)
        .json(
          errorEnvelope(
            "FORBIDDEN",
            "Session is not entitled for this creator.",
            traceId
          )
        );
      return false;
    }
    return true;
  }

  /**
   * Tier 1.1-FUP — When Postgres identity is enabled, require an Account-linked session whose
   * `primaryRelayCreatorId` matches the route creator scope. File-backed integration tests skip
   * enforcement (`config.prisma` unset).
   */
  async function requireAccountMatchesCreator(
    req: Request,
    res: Response,
    traceId: string,
    relayCreatorId: string
  ): Promise<boolean> {
    if (!config.prisma) {
      return true;
    }
    try {
      const { context } = await requireAccount(req, {
        prisma: config.prisma,
        identityService
      });
      const want = relayCreatorId.trim();
      const got = context.primaryRelayCreatorId?.trim() ?? "";
      if (!got || got !== want) {
        res.status(403).json(
          errorEnvelope(
            "FORBIDDEN",
            "creator_id does not match the authenticated creator account.",
            traceId
          )
        );
        return false;
      }
      return true;
    } catch (err) {
      if (sendRelayAuthError(res, err, traceId)) return false;
      throw err;
    }
  }

  /**
   * MT-009 — Introspection: which `relay_creator_id` values this patron session may use.
   * Requires Postgres (`RELAY_DB_STORE_IDENTITY`).
   */
  app.get("/api/v1/me/patron-auth", async (req: Request, res: Response) => {
    const traceId = traceIdFrom(req);
    const session = await requirePatronBearerSession(req, res, traceId);
    if (!session) {
      return;
    }
    if (!config.prisma) {
      return res.status(503).json(
        errorEnvelope(
          "SERVICE_UNAVAILABLE",
          "Database required for membership allowlist.",
          traceId
        )
      );
    }
    const ctx = await loadPatronAuthContext(config.prisma, session);
    res.setHeader("Cache-Control", "private, no-store");
    return res.status(200).json(
      successEnvelope(
        {
          account_id: ctx.accountId,
          allowed_relay_creator_ids: [...ctx.allowedRelayCreatorIds],
          session_membership_id: session.user_id,
          session_creator_id: session.creator_id
        },
        traceId
      )
    );
  });

  /**
   * Current opaque Bearer session + linked `UserAccount` (email) for patron/creator Library clients.
   */
  app.get("/api/v1/me/session", async (req: Request, res: Response) => {
    const traceId = traceIdFrom(req);
    const session = await requirePatronBearerSession(req, res, traceId);
    if (!session) {
      return;
    }
    const user = await identityStore.getUser(session.user_id);
    res.setHeader("Cache-Control", "private, no-store");
    return res.status(200).json(
      successEnvelope(
        {
          user_id: session.user_id,
          creator_id: session.creator_id,
          email: user?.email ?? null,
          auth_provider: user?.auth_provider ?? null,
          patreon_user_id: user?.patreon_user_id ?? null,
          expires_at: session.expires_at
        },
        traceId
      )
    );
  });

  /**
   * MT-032 — Idempotent artist studio: `Tenant` + creator `User` + `CreatorProfile`; sets
   * `Account.primaryRelayCreatorId`. Requires opaque Bearer session with `Account`-backed membership.
   */
  app.post("/api/v1/creator/workspace", async (req: Request, res: Response) => {
    const traceId = traceIdFrom(req);
    if (!config.prisma) {
      return res.status(503).json(
        errorEnvelope("SERVICE_UNAVAILABLE", "Database not configured.", traceId)
      );
    }
    const session = await requirePatronBearerSession(req, res, traceId);
    if (!session) {
      return;
    }
    const accountId = await getAccountIdForSession(config.prisma, session);
    if (!accountId) {
      return res
        .status(403)
        .json(errorEnvelope("FORBIDDEN", "Session is not linked to an account.", traceId));
    }
    try {
      const result = await provisionCreatorWorkspace(config.prisma, accountId);
      return res.status(result.created ? 201 : 200).json(
        successEnvelope(
          {
            relay_creator_id: result.relay_creator_id,
            account_id: result.account_id,
            created: result.created,
            public_slug: result.public_slug
          },
          traceId
        )
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("Account not found")) {
        return res.status(404).json(errorEnvelope("NOT_FOUND", msg, traceId));
      }
      return res.status(500).json(errorEnvelope("INTERNAL_ERROR", msg, traceId));
    }
  });

  /**
   * Current studio's public URL slug (`/patron/c/{public_slug}`).
   */
  app.get("/api/v1/creator/public-slug", async (req: Request, res: Response) => {
    const traceId = traceIdFrom(req);
    if (!config.prisma) {
      return res.status(503).json(
        errorEnvelope("SERVICE_UNAVAILABLE", "Database not configured.", traceId)
      );
    }
    const session = await requirePatronBearerSession(req, res, traceId);
    if (!session) {
      return;
    }
    const accountId = await getAccountIdForSession(config.prisma, session);
    if (!accountId) {
      return res
        .status(403)
        .json(errorEnvelope("FORBIDDEN", "Session is not linked to an account.", traceId));
    }
    const account = await config.prisma.account.findUnique({
      where: { id: accountId },
      select: { primaryRelayCreatorId: true }
    });
    const relayId = account?.primaryRelayCreatorId?.trim();
    if (!relayId) {
      return res.status(404).json(
        errorEnvelope("NOT_FOUND", "No creator studio — call POST /api/v1/creator/workspace first.", traceId)
      );
    }
    const prof = await config.prisma.creatorProfile.findFirst({
      where: { tenant: { relayCreatorId: relayId } },
      select: { publicSlug: true }
    });
    if (!prof) {
      return res.status(404).json(errorEnvelope("NOT_FOUND", "Creator profile missing.", traceId));
    }
    res.setHeader("Cache-Control", "private, no-store");
    return res.status(200).json(successEnvelope({ public_slug: prof.publicSlug }, traceId));
  });

  /**
   * Change public slug (reserved words and uniqueness enforced).
   */
  app.patch("/api/v1/creator/public-slug", async (req: Request, res: Response) => {
    const traceId = traceIdFrom(req);
    if (!config.prisma) {
      return res.status(503).json(
        errorEnvelope("SERVICE_UNAVAILABLE", "Database not configured.", traceId)
      );
    }
    const session = await requirePatronBearerSession(req, res, traceId);
    if (!session) {
      return;
    }
    const body = (req.body ?? {}) as Record<string, unknown>;
    const raw =
      typeof body.public_slug === "string"
        ? body.public_slug.trim().toLowerCase()
        : typeof body.slug === "string"
          ? body.slug.trim().toLowerCase()
          : "";
    const v = validatePublicSlugFormat(raw);
    if (!v.ok) {
      return res.status(400).json(
        errorEnvelope("VALIDATION_ERROR", v.message, traceId, [{ field: "public_slug", issue: "invalid" }])
      );
    }
    const accountId = await getAccountIdForSession(config.prisma, session);
    if (!accountId) {
      return res
        .status(403)
        .json(errorEnvelope("FORBIDDEN", "Session is not linked to an account.", traceId));
    }
    const account = await config.prisma.account.findUnique({
      where: { id: accountId },
      select: { primaryRelayCreatorId: true }
    });
    const relayId = account?.primaryRelayCreatorId?.trim();
    if (!relayId) {
      return res.status(404).json(
        errorEnvelope("NOT_FOUND", "No creator studio — call POST /api/v1/creator/workspace first.", traceId)
      );
    }
    const prof = await config.prisma.creatorProfile.findFirst({
      where: { tenant: { relayCreatorId: relayId } },
      select: { id: true }
    });
    if (!prof) {
      return res.status(404).json(errorEnvelope("NOT_FOUND", "Creator profile missing.", traceId));
    }
    const taken = await config.prisma.creatorProfile.findFirst({
      where: { publicSlug: raw, NOT: { id: prof.id } },
      select: { id: true }
    });
    if (taken) {
      return res.status(409).json(
        errorEnvelope("CONFLICT", "That slug is already taken.", traceId, [
          { field: "public_slug", issue: "taken" }
        ])
      );
    }
    await config.prisma.creatorProfile.update({
      where: { id: prof.id },
      data: { publicSlug: raw }
    });
    res.setHeader("Cache-Control", "private, no-store");
    return res.status(200).json(successEnvelope({ public_slug: raw }, traceId));
  });

  /**
   * Resolve a public creator slug (no auth). Used by `/patron/c/[handle]` and share links.
   */
  app.get("/api/v1/public/creators/:slug", async (req: Request, res: Response) => {
    const traceId = traceIdFrom(req);
    if (!config.prisma) {
      return res.status(503).json(
        errorEnvelope("SERVICE_UNAVAILABLE", "Database not configured.", traceId)
      );
    }
    const raw = typeof req.params.slug === "string" ? req.params.slug.trim() : "";
    const resolved = await resolveTenantBySlug(raw, config.prisma);
    if (!resolved) {
      return res.status(404).json(errorEnvelope("NOT_FOUND", "Unknown creator.", traceId));
    }
    res.setHeader("Cache-Control", "public, max-age=60, s-maxage=60");
    return res.status(200).json(
      successEnvelope(
        {
          public_slug: resolved.publicSlug ?? "",
          relay_creator_id: resolved.relayCreatorId
        },
        traceId
      )
    );
  });

  /**
   * Patron home (fan Relay): feed + sidebar bundle. Requires Bearer session from patron OAuth.
   * Payload is fixture-shaped JSON until DB-backed aggregation exists (`web/lib/patron-relay-feed-bundle.json`).
   */
  app.get("/api/v1/patron/relay_feed", async (req: Request, res: Response) => {
    const traceId = traceIdFrom(req);
    if (!(await requirePatronBearerSession(req, res, traceId))) {
      return;
    }
    try {
      const data = loadPatronRelayFeedBundleFromRepo();
      res.setHeader("Cache-Control", "private, no-store");
      return res.status(200).json(successEnvelope(data, traceId));
    } catch (error) {
      return res
        .status(500)
        .json(errorEnvelope("INTERNAL", (error as Error).message, traceId));
    }
  });

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
    if (!(await requirePatronForCreatorId(req, res, traceId, session, creatorId))) {
      return;
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
    if (!(await requirePatronForCreatorId(req, res, traceId, session, creatorId))) {
      return;
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
    if (!(await requirePatronForCreatorId(req, res, traceId, session, creatorId))) {
      return;
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
    if (!(await requirePatronForCreatorId(req, res, traceId, session, creatorId))) {
      return;
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
    if (!(await requirePatronForCreatorId(req, res, traceId, session, creatorId))) {
      return;
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
    if (!(await requirePatronForCreatorId(req, res, traceId, session, creatorId))) {
      return;
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
    if (!(await requirePatronForCreatorId(req, res, traceId, session, creatorId))) {
      return;
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
    if (!(await requirePatronForCreatorId(req, res, traceId, session, creatorId))) {
      return;
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
    if (!(await requirePatronForCreatorId(req, res, traceId, session, creatorId))) {
      return;
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
    if (!(await requireAccountMatchesCreator(req, res, traceId, creatorId.trim()))) {
      return;
    }
    if (
      !(await assertCreatorRelayMutationAllowed(
        req,
        res,
        traceId,
        config.prisma,
        creatorId.trim()
      ))
    ) {
      return;
    }

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
    if (!(await requireAccountMatchesCreator(req, res, traceId, creatorId))) {
      return;
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
    const cid = body.creator_id as string;
    if (!(await requireAccountMatchesCreator(req, res, traceId, cid))) {
      return;
    }
    const created = await savedFiltersStore.create(
      cid,
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
    if (!(await requireAccountMatchesCreator(req, res, traceId, creatorId))) {
      return;
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
    const triageCid = body.creator_id as string;
    if (!(await requireAccountMatchesCreator(req, res, traceId, triageCid))) {
      return;
    }
    const result = await triageService.analyze(triageCid);
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
    const autoCid = body.creator_id as string;
    if (!(await requireAccountMatchesCreator(req, res, traceId, autoCid))) {
      return;
    }
    const result = await triageService.autoFlag(
      autoCid,
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
    if (!(await requireAccountMatchesCreator(req, res, traceId, creatorId))) {
      return;
    }
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
    if (
      !parseQueryTruthy(req.query.visitor) &&
      !(await requireAccountMatchesCreator(req, res, traceId, creatorId))
    ) {
      return;
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
    const collCid = body.creator_id as string;
    if (!(await requireAccountMatchesCreator(req, res, traceId, collCid))) {
      return;
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
      collCid,
      body.title as string,
      typeof body.description === "string" ? body.description : undefined,
      Object.keys(extras).length > 0 ? extras : undefined
    );
    return res.status(201).json(successEnvelope(created, traceId));
  });

  app.patch("/api/v1/gallery/collections/:collection_id", async (req: Request, res: Response) => {
    const traceId = traceIdFrom(req);
    const existingCol = await collectionsStore.getById(req.params.collection_id);
    if (!existingCol) {
      return res.status(404).json(errorEnvelope("NOT_FOUND", "Collection not found.", traceId));
    }
    if (!(await requireAccountMatchesCreator(req, res, traceId, existingCol.creator_id))) {
      return;
    }
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
    const colDel = await collectionsStore.getById(req.params.collection_id);
    if (!colDel) {
      return res.status(404).json(errorEnvelope("NOT_FOUND", "Collection not found.", traceId));
    }
    if (!(await requireAccountMatchesCreator(req, res, traceId, colDel.creator_id))) {
      return;
    }
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
    if (!(await requireAccountMatchesCreator(req, res, traceId, col.creator_id))) {
      return;
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
    const colRm = await collectionsStore.getById(req.params.collection_id);
    if (!colRm) {
      return res.status(404).json(errorEnvelope("NOT_FOUND", "Collection not found.", traceId));
    }
    if (!(await requireAccountMatchesCreator(req, res, traceId, colRm.creator_id))) {
      return;
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
    const reorderCid = body.creator_id as string;
    if (!(await requireAccountMatchesCreator(req, res, traceId, reorderCid))) {
      return;
    }
    await collectionsStore.reorder(reorderCid, ordered as string[]);
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
    if (!(await requireAccountMatchesCreator(req, res, traceId, creatorId))) {
      return;
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
    const layoutCid = body.creator_id as string;
    if (!(await requireAccountMatchesCreator(req, res, traceId, layoutCid))) {
      return;
    }
    await layoutStore.save(layoutCid, body as never);
    const layout = await layoutStore.load(layoutCid);
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
    const secCid = body.creator_id as string;
    if (!(await requireAccountMatchesCreator(req, res, traceId, secCid))) {
      return;
    }
    const section = await layoutStore.addSection(secCid, {
      title: body.title as string,
      source: (body.source as never) ?? { type: "manual", post_ids: [] },
      layout: (body.layout as "grid" | "masonry" | "list" | "featured") ?? "grid",
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
    if (!(await requireAccountMatchesCreator(req, res, traceId, creatorId))) {
      return;
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
    if (!(await requireAccountMatchesCreator(req, res, traceId, creatorId))) {
      return;
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
    const layoutReorderCid = body.creator_id as string;
    if (!(await requireAccountMatchesCreator(req, res, traceId, layoutReorderCid))) {
      return;
    }
    await layoutStore.reorderSections(layoutReorderCid, ordered as string[]);
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
    if (!(await requireAccountMatchesCreator(req, res, traceId, creatorId.trim()))) {
      return;
    }
    if (
      !(await assertCreatorRelayMutationAllowed(
        req,
        res,
        traceId,
        config.prisma,
        creatorId.trim()
      ))
    ) {
      return;
    }
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
    const analyticsCreatorId = (body.creator_id as string).trim();
    if (!(await requireAccountMatchesCreator(req, res, traceId, analyticsCreatorId))) {
      return;
    }
    if (
      !(await assertCreatorRelayMutationAllowed(
        req,
        res,
        traceId,
        config.prisma,
        analyticsCreatorId
      ))
    ) {
      return;
    }
    recordAnalyticsGenerateAttempt();
    try {
      const result = await actionCenterService.generateAndStore(
        analyticsCreatorId,
        traceId
      );
      recordAnalyticsGenerateSuccess();
      return res.status(200).json(successEnvelope(result, traceId));
    } catch (err) {
      recordAnalyticsGenerateFailure();
      return res.status(500).json(
        errorEnvelope(
          "ANALYTICS_GENERATE_ERROR",
          err instanceof Error ? err.message : String(err),
          traceId
        )
      );
    }
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
    if (!(await requireAccountMatchesCreator(req, res, traceId, creatorId))) {
      return;
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
      const accCid = body.creator_id as string;
      if (!(await requireAccountMatchesCreator(req, res, traceId, accCid))) {
        return;
      }
      const card = await actionCenterService.accept(
        accCid,
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
      const execCid = body.creator_id as string;
      if (!(await requireAccountMatchesCreator(req, res, traceId, execCid))) {
        return;
      }
      const options =
        typeof body.options === "object" && body.options !== null
          ? (body.options as Record<string, unknown>)
          : {};
      const action = await actionCenterService.execute(
        execCid,
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
      const disCid = body.creator_id as string;
      if (!(await requireAccountMatchesCreator(req, res, traceId, disCid))) {
        return;
      }
      const reasonCode =
        typeof body.reason_code === "string" ? body.reason_code : "no_reason";
      const card = await actionCenterService.dismiss(
        disCid,
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
      if (!(await requireAccountMatchesCreator(req, res, traceId, creatorId))) {
        return;
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
    if (!(await requireAccountMatchesCreator(req, res, traceId, creatorId))) {
      return;
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
    const cloneCreatorId = (body.creator_id as string).trim();
    if (!(await requireAccountMatchesCreator(req, res, traceId, cloneCreatorId))) {
      return;
    }
    if (
      !(await assertCreatorRelayMutationAllowed(
        req,
        res,
        traceId,
        config.prisma,
        cloneCreatorId
      ))
    ) {
      return;
    }
    const baseUrl =
      typeof body.base_url === "string" && body.base_url.trim()
        ? body.base_url.trim()
        : "https://preview.relay.local";
    const model = await cloneService.generate(cloneCreatorId, baseUrl);
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
    if (!(await requireAccountMatchesCreator(req, res, traceId, creatorId))) {
      return;
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
    if (!(await requireAccountMatchesCreator(req, res, traceId, creatorId))) {
      return;
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
    if (!(await requireAccountMatchesCreator(req, res, traceId, creatorId))) {
      return;
    }
    const result = await cloneService.parityCheck(creatorId);
    return res.status(200).json(successEnvelope(result, traceId));
  });

  /**
   * MT-007 — Preferred email/password signup for Option B (no `creator_id`).
   * @see POST /api/v1/identity/register (legacy; may omit `creator_id` when DB identity is enabled)
   */
  // PUBLIC: Email/password signup; issues session cookie when dual-write enabled.
  app.post("/api/v1/auth/signup", async (req: Request, res: Response) => {
    const traceId = traceIdFrom(req);
    const body = (req.body ?? {}) as Record<string, unknown>;
    const details = validateRequiredFields(body, ["email", "password"]);
    if (details.length > 0) {
      return res
        .status(400)
        .json(errorEnvelope("VALIDATION_ERROR", "Invalid request.", traceId, details));
    }
    if (!identityService.supportsAccountScopedEmailAuth()) {
      return res.status(503).json(
        errorEnvelope(
          "SERVICE_UNAVAILABLE",
          "Account signup requires RELAY_DB_STORE_IDENTITY with PostgreSQL.",
          traceId
        )
      );
    }
    try {
      const user = await identityService.registerAccount(
        body.email as string,
        body.password as string
      );
      const session = await identityService.issueSessionForUser(user);
      setSessionCookie(res, session.token, { expiresAtIso: session.expires_at });
      await setActiveRoleCookieForNewSession(res, config.prisma, session, session.expires_at);
      return res.status(201).json(
        successEnvelope(
          applyDualWriteToken({
            token: session.token,
            user_id: user.user_id,
            creator_id: user.creator_id,
            email: user.email,
            auth_provider: user.auth_provider,
            tier_ids: user.tier_ids,
            expires_at: session.expires_at
          }),
          traceId
        )
      );
    } catch (error) {
      const msg = (error as Error).message;
      const status = msg.includes("already exists") ? 409 : 400;
      return res.status(status).json(
        errorEnvelope(status === 409 ? "CONFLICT" : "VALIDATION_ERROR", msg, traceId)
      );
    }
  });

  /** MT-007 — Account-scoped login (same Bearer session contract as `POST /api/v1/identity/login`). */
  // PUBLIC: Email/password login; issues session cookie when dual-write enabled.
  app.post("/api/v1/auth/login", async (req: Request, res: Response) => {
    const traceId = traceIdFrom(req);
    const body = (req.body ?? {}) as Record<string, unknown>;
    const details = validateRequiredFields(body, ["email", "password"]);
    if (details.length > 0) {
      return res
        .status(400)
        .json(errorEnvelope("VALIDATION_ERROR", "Invalid request.", traceId, details));
    }
    if (!identityService.supportsAccountScopedEmailAuth()) {
      return res.status(503).json(
        errorEnvelope(
          "SERVICE_UNAVAILABLE",
          "Account login requires RELAY_DB_STORE_IDENTITY with PostgreSQL.",
          traceId
        )
      );
    }
    try {
      const session = await identityService.loginAccount(
        body.email as string,
        body.password as string
      );
      setSessionCookie(res, session.token, { expiresAtIso: session.expires_at });
      await setActiveRoleCookieForNewSession(res, config.prisma, session, session.expires_at);
      return res.status(200).json(
        successEnvelope(
          applyDualWriteToken({
            token: session.token,
            user_id: session.user_id,
            creator_id: session.creator_id,
            tier_ids: session.tier_ids,
            expires_at: session.expires_at
          }),
          traceId
        )
      );
    } catch (error) {
      return res
        .status(401)
        .json(errorEnvelope("AUTH_ERROR", (error as Error).message, traceId));
    }
  });

  /**
   * Legacy patron registration scoped to a creator. Prefer **`POST /api/v1/auth/signup`** for Option B
   * first account (no `creator_id`). When `creator_id` is omitted and DB identity is enabled, behaves
   * like `/api/v1/auth/signup` (MT-008).
   */
  // PUBLIC: Patron registration / account bootstrap; issues session on success.
  app.post("/api/v1/identity/register", async (req: Request, res: Response) => {
    const traceId = traceIdFrom(req);
    res.setHeader("Deprecation", 'true; api="/api/v1/auth/signup"');
    const body = (req.body ?? {}) as Record<string, unknown>;
    const baseDetails = validateRequiredFields(body, ["email", "password"]);
    if (baseDetails.length > 0) {
      return res
        .status(400)
        .json(errorEnvelope("VALIDATION_ERROR", "Invalid request.", traceId, baseDetails));
    }
    const tierIds = Array.isArray(body.tier_ids)
      ? (body.tier_ids as string[]).filter((x): x is string => typeof x === "string")
      : [];
    const creatorRaw =
      typeof body.creator_id === "string" ? body.creator_id.trim() : "";
    if (!creatorRaw) {
      if (!identityService.supportsAccountScopedEmailAuth()) {
        return res.status(400).json(
          errorEnvelope(
            "VALIDATION_ERROR",
            "creator_id is required unless RELAY_DB_STORE_IDENTITY is enabled (use POST /api/v1/auth/signup).",
            traceId,
            [{ field: "creator_id", issue: "missing" }]
          )
        );
      }
      try {
        const user = await identityService.registerAccount(
          body.email as string,
          body.password as string
        );
        const session = await identityService.issueSessionForUser(user);
        setSessionCookie(res, session.token, { expiresAtIso: session.expires_at });
        await setActiveRoleCookieForNewSession(res, config.prisma, session, session.expires_at);
        return res.status(201).json(
          successEnvelope(
            applyDualWriteToken({
              token: session.token,
              user_id: user.user_id,
              creator_id: user.creator_id,
              email: user.email,
              auth_provider: user.auth_provider,
              tier_ids: user.tier_ids,
              expires_at: session.expires_at
            }),
            traceId
          )
        );
      } catch (error) {
        return res
          .status(409)
          .json(errorEnvelope("CONFLICT", (error as Error).message, traceId));
      }
    }
    try {
      const user = await identityService.register(
        creatorRaw,
        body.email as string,
        body.password as string,
        tierIds
      );
      const session = await identityService.issueSessionForUser(user);
      setSessionCookie(res, session.token, { expiresAtIso: session.expires_at });
      await setActiveRoleCookieForNewSession(res, config.prisma, session, session.expires_at);
      return res.status(201).json(
        successEnvelope(
          applyDualWriteToken({
            token: session.token,
            user_id: user.user_id,
            creator_id: user.creator_id,
            email: user.email,
            auth_provider: user.auth_provider,
            tier_ids: user.tier_ids,
            expires_at: session.expires_at
          }),
          traceId
        )
      );
    } catch (error) {
      return res
        .status(409)
        .json(errorEnvelope("CONFLICT", (error as Error).message, traceId));
    }
  });

  // PUBLIC: Legacy Patreon-id registration path (bootstrap; no prior session).
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
    try {
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
    } catch (error) {
      if (error instanceof PatreonAccountLinkConflictError) {
        return res
          .status(409)
          .json(errorEnvelope("CONFLICT", (error as Error).message, traceId));
      }
      throw error;
    }
  });

  app.post("/api/v1/identity/login", async (req: Request, res: Response) => {
    const traceId = traceIdFrom(req);
    res.setHeader("Deprecation", 'true; api="/api/v1/auth/login"');
    const body = (req.body ?? {}) as Record<string, unknown>;
    const baseDetails = validateRequiredFields(body, ["email", "password"]);
    if (baseDetails.length > 0) {
      return res
        .status(400)
        .json(errorEnvelope("VALIDATION_ERROR", "Invalid request.", traceId, baseDetails));
    }
    const creatorRaw =
      typeof body.creator_id === "string" ? body.creator_id.trim() : "";
    try {
      let session: SessionToken;
      if (creatorRaw) {
        session = await identityService.login(
          creatorRaw,
          body.email as string,
          body.password as string
        );
      } else {
        if (!identityService.supportsAccountScopedEmailAuth()) {
          return res.status(400).json(
            errorEnvelope(
              "VALIDATION_ERROR",
              "creator_id is required unless RELAY_DB_STORE_IDENTITY is enabled (use POST /api/v1/auth/login).",
              traceId,
              [{ field: "creator_id", issue: "missing" }]
            )
          );
        }
        session = await identityService.loginAccount(
          body.email as string,
          body.password as string
        );
      }
      setSessionCookie(res, session.token, { expiresAtIso: session.expires_at });
      await setActiveRoleCookieForNewSession(res, config.prisma, session, session.expires_at);
      return res.status(200).json(
        successEnvelope(
          applyDualWriteToken({
            token: session.token,
            user_id: session.user_id,
            creator_id: session.creator_id,
            tier_ids: session.tier_ids,
            expires_at: session.expires_at
          }),
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
      setSessionCookie(res, session.token, { expiresAtIso: session.expires_at });
      await setActiveRoleCookieForNewSession(res, config.prisma, session, session.expires_at);
      return res.status(200).json(
        successEnvelope(
          applyDualWriteToken({
            token: session.token,
            user_id: session.user_id,
            tier_ids: session.tier_ids,
            expires_at: session.expires_at
          }),
          traceId
        )
      );
    } catch (error) {
      return res
        .status(401)
        .json(errorEnvelope("AUTH_ERROR", (error as Error).message, traceId));
    }
  });

  // PUBLIC: Logout must be POST; GET is rejected so prefetch/link-preview cannot revoke sessions.
  app.get("/api/v1/identity/logout", (req: Request, res: Response) => {
    const traceId = traceIdFrom(req);
    res.setHeader("Allow", "POST");
    return res
      .status(405)
      .json(
        errorEnvelope(
          "METHOD_NOT_ALLOWED",
          "Logout requires POST /api/v1/identity/logout.",
          traceId
        )
      );
  });

  app.post("/api/v1/identity/logout", async (req: Request, res: Response) => {
    const traceId = traceIdFrom(req);
    const bearer = req.header("authorization")?.replace(/^Bearer\s+/i, "").trim() ?? "";
    const fromCookie = readSessionCookie(req)?.trim() ?? "";
    const token = bearer || fromCookie;
    if (!token) {
      return res
        .status(400)
        .json(errorEnvelope("VALIDATION_ERROR", "Bearer token required.", traceId));
    }
    await identityService.logout(token);
    clearSessionCookie(res);
    clearActiveRoleCookie(res);
    return res.status(200).json(successEnvelope({ logged_out: true }, traceId));
  });

  /**
   * MIG-11: After Supabase Auth signup/sign-in, call with `Authorization: Bearer <access_token>`
   * (or `{ "access_token" }` in JSON) to ensure a Prisma `Account` row with `supabaseUserId`.
   * Optional `creator_id` + `tier_ids` attach patron `TenantMembership`.
   * MIG-13: This route validates a **Supabase** JWT — not the opaque patron session used on `/api/v1/patron/*`.
   */
  app.post("/api/v1/auth/supabase/sync", async (req: Request, res: Response) => {
    const traceId = traceIdFrom(req);
    if (!config.prisma) {
      return res
        .status(503)
        .json(errorEnvelope("SERVICE_UNAVAILABLE", "Database not configured.", traceId));
    }
    const body = (req.body ?? {}) as Record<string, unknown>;
    const fromBody =
      typeof body.access_token === "string" ? body.access_token.trim() : "";
    const accessToken = fromBody || bearerAccessTokenFromRequest(req);
    if (!accessToken) {
      recordSupabaseSyncOutcome("other_error");
      return res.status(400).json(
        errorEnvelope("VALIDATION_ERROR", "Missing access_token or Authorization: Bearer.", traceId, [
          { field: "access_token", issue: "missing" }
        ])
      );
    }

    const authResult = await getSupabaseUserFromAccessToken(accessToken);
    if (!authResult.ok) {
      recordSupabaseSyncOutcome("auth_error");
      const code = authResult.error.includes("not configured") ? 503 : 401;
      return res.status(code).json(
        errorEnvelope(
          code === 503 ? "SERVICE_UNAVAILABLE" : "AUTH_ERROR",
          authResult.error,
          traceId
        )
      );
    }

    const creatorId =
      typeof body.creator_id === "string" ? body.creator_id.trim() : "";
    const tierIds = Array.isArray(body.tier_ids)
      ? (body.tier_ids as string[]).filter((x): x is string => typeof x === "string")
      : [];

    try {
      const { account, created } = await upsertAccountForSupabaseUser(config.prisma, {
        supabaseUserId: authResult.user.id,
        email: authResult.user.email ?? null
      });

      let membership_id: string | undefined;
      if (creatorId.length > 0) {
        const m = await ensurePatronMembershipForSupabaseAccount(config.prisma, {
          accountId: account.id,
          creatorId,
          tierIds
        });
        membership_id = m.membershipId;
      }

      recordSupabaseSyncOutcome("success");
      return res.status(200).json(
        successEnvelope(
          {
            account_id: account.id,
            supabase_user_id: authResult.user.id,
            email: account.emailNorm,
            created,
            ...(creatorId.length > 0 ? { membership_id, creator_id: creatorId } : {})
          },
          traceId
        )
      );
    } catch (err) {
      recordSupabaseSyncOutcome("other_error");
      const msg = err instanceof Error ? err.message : String(err);
      const status = msg.includes("another Supabase") ? 409 : 500;
      return res.status(status).json(
        errorEnvelope(status === 409 ? "CONFLICT" : "INTERNAL_ERROR", msg, traceId)
      );
    }
  });

  /**
   * MT-033: Exchange Supabase access token for opaque Relay patron session (same contract as `POST /api/v1/auth/login`).
   * Validates JWT, `upsertAccountForSupabaseUser`, ensures platform `TenantMembership`, returns `sess_*` token.
   */
  app.post("/api/v1/auth/supabase/relay-session", async (req: Request, res: Response) => {
    const traceId = traceIdFrom(req);
    if (!config.prisma) {
      return res.status(503).json(
        errorEnvelope("SERVICE_UNAVAILABLE", "Database not configured.", traceId)
      );
    }
    if (!identityService.supportsRelaySessionBridge()) {
      return res.status(503).json(
        errorEnvelope(
          "SERVICE_UNAVAILABLE",
          "Relay session bridge requires RELAY_DB_STORE_IDENTITY with PostgreSQL.",
          traceId
        )
      );
    }
    const body = (req.body ?? {}) as Record<string, unknown>;
    const fromBody =
      typeof body.access_token === "string" ? body.access_token.trim() : "";
    const accessToken = fromBody || bearerAccessTokenFromRequest(req);
    if (!accessToken) {
      return res.status(400).json(
        errorEnvelope("VALIDATION_ERROR", "Missing access_token or Authorization: Bearer.", traceId, [
          { field: "access_token", issue: "missing" }
        ])
      );
    }

    const authResult = await getSupabaseUserFromAccessToken(accessToken);
    if (!authResult.ok) {
      const code = authResult.error.includes("not configured") ? 503 : 401;
      return res.status(code).json(
        errorEnvelope(
          code === 503 ? "SERVICE_UNAVAILABLE" : "AUTH_ERROR",
          authResult.error,
          traceId
        )
      );
    }

    try {
      const { account } = await upsertAccountForSupabaseUser(config.prisma, {
        supabaseUserId: authResult.user.id,
        email: authResult.user.email ?? null
      });
      const session = await identityService.issueRelaySessionForAccount(account.id);
      setSessionCookie(res, session.token, { expiresAtIso: session.expires_at });
      await setActiveRoleCookieForNewSession(res, config.prisma, session, session.expires_at);
      return res.status(200).json(
        successEnvelope(
          applyDualWriteToken({
            token: session.token,
            user_id: session.user_id,
            creator_id: session.creator_id,
            tier_ids: session.tier_ids,
            expires_at: session.expires_at,
            account_id: account.id,
            email: account.emailNorm
          }),
          traceId
        )
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const status = msg.includes("another Supabase") ? 409 : 500;
      return res.status(status).json(
        errorEnvelope(status === 409 ? "CONFLICT" : "INTERNAL_ERROR", msg, traceId)
      );
    }
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
    const payMapCid = body.creator_id as string;
    if (!(await requireAccountMatchesCreator(req, res, traceId, payMapCid))) {
      return;
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
      payMapCid,
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
    if (!(await requireAccountMatchesCreator(req, res, traceId, creatorId))) {
      return;
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
    const preCid = body.creator_id as string;
    if (!(await requireAccountMatchesCreator(req, res, traceId, preCid))) {
      return;
    }
    const result = await paymentService.preflight(preCid);
    return res.status(200).json(successEnvelope(result, traceId));
  });

  // PUBLIC: Checkout session for a patron (may be unauthenticated buyer; creator_id scopes the listing).
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
    const liveCid = body.creator_id as string;
    if (!(await requireAccountMatchesCreator(req, res, traceId, liveCid))) {
      return;
    }
    const live = body.live === true;
    const config = await paymentService.setLiveMode(
      liveCid,
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
    const migCreateCid = body.creator_id as string;
    if (!(await requireAccountMatchesCreator(req, res, traceId, migCreateCid))) {
      return;
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
      migCreateCid,
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
      const preCamp = await campaignService.getCampaign(req.params.campaign_id);
      if (preCamp) {
        if (
          !(await requireAccountMatchesCreator(req, res, traceId, preCamp.creator_id))
        ) {
          return;
        }
      }
      const result = await campaignService.preflight(req.params.campaign_id);
      return res.status(200).json(successEnvelope(result, traceId));
    }
  );

  app.post(
    "/api/v1/migrations/campaigns/:campaign_id/send",
    async (req: Request, res: Response) => {
      const traceId = traceIdFrom(req);
      const sendCamp = await campaignService.getCampaign(req.params.campaign_id);
      if (!sendCamp) {
        return res
          .status(404)
          .json(errorEnvelope("NOT_FOUND", "Campaign not found.", traceId));
      }
      if (
        !(await requireAccountMatchesCreator(req, res, traceId, sendCamp.creator_id))
      ) {
        return;
      }
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
      if (
        !(await requireAccountMatchesCreator(req, res, traceId, campaign.creator_id))
      ) {
        return;
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
      const prevCamp = await campaignService.getCampaign(req.params.campaign_id);
      if (!prevCamp) {
        return res
          .status(404)
          .json(errorEnvelope("NOT_FOUND", "Campaign not found.", traceId));
      }
      if (
        !(await requireAccountMatchesCreator(req, res, traceId, prevCamp.creator_id))
      ) {
        return;
      }
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
    const supCid = body.creator_id as string;
    if (!(await requireAccountMatchesCreator(req, res, traceId, supCid))) {
      return;
    }
    const emails = Array.isArray(body.emails)
      ? (body.emails as string[]).filter((x): x is string => typeof x === "string")
      : [];
    await migrationStore.addToSuppression(supCid, emails);
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
      if (!(await requireAccountMatchesCreator(req, res, traceId, creatorId))) {
        return;
      }
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
        const depDns = await deployService.getDeployment(req.params.deployment_id);
        if (!depDns) {
          return res
            .status(404)
            .json(errorEnvelope("NOT_FOUND", "Deployment not found.", traceId));
        }
        if (
          !(await requireAccountMatchesCreator(req, res, traceId, depDns.creator_id))
        ) {
          return;
        }
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
        const depAp = await deployService.getDeployment(req.params.deployment_id);
        if (!depAp) {
          return res
            .status(404)
            .json(errorEnvelope("NOT_FOUND", "Deployment not found.", traceId));
        }
        if (
          !(await requireAccountMatchesCreator(req, res, traceId, depAp.creator_id))
        ) {
          return;
        }
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
        const depLn = await deployService.getDeployment(req.params.deployment_id);
        if (!depLn) {
          return res
            .status(404)
            .json(errorEnvelope("NOT_FOUND", "Deployment not found.", traceId));
        }
        if (
          !(await requireAccountMatchesCreator(req, res, traceId, depLn.creator_id))
        ) {
          return;
        }
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
      if (!(await requireAccountMatchesCreator(req, res, traceId, creatorId))) {
        return;
      }
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
    if (
      !(await requireAccountMatchesCreator(req, res, traceId, req.params.creator_id))
    ) {
      return;
    }
    const dep = await deployService.getActive(req.params.creator_id);
    if (!dep) {
      return res.status(404).json(errorEnvelope("NOT_FOUND", "No active deployment.", traceId));
    }
    return res.status(200).json(successEnvelope(dep, traceId));
  });

  app.get("/api/v1/deploy/list/:creator_id", async (req: Request, res: Response) => {
    const traceId = traceIdFrom(req);
    if (
      !(await requireAccountMatchesCreator(req, res, traceId, req.params.creator_id))
    ) {
      return;
    }
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
      if (
        !(await requireAccountMatchesCreator(req, res, traceId, dep.creator_id))
      ) {
        return;
      }
      return res.status(200).json(successEnvelope(dep, traceId));
    }
  );

  registerPipelineParityRoutes(app, {
    config,
    prisma: config.prisma,
    patreonCampaignCreatorIndex,
    credentialStorePath,
    cookieStorePath: config.cookie_store_path ?? join(relayDataDir, "patreon_cookies.json"),
    patreonWebhookMetadataPath,
    patreonCampaignIndexPath,
    ingestCanonicalPath: config.ingest_canonical_path ?? join(relayDataDir, "canonical.json")
  });

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
    patreonSyncService,
    tokenStore,
    patreonSyncHealthStore,
    patreonCampaignCreatorIndex
  };
}
