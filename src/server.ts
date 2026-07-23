/**
 * @fileoverview Express application factory (`createApp`) and the full Relay HTTP API route surface.
 * @description Selects file- versus database-backed stores from `AppConfig`, wires Patreon ingest, gallery, patron social, payments, webhooks, and export routes. Module intentionally monolithic; most business logic delegates to `src/*` services.
 * @see src/main.ts Process entry that calls `createApp` and listens for HTTP
 * @see src/lib/db.ts Shared Prisma client when DB stores are enabled
 * @see src/jsdoc-core-entities.ts Canonical `Artist`, `Gallery`, `SyncStatus` typedefs for Supabase mapping
 * @todo Split route registration into domain routers; unify error envelopes on anonymous handlers (high brittleness in this file).
 * @security-audit-required Numerous endpoints handle PII and entitlements; each must tie mutations to authenticated `user_id` and tenant/creator scope — verify in a dedicated security pass.
 */

import type { Logger } from "pino";
import express, { Request, Response } from "express";
import { randomUUID } from "node:crypto";
import { dirname, join } from "node:path";
import { PatreonAuthService } from "./auth/auth-service.js";
import {
  getExtensionConsentSecret,
  isExtensionConsentCodeConsumed,
  markExtensionConsentCodeConsumed,
  signExtensionConsentCode,
  verifyExtensionConsentCode
} from "./auth/extension-consent-code.js";
import {
  getPatreonOAuthStateSecret,
  signCreatorPatreonOAuthState,
  verifyCreatorPatreonOAuthState
} from "./auth/patreon-creator-oauth-state.js";
import { FilePatreonCookieStore } from "./auth/cookie-store.js";
import { PatreonClient } from "./auth/patreon-client.js";
import { DbPatreonTokenStore } from "./auth/token-store-db.js";
import { FilePatreonTokenStore, type PatreonTokenStore } from "./auth/token-store.js";
import { DbSubscribeStarCreatorTokenStore } from "./auth/subscribestar-token-store-db.js";
import { SubscribeStarCreatorAuthService } from "./auth/subscribestar-auth-service.js";
import {
  getSubscribeStarOAuthStateSecret,
  signCreatorSubscribeStarOAuthState,
  verifyCreatorSubscribeStarOAuthState
} from "./auth/subscribestar-creator-oauth-state.js";
import { errorEnvelope, successEnvelope } from "./contracts/api.js";
import { RELAY_TIER_ALL_PATRONS, RELAY_TIER_PUBLIC } from "./patreon/relay-access-tiers.js";
import { DbEventBus } from "./events/event-bus-db.js";
import { InMemoryEventBus, type RelayEventBus } from "./events/event-bus.js";
import { FileCanonicalStore } from "./ingest/canonical-store.js";
import { DbCanonicalStore } from "./ingest/canonical-store-db.js";
import { DbDeadLetterQueue } from "./ingest/dlq-db.js";
import { FileDeadLetterQueue, type DeadLetterQueue } from "./ingest/dlq.js";
import { recordSupabaseSyncOutcome } from "./health/auth-route-metrics.js";
import { evaluatePlatformOperationsHealth } from "./health/platform-operations-metrics.js";
import { buildPlatformMetricRegistry } from "./platform-metrics/platform-metric-registry-service.js";
import { ingestFirstPartyEvent } from "./platform-metrics/first-party-event-ingestion.js";
import {
  auditAllowedPlatformMetricsRegistryRead,
  auditAllowedTipBetaFunnelRead,
  platformOperatorAccessPolicyFromEnv,
  requirePlatformOperatorForRequest
} from "./platform-metrics/platform-operator-access.js";
import { applyBaselineSecurityHeaders } from "./security/baseline-response-headers.js";
import { exportRequireTierAccessFromEnv } from "./security/production-env-defaults.js";
import { evaluatePart1aGates } from "./auth/part1a-gate-metrics.js";
import { buildDeviantArtCrossPostPackage, buildPatreonCrossPostPackage, buildXCrossPostPackage } from "./extension/cross-post-package.js";
import {
  BlueskyCredentialValidationError,
  deleteCreatorBlueskyCredential,
  getCreatorBlueskyCredential,
  putCreatorBlueskyCredential
} from "./extension/bluesky-credential-service.js";
import { publishRelayPostToBluesky } from "./extension/bluesky-publish-service.js";
import { evaluateIngestHealthGates } from "./ingest/ingest-health-metrics.js";
import { IngestService } from "./ingest/ingest-service.js";
import { IngestRetryQueue } from "./ingest/retry-queue.js";
import { SyncWatermarkStore } from "./ingest/sync-watermark-store.js";
import { DbSyncWatermarkStore } from "./ingest/sync-watermark-store-db.js";
import { validateIngestBatchBody } from "./ingest/validate-body.js";
import { buildSubscribeStarSyncBatch } from "./subscribestar/map-subscribestar-to-ingest.js";
import { validateSubscribeStarIngestWire } from "./subscribestar/validate-subscribestar-ingest-wire.js";
import { recordSubscribeStarLastPostSync } from "./subscribestar/record-subscribestar-provider-sync.js";
import { persistSubscribeStarProviderSnapshot } from "./subscribestar/persist-subscribestar-provider-snapshot.js";
import { runSubscribeStarPostsGraphqlPagedIngest } from "./subscribestar/run-subscribestar-posts-graphql-ingest.js";
import { linkSubscribeStarPatronWithCode } from "./subscribestar/subscribestar-patron-entitlement-sync.js";
import { isPilotPatreonOnlyScope } from "./pilot/pilot-patreon-only-scope.js";
import {
  createRelayPostTransaction,
  RelayCreatePostError,
  resolveRelayPostTier
} from "./relay/create-relay-post.js";
import { updatePostAudienceTierGate } from "./relay/update-post-audience-tier-gate.js";
import {
  getManualImportSetup,
  MANUAL_RELAY_CAMPAIGN_PREFIX,
  ManualImportCatalogError,
  upsertManualTierBins,
  type ManualImportBinInput
} from "./relay/manual-import-catalog.js";
import { resolveManualImportUploadStagingPayload } from "./relay/manual-import-staging-access.js";
import {
  applyRelayUploadCommitUpdate,
  markMediaAssetProcessingFailed
} from "./relay/relay-native-upload-finalize.js";
import {
  executeDiscordIngest,
  parseDiscordIngestPayload
} from "./discord/discord-ingest.js";
import {
  getDiscordIngestHmacSecret,
  RELAY_DISCORD_SIGNATURE_HEADER,
  verifyDiscordIngestHmac
} from "./discord/discord-ingest-hmac.js";
import {
  DISCORD_LINK_CODE_TTL_MS,
  generateDiscordLinkPlainCode,
  hashDiscordLinkCode,
  normalizeDiscordLinkCodeInput
} from "./discord/discord-link-code.js";
import { executeDiscordBind, parseDiscordBindPayload } from "./discord/discord-bind.js";
import {
  MEDIA_STORAGE_PURGE_REASON_DISCORD_STAGING,
  MEDIA_STORAGE_PURGE_REASON_LIBRARY_STAGING,
  enqueueMediaStoragePurge
} from "./storage/media-storage-purge-service.js";
import {
  consentExchange,
  consentStart,
  cookieWrite,
  creatorProfileMutate,
  patronBlockMutate,
  patronCollectionMutate,
  patronCommentMutate,
  patronFollowMutate,
  patronProfileMutate,
  patronReactionMutate,
  patronReportMutate
} from "./middleware/rate-limits.js";
import {
  registerUsageMeteringPrisma,
  scheduleExportMediaBytes,
  scheduleLibraryZipUsage
} from "./usage/usage-events.js";
import { InMemoryIdempotencyStore } from "./middleware/idempotency-store.js";
import { buildIdempotencyMiddleware } from "./middleware/idempotency-middleware.js";
import { buildDiscoverPage } from "./patron/discover-service.js";
import {
  listNotifications,
  markAllRead,
  markRead,
  resolveNotificationRecipientScope,
  unreadCount
} from "./patron/notification-service.js";
import {
  listPreferences,
  setPreference
} from "./patron/notification-prefs-service.js";
import { buildPatronExportBundle } from "./patron/data-export-service.js";
import { deleteCreatorRelationship } from "./patron/creator-relationship-delete-service.js";
import {
  cancelDeletion,
  getPendingDeletion,
  requestDeletion
} from "./patron/account-deletion-service.js";
import { getPublicPatronProfileByHandle } from "./patron/public-patron-profile-service.js";
import { getCuratorSupportSummary } from "./patron/curator-perks-service.js";
import { activeCuratorMembershipIds } from "./patron/curator-status.js";
import { getPublicPatronCollectionDetail } from "./patron/public-patron-collections-service.js";
import {
  hydratePatronCollectionDetailEntries,
  loadCreatorProfilesForPatronCollection,
  toPatronOwnerCollectionDetail
} from "./patron/patron-collection-detail-service.js";
import {
  CommentEditWindowClosedError,
  CommentForbiddenError,
  CommentNotFoundError,
  CommentValidationError,
  createComment,
  listComments,
  patchComment,
  setCreatorPinned,
  setModState,
  softDeleteComment
} from "./patron/comment-service.js";
import { revokeCommentTag, unrevokeCommentTag } from "./patron/comment-tag-service.js";
import {
  aggregateReactions,
  toggleCommentReaction
} from "./patron/comment-reaction-service.js";
import {
  ContentReportValidationError,
  createContentReport,
  listContentReports,
  resolveContentReport
} from "./patron/content-report-service.js";
import {
  blockAccount,
  loadBlocksFor,
  unblockAccount
} from "./patron/account-block-service.js";
import { recordModerationAction } from "./patron/moderation-action-log.js";
import {
  getCreatorIdentity,
  patchCreatorIdentity,
  promoteSnapshotToProfile
} from "./creator/creator-identity-service.js";
import {
  ensureCreatorOnboardingAtLeastImportStarted,
  getCreatorOnboardingForStudio,
  getLayoutPublishBlock,
  OnboardingPublishBlockedError,
  OnboardingTransitionError,
  patchCreatorOnboarding,
  type PatchCreatorOnboardingInput
} from "./creator/onboarding-service.js";
import {
  CreatorPromoSlotTargetNotFoundError,
  CreatorPromoSlotValidationError,
  getCreatorPromoSlots,
  patchCreatorPromoSlotTipEligible,
  putCreatorPromoSlots,
  type CreatorPromoSlotPutRow
} from "./creator/promo-slot-service.js";
import {
  applyOwnerPromoPieceMarkers,
  loadPromoPieceMarkersByPostId
} from "./creator/promo-piece-markers.js";
import { loadPromotionHubSummary } from "./marketing/promotion-hub-summary-service.js";
import {
  AutopostDraftConflictError,
  AutopostDraftDiscardWarningError,
  AutopostDraftValidationError,
  discardAutopostDraft,
  getActiveAutopostDraft,
  getAutopostDraft,
  listAutopostDrafts,
  patchAutopostDraft,
  publishAutopostDraft,
  recordAutopostDistribution,
  saveAutopostDraft,
  type AutopostDistributionDestination
} from "./autopost/autopost-draft-service.js";
import {
  ScheduleSeriesNotFoundError,
  ScheduleSeriesPlanRequiredError,
  ScheduleSeriesValidationError,
  createScheduleSeries,
  deleteScheduleSeries,
  listScheduleSeries,
  materializeOccurrence,
  patchScheduleSeries,
  reconcileSeriesMaterialization,
  type CreateScheduleSeriesInput,
  type PatchScheduleSeriesInput
} from "./autopost/schedule-series-service.js";
import {
  DistributionRuleNotFoundError,
  DistributionRulePlanRequiredError,
  DistributionRuleValidationError,
  createDistributionRule,
  deleteDistributionRule,
  listDistributionRuleRuns,
  listDistributionRules,
  patchDistributionRule,
  type CreateDistributionRuleInput,
  type PatchDistributionRuleInput
} from "./autopost/distribution-rule-service.js";
import {
  AutomationServiceError,
  archiveAutomation,
  cancelAutomationRun,
  completeAutomationRunFromHandoff,
  correlateAutomationRunPlan,
  createAutomation,
  getAutomation,
  getAutomationApprovalContext,
  listAutomationRuns,
  listAutomations,
  patchAutomation
} from "./autopost/automation-service.js";
import {
  SocialPlaybookFeatureDisabledError,
  SocialPlaybookPlanRequiredError,
  SocialPlaybookValidationError,
  applySocialPlaybook,
  listSocialPlaybookTemplates
} from "./autopost/social-playbook-service.js";
import {
  isSocialPlaybookTemplateKey,
  type ApplySocialPlaybookBody
} from "./autopost/social-playbook-contract.js";
import {
  StyleProfileValidationError,
  getCreatorStyleProfile,
  listStyleTonePresets,
  putCreatorStyleProfile
} from "./autopost/style-profile-service.js";
import {
  PostingGoalNotFoundError,
  PostingGoalValidationError,
  getCreatorPostingGoal,
  getCreatorPostingGoalStatus,
  putCreatorPostingGoal,
  skipCreatorPostingNudge,
  skipCurrentCreatorPostingNudge,
  snoozeCreatorPostingNudge,
  snoozeCurrentCreatorPostingNudge
} from "./autopost/posting-goal-service.js";
import { listConnectedPlatforms } from "./distribution/connected-platforms-service.js";
import {
  getCreatorFeatureFlags,
  isPostingAssistantAllowedForCreator,
  setCreatorPostingAssistantEnabled
} from "./creator/creator-feature-flags-service.js";
import {
  getCreatorStudioBrief,
  patchCreatorStudioBrief,
  StudioBriefValidationError
} from "./creator/studio-brief-service.js";
import {
  createPostTemplate,
  deletePostTemplate,
  listPostTemplates,
  PostTemplateNotFoundError,
  PostTemplateValidationError,
  updatePostTemplate
} from "./distribution/post-template-service.js";
import {
  createPreviewTemplate,
  deletePreviewTemplate,
  listPreviewTemplates,
  PreviewTemplateNotFoundError,
  PreviewTemplateValidationError,
  updatePreviewTemplate
} from "./distribution/preview-template-service.js";
import { buildCrossPostPackageFromAttempt } from "./distribution/distribution-package.js";
import {
  approveDistributionVariant,
  completeDistributionAttempt,
  createPostDistributionPlan,
  getDistributionAttempt,
  getPostDistributionPlan,
  getPostDistributionSummary,
  getDistributionSummariesForPosts,
  patchDistributionVariant,
  PostDistributionNotFoundError,
  PostDistributionValidationError,
  recordDistributionFillResult,
  startDistributionHandoff,
  updatePostbotTaskRemindMe,
  updatePostbotTaskStatus
} from "./distribution/post-distribution-service.js";
import {
  completeBoundedGoalCycleTask
} from "./goal-cycle/execution/goal-cycle-execution-service.js";
import { GoalCycleContractError } from "./goal-cycle/contracts.js";
import {
  mapPostbotTaskRow
} from "./distribution/postbot-task-service.js";
import { proposeCoachAttackPlans } from "./distribution/coach-propose-service.js";
import {
  assertCoachProposeAllowed,
  clearCoachReviewCheckpoint,
  patchCoachReviewProgress,
  saveCoachReviewCheckpoint
} from "./distribution/coach-checkpoint-service.js";
import type { PostingAssistantContext } from "./distribution/posting-assistant-service.js";
import {
  PostbotTaskNotFoundError,
  PostbotTaskValidationError
} from "./distribution/postbot-task-service.js";
import {
  ExternalPostMetricsValidationError,
  getPostExternalMetrics,
  recordExternalPostMetricSnapshots
} from "./distribution/external-post-metrics-service.js";
import {
  assertPilotUxPatronOnboardingWalkthroughAccount,
  assertPilotUxOnboardingWalkthroughAccount,
  isPilotUxDevWalkthroughApiEnabled,
  pilotUxOnboardingWalkthroughPatronTierSummary,
  PILOT_UX_ONBOARDING_RELAY_CREATOR_ID,
  PilotUxWalkthroughForbiddenError,
  resetPilotUxPatronOnboardingWalkthrough,
  resetPilotUxOnboardingWalkthrough,
  simulatePilotUxMediaImport,
  simulatePilotUxPatreonConnect
} from "./pilot-ux/pilot-ux-onboarding-walkthrough.js";
import { TokenEncryption } from "./lib/crypto.js";
import {
  isBrowserExtensionOrigin,
  isWebFacingExtensionAuthPath,
  parseRelayExtensionOrigins,
  RELAY_EXTENSION_AUTH_API_PREFIX
} from "./lib/relay-extension-origins.js";
import {
  isCredentialedCorsOrigin,
  parseAllowedWebOrigins
} from "./lib/relay-cors.js";
import { ExportService } from "./export/export-service.js";
import { FileExportIndex } from "./export/export-index.js";
import { DEFAULT_EXPORT_FETCH_RETRY_POLICY } from "./export/types.js";
import {
  buildMediaManifest,
  buildPostMap,
  buildTierMap
} from "./export/manifests.js";
import { GalleryService } from "./gallery/gallery-service.js";
import { getGalleryPlatformInstanceSummariesForPosts } from "./gallery/platform-instance-enrichment.js";
import { getCreativeWorkMembershipForPosts } from "./gallery/creative-work-enrichment.js";
import {
  derivePresentationUpsertFragments,
  presentationPatchTouches,
  validateMediaIdsBelongToPost,
  validatePromoPreviewMediaForCreator
} from "./gallery/post-presentation-mutate.js";
import { loadPostPresentationOverlaysFromDb } from "./gallery/post-presentation-load.js";
import { loadAudienceSimulationForCreatorPost } from "./gallery/audience-simulation-load.js";
import {
  createCreatorDiscountCode,
  DiscountCodeValidationError,
  listCreatorDiscountCodes,
  updateCreatorDiscountCode
} from "./marketing/discount-code-service.js";
import {
  listPostMarketingOffers,
  PostOfferValidationError,
  upsertPostMarketingOffer
} from "./marketing/post-offer-service.js";
import {
  ensureOfferRedirectSlug,
  ensureTierDefaultRedirectSlug,
  recordOfferLinkClick,
  recordTierDefaultLinkClick,
  referrerHostFromHeader,
  resolveOfferRedirect
} from "./marketing/offer-redirect-service.js";
import {
  deleteCreatorTierPromotionDefault,
  listCreatorTierPromotionDefaults,
  TierPromotionDefaultValidationError,
  upsertCreatorTierPromotionDefault
} from "./marketing/tier-promotion-default-service.js";
import { resolveViewerEffectivePromo } from "./marketing/attach-effective-promo.js";
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
import {
  computeViewerEntitlementsForPostsBulk,
  resolveCurrentEntitledTierIdsForAccount,
  targetKey as viewerEntitlementTargetKey,
  type ViewerEntitlementSourceTarget
} from "./patron/viewer-entitlement.js";
import { TriageService } from "./gallery/triage-service.js";
import { resolveLayoutPosts } from "./gallery/layout-to-clone.js";
import {
  findPostIdForExportedMedia,
  patronMayFetchMediaExport
} from "./gallery/patron-media-access.js";
import { hasOpenTipReveal } from "./tips/open-tip-reveal.js";
import {
  resolveMediaExportAccessContext,
  shouldApplyMediaExportEntitlementGates
} from "./gallery/media-export-access-context.js";
import { buildPatronEntitlementHealthPayload } from "./gallery/entitlement-degraded.js";
import { evaluatePostPermission } from "./gallery/post-permission.js";
import { isPostHiddenFromPatronSurfaces } from "./gallery/hidden-post-ids.js";
import {
  isPostMatureFromPatronSurfaces,
  loadMaturePostIdsByCreator,
  isPostExcludedByPatronMaturePref
} from "./gallery/mature-post-ids.js";
import { resolveGalleryItemVisibility } from "./gallery/query.js";
import { buildGridThumbnailImage, GRID_THUMB_ETAG_TOKEN } from "./export/grid-thumbnail.js";
import { buildVisitorPreviewImage } from "./export/visitor-preview.js";
import { parseGalleryLimit, queryStringList } from "./gallery/parse-query.js";
import type {
  PatronCollectionEntryRecord,
  PatronCollectionEntryWithViewerEntitlement,
  PatronCollectionRecord,
  PatronFavoriteRecord,
  PatronFavoriteTargetKind,
  PatronFavoriteWithViewerEntitlement,
  PostVisibility,
  SavedFilterRecord,
  GalleryOverridesRoot
} from "./gallery/types.js";
import { hashOpaqueSessionToken } from "./identity/session-token-hash.js";
import type { SessionToken } from "./identity/types.js";

/**
 * @description Maps raw query-string visibility tokens to internal `PostVisibility` or `all`.
 * @param {string|undefined} raw Untrusted query parameter fragment.
 * @returns {PostVisibility|"all"|undefined} Normalized filter or undefined when unknown.
 */
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
 * @description Read at request time: `main.ts` loads dotenv after this module may be imported, so a module-level `process.env` snapshot would miss `RELAY_DEV_VISITOR_TIER_SIM`.
 * @returns {boolean} True when dev tier simulation is enabled.
 */
function devVisitorTierSimEnabled(): boolean {
  // [R-SEC-23 @security-review 2026-06] Hard-disabled in production regardless of env value so a stray
  // prod setting can never grant simulated tier entitlements. Dev behavior unchanged. See docs/security-review-2026-06.md.
  if (process.env.NODE_ENV === "production") return false;
  return process.env.RELAY_DEV_VISITOR_TIER_SIM === "true";
}

/**
 * @description [R-SEC-05 / R-SEC-06 @security-review 2026-06] Legacy unauthenticated routes (unsigned
 *   Patreon webhook stub; `login-patreon` / `register-patreon` that mint sessions without OAuth proof) are
 *   disabled in production. Dev/test keep them. Set `RELAY_ALLOW_LEGACY_INSECURE_ROUTES=1` only for a
 *   controlled migration window. See docs/security-review-2026-06.md.
 * @returns {boolean} True when the legacy route must respond 404 (production, no explicit override).
 */
function legacyInsecureRouteDisabled(): boolean {
  if (process.env.NODE_ENV !== "production") return false;
  return process.env.RELAY_ALLOW_LEGACY_INSECURE_ROUTES !== "1";
}

/**
 * @description When visitor catalog + dev flag + `dev_sim_patron`, redaction uses a fake session (`tier_ids` from `simulate_tier_ids`).
 * @param {{ visitor: boolean, creatorId: string, devSimPatron: boolean, simulateTierIds: string[], bearerSession: SessionToken | null }} args
 * @returns {SessionToken|null} Synthetic or original bearer session.
 * @security-audit-required Dev-only impersonation; must never be enabled in production configs.
 */
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

/**
 * @description Coerces JSON body visibility values; maps legacy `flagged` to `review`.
 * @param {unknown} vis Parsed JSON field.
 * @returns {PostVisibility|null} Valid enum member or null.
 */
function normalizeGalleryVisibilityBody(vis: unknown): PostVisibility | null {
  if (vis === "flagged") return "review";
  if (vis === "visible" || vis === "hidden" || vis === "review") return vis;
  return null;
}

/**
 * @description Parses a single `Range: bytes=...` header for partial content responses.
 * @param {string|undefined} rangeHeader Raw `Range` header value.
 * @param {number} byteLength Total body length in bytes.
 * @returns {{start:number,end:number}|"invalid"|null} Inclusive byte range, invalid syntax, or absent header.
 * @todo Reject multi-range requests explicitly if proxies may emit them.
 */
function parseSingleByteRange(
  rangeHeader: string | undefined,
  byteLength: number
): { start: number; end: number } | "invalid" | null {
  if (!rangeHeader) return null;
  if (byteLength <= 0) return "invalid";
  const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader.trim());
  if (!match) return "invalid";
  const [, startRaw, endRaw] = match;
  if (!startRaw && !endRaw) return "invalid";

  if (!startRaw) {
    const suffixLength = Number.parseInt(endRaw!, 10);
    if (!Number.isFinite(suffixLength) || suffixLength <= 0) return "invalid";
    return {
      start: Math.max(byteLength - suffixLength, 0),
      end: byteLength - 1
    };
  }

  const start = Number.parseInt(startRaw, 10);
  const end = endRaw ? Number.parseInt(endRaw, 10) : byteLength - 1;
  if (
    !Number.isFinite(start) ||
    !Number.isFinite(end) ||
    start < 0 ||
    end < start ||
    start >= byteLength
  ) {
    return "invalid";
  }
  return { start, end: Math.min(end, byteLength - 1) };
}
import { DbAnalyticsStore } from "./analytics/analytics-store-db.js";
import { FileAnalyticsStore } from "./analytics/analytics-store.js";
import { ActionCenterService } from "./analytics/action-center-service.js";
import { getCreatorMembershipCohortRetention } from "./analytics/creator-membership-cohorts.js";
import { getCreatorMembershipKpis } from "./analytics/creator-membership-kpis.js";
import { getCreatorTierStickiness } from "./analytics/creator-tier-stickiness.js";
import {
  ingestPatreonInsightsCsv,
  readPatreonInsightsMultipart
} from "./analytics/patreon-insights-csv.js";
import { getCreatorPostPerformance } from "./analytics/creator-post-performance.js";
import {
  getCreatorUnifiedPerformance,
  parseUnifiedPerformanceRange
} from "./analytics/creator-unified-performance.js";
import {
  getPerformanceCampaignRollups,
  getPerformanceOverview,
  getPerformancePlatformInstance,
  getPerformancePostVariant,
  getPerformanceTagRollups,
  getPerformanceWorkBundle,
  getPerformanceWorkInstances,
  listPerformanceWorks
} from "./analytics/performance-intelligence-read.js";
import {
  getPlatformInstanceRefreshStatus,
  requestPlatformInstanceManualRefresh
} from "./analytics/platform-instance-refresh-service.js";
import {
  attachMediaToScheduleRailEvent,
  createScheduledPostForRail,
  getCreatorScheduleRail,
  ScheduleRailNotFoundError,
  ScheduleRailValidationError,
  updateScheduleRailEventPostDetails
} from "./distribution/schedule-rail-service.js";
import {
  createCreatorScheduleEvent,
  CreatorScheduleEventNotFoundError,
  CreatorScheduleEventPlanRequiredError,
  CreatorScheduleEventValidationError,
  listScheduleLibraryPosts,
  patchCreatorScheduleEvent
} from "./distribution/creator-schedule-event-service.js";
import {
  isCreatorScheduleDestination,
  isCreatorScheduleEventType
} from "./distribution/creator-schedule-event-contract.js";
import {
  DEFAULT_SNOOZE_MINUTES,
  dismissScheduleReminder,
  listDueScheduleReminders,
  getNextUpcomingScheduleReminderDueAt,
  markScheduleReminderPresented,
  ScheduleReminderNotFoundError,
  ScheduleReminderValidationError,
  snoozeScheduleReminder
} from "./distribution/schedule-reminder-extension-api.js";
import {
  confirmMergeCreativeWorkBundle,
  dismissCreativeWorkBundleSuggestion,
  linkCreativeWorkMembers,
  listCreativeWorkBundleSuggestions,
  splitCreativeWorkMember
} from "./analytics/creative-work-bundling-service.js";
import { getPerformanceInsightActions } from "./analytics/performance-insight-actions.js";
import {
  createCreatorPerformanceGoal,
  deleteCreatorPerformanceGoal,
  listCreatorPerformanceGoals
} from "./analytics/performance-insight-goals-service.js";
import { platformAdapterCatalog } from "./analytics/platform-identity-adapters.js";
import { confirmPlatformInstanceLink } from "./analytics/platform-instance-link-service.js";
import { getCreatorUsagePreview } from "./usage/usage-preview-service.js";
import { enqueueRelayEngagementEvent } from "./analytics/relay-engagement-event.js";
import {
  computeCreatorTipBetaStats,
  computeTipBetaFunnel
} from "./analytics/tip-beta-funnel-service.js";
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
  checkPatreonLinkEmailGate,
  getSessionEmailVerifiedForPatronLink
} from "./identity/patreon-link-email-gate.js";
import { invalidatePatronEntitlementSnapshotsForMemberships } from "./identity/patron-entitlement-snapshot.js";
import {
  addAccountFollowForAccount,
  listAccountFollowsForAccount,
  removeAccountFollowForAccount
} from "./patron/account-follow-service.js";
import {
  addPatronFollowForMembership,
  listPatronFollowsForMembership,
  removePatronFollowForMembership
} from "./patron/patron-follow-service.js";
import {
  getPatronProfileViewForMembership,
  patchPatronProfileForMembership
} from "./patron/patron-profile-service.js";
import { loadPatronHideMatureContent } from "./patron/patron-content-preferences.js";
import {
  commitPatronProfileImageUpload,
  getPatronProfileAssetBytes,
  initPatronProfileImageUpload,
  mayReadPatronProfileAsset,
} from "./patron/patron-profile-upload-service.js";
import {
  ensurePatronMembershipForSupabaseAccount,
  upsertAccountForSupabaseUser
} from "./identity/supabase-account.js";
import { getSupabaseUserFromAccessToken } from "./lib/supabase-auth.js";
import { getR2ClientConfigFromEnv } from "./storage/r2-config.js";
import { isPatronProfileAssetKind } from "./storage/patron-profile-r2.js";
import {
  buildRelayR2ObjectKey,
  getAllowedMimePrefixesFromEnv,
  getPresignExpiresSec,
  getRelayUploadMaxBytes,
  headR2ObjectContentLength,
  isMimeTypeAllowed,
  presignR2Put
} from "./storage/relay-upload-r2.js";
import {
  IdentityAuthProvider,
  MediaIngestOrigin,
  MediaProcessingStatus,
  MediaUpstreamStatus,
  PostSource,
  PostUpstreamStatus,
  Prisma,
  PublicSlugSource,
  SessionKind,
  TenantRole,
  type PrismaClient
} from "@prisma/client";
import { checkPostAccess, filterAccessiblePosts } from "./identity/access-guard.js";
import {
  clearActiveRoleCookie,
  clearSessionCookie,
  readSessionCookie,
  setSessionCookie
} from "./identity/session-cookie.js";
import { setActiveRoleCookieForNewSession } from "./identity/set-active-role-cookie-for-session.js";
import { resolveAvailableRolesForAccount } from "./identity/active-role-available.js";
import { setActiveRoleCookie } from "./identity/session-cookie.js";
import type { ActiveRole } from "./identity/active-role-default.js";
import { resolveTenantBySlug } from "./identity/resolve-tenant.js";
import {
  applyRelayAccountRlsIfPresent,
  requireAccount,
  requireAccountWithRole,
  sendRelayAuthError
} from "./identity/require-account.js";
import { setRelayUsernameForAccount } from "./identity/relay-username-service.js";

/**
 * @description When false (`RELAY_COOKIE_SESSION_DUAL_WRITE=0`), API JSON omits session token fields (cookie-only transport).
 * @returns {boolean} Whether dual-write of token in JSON is enabled.
 */
function relayCookieDualWriteJson(): boolean {
  const raw = process.env.RELAY_COOKIE_SESSION_DUAL_WRITE?.trim();
  if (raw === "1") return true;
  if (raw === "0") return false;
  // [R-SEC-19 @security-review 2026-06] Default OFF in production (session token is cookie-only; the web
  // client no longer reads it from JSON). Defaults ON in dev/test so legacy clients and tests that read
  // the token keep working. Set RELAY_COOKIE_SESSION_DUAL_WRITE=1 to force on. See docs/security-review-2026-06.md.
  return process.env.NODE_ENV !== "production";
}

/**
 * @description Strips `token` from JSON payloads when dual-write is disabled.
 * @template T
 * @param {T & { token?: string }} payload Success body possibly containing session token.
 * @returns {T} Payload with `token` removed when cookie-only mode is active.
 */
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
import {
  exchangePatreonPatronOAuth,
  exchangePatreonPatronOAuthUnified
} from "./patreon/patreon-patron-oauth.js";
import { CreatorCampaignDisplayStore } from "./patreon/creator-campaign-display-store.js";
import {
  type PatreonSyncHealthStoreAPI,
  PatreonSyncHealthStore
} from "./patreon/patreon-sync-health-store.js";
import { DbPatreonSyncHealthStore } from "./patreon/patreon-sync-health-store-db.js";
import { assertCreatorSyncWritable } from "./patreon/creator-sync-writable.js";
import { PatreonSyncService } from "./patreon/patreon-sync-service.js";
import { creatorSyncHealthStateToWebDto } from "./patreon/sync-health-web-dto.js";
import { classifySyncError } from "./patreon/sync-error-copy.js";
import { SubscribeStarOAuthClient } from "./subscribestar/subscribestar-client.js";
import {
  ensureCreatorProfilePatreonCampaignId,
  getCreatorProfilePatreonCampaignIdForRelayCreatorDb,
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
import { createBillingWebhookHandler } from "./billing/webhook-router.js";
import { isBillingEnabled } from "./billing/config.js";
import {
  createCreatorCheckoutSession,
  createFanCheckoutSession,
  createPortalSession,
  createReloadPackCheckoutSession
} from "./billing/checkout-service.js";
import { isFanPremiumEnabled, isPaidFanPlanId, fanPlanParams } from "./billing/fan-plan-config.js";
import { isCreatorPlanId } from "./billing/plan-price-map.js";
import {
  getActiveFanSubscription,
  getCreatorSubscriptionWire
} from "./billing/subscription-sync.js";
import {
  grantOperatorCreatorPlan,
  isAutopostBetterAllowed,
  requireCreatorPlanAtLeast
} from "./billing/creator-plan-entitlement-service.js";
import { getCreatorPlanAccessWire } from "./billing/creator-plan-access-service.js";
import { CreatorPlan } from "@prisma/client";
import { isTipsBetaEnabled, resolveTipsBetaConfig, tipPeriodKeyUtc } from "./tips/config.js";
import {
  getWallet,
  InsufficientTipsError
} from "./ledger/tip-ledger-service.js";
import { getCreatorEarningsWire } from "./ledger/artist-ledger-service.js";
import { startConnectOnboarding } from "./payouts/connect-onboarding-service.js";
import {
  listCreatorPayouts,
  requestPayout
} from "./payouts/payout-service.js";
import { payoutThresholdCents } from "./billing/artist-payout-config.js";
import {
  listActiveReveals,
  revealPost,
  TipNotEligibleError
} from "./tips/reveal-service.js";
import { buildTipGatedDiscoverSection } from "./tips/tip-gated-discover.js";
import {
  assemblePatronFeed,
  DEFAULT_LIMIT as PATRON_FEED_DEFAULT_LIMIT,
  parseFilter as parsePatronFeedFilter,
  MAX_LIMIT as PATRON_FEED_MAX_LIMIT
} from "./patron/assemble-patron-feed.js";
import {
  assemblePatronSearch,
  normalizePatronSearchMediaFilter,
  normalizePatronSearchSort,
  parsePatronSearchCreatorIdsFromQuery,
  PatronSearchValidationError,
  PATRON_SEARCH_DEFAULT_LIMIT,
  PATRON_SEARCH_MAX_LIMIT
} from "./patron/patron-search-service.js";
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
import { registerGoalCycleRoutes } from "./goal-cycle/goal-cycle-routes.js";
import { registerGoalCyclePlannerRoutes } from "./goal-cycle/planner/planner-routes.js";
import { registerGoalCycleMaterializationRoutes } from "./goal-cycle/materialization/materialization-routes.js";
import { registerGoalCycleOutcomeRoutes } from "./goal-cycle/outcomes/outcome-routes.js";
import { registerCoachPlanCreditRoutes } from "./usage/coach-plan-credit-routes.js";
import {
  createManagedVerifyService,
  registerManagedVerifyRoutes
} from "./escape-hatch/managed-verify/index.js";
import {
  createManagedVerifyBillingService,
  createManagedVerifyBillingWebhookHandler,
  registerManagedVerifyBillingRoutes
} from "./escape-hatch/managed-verify-billing/index.js";
import { attachRelaySentryExpressErrorHandler } from "./lib/relay-sentry.js";
import { resolveHttpAccessLogEmit } from "./lib/http-access-log-policy.js";
import { createLogger } from "./lib/logger.js";

/**
 * @description Strongly typed configuration for `createApp`: OAuth credentials, filesystem paths, DB-backed store feature flags, and behavioral toggles.
 * @typedef {Object} AppConfig
 * @see src/relay-server-env.ts Env parsing companion
 */
export type AppConfig = {
  /** Patreon "Client ID" from the developer portal (register-clients). */
  patreon_client_id?: string;
  /** Patreon "Client Secret" from the developer portal. */
  patreon_client_secret?: string;
  /** Defaults to https://www.patreon.com/api/oauth2/token */
  patreon_token_url?: string;
  /**
   * SubscribeStar API origin (OAuth + GraphQL), no trailing slash. Default reads `SUBSCRIBESTAR_API_ORIGIN`
   * in `createApp` when omitted (`https://subscribestar.adult`).
   */
  subscribestar_api_origin?: string;
  /** SubscribeStar OAuth app Client ID — creator ingest app. */
  subscribestar_creator_client_id?: string;
  /** SubscribeStar OAuth app Client Secret — creator ingest app. */
  subscribestar_creator_client_secret?: string;
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
   * Default: on in production, off in development (override with `RELAY_EXPORT_REQUIRE_TIER_ACCESS`).
   */
  export_require_tier_access?: boolean;
  /** Overrides defaults in `DEFAULT_EXPORT_FETCH_RETRY_POLICY` (export download retries). */
  export_fetch_retry_policy?: Partial<{
    max_attempts: number;
    base_delay_ms: number;
    timeout_ms: number;
  }>;
  /** Override HTTP request logger (tests); default `createLogger({ name: "relay-http" })`. */
  http_request_logger?: Logger;
};

/**
 * @description Service graph returned from `createApp` for tests and `main.ts` worker wiring.
 * @typedef {Object} CreateAppResult
 */
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
  /** Same instance used for cookie + patron OAuth crypto (PE-H workers). */
  encryption: TokenEncryption;
  patreonClient: PatreonClient;
  /** Present when `SUBSCRIBESTAR_INGEST_ENABLED` + DB OAuth + client env are configured. */
  subscribeStarCreatorAuthService?: SubscribeStarCreatorAuthService;
  subscribeStarCreatorOAuthClient?: SubscribeStarOAuthClient;
  /** GraphQL ingest URL `${SUBSCRIBESTAR_API_ORIGIN}/api/graphql/v1` when creator OAuth wiring is active. */
  subscribeStarGraphqlIngestUrl?: string;
  /** Subscriber OAuth client when `SUBSCRIBESTAR_*` client env resolves (may share creator app). */
  subscribeStarPatronOAuthClient?: SubscribeStarOAuthClient;
  /** Same GraphQL endpoint patrons use with subscriber-scoped bearer tokens. */
  subscribeStarPatronGraphqlUrl?: string;
};

/**
 * @description Asserts a required string config value is present.
 * @param {string|undefined} value Config field value (may be undefined).
 * @param {string} key Human-readable key name for error messages.
 * @returns {string} Trimmed non-empty string (same as input when truthy).
 * @throws {Error} When value is falsy or empty after coercion expectations in caller.
 */
function required(value: string | undefined, key: string): string {
  if (!value) {
    throw new Error(`Missing required config: ${key}`);
  }
  return value;
}

type RelayRequest = Request & { relayTraceId?: string };

function ensureRelayTraceId(req: Request): string {
  const r = req as RelayRequest;
  if (r.relayTraceId) return r.relayTraceId;
  const headerValue = req.header("x-trace-id")?.trim();
  r.relayTraceId = headerValue || `trace_${randomUUID()}`;
  return r.relayTraceId;
}

/**
 * @description Reads or mints the stable per-request trace id (`X-Trace-Id` / global middleware).
 * @param {Request} req Express request (`x-trace-id` header optional until middleware runs).
 * @returns {string} Client-provided trace id or server-generated `trace_<uuid>`.
 */
function traceIdFrom(req: Request): string {
  return ensureRelayTraceId(req);
}

/** Opaque visitor session from public gallery client (PMD-042). */
function readVisitorSessionKey(req: Request): string | null {
  const raw = req.header("x-relay-visitor-session")?.trim();
  if (!raw || raw.length > 128) return null;
  return raw;
}

/**
 * @description Validates that string fields exist and are non-empty in a JSON object.
 * @param {Record<string, unknown>} payload Parsed request body.
 * @param {string[]} fields Field names that must be non-empty strings.
 * @returns {Array<{field:string,issue:string}>} Empty when all fields valid.
 */
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

/**
 * When `SUBSCRIBESTAR_CREATOR_REDIRECT_URI` is set, exchanged `redirect_uri` must match exactly (mitigate misuse).
 */
function subscribeStarCreatorRedirectMismatch(
  redirectUri: string
): string | undefined {
  const expected =
    process.env.SUBSCRIBESTAR_CREATOR_REDIRECT_URI?.trim() ||
    process.env.SUBSCRIBESTAR_RELAY_CREATOR_REDIRECT_URI?.trim();
  if (!expected) return undefined;
  if (redirectUri.trim() !== expected) {
    return "redirect_uri must match SUBSCRIBESTAR_CREATOR_REDIRECT_URI.";
  }
  return undefined;
}

/**
 * @description Partial JSON body fields: absent → undefined; JSON `null` → null (clear); strings trimmed.
 * @param {unknown} value JSON field value.
 * @returns {string|null|undefined} Normalized optional string semantics.
 */
function readOptionalString(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value === "string") return value.trim();
  return undefined;
}

/**
 * @description Parses an optional strict boolean JSON field (no type coercion from string).
 * @param {unknown} value JSON field value.
 * @returns {boolean|undefined} Boolean when provided and correct type; otherwise undefined.
 */
function readOptionalBoolean(value: unknown): boolean | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value === "boolean") return value;
  return undefined;
}

/**
 * @description Parses an optional JSON integer (finite, integral `number` only).
 * @param {unknown} value JSON field value.
 * @returns {number|undefined} Integer or undefined.
 */
function readOptionalInt(value: unknown): number | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value === "number" && Number.isFinite(value) && Number.isInteger(value)) {
    return value;
  }
  return undefined;
}

/**
 * @description Extracts a bearer access token from `Authorization` header (RFC-style).
 * @param {Request} req Express request.
 * @returns {string|undefined} Token string without `Bearer ` prefix, or undefined.
 * @security-audit-required Token parsing; downstream must bind token to `user_id` / Supabase subject before data access.
 */
function bearerAccessTokenFromRequest(req: Request): string | undefined {
  const raw = req.header("authorization");
  if (typeof raw !== "string") return undefined;
  const m = /^Bearer\s+(\S+)/i.exec(raw.trim());
  return m?.[1];
}

/**
 * @description Coerces query-string or JSON values to boolean (recursive for arrays).
 * @param {unknown} value Parsed query param (`string`, `boolean`, or array of either).
 * @returns {boolean} True when any fragment matches `1`/`true`/`yes`.
 */
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

/**
 * @description Env flag: `1` / `true` / `yes` (case-insensitive); mirrors `main.ts` helper with empty-string guard.
 * @param {string|undefined} raw Environment variable value.
 * @returns {boolean} True when enabled.
 */
function relayEnvTruthy(raw: string | undefined): boolean {
  if (raw === undefined || raw.trim() === "") {
    return false;
  }
  const s = raw.trim().toLowerCase();
  return s === "1" || s === "true" || s === "yes";
}

/**
 * @description Whether `DbIdentityStore` (Postgres) should back identity instead of JSON file store.
 * @param {AppConfig} config App configuration (explicit flag wins over env).
 * @returns {boolean} True when DB identity store is selected.
 * @see prisma/schema.prisma Identity-related models
 * @see env `RELAY_DB_STORE_IDENTITY`
 */
function useDbIdentityStore(config: AppConfig): boolean {
  if (typeof config.relay_db_store_identity === "boolean") {
    return config.relay_db_store_identity;
  }
  return relayEnvTruthy(process.env.RELAY_DB_STORE_IDENTITY);
}

/**
 * @description Whether canonical ingest data is read/written via `DbCanonicalStore`.
 * @param {AppConfig} config
 * @returns {boolean}
 * @see prisma/schema.prisma Canonical / ingest tables
 * @see env `RELAY_DB_STORE_CANONICAL`
 */
function useDbCanonicalStore(config: AppConfig): boolean {
  if (typeof config.relay_db_store_canonical === "boolean") {
    return config.relay_db_store_canonical;
  }
  return relayEnvTruthy(process.env.RELAY_DB_STORE_CANONICAL);
}

/**
 * @description Whether Patreon sync watermarks use `DbSyncWatermarkStore` vs file.
 * @param {AppConfig} config
 * @returns {boolean}
 * @see src/jsdoc-core-entities.ts `SyncStatus` conceptual mapping
 * @see env `RELAY_DB_STORE_WATERMARK`
 */
function useDbSyncWatermarkStore(config: AppConfig): boolean {
  if (typeof config.relay_db_store_watermark === "boolean") {
    return config.relay_db_store_watermark;
  }
  return relayEnvTruthy(process.env.RELAY_DB_STORE_WATERMARK);
}

/**
 * @description Whether creator sync health snapshots use DB vs JSON (`creator_sync_states`).
 * @param {AppConfig} config
 * @returns {boolean}
 * @see env `RELAY_DB_STORE_SYNC_HEALTH`
 */
function useDbPatreonSyncHealthStore(config: AppConfig): boolean {
  if (typeof config.relay_db_store_sync_health === "boolean") {
    return config.relay_db_store_sync_health;
  }
  return relayEnvTruthy(process.env.RELAY_DB_STORE_SYNC_HEALTH);
}

/**
 * @description Whether post visibility overrides use `post_overrides` table.
 * @param {AppConfig} config
 * @returns {boolean}
 * @see env `RELAY_DB_STORE_OVERRIDES`
 */
function useDbGalleryOverridesStore(config: AppConfig): boolean {
  if (typeof config.relay_db_store_overrides === "boolean") {
    return config.relay_db_store_overrides;
  }
  return relayEnvTruthy(process.env.RELAY_DB_STORE_OVERRIDES);
}

/**
 * @description Whether gallery collections use DB vs JSON file.
 * @param {AppConfig} config
 * @returns {boolean}
 * @see env `RELAY_DB_STORE_COLLECTIONS`
 */
function useDbCollectionsStore(config: AppConfig): boolean {
  if (typeof config.relay_db_store_collections === "boolean") {
    return config.relay_db_store_collections;
  }
  return relayEnvTruthy(process.env.RELAY_DB_STORE_COLLECTIONS);
}

/**
 * @description Whether saved gallery filters use DB vs JSON file.
 * @param {AppConfig} config
 * @returns {boolean}
 * @see env `RELAY_DB_STORE_SAVED_FILTERS`
 */
function useDbSavedFiltersStore(config: AppConfig): boolean {
  if (typeof config.relay_db_store_saved_filters === "boolean") {
    return config.relay_db_store_saved_filters;
  }
  return relayEnvTruthy(process.env.RELAY_DB_STORE_SAVED_FILTERS);
}

/**
 * @description Whether page layout documents use DB vs JSON (`page_layout` path).
 * @param {AppConfig} config
 * @returns {boolean}
 * @see src/jsdoc-core-entities.ts `Gallery.layout_json` alignment
 * @see env `RELAY_DB_STORE_LAYOUT`
 */
function useDbPageLayoutStore(config: AppConfig): boolean {
  if (typeof config.relay_db_store_layout === "boolean") {
    return config.relay_db_store_layout;
  }
  return relayEnvTruthy(process.env.RELAY_DB_STORE_LAYOUT);
}

/**
 * @description Whether ingest DLQ uses `job_runs` / DB implementation.
 * @param {AppConfig} config
 * @returns {boolean}
 * @see env `RELAY_DB_STORE_DLQ`
 */
function useDbDlqStore(config: AppConfig): boolean {
  if (typeof config.relay_db_store_dlq === "boolean") {
    return config.relay_db_store_dlq;
  }
  return relayEnvTruthy(process.env.RELAY_DB_STORE_DLQ);
}

/**
 * @description Whether durable outbox (`outbox_events`) backs the event bus buffer.
 * @param {AppConfig} config
 * @returns {boolean}
 * @see env `RELAY_DB_STORE_EVENTS`
 */
function useDbEventBus(config: AppConfig): boolean {
  if (typeof config.relay_db_store_events === "boolean") {
    return config.relay_db_store_events;
  }
  return relayEnvTruthy(process.env.RELAY_DB_STORE_EVENTS);
}

/**
 * @description Whether analytics snapshots use DB vs `analytics.json`.
 * @param {AppConfig} config
 * @returns {boolean}
 * @see env `RELAY_DB_STORE_ANALYTICS`
 */
function useDbAnalyticsStore(config: AppConfig): boolean {
  if (typeof config.relay_db_store_analytics === "boolean") {
    return config.relay_db_store_analytics;
  }
  return relayEnvTruthy(process.env.RELAY_DB_STORE_ANALYTICS);
}

/**
 * @description Whether patron favorites/collections engagement stores use DB vs JSON files.
 * @param {AppConfig} config
 * @returns {boolean}
 * @see env `RELAY_DB_STORE_PATRON_ENGAGEMENT`
 * @security-audit-required Patron-owned data; RLS must scope by `user_id` / membership when on Supabase.
 */
function useDbPatronEngagementStore(config: AppConfig): boolean {
  if (typeof config.relay_db_store_patron_engagement === "boolean") {
    return config.relay_db_store_patron_engagement;
  }
  return relayEnvTruthy(process.env.RELAY_DB_STORE_PATRON_ENGAGEMENT);
}

/**
 * @description Whether static site clone metadata uses DB vs JSON.
 * @param {AppConfig} config
 * @returns {boolean}
 * @see env `RELAY_DB_STORE_CLONE`
 */
function useDbCloneStore(config: AppConfig): boolean {
  if (typeof config.relay_db_store_clone === "boolean") {
    return config.relay_db_store_clone;
  }
  return relayEnvTruthy(process.env.RELAY_DB_STORE_CLONE);
}

/**
 * @description Whether payment provider linking uses DB vs `payments.json`.
 * @param {AppConfig} config
 * @returns {boolean}
 * @see env `RELAY_DB_STORE_PAYMENTS`
 */
function useDbPaymentStore(config: AppConfig): boolean {
  if (typeof config.relay_db_store_payments === "boolean") {
    return config.relay_db_store_payments;
  }
  return relayEnvTruthy(process.env.RELAY_DB_STORE_PAYMENTS);
}

/**
 * @description Whether campaign migration records use DB vs file.
 * @param {AppConfig} config
 * @returns {boolean}
 * @see env `RELAY_DB_STORE_MIGRATION`
 */
function useDbMigrationStore(config: AppConfig): boolean {
  if (typeof config.relay_db_store_migration === "boolean") {
    return config.relay_db_store_migration;
  }
  return relayEnvTruthy(process.env.RELAY_DB_STORE_MIGRATION);
}

/**
 * @description Whether deploy run history uses DB vs file.
 * @param {AppConfig} config
 * @returns {boolean}
 * @see env `RELAY_DB_STORE_DEPLOY`
 */
function useDbDeployStore(config: AppConfig): boolean {
  if (typeof config.relay_db_store_deploy === "boolean") {
    return config.relay_db_store_deploy;
  }
  return relayEnvTruthy(process.env.RELAY_DB_STORE_DEPLOY);
}

/**
 * @description Whether creator OAuth credentials use `DbPatreonTokenStore` (Prisma) vs JSON credentials file.
 * @param {AppConfig} config
 * @returns {boolean}
 * @see env `RELAY_DB_STORE_CREATOR_OAUTH`
 */
function useDbCreatorOAuthStore(config: AppConfig): boolean {
  if (typeof config.relay_db_store_creator_oauth === "boolean") {
    return config.relay_db_store_creator_oauth;
  }
  return relayEnvTruthy(process.env.RELAY_DB_STORE_CREATOR_OAUTH);
}

/**
 * @description True if any Relay persistence flag selects a DB-backed implementation (requires `config.prisma`).
 * @param {AppConfig} config
 * @returns {boolean}
 * @throws {Error} Indirectly via `createApp` when true but `prisma` absent.
 */
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

/**
 * @description Unattached READY media listed by `GET /api/v1/relay/library/staging` (Discord + direct Relay upload).
 * @const {import("@prisma/client").MediaIngestOrigin[]} RELAY_LIBRARY_STAGING_INGEST_ORIGINS
 * @see prisma/schema.prisma `MediaAsset` ingestOrigin / processingStatus
 */
const RELAY_LIBRARY_STAGING_INGEST_ORIGINS: MediaIngestOrigin[] = [
  MediaIngestOrigin.DISCORD,
  MediaIngestOrigin.RELAY_UPLOAD
];

/**
 * @async
 * @description Loads recent staging `MediaAsset` rows for library UI (non-attached, READY).
 * @param {PrismaClient} prisma Database client.
 * @param {string} creatorId Owning creator id (must match authenticated creator).
 * @param {MediaIngestOrigin[]} ingestOrigins Allowed source origins filter.
 * @returns {Promise<object[]>} Selected columns for list mapping (max 100).
 * @throws {Error} On Prisma query failure (connection, RLS, etc.).
 * @security-audit-required Must only be called after creator auth proves `creatorId` ownership / `tenant_id`.
 */
async function findRelayLibraryStagingRows(
  prisma: PrismaClient,
  creatorId: string,
  ingestOrigins: MediaIngestOrigin[]
) {
  return prisma.mediaAsset.findMany({
    where: {
      creatorId,
      ingestOrigin: { in: ingestOrigins },
      primaryPostId: null,
      autopostDraftId: null,
      processingStatus: MediaProcessingStatus.READY
    },
    orderBy: { currentIngestedAt: "desc" },
    take: 100,
    select: {
      id: true,
      currentMimeType: true,
      currentIngestedAt: true,
      discordCaptureJson: true,
      ingestOrigin: true,
      manualImportStagingJson: true
    }
  });
}

/**
 * @description Maps DB rows to API list shape for Discord-originated staging assets.
 * @param {string} creatorId Creator id for URL path encoding.
 * @param {Awaited<ReturnType<typeof findRelayLibraryStagingRows>>} rows Staging query rows.
 * @returns {object[]} Client list DTOs.
 */
function mapDiscordStagingListItems(
  creatorId: string,
  rows: Awaited<ReturnType<typeof findRelayLibraryStagingRows>>
) {
  return rows.map((r) => ({
    media_id: r.id,
    mime_type: r.currentMimeType,
    ingested_at: r.currentIngestedAt.toISOString(),
    content_url_path: `/api/v1/export/media/${encodeURIComponent(creatorId)}/${encodeURIComponent(r.id)}/content`,
    thumb_url_path: r.currentMimeType?.startsWith("image/")
      ? `/api/v1/export/media/${encodeURIComponent(creatorId)}/${encodeURIComponent(r.id)}/thumb`
      : "",
    discord_capture: r.discordCaptureJson
  }));
}

/**
 * @description Maps staging rows for combined library list including `ingest_origin` discriminator.
 * @param {string} creatorId Creator id for URL path encoding.
 * @param {Awaited<ReturnType<typeof findRelayLibraryStagingRows>>} rows Staging query rows.
 * @returns {object[]} Client list DTOs.
 */
function mapRelayLibraryStagingListItems(
  creatorId: string,
  rows: Awaited<ReturnType<typeof findRelayLibraryStagingRows>>
) {
  return rows.map((r) => ({
    media_id: r.id,
    mime_type: r.currentMimeType,
    ingested_at: r.currentIngestedAt.toISOString(),
    content_url_path: `/api/v1/export/media/${encodeURIComponent(creatorId)}/${encodeURIComponent(r.id)}/content`,
    thumb_url_path: r.currentMimeType?.startsWith("image/")
      ? `/api/v1/export/media/${encodeURIComponent(creatorId)}/${encodeURIComponent(r.id)}/thumb`
      : "",
    ingest_origin: r.ingestOrigin,
    discord_capture: r.ingestOrigin === MediaIngestOrigin.DISCORD ? r.discordCaptureJson : null,
    manual_import_staging: r.manualImportStagingJson
  }));
}

function manualImportStagingRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  return typeof record.bin_prisma_tier_id === "string" && typeof record.bin_title === "string"
    ? record
    : null;
}

function isManualImportLibraryCommitted(value: unknown): boolean {
  const record = manualImportStagingRecord(value);
  if (!record) return true;
  return typeof record.committed_to_library_at === "string" && record.committed_to_library_at.trim().length > 0;
}

function isManualImportBinPending(value: unknown): boolean {
  const record = manualImportStagingRecord(value);
  return Boolean(record && !isManualImportLibraryCommitted(record));
}

/**
 * @async
 * @description Deletes staged media when caller proves creator + ingest-origin constraints; enqueues R2 purge when a storage key exists.
 * @param {PrismaClient} prisma Database client (transactional).
 * @param {string} mediaId Target media asset id.
 * @param {string} creatorId Owning creator id.
 * @param {MediaIngestOrigin[]} allowedOrigins Deletable origins whitelist.
 * @param {string} purgeReason Audit label passed to purge queue.
 * @returns {Promise<boolean>} False when no matching row (no-op).
 * @throws {Error} On transaction failure or enqueue errors bubbling from Prisma layer.
 * @see src/storage/media-storage-purge-service.ts `enqueueMediaStoragePurge`
 * @security-audit-required Destructive; verify route always passes authenticated creator matching `creatorId`.
 */
async function deleteRelayStagedMediaForOrigins(
  prisma: PrismaClient,
  mediaId: string,
  creatorId: string,
  allowedOrigins: MediaIngestOrigin[],
  purgeReason: string
): Promise<boolean> {
  const row = await prisma.mediaAsset.findFirst({
    where: {
      id: mediaId,
      creatorId,
      ingestOrigin: { in: allowedOrigins },
      primaryPostId: null
    },
    select: { id: true, currentStorageKey: true }
  });
  if (!row) return false;
  await prisma.$transaction(async (tx) => {
    const key = row.currentStorageKey?.trim();
    if (key) {
      await enqueueMediaStoragePurge(tx, {
        storageKey: key,
        creatorId,
        formerMediaId: row.id,
        reason: purgeReason
      });
    }
    await tx.mediaAsset.delete({ where: { id: mediaId } });
  });
  return true;
}

async function patronMatureGateForMediaExport(
  config: AppConfig,
  args: {
    session: SessionToken | null;
    creatorId: string;
    mediaId: string;
    snapshot: Parameters<typeof findPostIdForExportedMedia>[0];
    overrides: GalleryOverridesRoot;
    isContentOwner: boolean;
  }
): Promise<{ hideMatureContent?: boolean; isPostMature?: boolean }> {
  if (args.isContentOwner || !args.session || !config.prisma) {
    return {};
  }
  const hideMatureContent = await loadPatronHideMatureContent(
    config.prisma,
    args.session.user_id
  );
  if (!hideMatureContent) {
    return {};
  }
  const postId = findPostIdForExportedMedia(args.snapshot, args.creatorId, args.mediaId);
  if (!postId) {
    return { hideMatureContent: true, isPostMature: false };
  }
  const postRow = args.snapshot.posts[args.creatorId]?.[postId];
  const isPostMature = postRow
    ? isPostMatureFromPatronSurfaces({
        overrides: args.overrides,
        creatorId: args.creatorId,
        postId,
        activeMediaIds: postRow.current.media_ids ?? []
      })
    : false;
  return { hideMatureContent: true, isPostMature };
}

/**
 * @description Wires Relay services, persistence implementations, and all Express routes from `AppConfig`.
 * @param {AppConfig} config Patreon keys, store flags, optional `prisma`, path roots, and feature toggles.
 * @returns {CreateAppResult} Express `app` plus service handles consumed by `main.ts` and tests.
 * @throws {Error} When token encryption key missing; when any DB store flag is true but `config.prisma` undefined; service constructors may throw on invalid paths.
 * @see src/main.ts Entry wiring and worker startup
 * @see src/jsdoc-core-entities.ts Domain typedefs
 * @todo Further modularize route registration to reduce static analysis / coverage gaps in this factory.
 */
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
  registerUsageMeteringPrisma(() => config.prisma);
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
    },
    config.prisma
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
  // PE-K (BO-P2-05) — Idempotency-Key store. Single in-memory instance shared across all
  // mutating route middleware via per-route scopes. Multi-node future swaps in a Redis-backed
  // implementation behind the same interface (see src/middleware/idempotency-store.ts header).
  const idempotencyStore = new InMemoryIdempotencyStore();
  const buildIdem = (scope: string) =>
    buildIdempotencyMiddleware({ store: idempotencyStore, scope });
  const layoutStore = useDbPageLayoutStore(config)
    ? new DbPageLayoutStore(config.prisma!)
    : new FilePageLayoutStore(config.page_layout_store_path ?? ".relay-data/page_layout.json");
  const galleryService = new GalleryService(canonicalStore, exportIndex, galleryOverridesStore, {
    loadPostPresentations: config.prisma
      ? (creatorId) => loadPostPresentationOverlaysFromDb(config.prisma!, creatorId)
      : undefined
  });
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
      : exportRequireTierAccessFromEnv();
  const paymentStore = useDbPaymentStore(config)
    ? new DbPaymentStore(config.prisma!)
    : new FilePaymentStore(config.payment_store_path ?? ".relay-data/payments.json");
  const paymentAdapters = new Map<string, InstanceType<typeof StripeAdapter> | InstanceType<typeof PayPalAdapter>>();
  // [R-SEC-21 @security-review 2026-06] Do not inject fake placeholder credentials in production: leave
  // them empty so a misconfigured prod deploy fails closed rather than appearing configured. Dev keeps the
  // convenient test placeholders. (Live charges are also blocked in prod — see R-SEC-07.)
  const isProductionRuntime = process.env.NODE_ENV === "production";
  paymentAdapters.set(
    "stripe",
    new StripeAdapter(
      config.stripe_secret_key ?? (isProductionRuntime ? "" : "sk_test_placeholder"),
      config.stripe_webhook_secret ?? (isProductionRuntime ? "" : "whsec_placeholder")
    )
  );
  paymentAdapters.set(
    "paypal",
    new PayPalAdapter(
      config.paypal_client_id ?? (isProductionRuntime ? "" : "paypal_test_id"),
      config.paypal_client_secret ?? (isProductionRuntime ? "" : "paypal_test_secret")
    )
  );
  const paymentService = new PaymentService(paymentStore, cloneService, paymentAdapters, {
    prisma: config.prisma,
    relay_db_store_analytics: config.relay_db_store_analytics
  });
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
  const authService = new PatreonAuthService(
    patreonClient,
    tokenStore,
    eventBus,
    config.fetch_impl ?? globalThis.fetch
  );
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
    creatorCampaignDisplayStore,
    config.prisma ?? null
  );
  const patreonMemberSyncCoordinator = new PatreonMemberSyncCoordinator(
    patreonSyncService,
    patreonSyncHealthStore,
    60_000
  );

  const guardStudioSyncWritable = (res: Response, traceId: string, creatorId: string) =>
    assertCreatorSyncWritable(res, traceId, patreonSyncHealthStore, creatorId);

  const serverLog = createLogger({ name: "relay-server" });

  const publicWebhookBaseResolved =
    config.public_webhook_base_url?.trim() || resolvePublicWebhookBaseFromEnv();
  const publicWebhookBaseConfigured = Boolean(publicWebhookBaseResolved?.trim());
  if (!publicWebhookBaseConfigured) {
    serverLog.warn(
      "[relay] RELAY_PUBLIC_WEBHOOK_BASE_URL is not set — Patreon platform webhooks cannot be registered. " +
        "Set RELAY_PUBLIC_WEBHOOK_BASE_URL (or PUBLIC_WEBHOOK_BASE_URL) to your public Relay API origin in production."
    );
  }

  const subscribeStarIngestEnvEnabled = relayEnvTruthy(process.env.SUBSCRIBESTAR_INGEST_ENABLED);

  let subscribeStarCreatorOAuthClient: SubscribeStarOAuthClient | undefined;
  let subscribeStarCreatorAuthService: SubscribeStarCreatorAuthService | undefined;
  let subscribeStarGraphqlIngestUrl: string | undefined;

  let subscribeStarPatronOAuthClient: SubscribeStarOAuthClient | undefined;
  let subscribeStarPatronGraphqlUrl: string | undefined;

  if (
    subscribeStarIngestEnvEnabled &&
    useDbCreatorOAuthStore(config) &&
    config.prisma
  ) {
    const subOriginTrim = (
      config.subscribestar_api_origin?.trim() ||
      process.env.SUBSCRIBESTAR_API_ORIGIN?.trim() ||
      "https://subscribestar.adult"
    ).replace(/\/$/, "");
    const creatorCid =
      config.subscribestar_creator_client_id?.trim() ||
      process.env.SUBSCRIBESTAR_RELAY_CREATOR_CLIENT_ID?.trim() ||
      process.env.SUBSCRIBESTAR_CREATOR_CLIENT_ID?.trim();
    const creatorSecret =
      config.subscribestar_creator_client_secret?.trim() ||
      process.env.SUBSCRIBESTAR_RELAY_CREATOR_SECRET?.trim() ||
      process.env.SUBSCRIBESTAR_CREATOR_CLIENT_SECRET?.trim();
    const fetchImplSs = config.fetch_impl ?? globalThis.fetch;
    if (creatorCid && creatorSecret) {
      subscribeStarCreatorOAuthClient = new SubscribeStarOAuthClient({
        client_id: creatorCid,
        client_secret: creatorSecret,
        token_url: `${subOriginTrim}/oauth2/token`,
        fetch_impl: fetchImplSs
      });
      const ssTokenStore = new DbSubscribeStarCreatorTokenStore(config.prisma, encryption);
      subscribeStarGraphqlIngestUrl = `${subOriginTrim}/api/graphql/v1`;
      subscribeStarCreatorAuthService = new SubscribeStarCreatorAuthService(
        subscribeStarCreatorOAuthClient,
        ssTokenStore,
        eventBus,
        fetchImplSs,
        subscribeStarGraphqlIngestUrl,
        config.prisma
      );
    } else {
      serverLog.warn(
        "[relay] SUBSCRIBESTAR_INGEST_ENABLED is set but creator OAuth env is incomplete " +
          "(SUBSCRIBESTAR_RELAY_CREATOR_CLIENT_ID + SUBSCRIBESTAR_RELAY_CREATOR_SECRET, or *_CREATOR_CLIENT_* aliases)."
      );
    }
  }

  {
    const subOriginPatron = (
      config.subscribestar_api_origin?.trim() ||
      process.env.SUBSCRIBESTAR_API_ORIGIN?.trim() ||
      "https://subscribestar.adult"
    ).replace(/\/$/, "");
    const patronCid =
      process.env.SUBSCRIBESTAR_PATRON_CLIENT_ID?.trim() ||
      process.env.SUBSCRIBESTAR_RELAY_CREATOR_CLIENT_ID?.trim() ||
      process.env.SUBSCRIBESTAR_CREATOR_CLIENT_ID?.trim();
    const patronSecret =
      process.env.SUBSCRIBESTAR_PATRON_CLIENT_SECRET?.trim() ||
      process.env.SUBSCRIBESTAR_RELAY_CREATOR_SECRET?.trim() ||
      process.env.SUBSCRIBESTAR_CREATOR_CLIENT_SECRET?.trim();
    const fetchPatron = config.fetch_impl ?? globalThis.fetch;
    if (config.prisma && patronCid && patronSecret) {
      subscribeStarPatronOAuthClient = new SubscribeStarOAuthClient({
        client_id: patronCid,
        client_secret: patronSecret,
        token_url: `${subOriginPatron}/oauth2/token`,
        fetch_impl: fetchPatron
      });
      subscribeStarPatronGraphqlUrl = `${subOriginPatron}/api/graphql/v1`;
    }
  }

  const httpRequestLogger = config.http_request_logger ?? createLogger({ name: "relay-http" });

  const app = express();

  app.use((req, res, next) => {
    const traceId = ensureRelayTraceId(req);
    res.setHeader("X-Trace-Id", traceId);
    applyBaselineSecurityHeaders(res);
    const started = performance.now();
    res.on("finish", () => {
      const pathOnly = (req.originalUrl ?? req.url).split("?")[0] ?? "";
      const row = {
        traceId,
        method: req.method,
        path: pathOnly,
        status: res.statusCode,
        durationMs: Math.round(performance.now() - started)
      };
      const emit = resolveHttpAccessLogEmit({
        pathOnly,
        nodeEnv: process.env.NODE_ENV,
        sampleRateEnv: process.env.RELAY_LOG_SAMPLE_RATE,
        random: Math.random
      });
      if (emit === "info") {
        httpRequestLogger.info(row, "http_request");
      } else if (emit === "trace") {
        httpRequestLogger.trace(row, "http_request");
      }
    });
    next();
  });

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

  const discordIngestRawBody = express.raw({
    type: (req) =>
      String(req.headers["content-type"] ?? "")
        .toLowerCase()
        .includes("json"),
    limit: "6mb"
  });

  /**
   * PUBLIC: Stripe-signed SaaS billing webhook (MB-1). Raw body required for signature verify.
   * Disabled (`RELAY_BILLING_ENABLED` unset/false or missing secrets) → 404.
   * @see docs/BILLING_SPINE_BUILD_PLAN.md
   */
  const stripeBillingRawBody = express.raw({
    type: (req) =>
      String(req.headers["content-type"] ?? "")
        .toLowerCase()
        .includes("json"),
    limit: "1mb"
  });
  app.post(
    "/api/v1/billing/webhook",
    stripeBillingRawBody,
    createBillingWebhookHandler({
      prisma: config.prisma,
      log: (msg, ctx) => httpRequestLogger.info(ctx ?? {}, msg)
    })
  );

  /**
   * PUBLIC: EH-042 managed Patreon connector billing webhook.
   * Raw body required for HMAC (same posture as Stripe SaaS billing webhook).
   * Signature required by default — unsigned only with explicit ALLOW_UNSIGNED / SIGNATURE_REQUIRED=0.
   */
  const managedVerifyBillingService = createManagedVerifyBillingService();
  const eh042BillingRawBody = express.raw({
    type: (req) =>
      String(req.headers["content-type"] ?? "")
        .toLowerCase()
        .includes("json"),
    limit: "1mb"
  });
  app.post(
    "/api/v1/escape-hatch/managed-verify-billing/webhook",
    eh042BillingRawBody,
    createManagedVerifyBillingWebhookHandler(managedVerifyBillingService)
  );

  /**
   * Internal: Discord bridge bot → HMAC-signed JSON. Resolves studio via `DiscordChannelBinding`,
   * downloads attachments, server-side PUT to R2, `MediaAsset` + `DiscordMediaIngestKey`.
   */
  app.post("/api/v1/internal/discord/ingest", discordIngestRawBody, async (req: Request, res: Response) => {
    const traceId = traceIdFrom(req);
    if (!config.prisma) {
      return res
        .status(503)
        .json(errorEnvelope("SERVICE_UNAVAILABLE", "Database not configured.", traceId));
    }
    if (!getDiscordIngestHmacSecret()) {
      return res
        .status(503)
        .json(
          errorEnvelope(
            "SERVICE_UNAVAILABLE",
            "Discord ingest is not configured (RELAY_DISCORD_INGEST_HMAC_SECRET).",
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
    const sig =
      req.header(RELAY_DISCORD_SIGNATURE_HEADER) ??
      req.header("x-relay-discord-signature") ??
      "";
    if (!verifyDiscordIngestHmac(raw, sig)) {
      return res
        .status(401)
        .json(errorEnvelope("UNAUTHORIZED", "Invalid Discord ingest HMAC signature.", traceId));
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw.toString("utf8"));
    } catch {
      return res
        .status(400)
        .json(errorEnvelope("VALIDATION_ERROR", "Invalid JSON body.", traceId));
    }
    const payload = parseDiscordIngestPayload(parsed);
    if (!payload) {
      return res
        .status(400)
        .json(
          errorEnvelope(
            "VALIDATION_ERROR",
            "Invalid ingest payload (discord_guild_id, discord_channel_id, discord_message_id, attachments[] required).",
            traceId
          )
        );
    }
    if (payload.attachments.length === 0) {
      return res
        .status(400)
        .json(errorEnvelope("VALIDATION_ERROR", "attachments must be non-empty.", traceId));
    }
    const r2 = getR2ClientConfigFromEnv();
    if (!r2) {
      return res
        .status(503)
        .json(
          errorEnvelope("SERVICE_UNAVAILABLE", "Object storage (R2) is not configured. See .env.example.", traceId)
        );
    }
    const fetchImpl = config.fetch_impl ?? globalThis.fetch;
    const out = await executeDiscordIngest(config.prisma, r2, payload, fetchImpl);
    if ("error" in out) {
      return res
        .status(404)
        .json(
          errorEnvelope(
            "NOT_FOUND",
            "No Discord channel binding for this guild and channel. Link the studio first.",
            traceId
          )
        );
    }
    res.setHeader("Cache-Control", "private, no-store");
    return res.status(200).json(
      successEnvelope(
        {
          relay_creator_id: out.relay_creator_id,
          results: out.results
        },
        traceId
      )
    );
  });

  /**
   * Internal: Discord bridge exchanges a minted link code for `DiscordChannelBinding`.
   * Same HMAC contract as `/api/v1/internal/discord/ingest`.
   */
  app.post("/api/v1/internal/discord/bind", discordIngestRawBody, async (req: Request, res: Response) => {
    const traceId = traceIdFrom(req);
    if (!config.prisma) {
      return res
        .status(503)
        .json(errorEnvelope("SERVICE_UNAVAILABLE", "Database not configured.", traceId));
    }
    if (!getDiscordIngestHmacSecret()) {
      return res
        .status(503)
        .json(
          errorEnvelope(
            "SERVICE_UNAVAILABLE",
            "Discord bind is not configured (RELAY_DISCORD_INGEST_HMAC_SECRET).",
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
    const sig =
      req.header(RELAY_DISCORD_SIGNATURE_HEADER) ??
      req.header("x-relay-discord-signature") ??
      "";
    if (!verifyDiscordIngestHmac(raw, sig)) {
      return res
        .status(401)
        .json(errorEnvelope("UNAUTHORIZED", "Invalid Discord bind HMAC signature.", traceId));
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw.toString("utf8"));
    } catch {
      return res
        .status(400)
        .json(errorEnvelope("VALIDATION_ERROR", "Invalid JSON body.", traceId));
    }
    const payload = parseDiscordBindPayload(parsed);
    if (!payload) {
      return res
        .status(400)
        .json(
          errorEnvelope(
            "VALIDATION_ERROR",
            "Body requires code, discord_guild_id, discord_channel_id.",
            traceId
          )
        );
    }
    const out = await executeDiscordBind(config.prisma, payload);
    if (!out.ok) {
      const status = out.reason === "expired" ? 410 : 400;
      return res.status(status).json(errorEnvelope("VALIDATION_ERROR", out.message, traceId));
    }
    res.setHeader("Cache-Control", "private, no-store");
    return res.status(200).json(
      successEnvelope(
        { relay_creator_id: out.relay_creator_id, discord_guild_id: payload.discord_guild_id, discord_channel_id: payload.discord_channel_id },
        traceId
      )
    );
  });

  app.use(express.json());
  app.use((req, res, next) => {
    const origin = req.header("Origin")?.trim();
    const path = req.path;
    const corsMethods = "GET,HEAD,POST,PUT,PATCH,DELETE,OPTIONS";
    const corsAllowHeaders =
      "Content-Type, X-Trace-Id, Authorization, Idempotency-Key, X-Relay-Visitor-Session, X-Relay-Pipeline-Parity-Secret, X-Relay-Discord-Signature";

    // EXT-0E — `/api/v1/auth/extension/*`: extension-only for consent/exchange; web UI routes also
    // allow credentialed localhost / RELAY_ALLOWED_WEB_ORIGINS (authorize page, connected-extensions).
    if (path.startsWith(RELAY_EXTENSION_AUTH_API_PREFIX)) {
      const allow = parseRelayExtensionOrigins();
      const extensionCorsOk =
        Boolean(origin) &&
        isBrowserExtensionOrigin(origin!) &&
        allow.has(origin!);
      const isProduction = process.env.NODE_ENV === "production";
      const allowedWebOrigins = parseAllowedWebOrigins();
      const webCorsOk =
        Boolean(origin) &&
        isWebFacingExtensionAuthPath(path) &&
        isCredentialedCorsOrigin(origin!, allowedWebOrigins, isProduction);
      const isExtensionExchange = path === "/api/v1/auth/extension/consent/exchange";
      const corsOk = isExtensionExchange ? extensionCorsOk : extensionCorsOk || webCorsOk;
      if (req.method === "OPTIONS") {
        if (!corsOk) {
          return res.sendStatus(403);
        }
        res.setHeader("Access-Control-Allow-Origin", origin!);
        res.setHeader("Access-Control-Allow-Methods", corsMethods);
        res.setHeader("Access-Control-Allow-Headers", corsAllowHeaders);
        if (webCorsOk) {
          res.setHeader("Access-Control-Allow-Credentials", "true");
          res.setHeader("Vary", "Origin");
        }
        return res.sendStatus(204);
      }
      if (corsOk) {
        res.setHeader("Access-Control-Allow-Origin", origin!);
        if (webCorsOk) {
          res.setHeader("Access-Control-Allow-Credentials", "true");
          res.setHeader("Vary", "Origin");
        }
      }
      next();
      return;
    }

    // [R-SEC-03 HIGH @security-review 2026-06, Tier C] Explicit origin allowlist replaces reflective
    // echo-any-origin. Credentialed responses only for allowlisted origins + localhost in dev.
    // Configure: RELAY_ALLOWED_WEB_ORIGINS=https://app.relayapp.me (comma-separated).
    const isProduction = process.env.NODE_ENV === "production";
    const allowedWebOrigins = parseAllowedWebOrigins();
    if (origin && isCredentialedCorsOrigin(origin, allowedWebOrigins, isProduction)) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Access-Control-Allow-Credentials", "true");
      res.setHeader("Vary", "Origin");
    } else {
      // Unauthenticated public requests (no credentials header means browsers can still use the response).
      res.setHeader("Access-Control-Allow-Origin", "*");
    }
    res.setHeader("Access-Control-Allow-Methods", corsMethods);
    res.setHeader("Access-Control-Allow-Headers", corsAllowHeaders);
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
    <li><a href="/api/v1/platform-metrics/registry">GET /api/v1/platform-metrics/registry</a> — operator dashboard metric registry (PMD-020/030)</li>
    <li>POST /api/v1/platform-metrics/events — first-party telemetry ingestion (PMD-041)</li>
  </ul>
  <p>The <strong>gallery / Patreon connect UI</strong> is the Next.js app: run <code>npm run dev</code> in the <code>web/</code> folder (default <code>http://localhost:3000</code>).</p>
  <p><code>NEXT_PUBLIC_RELAY_API_URL</code> in <code>web/.env.local</code> should point here (e.g. <code>http://127.0.0.1:8787</code>) with <strong>no trailing slash</strong>.</p>
</body>
</html>`);
  });

  // PUBLIC: Liveness probe (no auth) — scrape-friendly health JSON for load balancers / uptime checks.
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

  // PUBLIC: Ingest/DLQ health metrics (no auth) — operational scrape endpoint, no tenant data.
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

  // PUBLIC: OAuth/token-refresh gate metrics (no auth) — operational scrape endpoint, no tenant data.
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

  // PUBLIC: Insight-job health metrics (no auth) — operational scrape endpoint, no tenant data.
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

  // PUBLIC: Export-retrieval health metrics (no auth) — operational scrape endpoint, no tenant data.
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

  /** PMD-020/030 — Operator dashboard registry with Phase 3 wiring from health + domain tables. */
  app.get("/api/v1/platform-metrics/registry", async (req: Request, res: Response) => {
    const traceId = traceIdFrom(req);
    const operatorPolicy = platformOperatorAccessPolicyFromEnv(process.env);
    const operator = await requirePlatformOperatorForRequest({
      req,
      res,
      traceId,
      prisma: config.prisma,
      identityService,
      policy: operatorPolicy
    });
    if (!operator) return;
    try {
      const payload = await buildPlatformMetricRegistry({
        prisma: config.prisma,
        pendingRetryJobs: ingestQueue.pendingCount(),
        dlqRecordCount: await dlq.count()
      });
      auditAllowedPlatformMetricsRegistryRead({
        prisma: config.prisma,
        req,
        traceId,
        accountId: operator.accountId,
        reason: operator.accessReason
      });
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

  /** MB-8 — Tip beta go/no-go funnel (Phase 3 gate input). */
  app.get("/api/v1/platform-metrics/tip-beta-funnel", async (req: Request, res: Response) => {
    const traceId = traceIdFrom(req);
    if (!config.prisma) {
      return res
        .status(503)
        .json(errorEnvelope("SERVICE_UNAVAILABLE", "Database not configured.", traceId));
    }
    const operatorPolicy = platformOperatorAccessPolicyFromEnv(process.env);
    const operator = await requirePlatformOperatorForRequest({
      req,
      res,
      traceId,
      prisma: config.prisma,
      identityService,
      policy: operatorPolicy
    });
    if (!operator) return;
    try {
      const periodRaw =
        typeof req.query.period === "string" ? req.query.period.trim() : "";
      const payload = await computeTipBetaFunnel(config.prisma, {
        periodKey: periodRaw || undefined
      });
      auditAllowedTipBetaFunnelRead({
        prisma: config.prisma,
        req,
        traceId,
        accountId: operator.accountId,
        reason: operator.accessReason
      });
      return res.status(200).json(successEnvelope(payload, traceId));
    } catch (err) {
      if (err instanceof Error && err.message.includes("Invalid period_key")) {
        return res.status(400).json(
          errorEnvelope("VALIDATION_ERROR", err.message, traceId, [
            { field: "period", issue: "invalid_yyyy_mm" }
          ])
        );
      }
      return res.status(500).json(
        errorEnvelope(
          "INTERNAL_ERROR",
          err instanceof Error ? err.message : String(err),
          traceId
        )
      );
    }
  });

  /** PMD-041 — Validate and persist first-party telemetry events for operator dashboard rollups. */
  app.post("/api/v1/platform-metrics/events", async (req: Request, res: Response) => {
    const traceId = traceIdFrom(req);
    const outcome = await ingestFirstPartyEvent(
      {
        prisma: config.prisma,
        relay_db_store_analytics: config.relay_db_store_analytics
      },
      req.body,
      traceId
    );

    if (!outcome.ok) {
      const status =
        outcome.code === "STORAGE_UNAVAILABLE"
          ? 503
          : outcome.code === "EVENT_NOT_ACCEPTED"
            ? 422
            : 400;
      return res.status(status).json(
        errorEnvelope(
          outcome.code,
          outcome.message,
          traceId,
          outcome.errors.map((issue) => ({ field: "payload", issue }))
        )
      );
    }

    return res.status(202).json(successEnvelope(outcome.result, traceId));
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

  app.post(
    "/api/v1/auth/extension/consent/start",
    async (req: Request, res: Response, next) => {
      const traceId = traceIdFrom(req);
      const body = (req.body ?? {}) as Record<string, unknown>;
      const details = validateRequiredFields(body, ["installation_id"]);
      if (details.length > 0) {
        return res
          .status(400)
          .json(errorEnvelope("VALIDATION_ERROR", "Invalid request payload.", traceId, details));
      }
      if (!getExtensionConsentSecret()) {
        return res.status(503).json(
          errorEnvelope(
            "SERVICE_UNAVAILABLE",
            "RELAY_EXTENSION_CONSENT_SECRET must be set (min 16 characters) to issue extension consent codes.",
            traceId
          )
        );
      }
      if (!config.prisma) {
        return res.status(503).json(
          errorEnvelope("SERVICE_UNAVAILABLE", "Database required for extension consent.", traceId)
        );
      }
      const sessionStart = await requirePatronBearerSession(req, res, traceId);
      if (!sessionStart) {
        return;
      }
      const accountIdStart = await getAccountIdForSession(config.prisma, sessionStart);
      if (!accountIdStart) {
        return res
          .status(403)
          .json(errorEnvelope("FORBIDDEN", "Session is not linked to an account.", traceId));
      }
      const installationIdStart = String(body.installation_id).trim();
      if (!installationIdStart) {
        return res.status(400).json(
          errorEnvelope("VALIDATION_ERROR", "installation_id is required.", traceId, [
            { field: "installation_id", issue: "empty" }
          ])
        );
      }
      (req as Request & { relayRateLimitKey?: string }).relayRateLimitKey = accountIdStart;
      res.locals.extensionConsentStart = {
        traceId,
        accountId: accountIdStart,
        installationId: installationIdStart
      };
      next();
    },
    consentStart,
    async (req: Request, res: Response) => {
      const loc = res.locals.extensionConsentStart as
        | { traceId: string; accountId: string; installationId: string }
        | undefined;
      if (!loc) {
        const traceId = traceIdFrom(req);
        return res
          .status(500)
          .json(errorEnvelope("INTERNAL_ERROR", "Missing extension consent context.", traceId));
      }
      const { traceId, accountId, installationId } = loc;
      try {
        const { consent_code, expires_at } = signExtensionConsentCode({
          accountId,
          installationId
        });
        return res.status(200).json(
          successEnvelope({ consent_code, expires_at }, traceId)
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
    }
  );

  // PUBLIC: one-time consent code is the credential; rate-limited (EXT-0D).
  app.post("/api/v1/auth/extension/consent/exchange", consentExchange, async (req: Request, res: Response) => {
    const traceId = traceIdFrom(req);
    const body = (req.body ?? {}) as Record<string, unknown>;
    const details = validateRequiredFields(body, ["consent_code", "installation_id"]);
    if (details.length > 0) {
      return res
        .status(400)
        .json(errorEnvelope("VALIDATION_ERROR", "Invalid request payload.", traceId, details));
    }
    if (!getExtensionConsentSecret()) {
      return res.status(503).json(
        errorEnvelope(
          "SERVICE_UNAVAILABLE",
          "RELAY_EXTENSION_CONSENT_SECRET is not configured.",
          traceId
        )
      );
    }
    if (!config.prisma) {
      return res.status(503).json(
        errorEnvelope(
          "SERVICE_UNAVAILABLE",
          "Database required for extension consent exchange.",
          traceId
        )
      );
    }
    const consentCodeRaw = String(body.consent_code).trim();
    const installationIdEx = String(body.installation_id).trim();
    const verifiedEx = verifyExtensionConsentCode(consentCodeRaw);
    if (!verifiedEx.ok) {
      if (verifiedEx.reason === "expired") {
        return res
          .status(410)
          .json(errorEnvelope("CONSENT_CODE_EXPIRED", "Consent code has expired.", traceId));
      }
      return res.status(400).json(
        errorEnvelope("VALIDATION_ERROR", "Invalid consent code.", traceId, [
          { field: "consent_code", issue: verifiedEx.reason }
        ])
      );
    }
    if (isExtensionConsentCodeConsumed(consentCodeRaw)) {
      return res
        .status(409)
        .json(errorEnvelope("CONSENT_CODE_USED", "This consent code was already used.", traceId));
    }
    if (verifiedEx.installationId !== installationIdEx) {
      return res.status(400).json(
        errorEnvelope(
          "VALIDATION_ERROR",
          "installation_id does not match the consent code.",
          traceId,
          [{ field: "installation_id", issue: "mismatch" }]
        )
      );
    }
    const uaRaw = req.headers["user-agent"];
    const ua = typeof uaRaw === "string" ? uaRaw.trim() : "";
    const label = [installationIdEx, ua].filter(Boolean).join(" · ") || installationIdEx;
    let sessionToken: SessionToken;
    try {
      sessionToken = await identityService.issueExtensionSessionForAccount(
        verifiedEx.accountId,
        label
      );
    } catch (e) {
      return res.status(502).json(
        errorEnvelope(
          "EXTENSION_SESSION_ERROR",
          e instanceof Error ? e.message : String(e),
          traceId
        )
      );
    }
    markExtensionConsentCodeConsumed(consentCodeRaw);
    const tokenRow = await config.prisma.session.findUnique({
      where: { tokenHash: hashOpaqueSessionToken(sessionToken.token) },
      select: { id: true }
    });
    if (!tokenRow?.id) {
      return res.status(502).json(
        errorEnvelope(
          "EXTENSION_SESSION_ERROR",
          "Could not resolve extension session id after issuance.",
          traceId
        )
      );
    }
    const accountEx = await config.prisma.account.findUnique({
      where: { id: verifiedEx.accountId },
      select: { primaryRelayCreatorId: true }
    });
    return res.status(200).json(
      successEnvelope(
        {
          token: sessionToken.token,
          token_id: tokenRow.id,
          expires_at: sessionToken.expires_at,
          label: sessionToken.label ?? label,
          account_id: verifiedEx.accountId,
          relay_creator_id: accountEx?.primaryRelayCreatorId ?? null
        },
        traceId
      )
    );
  });

  app.get("/api/v1/auth/extension/grants", async (req: Request, res: Response) => {
    const traceId = traceIdFrom(req);
    if (!config.prisma) {
      return res.status(503).json(
        errorEnvelope("SERVICE_UNAVAILABLE", "Database required.", traceId)
      );
    }
    const sessionGrants = await requirePatronBearerSession(req, res, traceId);
    if (!sessionGrants) {
      return;
    }
    const accountIdGrants = await getAccountIdForSession(config.prisma, sessionGrants);
    if (!accountIdGrants) {
      return res
        .status(403)
        .json(errorEnvelope("FORBIDDEN", "Session is not linked to an account.", traceId));
    }
    const rows = await config.prisma.session.findMany({
      where: {
        kind: SessionKind.extension,
        revokedAt: null,
        tenantMembership: { accountId: accountIdGrants },
        expiresAt: { gt: new Date() }
      },
      select: {
        id: true,
        label: true,
        expiresAt: true,
        createdAt: true,
        lastUsedAt: true
      },
      orderBy: { createdAt: "desc" }
    });
    return res.status(200).json(
      successEnvelope(
        {
          grants: rows.map((r) => ({
            token_id: r.id,
            label: r.label,
            expires_at: r.expiresAt?.toISOString() ?? null,
            created_at: r.createdAt.toISOString(),
            last_used_at: r.lastUsedAt?.toISOString() ?? null
          }))
        },
        traceId
      )
    );
  });

  app.delete("/api/v1/auth/extension/grants/:tokenId", async (req: Request, res: Response) => {
    const traceId = traceIdFrom(req);
    if (!config.prisma) {
      return res.status(503).json(
        errorEnvelope("SERVICE_UNAVAILABLE", "Database required.", traceId)
      );
    }
    const sessionRev = await requirePatronBearerSession(req, res, traceId);
    if (!sessionRev) {
      return;
    }
    const accountIdRev = await getAccountIdForSession(config.prisma, sessionRev);
    if (!accountIdRev) {
      return res
        .status(403)
        .json(errorEnvelope("FORBIDDEN", "Session is not linked to an account.", traceId));
    }
    const tokenId = String(req.params.tokenId ?? "").trim();
    if (!tokenId) {
      return res
        .status(400)
        .json(errorEnvelope("VALIDATION_ERROR", "tokenId is required.", traceId));
    }
    const del = await config.prisma.session.deleteMany({
      where: {
        id: tokenId,
        kind: SessionKind.extension,
        tenantMembership: { accountId: accountIdRev }
      }
    });
    if (del.count === 0) {
      return res.status(404).json(errorEnvelope("NOT_FOUND", "Extension grant not found.", traceId));
    }
    return res.status(200).json(
      successEnvelope({ token_id: tokenId, revoked: true }, traceId)
    );
  });

  /**
   * Extension cross-post — owner-authorized Patreon draft package for a Relay-native post.
   * Relay web sends only `relay_post_id` to the extension; the extension fetches this route.
   */
  app.get("/api/v1/extension/cross-post/patreon/:post_id", async (req: Request, res: Response) => {
    const traceId = traceIdFrom(req);
    if (!config.prisma) {
      return res.status(503).json(
        errorEnvelope("SERVICE_UNAVAILABLE", "Database required.", traceId)
      );
    }
    const session = await requirePatronBearerSession(req, res, traceId);
    if (!session) {
      return;
    }
    if (session.kind !== SessionKind.extension) {
      return res.status(403).json(
        errorEnvelope("FORBIDDEN", "Extension grant required.", traceId)
      );
    }
    const accountId = await getAccountIdForSession(config.prisma, session);
    if (!accountId) {
      return res
        .status(403)
        .json(errorEnvelope("FORBIDDEN", "Session is not linked to an account.", traceId));
    }
    const postId = typeof req.params.post_id === "string" ? req.params.post_id.trim() : "";
    if (!postId) {
      return res
        .status(400)
        .json(errorEnvelope("VALIDATION_ERROR", "post_id is required.", traceId));
    }
    const result = await buildPatreonCrossPostPackage(config.prisma, { postId, accountId });
    switch (result.status) {
      case "no_primary_creator":
        return res.status(403).json(
          errorEnvelope(
            "FORBIDDEN",
            "Relay workspace not provisioned for this account.",
            traceId
          )
        );
      case "forbidden":
        return res.status(403).json(
          errorEnvelope("FORBIDDEN", "Post is not owned by this account.", traceId)
        );
      case "not_found":
        return res.status(404).json(
          errorEnvelope("NOT_FOUND", "Relay post not found.", traceId)
        );
      case "ok":
        res.setHeader("Cache-Control", "private, no-store");
        return res.status(200).json(successEnvelope(result.package, traceId));
    }
  });

  /**
   * Extension cross-post — owner-authorized X compose package for a Relay-native post.
   */
  app.get("/api/v1/extension/cross-post/x/:post_id", async (req: Request, res: Response) => {
    const traceId = traceIdFrom(req);
    if (!config.prisma) {
      return res.status(503).json(
        errorEnvelope("SERVICE_UNAVAILABLE", "Database required.", traceId)
      );
    }
    const session = await requirePatronBearerSession(req, res, traceId);
    if (!session) {
      return;
    }
    if (session.kind !== SessionKind.extension) {
      return res.status(403).json(
        errorEnvelope("FORBIDDEN", "Extension grant required.", traceId)
      );
    }
    const accountId = await getAccountIdForSession(config.prisma, session);
    if (!accountId) {
      return res
        .status(403)
        .json(errorEnvelope("FORBIDDEN", "Session is not linked to an account.", traceId));
    }
    const postId = typeof req.params.post_id === "string" ? req.params.post_id.trim() : "";
    if (!postId) {
      return res
        .status(400)
        .json(errorEnvelope("VALIDATION_ERROR", "post_id is required.", traceId));
    }
    const result = await buildXCrossPostPackage(config.prisma, { postId, accountId });
    switch (result.status) {
      case "no_primary_creator":
        return res.status(403).json(
          errorEnvelope(
            "FORBIDDEN",
            "Relay workspace not provisioned for this account.",
            traceId
          )
        );
      case "forbidden":
        return res.status(403).json(
          errorEnvelope("FORBIDDEN", "Post is not owned by this account.", traceId)
        );
      case "not_found":
        return res.status(404).json(
          errorEnvelope("NOT_FOUND", "Relay post not found.", traceId)
        );
      case "ok":
        res.setHeader("Cache-Control", "private, no-store");
        return res.status(200).json(successEnvelope(result.package, traceId));
    }
  });

  /**
   * Extension cross-post — owner-authorized DeviantArt submit package for a Relay-native post.
   */
  app.get("/api/v1/extension/cross-post/deviantart/:post_id", async (req: Request, res: Response) => {
    const traceId = traceIdFrom(req);
    if (!config.prisma) {
      return res.status(503).json(
        errorEnvelope("SERVICE_UNAVAILABLE", "Database required.", traceId)
      );
    }
    const session = await requirePatronBearerSession(req, res, traceId);
    if (!session) {
      return;
    }
    if (session.kind !== SessionKind.extension) {
      return res.status(403).json(
        errorEnvelope("FORBIDDEN", "Extension grant required.", traceId)
      );
    }
    const accountId = await getAccountIdForSession(config.prisma, session);
    if (!accountId) {
      return res
        .status(403)
        .json(errorEnvelope("FORBIDDEN", "Session is not linked to an account.", traceId));
    }
    const postId = typeof req.params.post_id === "string" ? req.params.post_id.trim() : "";
    if (!postId) {
      return res
        .status(400)
        .json(errorEnvelope("VALIDATION_ERROR", "post_id is required.", traceId));
    }
    const result = await buildDeviantArtCrossPostPackage(config.prisma, { postId, accountId });
    switch (result.status) {
      case "no_primary_creator":
        return res.status(403).json(
          errorEnvelope(
            "FORBIDDEN",
            "Relay workspace not provisioned for this account.",
            traceId
          )
        );
      case "forbidden":
        return res.status(403).json(
          errorEnvelope("FORBIDDEN", "Post is not owned by this account.", traceId)
        );
      case "not_found":
        return res.status(404).json(
          errorEnvelope("NOT_FOUND", "Relay post not found.", traceId)
        );
      case "ok":
        res.setHeader("Cache-Control", "private, no-store");
        return res.status(200).json(successEnvelope(result.package, traceId));
    }
  });

  /**
   * Extension cross-post — package assembled from an approved distribution attempt/variant.
   */
  app.get("/api/v1/extension/cross-post/attempts/:attempt_id", async (req: Request, res: Response) => {
    const traceId = traceIdFrom(req);
    if (!config.prisma) {
      return res.status(503).json(
        errorEnvelope("SERVICE_UNAVAILABLE", "Database required.", traceId)
      );
    }
    const session = await requirePatronBearerSession(req, res, traceId);
    if (!session) {
      return;
    }
    if (session.kind !== SessionKind.extension) {
      return res.status(403).json(
        errorEnvelope("FORBIDDEN", "Extension grant required.", traceId)
      );
    }
    const accountId = await getAccountIdForSession(config.prisma, session);
    if (!accountId) {
      return res
        .status(403)
        .json(errorEnvelope("FORBIDDEN", "Session is not linked to an account.", traceId));
    }
    const attemptId = typeof req.params.attempt_id === "string" ? req.params.attempt_id.trim() : "";
    if (!attemptId) {
      return res
        .status(400)
        .json(errorEnvelope("VALIDATION_ERROR", "attempt_id is required.", traceId));
    }
    const result = await buildCrossPostPackageFromAttempt(config.prisma, accountId, attemptId);
    switch (result.status) {
      case "no_primary_creator":
        return res.status(403).json(
          errorEnvelope(
            "FORBIDDEN",
            "Relay workspace not provisioned for this account.",
            traceId
          )
        );
      case "forbidden":
        return res.status(403).json(
          errorEnvelope("FORBIDDEN", "Attempt is not owned by this account.", traceId)
        );
      case "not_found":
        return res.status(404).json(
          errorEnvelope("NOT_FOUND", "Distribution attempt not found.", traceId)
        );
      case "invalid_media_binding":
        return res.status(400).json(
          errorEnvelope("VALIDATION_ERROR", result.message, traceId)
        );
      case "ok":
        await config.prisma.postDistributionAttempt.update({
          where: { id: attemptId },
          data: { status: "package_fetched" }
        });
        res.setHeader("Cache-Control", "private, no-store");
        return res.status(200).json(
          successEnvelope(
            {
              destination: result.destination,
              package: result.package,
              attempt_id: attemptId
            },
            traceId
          )
        );
    }
  });

  /**
   * Phase 5 — due sticky schedule reminders for extension grant (SessionKind.extension).
   */
  app.get("/api/v1/extension/schedule-reminders/due", async (req: Request, res: Response) => {
    const traceId = traceIdFrom(req);
    if (!config.prisma) {
      return res.status(503).json(
        errorEnvelope("SERVICE_UNAVAILABLE", "Database required.", traceId)
      );
    }
    const session = await requirePatronBearerSession(req, res, traceId);
    if (!session) return;
    if (session.kind !== SessionKind.extension) {
      return res.status(403).json(
        errorEnvelope("FORBIDDEN", "Extension grant required.", traceId)
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
    const relayCreatorId = account?.primaryRelayCreatorId?.trim();
    if (!relayCreatorId) {
      return res.status(404).json(
        errorEnvelope("NOT_FOUND", "No creator studio for this grant.", traceId)
      );
    }
    try {
      const reminders = await listDueScheduleReminders(config.prisma, relayCreatorId);
      const nextUpcoming = await getNextUpcomingScheduleReminderDueAt(
        config.prisma,
        relayCreatorId
      );
      res.setHeader("Cache-Control", "private, no-store");
      return res.status(200).json(
        successEnvelope(
          {
            reminders,
            next_upcoming_due_at: nextUpcoming ? nextUpcoming.toISOString() : null
          },
          traceId
        )
      );
    } catch (err) {
      return res.status(500).json(errorEnvelope("INTERNAL", (err as Error).message, traceId));
    }
  });

  async function resolveExtensionCreatorId(
    req: Request,
    res: Response,
    traceId: string
  ): Promise<string | null> {
    if (!config.prisma) {
      res.status(503).json(errorEnvelope("SERVICE_UNAVAILABLE", "Database required.", traceId));
      return null;
    }
    const session = await requirePatronBearerSession(req, res, traceId);
    if (!session) return null;
    if (session.kind !== SessionKind.extension) {
      res.status(403).json(errorEnvelope("FORBIDDEN", "Extension grant required.", traceId));
      return null;
    }
    const accountId = await getAccountIdForSession(config.prisma, session);
    if (!accountId) {
      res
        .status(403)
        .json(errorEnvelope("FORBIDDEN", "Session is not linked to an account.", traceId));
      return null;
    }
    const account = await config.prisma.account.findUnique({
      where: { id: accountId },
      select: { primaryRelayCreatorId: true }
    });
    const relayCreatorId = account?.primaryRelayCreatorId?.trim();
    if (!relayCreatorId) {
      res.status(404).json(
        errorEnvelope("NOT_FOUND", "No creator studio for this grant.", traceId)
      );
      return null;
    }
    return relayCreatorId;
  }

  app.post(
    "/api/v1/extension/schedule-reminders/:reminder_id/dismiss",
    async (req: Request, res: Response) => {
      const traceId = traceIdFrom(req);
      const relayCreatorId = await resolveExtensionCreatorId(req, res, traceId);
      if (!relayCreatorId || !config.prisma) return;
      const reminderId = String(req.params.reminder_id ?? "").trim();
      try {
        const result = await dismissScheduleReminder(config.prisma, relayCreatorId, reminderId);
        res.setHeader("Cache-Control", "private, no-store");
        return res.status(200).json(successEnvelope(result, traceId));
      } catch (err) {
        if (err instanceof ScheduleReminderValidationError) {
          return res.status(400).json(errorEnvelope("VALIDATION_ERROR", err.message, traceId));
        }
        if (err instanceof ScheduleReminderNotFoundError) {
          return res.status(404).json(errorEnvelope("NOT_FOUND", err.message, traceId));
        }
        return res.status(500).json(errorEnvelope("INTERNAL", (err as Error).message, traceId));
      }
    }
  );

  app.post(
    "/api/v1/extension/schedule-reminders/:reminder_id/presented",
    async (req: Request, res: Response) => {
      const traceId = traceIdFrom(req);
      const relayCreatorId = await resolveExtensionCreatorId(req, res, traceId);
      if (!relayCreatorId || !config.prisma) return;
      const reminderId = String(req.params.reminder_id ?? "").trim();
      try {
        const result = await markScheduleReminderPresented(
          config.prisma,
          relayCreatorId,
          reminderId
        );
        res.setHeader("Cache-Control", "private, no-store");
        return res.status(200).json(successEnvelope(result, traceId));
      } catch (err) {
        if (err instanceof ScheduleReminderValidationError) {
          return res.status(400).json(errorEnvelope("VALIDATION_ERROR", err.message, traceId));
        }
        if (err instanceof ScheduleReminderNotFoundError) {
          return res.status(404).json(errorEnvelope("NOT_FOUND", err.message, traceId));
        }
        return res.status(500).json(errorEnvelope("INTERNAL", (err as Error).message, traceId));
      }
    }
  );

  app.post(
    "/api/v1/extension/schedule-reminders/:reminder_id/snooze",
    async (req: Request, res: Response) => {
      const traceId = traceIdFrom(req);
      const relayCreatorId = await resolveExtensionCreatorId(req, res, traceId);
      if (!relayCreatorId || !config.prisma) return;
      const reminderId = String(req.params.reminder_id ?? "").trim();
      const body = (req.body ?? {}) as Record<string, unknown>;
      const snoozeMinutes =
        typeof body.snooze_minutes === "number"
          ? body.snooze_minutes
          : typeof body.snooze_minutes === "string"
            ? Number.parseInt(body.snooze_minutes, 10)
            : DEFAULT_SNOOZE_MINUTES;
      try {
        const result = await snoozeScheduleReminder(
          config.prisma,
          relayCreatorId,
          reminderId,
          snoozeMinutes
        );
        res.setHeader("Cache-Control", "private, no-store");
        return res.status(200).json(successEnvelope(result, traceId));
      } catch (err) {
        if (err instanceof ScheduleReminderValidationError) {
          return res.status(400).json(errorEnvelope("VALIDATION_ERROR", err.message, traceId));
        }
        if (err instanceof ScheduleReminderNotFoundError) {
          return res.status(404).json(errorEnvelope("NOT_FOUND", err.message, traceId));
        }
        return res.status(500).json(errorEnvelope("INTERNAL", (err as Error).message, traceId));
      }
    }
  );

  app.get("/api/v1/creator/bluesky/credential", async (req: Request, res: Response) => {
    const traceId = traceIdFrom(req);
    if (!config.prisma) {
      return res.status(503).json(
        errorEnvelope("SERVICE_UNAVAILABLE", "Database not configured.", traceId)
      );
    }
    try {
      const { context } = await requireAccountWithRole(
        req,
        { prisma: config.prisma, identityService },
        "creator"
      );
      const relayCreatorId = context.primaryRelayCreatorId?.trim();
      if (!relayCreatorId) {
        return res.status(404).json(
          errorEnvelope(
            "NOT_FOUND",
            "No creator studio — call POST /api/v1/creator/workspace first.",
            traceId
          )
        );
      }
      const credential = await getCreatorBlueskyCredential(config.prisma, relayCreatorId);
      res.setHeader("Cache-Control", "private, no-store");
      return res.status(200).json(successEnvelope({ credential }, traceId));
    } catch (err) {
      if (sendRelayAuthError(res, err, traceId)) return;
      return res.status(500).json(errorEnvelope("INTERNAL", (err as Error).message, traceId));
    }
  });

  app.put("/api/v1/creator/bluesky/credential", async (req: Request, res: Response) => {
    const traceId = traceIdFrom(req);
    if (!config.prisma) {
      return res.status(503).json(
        errorEnvelope("SERVICE_UNAVAILABLE", "Database not configured.", traceId)
      );
    }
    const body = (req.body ?? {}) as Record<string, unknown>;
    try {
      const { context } = await requireAccountWithRole(
        req,
        { prisma: config.prisma, identityService },
        "creator"
      );
      const relayCreatorId = context.primaryRelayCreatorId?.trim();
      if (!relayCreatorId) {
        return res.status(404).json(
          errorEnvelope(
            "NOT_FOUND",
            "No creator studio — call POST /api/v1/creator/workspace first.",
            traceId
          )
        );
      }
      const credential = await putCreatorBlueskyCredential(
        config.prisma,
        encryption,
        relayCreatorId,
        {
          handle: typeof body.handle === "string" ? body.handle : "",
          app_password: typeof body.app_password === "string" ? body.app_password : ""
        }
      );
      res.setHeader("Cache-Control", "private, no-store");
      return res.status(200).json(successEnvelope({ credential }, traceId));
    } catch (err) {
      if (sendRelayAuthError(res, err, traceId)) return;
      if (err instanceof BlueskyCredentialValidationError) {
        return res.status(400).json(
          errorEnvelope("VALIDATION_ERROR", err.message, traceId, err.details)
        );
      }
      return res.status(500).json(errorEnvelope("INTERNAL", (err as Error).message, traceId));
    }
  });

  app.delete("/api/v1/creator/bluesky/credential", async (req: Request, res: Response) => {
    const traceId = traceIdFrom(req);
    if (!config.prisma) {
      return res.status(503).json(
        errorEnvelope("SERVICE_UNAVAILABLE", "Database not configured.", traceId)
      );
    }
    try {
      const { context } = await requireAccountWithRole(
        req,
        { prisma: config.prisma, identityService },
        "creator"
      );
      const relayCreatorId = context.primaryRelayCreatorId?.trim();
      if (!relayCreatorId) {
        return res.status(404).json(
          errorEnvelope(
            "NOT_FOUND",
            "No creator studio — call POST /api/v1/creator/workspace first.",
            traceId
          )
        );
      }
      await deleteCreatorBlueskyCredential(config.prisma, relayCreatorId);
      return res.status(200).json(successEnvelope({ removed: true }, traceId));
    } catch (err) {
      if (sendRelayAuthError(res, err, traceId)) return;
      return res.status(500).json(errorEnvelope("INTERNAL", (err as Error).message, traceId));
    }
  });

  app.post("/api/v1/creator/cross-post/bluesky/:post_id", async (req: Request, res: Response) => {
    const traceId = traceIdFrom(req);
    if (!config.prisma) {
      return res.status(503).json(
        errorEnvelope("SERVICE_UNAVAILABLE", "Database not configured.", traceId)
      );
    }
    const postId = typeof req.params.post_id === "string" ? req.params.post_id.trim() : "";
    if (!postId) {
      return res
        .status(400)
        .json(errorEnvelope("VALIDATION_ERROR", "post_id is required.", traceId));
    }
    try {
      const { context } = await requireAccountWithRole(
        req,
        { prisma: config.prisma, identityService },
        "creator"
      );
      const relayCreatorId = context.primaryRelayCreatorId?.trim();
      if (!relayCreatorId) {
        return res.status(404).json(
          errorEnvelope(
            "NOT_FOUND",
            "No creator studio — call POST /api/v1/creator/workspace first.",
            traceId
          )
        );
      }
      const accountId = context.accountId?.trim();
      if (!accountId) {
        return res.status(403).json(
          errorEnvelope("FORBIDDEN", "Account context missing.", traceId)
        );
      }
      const result = await publishRelayPostToBluesky(config.prisma, encryption, {
        postId,
        accountId
      });
      switch (result.status) {
        case "no_primary_creator":
          return res.status(403).json(
            errorEnvelope("FORBIDDEN", "Relay workspace not provisioned.", traceId)
          );
        case "forbidden":
          return res.status(403).json(
            errorEnvelope("FORBIDDEN", "Post is not owned by this account.", traceId)
          );
        case "not_found":
          return res.status(404).json(
            errorEnvelope("NOT_FOUND", "Relay post not found.", traceId)
          );
        case "not_connected":
          return res.status(409).json(
            errorEnvelope(
              "CONFLICT",
              "Connect Bluesky in Autopost settings before publishing.",
              traceId,
              [{ field: "bluesky", issue: "not_connected" }]
            )
          );
        case "publish_failed":
          return res.status(502).json(
            errorEnvelope("UPSTREAM_ERROR", result.detail, traceId, [
              { field: "bluesky", issue: "publish_failed" }
            ])
          );
        case "ok":
          res.setHeader("Cache-Control", "private, no-store");
          return res.status(200).json(
            successEnvelope(
              {
                relay_post_id: postId,
                uri: result.uri,
                cid: result.cid,
                post_text: result.post_text
              },
              traceId
            )
          );
      }
    } catch (err) {
      if (sendRelayAuthError(res, err, traceId)) return;
      return res.status(500).json(errorEnvelope("INTERNAL", (err as Error).message, traceId));
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

      if (config.prisma) {
        try {
          await ensureCreatorOnboardingAtLeastImportStarted(config.prisma, creatorId);
        } catch (err) {
          serverLog.warn(
            { err, traceId, creatorId },
            "ensureCreatorOnboardingAtLeastImportStarted failed after Patreon OAuth (non-fatal)"
          );
        }
      }

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
            promoteSnapshotToProfile(config.prisma!, creatorCampaignDisplayStore, creatorId).catch(() => {});
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
   * SubscribeStar creator OAuth: signed `state` when `RELAY_ENFORCE_CREATOR_OAUTH_BIND=1`.
   * Requires `RELAY_SUBSCRIBESTAR_OAUTH_STATE_SECRET` (min 16 chars).
   */
  app.post("/api/v1/auth/subscribestar/creator/prepare", async (req: Request, res: Response) => {
    const traceId = traceIdFrom(req);
    if (isPilotPatreonOnlyScope()) {
      return res
        .status(404)
        .json(errorEnvelope("NOT_FOUND", "SubscribeStar is outside Patreon-only pilot scope.", traceId));
    }
    if (!relayEnvTruthy(process.env.SUBSCRIBESTAR_INGEST_ENABLED)) {
      return res
        .status(404)
        .json(errorEnvelope("NOT_FOUND", "SubscribeStar ingest is disabled.", traceId));
    }
    if (!subscribeStarCreatorAuthService || !config.prisma) {
      return res.status(503).json(
        errorEnvelope(
          "SERVICE_UNAVAILABLE",
          "SubscribeStar creator OAuth is not configured (enable SUBSCRIBESTAR_INGEST_ENABLED, OAuth client env, RELAY_DB_STORE_CREATOR_OAUTH).",
          traceId
        )
      );
    }
    const ssBody = (req.body ?? {}) as Record<string, unknown>;
    const ssDetails = validateRequiredFields(ssBody, ["creator_id"]);
    if (ssDetails.length > 0) {
      return res
        .status(400)
        .json(errorEnvelope("VALIDATION_ERROR", "Invalid request payload.", traceId, ssDetails));
    }
    if (!getSubscribeStarOAuthStateSecret()) {
      return res.status(503).json(
        errorEnvelope(
          "SERVICE_UNAVAILABLE",
          "RELAY_SUBSCRIBESTAR_OAUTH_STATE_SECRET must be set (min 16 characters) to issue OAuth state.",
          traceId
        )
      );
    }
    const ssSession = await requirePatronBearerSession(req, res, traceId);
    if (!ssSession) {
      return;
    }
    const ssAccountId = await getAccountIdForSession(config.prisma, ssSession);
    if (!ssAccountId) {
      return res
        .status(403)
        .json(errorEnvelope("FORBIDDEN", "Session is not linked to an account.", traceId));
    }
    const ssCreatorId = String(ssBody.creator_id).trim();
    const ssOwns = await accountOwnsRelayCreatorId(config.prisma, ssAccountId, ssCreatorId);
    if (!ssOwns) {
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
      const { state: ssState, expiresAtIso: ssExpires } = signCreatorSubscribeStarOAuthState({
        accountId: ssAccountId,
        creatorId: ssCreatorId
      });
      return res.status(200).json(
        successEnvelope(
          {
            state: ssState,
            creator_id: ssCreatorId,
            expires_at: ssExpires
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

  app.post("/api/v1/auth/subscribestar/creator/exchange", async (req: Request, res: Response) => {
    const traceId = traceIdFrom(req);
    if (isPilotPatreonOnlyScope()) {
      return res
        .status(404)
        .json(errorEnvelope("NOT_FOUND", "SubscribeStar is outside Patreon-only pilot scope.", traceId));
    }
    if (!relayEnvTruthy(process.env.SUBSCRIBESTAR_INGEST_ENABLED)) {
      return res
        .status(404)
        .json(errorEnvelope("NOT_FOUND", "SubscribeStar ingest is disabled.", traceId));
    }
    if (!subscribeStarCreatorAuthService || !config.prisma) {
      return res.status(503).json(
        errorEnvelope(
          "SERVICE_UNAVAILABLE",
          "SubscribeStar creator OAuth is not configured.",
          traceId
        )
      );
    }
    const sseBody = (req.body ?? {}) as Record<string, unknown>;
    const sseDetails = validateRequiredFields(sseBody, ["creator_id", "code", "redirect_uri"]);
    if (sseDetails.length > 0) {
      return res
        .status(400)
        .json(errorEnvelope("VALIDATION_ERROR", "Invalid request payload.", traceId, sseDetails));
    }
    const sseRedirectUri = String(sseBody.redirect_uri ?? "").trim();
    const sseRdErr = subscribeStarCreatorRedirectMismatch(sseRedirectUri);
    if (sseRdErr) {
      return res.status(400).json(
        errorEnvelope("VALIDATION_ERROR", sseRdErr, traceId, [{ field: "redirect_uri", issue: "invalid" }])
      );
    }

    const sseCreatorId = String(sseBody.creator_id).trim();

    if (relayEnvTruthy(process.env.RELAY_ENFORCE_CREATOR_OAUTH_BIND)) {
      if (!relayCreatorSecretBypassesOAuthBind(req)) {
        const sseSession = await requirePatronBearerSession(req, res, traceId);
        if (!sseSession) {
          return;
        }
        const sseAccountId = await getAccountIdForSession(config.prisma!, sseSession);
        if (!sseAccountId) {
          return res
            .status(403)
            .json(errorEnvelope("FORBIDDEN", "Session is not linked to an account.", traceId));
        }
        const sseStateRaw = typeof sseBody.state === "string" ? sseBody.state.trim() : "";
        if (!sseStateRaw) {
          return res.status(400).json(
            errorEnvelope("VALIDATION_ERROR", "Invalid request payload.", traceId, [
              { field: "state", issue: "missing" }
            ])
          );
        }
        const sseVerify = verifyCreatorSubscribeStarOAuthState(sseStateRaw, sseAccountId, sseCreatorId);
        if (!sseVerify.ok) {
          return res.status(403).json(
            errorEnvelope(
              "FORBIDDEN",
              `OAuth state verification failed (${sseVerify.reason}).`,
              traceId
            )
          );
        }
        const sseOwnsExchange = await accountOwnsRelayCreatorId(
          config.prisma!,
          sseAccountId,
          sseCreatorId
        );
        if (!sseOwnsExchange) {
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
      const sseResult = await subscribeStarCreatorAuthService.exchangeCodeAndPersist(
        sseCreatorId,
        sseBody.code as string,
        sseRedirectUri,
        traceId
      );
      try {
        await ensureCreatorOnboardingAtLeastImportStarted(config.prisma!, sseCreatorId);
      } catch (sseOnbErr) {
        serverLog.warn(
          { err: sseOnbErr, traceId, creatorId: sseCreatorId },
          "ensureCreatorOnboardingAtLeastImportStarted failed after SubscribeStar OAuth (non-fatal)"
        );
      }
      return res.status(200).json(successEnvelope(sseResult, traceId));
    } catch (sseErr) {
      return res
        .status(502)
        .json(errorEnvelope("UPSTREAM_AUTH_ERROR", (sseErr as Error).message, traceId));
    }
  });

  app.post("/api/v1/auth/subscribestar/creator/refresh", async (req: Request, res: Response) => {
    const traceId = traceIdFrom(req);
    if (isPilotPatreonOnlyScope()) {
      return res
        .status(404)
        .json(errorEnvelope("NOT_FOUND", "SubscribeStar is outside Patreon-only pilot scope.", traceId));
    }
    if (!relayEnvTruthy(process.env.SUBSCRIBESTAR_INGEST_ENABLED)) {
      return res
        .status(404)
        .json(errorEnvelope("NOT_FOUND", "SubscribeStar ingest is disabled.", traceId));
    }
    if (!subscribeStarCreatorAuthService) {
      return res.status(503).json(
        errorEnvelope("SERVICE_UNAVAILABLE", "SubscribeStar creator OAuth is not configured.", traceId)
      );
    }
    const ssrBody = (req.body ?? {}) as Record<string, unknown>;
    const ssrDetails = validateRequiredFields(ssrBody, ["creator_id"]);
    if (ssrDetails.length > 0) {
      return res
        .status(400)
        .json(errorEnvelope("VALIDATION_ERROR", "Invalid request payload.", traceId, ssrDetails));
    }
    try {
      const ssrResult = await subscribeStarCreatorAuthService.refreshAndRotate(
        ssrBody.creator_id as string,
        traceId
      );
      return res.status(200).json(successEnvelope(ssrResult, traceId));
    } catch (ssrErr) {
      const code = (ssrErr as Error).message.includes("not found") ? "NOT_FOUND" : "UPSTREAM_AUTH_ERROR";
      const status = code === "NOT_FOUND" ? 404 : 502;
      return res.status(status).json(errorEnvelope(code, (ssrErr as Error).message, traceId));
    }
  });

  /**
   * Patron OAuth: exchange code with Patreon, GET /v2/identity, sync `tier_ids` like member
   * sync (`patreon_tier_*`), issue Relay session. When DB identity is enabled, persists
   * tokens to `patron_oauth_credentials` for PE-H refresh.
   *
   * **Hard-deprecated (PE-A, 2026-04-20).** A Patreon login alone must never create a Relay
   * `Account`; verified-email registration is required first. By default this route returns
   * `403 RELAY_ACCOUNT_REQUIRED` and clients should drive users to `/login` then call
   * `POST /api/v1/auth/patreon/patron/link` (session-first). Set
   * `RELAY_PATREON_PATRON_ALLOW_LEGACY_EXCHANGE=1` ONLY for emergency rollback.
   */
  app.post("/api/v1/auth/patreon/patron/exchange", async (req: Request, res: Response) => {
    const traceId = traceIdFrom(req);
    res.setHeader(
      "Deprecation",
      'true; successor="/api/v1/auth/patreon/patron/link" for session-first multi-campaign Patreon link'
    );

    if (!relayEnvTruthy(process.env.RELAY_PATREON_PATRON_ALLOW_LEGACY_EXCHANGE)) {
      return res.status(403).json(
        errorEnvelope(
          "RELAY_ACCOUNT_REQUIRED",
          "Sign in to a verified Relay account first, then link Patreon via POST /api/v1/auth/patreon/patron/link.",
          traceId
        )
      );
    }

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
        fetchImpl,
        ...(useDbIdentityStore(config) && config.prisma
          ? { prisma: config.prisma, encryption }
          : {})
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

  /**
   * PE-A — Session-first unified Patreon link: same scopes as `/exchange`, but pulls full
   * identity (`extractUnifiedPatreonIdentity`) and upserts all on-Relay memberships.
   * Requires Bearer or `relay_session` cookie. Response includes `linked_relay_creator_ids`,
   * `owned_relay_creator_id`, and `unmapped_patreon_campaign_ids` for the "Connect your Campaign" modal.
   */
  app.post("/api/v1/auth/patreon/patron/link", async (req: Request, res: Response) => {
    const traceId = traceIdFrom(req);
    const preSession = await requirePatronBearerSession(req, res, traceId);
    if (!preSession) return;
    if (!useDbIdentityStore(config) || !config.prisma) {
      return res.status(503).json(
        errorEnvelope(
          "NOT_AVAILABLE",
          "Unified Patreon link requires database-backed identity (RELAY_DB_STORE_IDENTITY).",
          traceId
        )
      );
    }
    const body = (req.body ?? {}) as Record<string, unknown>;
    const linkDetails = validateRequiredFields(body, ["code", "redirect_uri"]);
    if (linkDetails.length > 0) {
      return res
        .status(400)
        .json(errorEnvelope("VALIDATION_ERROR", "Invalid request payload.", traceId, linkDetails));
    }
    const linkAccountId = await getAccountIdForSession(config.prisma, preSession);
    if (!linkAccountId) {
      return res
        .status(404)
        .json(errorEnvelope("NOT_FOUND", "Account not found for session.", traceId));
    }
    const emailGate = await checkPatreonLinkEmailGate(config.prisma, linkAccountId);
    if (!emailGate.ok) {
      return res
        .status(emailGate.httpStatus)
        .json(errorEnvelope(emailGate.code, emailGate.message, traceId));
    }
    const fetchImpl = config.fetch_impl ?? globalThis.fetch;
    try {
      const result = await exchangePatreonPatronOAuthUnified({
        code: body.code as string,
        redirectUri: body.redirect_uri as string,
        patreonClient,
        identityService,
        fetchImpl,
        prisma: config.prisma,
        encryption,
        anchorMembershipId: preSession.user_id
      });
      setSessionCookie(res, result.session.token, {
        expiresAtIso: result.session.expires_at
      });
      await setActiveRoleCookieForNewSession(
        res,
        config.prisma,
        result.session,
        result.session.expires_at
      );
      return res.status(200).json(
        successEnvelope(
          applyDualWriteToken({
            token: result.session.token,
            user_id: result.session.user_id,
            tier_ids: result.session.tier_ids,
            expires_at: result.session.expires_at,
            auth_provider: result.user.auth_provider,
            patreon_user_id: result.user.patreon_user_id,
            linked_relay_creator_ids: result.linkedRelayCreatorIds,
            paid_membership_relay_creator_ids: result.paidMembershipRelayCreatorIds,
            declined_patron_relay_creator_ids: result.declinedPatronRelayCreatorIds,
            former_patron_relay_creator_ids: result.formerPatronRelayCreatorIds,
            free_follower_relay_creator_ids: result.freeFollowerRelayCreatorIds,
            owned_relay_creator_id: result.ownedRelayCreatorId,
            unmapped_patreon_campaign_ids: result.unmappedPatreonCampaignIds
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

  /**
   * PE-A — Unlink Patreon: drop encrypted refresh token, clear Patreon id on `Account`,
   * clear patron tier rows, invalidate entitlement snapshots (immediate stale). Session stays.
   */
  app.delete("/api/v1/auth/patreon/patron/link", async (req: Request, res: Response) => {
    const traceId = traceIdFrom(req);
    const session = await requirePatronBearerSession(req, res, traceId);
    if (!session) return;
    if (!useDbIdentityStore(config) || !config.prisma) {
      return res.status(503).json(
        errorEnvelope(
          "NOT_AVAILABLE",
          "Patreon unlink requires database-backed identity (RELAY_DB_STORE_IDENTITY).",
          traceId
        )
      );
    }
    const prisma = config.prisma;
    const accountId = await getAccountIdForSession(prisma, session);
    if (!accountId) {
      return res
        .status(404)
        .json(errorEnvelope("NOT_FOUND", "Account not found for session.", traceId));
    }

    // Safety net: refuse to unlink Patreon when it is the account's only login method. With the
    // PE-A policy (`/exchange` hard-deprecated, email-verify gate on `/link`) this should never
    // fire for new accounts, but legacy Patreon-only accounts predate the gate. If the unlink
    // proceeded, the user would lose all sign-in paths.
    const accountLoginMethods = await prisma.account.findUnique({
      where: { id: accountId },
      select: { passwordHash: true, supabaseUserId: true }
    });
    if (
      !accountLoginMethods?.passwordHash &&
      !accountLoginMethods?.supabaseUserId
    ) {
      return res.status(409).json(
        errorEnvelope(
          "LAST_LOGIN_METHOD",
          "Patreon is your only sign-in method. Add an email + password (or link a Supabase account) before disconnecting Patreon.",
          traceId
        )
      );
    }

    const memberships = await prisma.tenantMembership.findMany({
      where: { accountId },
      select: { id: true }
    });
    const patronMembershipIds = memberships.map((m) => m.id);

    const credResult = await prisma.patronOAuthCredential.deleteMany({
      where: { accountId }
    });

    const snapshotCount = await invalidatePatronEntitlementSnapshotsForMemberships(
      prisma,
      patronMembershipIds
    );

    await prisma.tenantMembership.updateMany({
      where: { accountId, role: TenantRole.patron },
      data: { tierIds: [] }
    });

    await prisma.account.update({
      where: { id: accountId },
      data: {
        patronPatreonUserId: null,
        identityAuthProvider: IdentityAuthProvider.independent
      }
    });

    return res.status(200).json(
      successEnvelope(
        {
          unlinked: true,
          patron_oauth_credential_deleted: credResult.count > 0,
          entitlement_snapshots_invalidated: snapshotCount
        },
        traceId
      )
    );
  });

  /**
   * SubscribeStar subscriber OAuth — merge `substar_tier_*` ids into the patron entitlement snapshot for one creator.
   * Requires `SUBSCRIBESTAR_PATRON_SUBSCRIPTIONS_GRAPHQL_QUERY` (validated in Explorer) plus creator `subscribestarProfileId`.
   */
  app.post("/api/v1/auth/subscribestar/patron/link", async (req: Request, res: Response) => {
    const traceId = traceIdFrom(req);
    if (isPilotPatreonOnlyScope()) {
      return res
        .status(404)
        .json(errorEnvelope("NOT_FOUND", "SubscribeStar is outside Patreon-only pilot scope.", traceId));
    }
    const session = await requirePatronBearerSession(req, res, traceId);
    if (!session) return;
    if (!useDbIdentityStore(config) || !config.prisma) {
      return res.status(503).json(
        errorEnvelope(
          "NOT_AVAILABLE",
          "SubscribeStar patron link requires database-backed identity (RELAY_DB_STORE_IDENTITY).",
          traceId
        )
      );
    }
    if (!subscribeStarPatronOAuthClient || !subscribeStarPatronGraphqlUrl?.trim()) {
      return res.status(503).json(
        errorEnvelope(
          "NOT_AVAILABLE",
          "SubscribeStar patron OAuth is not configured. Set SUBSCRIBESTAR_PATRON_CLIENT_ID and SUBSCRIBESTAR_PATRON_CLIENT_SECRET (or reuse creator SUBSCRIBESTAR_* client env).",
          traceId
        )
      );
    }
    const body = (req.body ?? {}) as Record<string, unknown>;
    const details = validateRequiredFields(body, ["code", "redirect_uri", "relay_creator_id"]);
    if (details.length > 0) {
      return res
        .status(400)
        .json(errorEnvelope("VALIDATION_ERROR", "Invalid request payload.", traceId, details));
    }
    const prisma = config.prisma;
    const accountId = await getAccountIdForSession(prisma, session);
    if (!accountId) {
      return res.status(404).json(errorEnvelope("NOT_FOUND", "Account not found for session.", traceId));
    }
    const relayCreatorId = String(body.relay_creator_id).trim();
    try {
      const result = await linkSubscribeStarPatronWithCode({
        prisma,
        encryption,
        fetchImpl: config.fetch_impl ?? globalThis.fetch,
        graphqlUrl: subscribeStarPatronGraphqlUrl.trim(),
        oauthClient: subscribeStarPatronOAuthClient,
        code: String(body.code),
        redirectUri: String(body.redirect_uri),
        accountId,
        relayCreatorId
      });
      return res
        .status(200)
        .json(successEnvelope({ linked: true, tier_ids: result.tier_ids }, traceId));
    } catch (error) {
      return res
        .status(502)
        .json(errorEnvelope("UPSTREAM_AUTH_ERROR", (error as Error).message, traceId));
    }
  });

  app.delete("/api/v1/auth/subscribestar/patron/link", async (req: Request, res: Response) => {
    const traceId = traceIdFrom(req);
    if (isPilotPatreonOnlyScope()) {
      return res
        .status(404)
        .json(errorEnvelope("NOT_FOUND", "SubscribeStar is outside Patreon-only pilot scope.", traceId));
    }
    const session = await requirePatronBearerSession(req, res, traceId);
    if (!session) return;
    if (!config.prisma) {
      return res.status(503).json(
        errorEnvelope("NOT_AVAILABLE", "SubscribeStar unlink requires database-backed identity.", traceId)
      );
    }
    const prisma = config.prisma;
    const accountId = await getAccountIdForSession(prisma, session);
    if (!accountId) {
      return res.status(404).json(errorEnvelope("NOT_FOUND", "Account not found for session.", traceId));
    }
    const del = await prisma.patronSubscribestarOAuthCredential.deleteMany({
      where: { accountId }
    });
    return res.status(200).json(
      successEnvelope({ unsubscribestar_patron_oauth_deleted: del.count > 0 }, traceId)
    );
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
      const fallbackCampaignId =
        !campaignId && config.prisma
          ? (await getCreatorProfilePatreonCampaignIdForRelayCreatorDb(
              config.prisma,
              creatorId
            )) ?? undefined
          : undefined;
      const state = await patreonSyncService.getSyncState(creatorId, {
        campaign_id: campaignId || undefined,
        fallback_campaign_id: fallbackCampaignId,
        probe_upstream: probeUpstream,
        traceId
      });
      const whMeta = await patreonWebhookMetadataStore.getByCreatorId(creatorId);
      const sync_health = creatorSyncHealthStateToWebDto({
        last_post_scrape: state.last_post_scrape ?? undefined,
        last_member_sync: state.last_member_sync ?? undefined
      });
      return res.status(200).json(
        successEnvelope(
          {
            ...state,
            sync_health,
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
      const fallbackCampaignId =
        !campaignId && config.prisma
          ? (await getCreatorProfilePatreonCampaignIdForRelayCreatorDb(
              config.prisma,
              creatorId.trim()
            )) ?? undefined
          : undefined;
      const result = await patreonSyncService.scrapeOrSync(creatorId, traceId, {
        campaign_id: campaignId || undefined,
        fallback_campaign_id: fallbackCampaignId,
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
          serverLog.warn(
            {
              patreonCampaignId: result.patreon_campaign_id,
              relayCreatorId: creatorId.trim(),
              existingCreatorId: idx.existing_creator_id
            },
            "patreon campaign index collision"
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
        serverLog.warn(
          {
            patreonCampaignId: result.patreon_campaign_id,
            relayCreatorId: String(body.creator_id).trim(),
            existingCreatorId: idx.existing_creator_id
          },
          "patreon campaign index collision"
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

  app.post("/api/v1/patreon/sync-post-access", async (req: Request, res: Response) => {
    const traceId = traceIdFrom(req);
    const body = (req.body ?? {}) as Record<string, unknown>;
    const details = validateRequiredFields(body, ["creator_id"]);
    if (details.length > 0) {
      return res
        .status(400)
        .json(errorEnvelope("VALIDATION_ERROR", "Invalid request payload.", traceId, details));
    }
    const accessCreatorId = (body.creator_id as string).trim();
    if (
      !(await assertCreatorRelayMutationAllowed(
        req,
        res,
        traceId,
        config.prisma,
        accessCreatorId
      ))
    ) {
      return;
    }
    if (!config.prisma) {
      return res
        .status(503)
        .json(
          errorEnvelope(
            "DB_UNAVAILABLE",
            "Database not wired — cannot sync post access.",
            traceId
          )
        );
    }
    try {
      const fallbackCampaignId =
        typeof body.campaign_id !== "string" || !body.campaign_id.trim()
          ? (await getCreatorProfilePatreonCampaignIdForRelayCreatorDb(
              config.prisma,
              accessCreatorId
            )) ?? undefined
          : undefined;
      const result = await patreonSyncService.syncPostAccess(accessCreatorId, traceId, {
        campaign_id: typeof body.campaign_id === "string" ? body.campaign_id.trim() : undefined,
        fallback_campaign_id: fallbackCampaignId,
        max_post_pages:
          typeof body.max_post_pages === "number" && Number.isFinite(body.max_post_pages)
            ? body.max_post_pages
            : undefined
      });
      return res.status(200).json(successEnvelope(result, traceId));
    } catch (err: unknown) {
      const msg = (err as Error).message;
      const notFound = msg.includes("No Patreon tokens");
      return res
        .status(notFound ? 404 : 502)
        .json(errorEnvelope(notFound ? "NOT_FOUND" : "POST_ACCESS_SYNC_ERROR", msg, traceId));
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
    // [R-SEC-06 HIGH @security-review 2026-06] Legacy UNSIGNED webhook: any caller with a creator_id can
    // trigger scrapeOrSync (DoS / resource burn). Disabled in production (see legacyInsecureRouteDisabled);
    // route real deliveries through the signed platform webhook. See docs/security-review-2026-06.md.
    const traceId = traceIdFrom(req);
    if (legacyInsecureRouteDisabled()) {
      return res
        .status(404)
        .json(errorEnvelope("NOT_FOUND", "This endpoint is disabled. Use the signed Patreon platform webhook.", traceId));
    }
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

  app.post(
    "/api/v1/patreon/cookie",
    async (req: Request, res: Response, next) => {
      const traceId = traceIdFrom(req);
      const body = (req.body ?? {}) as Record<string, unknown>;
      const creatorIdEarly =
        typeof body.creator_id === "string" ? body.creator_id.trim() : "";
      const sessionPost = await requirePatronBearerSession(req, res, traceId);
      if (!sessionPost) {
        return;
      }
      if (!(await requireAccountMatchesCreator(req, res, traceId, creatorIdEarly))) {
        return;
      }
      const rateKey =
        config.prisma != null
          ? ((await getAccountIdForSession(config.prisma, sessionPost)) ?? sessionPost.user_id)
          : sessionPost.user_id;
      (req as Request & { relayRateLimitKey?: string }).relayRateLimitKey = rateKey;
      next();
    },
    cookieWrite,
    async (req: Request, res: Response) => {
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
  }
  );

  app.delete(
    "/api/v1/patreon/cookie",
    async (req: Request, res: Response, next) => {
      const traceId = traceIdFrom(req);
      const body = (req.body ?? {}) as Record<string, unknown>;
      const creatorIdEarlyDel =
        typeof body.creator_id === "string" ? body.creator_id.trim() : "";
      const sessionDel = await requirePatronBearerSession(req, res, traceId);
      if (!sessionDel) {
        return;
      }
      if (!(await requireAccountMatchesCreator(req, res, traceId, creatorIdEarlyDel))) {
        return;
      }
      const rateKeyDel =
        config.prisma != null
          ? ((await getAccountIdForSession(config.prisma, sessionDel)) ?? sessionDel.user_id)
          : sessionDel.user_id;
      (req as Request & { relayRateLimitKey?: string }).relayRateLimitKey = rateKeyDel;
      next();
    },
    cookieWrite,
    async (req: Request, res: Response) => {
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
  }
  );

  app.get("/api/v1/patreon/cookie/status", async (req: Request, res: Response) => {
    const traceId = traceIdFrom(req);
    const creatorId = typeof req.query.creator_id === "string" ? req.query.creator_id.trim() : "";
    const sessionStatus = await requirePatronBearerSession(req, res, traceId);
    if (!sessionStatus) {
      return;
    }
    if (!(await requireAccountMatchesCreator(req, res, traceId, creatorId))) {
      return;
    }
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

  /**
   * SubscribeStar exploratory ingest: validates Explorer-shaped wire JSON, maps to `SyncBatchInput`,
   * then queues or runs sync ingest (same `process_sync` semantics as POST /api/v1/ingest/batches).
   * When `RELAY_DB_STORE_*` canonical + Prisma are enabled, persists `CreatorProviderSyncState.lastPostSync`
   * on synchronous success (best-effort).
   */
  app.post("/api/v1/subscribestar/creator/ingest/batch", async (req: Request, res: Response) => {
    const traceId = traceIdFrom(req);
    if (isPilotPatreonOnlyScope()) {
      return res
        .status(404)
        .json(errorEnvelope("NOT_FOUND", "SubscribeStar is outside Patreon-only pilot scope.", traceId));
    }
    if (!relayEnvTruthy(process.env.SUBSCRIBESTAR_INGEST_ENABLED)) {
      return res
        .status(404)
        .json(errorEnvelope("NOT_FOUND", "SubscribeStar ingest is disabled.", traceId));
    }
    const wireParsed = validateSubscribeStarIngestWire(req.body);
    if (!wireParsed.ok) {
      return res.status(400).json(
        errorEnvelope(
          "VALIDATION_ERROR",
          "Invalid SubscribeStar ingest payload.",
          traceId,
          wireParsed.details
        )
      );
    }
    const batchMapped = buildSubscribeStarSyncBatch(wireParsed.wire);
    const ingestParsed = validateIngestBatchBody(batchMapped);
    if (!ingestParsed.ok) {
      return res.status(400).json(
        errorEnvelope(
          "VALIDATION_ERROR",
          "Invalid mapped ingest batch.",
          traceId,
          ingestParsed.details
        )
      );
    }

    if (
      !(await assertCreatorRelayMutationAllowed(
        req,
        res,
        traceId,
        config.prisma,
        ingestParsed.batch.creator_id
      ))
    ) {
      return;
    }

    const processSync = String(req.query.process_sync) === "true";
    if (!processSync) {
      const jobId = `job_${randomUUID()}`;
      ingestQueue.enqueue({
        id: jobId,
        creator_id: ingestParsed.batch.creator_id,
        trace_id: traceId,
        batch: ingestParsed.batch,
        attempts: 0
      });
      void ingestQueue.drain();
      return res
        .status(202)
        .json(successEnvelope({ job_id: jobId, status: "queued" }, traceId));
    }

    try {
      const ingestResult = await ingestService.runBatch(ingestParsed.batch, traceId);
      if (config.prisma) {
        try {
          await recordSubscribeStarLastPostSync(
            config.prisma,
            ingestParsed.batch.creator_id,
            ingestResult,
            traceId
          );
        } catch (recErr) {
          serverLog.warn(
            {
              err: recErr,
              traceId,
              creatorId: ingestParsed.batch.creator_id
            },
            "recordSubscribeStarLastPostSync failed after ingest (non-fatal)"
          );
        }
      }
      return res.status(200).json(successEnvelope(ingestResult, traceId));
    } catch (ingestErr) {
      return res
        .status(502)
        .json(errorEnvelope("INGEST_ERROR", (ingestErr as Error).message, traceId));
    }
  });

  /**
   * SubscribeStar GraphQL posts sync: env-configured `postsPage` query + creator OAuth → paged wire → ingest `runBatch`.
   * Body: `{ creator_id, max_pages? }` (max_pages 1–50, default `SUBSCRIBESTAR_SYNC_POSTS_MAX_PAGES` or 25).
   */
  app.post("/api/v1/subscribestar/creator/sync/posts", async (req: Request, res: Response) => {
    const traceId = traceIdFrom(req);
    if (isPilotPatreonOnlyScope()) {
      return res
        .status(404)
        .json(errorEnvelope("NOT_FOUND", "SubscribeStar is outside Patreon-only pilot scope.", traceId));
    }
    if (!relayEnvTruthy(process.env.SUBSCRIBESTAR_INGEST_ENABLED)) {
      return res
        .status(404)
        .json(errorEnvelope("NOT_FOUND", "SubscribeStar ingest is disabled.", traceId));
    }
    if (!subscribeStarCreatorAuthService || !subscribeStarGraphqlIngestUrl) {
      return res.status(503).json(
        errorEnvelope(
          "SERVICE_UNAVAILABLE",
          "SubscribeStar creator OAuth service is not initialized.",
          traceId
        )
      );
    }

    const body = (req.body ?? {}) as Record<string, unknown>;
    const creatorId = typeof body.creator_id === "string" ? body.creator_id.trim() : "";
    if (!creatorId) {
      return res.status(400).json(
        errorEnvelope(
          "VALIDATION_ERROR",
          "Missing creator_id.",
          traceId,
          [{ field: "creator_id", issue: "missing" }]
        )
      );
    }

    const defaultMaxRaw = Number(process.env.SUBSCRIBESTAR_SYNC_POSTS_MAX_PAGES ?? "25");
    const fallbackMax =
      Number.isFinite(defaultMaxRaw) && defaultMaxRaw >= 1 ? Math.min(50, Math.floor(defaultMaxRaw)) : 25;
    const maxRaw = body.max_pages;
    const requested =
      typeof maxRaw === "number"
        ? maxRaw
        : typeof maxRaw === "string"
          ? Number(maxRaw)
          : fallbackMax;
    const max_pages =
      Number.isFinite(requested) && requested >= 1 ? Math.min(50, Math.floor(requested)) : fallbackMax;

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

    const fetchImplSs = config.fetch_impl ?? globalThis.fetch;

    try {
      const outcome = await runSubscribeStarPostsGraphqlPagedIngest({
        creator_id: creatorId,
        traceId,
        max_pages,
        deps: {
          graphqlUrl: subscribeStarGraphqlIngestUrl,
          fetchImpl: fetchImplSs,
          getAccessToken: () =>
            subscribeStarCreatorAuthService.resolveAccessTokenForGraphqlApi(creatorId, traceId),
          runBatch: (batch, tid) => ingestService.runBatch(batch, tid),
          ...(config.prisma
            ? {
                persistSubscribeStarProviderSnapshot: async (p) => {
                  await persistSubscribeStarProviderSnapshot(config.prisma!, p.creator_id, p.snapshot);
                }
              }
            : {})
        }
      });

      const lastApply =
        outcome.ok === true ? outcome.last_apply_result : outcome.last_apply_result;
      if (config.prisma && lastApply) {
        try {
          await recordSubscribeStarLastPostSync(config.prisma, creatorId, lastApply, traceId);
        } catch (recErr) {
          serverLog.warn(
            {
              err: recErr,
              traceId,
              creatorId
            },
            "recordSubscribeStarLastPostSync failed after graphql sync (non-fatal)"
          );
        }
      }

      if (!outcome.ok) {
        return res.status(502).json(
          errorEnvelope("SUBSCRIBESTAR_GRAPHQL_SYNC_ERROR", outcome.issue, traceId, [
            { field: "pages_fetched", issue: String(outcome.pages_fetched) },
            { field: "batches_ingested", issue: String(outcome.batches_ingested) }
          ])
        );
      }

      return res.status(200).json(
        successEnvelope(
          {
            creator_id: creatorId,
            pages_fetched: outcome.pages_fetched,
            batches_ingested: outcome.batches_ingested,
            ended_reason: outcome.ended_reason,
            last_cursor: outcome.last_cursor,
            last_apply_result: outcome.last_apply_result
          },
          traceId
        )
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return res
        .status(502)
        .json(errorEnvelope("SUBSCRIBESTAR_GRAPHQL_SYNC_ERROR", msg, traceId));
    }
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

  // [R-SEC-01 @security-review 2026-06, Tier C] Manifest read routes now require creator-route secret.
  // These are internal pipeline/creator-only routes that expose the full media/post/tier inventory.
  app.get("/api/v1/export/manifests/media-manifest", async (req: Request, res: Response) => {
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
    if (!(await assertCreatorRelayMutationAllowed(req, res, traceId, config.prisma, creatorId))) {
      return;
    }
    const snapshot = await canonicalStore.load();
    const index = await exportIndex.load(creatorId);
    const manifest = buildMediaManifest(creatorId, snapshot, index);
    return res.status(200).json(successEnvelope(manifest, traceId));
  });

  app.get("/api/v1/export/manifests/post-map", async (req: Request, res: Response) => {
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
    if (!(await assertCreatorRelayMutationAllowed(req, res, traceId, config.prisma, creatorId))) {
      return;
    }
    const snapshot = await canonicalStore.load();
    return res.status(200).json(successEnvelope(buildPostMap(creatorId, snapshot), traceId));
  });

  app.get("/api/v1/export/manifests/tier-map", async (req: Request, res: Response) => {
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
    if (!(await assertCreatorRelayMutationAllowed(req, res, traceId, config.prisma, creatorId))) {
      return;
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
    // [R-SEC-01 @security-review 2026-06, Tier C] Require authenticated session for full-library ZIP.
    // The Studio downloads this via a same-origin anchor click (browser sends session cookie) after a
    // cookie-bearing HEAD pre-flight. The session check runs against the file or DB identity store.
    const traceId = traceIdFrom(req);
    const zipToken =
      readSessionCookie(req)?.trim() ??
      req.header("authorization")?.replace(/^Bearer\s+/i, "").trim() ??
      "";
    if (!zipToken || !(await identityService.resolveSession(zipToken))) {
      return res
        .status(401)
        .json(errorEnvelope("AUTH_ERROR", "Authentication required to download library ZIP.", traceId));
    }
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
      scheduleLibraryZipUsage(config.prisma, creatorId, res.statusCode);
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
    // [R-SEC-01 CRITICAL / R-SEC-09 HIGH @security-review 2026-06] Tier paywall defaults ON in production
    // (exportRequireTierAccessFromEnv). Mature gate runs when session present or tier gate enabled.
    // library-zip/manifest auth still TODO. See docs/security-review-2026-06.md.
    const traceId = traceIdFrom(req);
    try {
      const content = await exportService.getExportContent(
        req.params.creator_id,
        req.params.media_id
      );
      if (!content) {
        recordContentDeliveryFailure();
        return res
          .status(404)
          .json(errorEnvelope("NOT_FOUND", "Exported media not found.", traceId));
      }
      const { record, buffer: bytes } = content;
      // [R-SEC-09 @security-review 2026-06] Enforce the patron "hide 18+" preference on byte delivery even
      // when the tier paywall (exportRequireTierAccess) is off. Anonymous requests carry no preference, so
      // the resolution is skipped unless a session is present or the tier gate is enabled — keeping the
      // unauthenticated hot path fast. See docs/security-review-2026-06.md.
      const bearer = req.header("authorization")?.replace(/^Bearer\s+/i, "").trim() ?? "";
      const session = bearer ? await identityService.resolveSession(bearer) : null;
      const mediaAccess = await resolveMediaExportAccessContext(
        config.prisma,
        session,
        req.params.creator_id
      );
      if (
        shouldApplyMediaExportEntitlementGates({
          session,
          exportRequireTierAccess,
          isContentOwner: mediaAccess.isContentOwner
        })
      ) {
        const snapshot = await canonicalStore.load();
        const overrides = await galleryOverridesStore.load();
        const matureGate = await patronMatureGateForMediaExport(config, {
          session,
          creatorId: req.params.creator_id,
          mediaId: req.params.media_id,
          snapshot,
          overrides,
          isContentOwner: mediaAccess.isContentOwner
        });
        if (matureGate.hideMatureContent && matureGate.isPostMature) {
          recordContentDeliveryFailure();
          return res
            .status(403)
            .json(errorEnvelope("FORBIDDEN", "18+ content hidden by your settings.", traceId));
        }
        if (exportRequireTierAccess) {
          const gate = patronMayFetchMediaExport({
            snapshot,
            creatorId: req.params.creator_id,
            mediaId: req.params.media_id,
            session,
            isContentOwner: mediaAccess.isContentOwner,
            ...matureGate
          });
          if (!gate.allowed) {
            const postId = findPostIdForExportedMedia(
              snapshot,
              req.params.creator_id,
              req.params.media_id
            );
            const tipOk =
              Boolean(postId) &&
              Boolean(mediaAccess.accountId) &&
              Boolean(config.prisma) &&
              (await hasOpenTipReveal(config.prisma!, {
                patronAccountId: mediaAccess.accountId!,
                postId: postId!
              }));
            if (!tipOk) {
              recordContentDeliveryFailure();
              return res
                .status(403)
                .json(errorEnvelope("FORBIDDEN", gate.reason, traceId));
            }
          }
        }
      }
      recordContentDeliverySuccess();
      const mime = record.mime_type ?? "application/octet-stream";
      const range = parseSingleByteRange(req.header("range"), bytes.byteLength);
      res.setHeader("accept-ranges", "bytes");
      res.setHeader("content-type", mime);
      // [R-SEC-18 @security-review 2026-06] Entitlement-gated bytes: use `private` so shared/CDN caches
      // cannot serve one viewer's authorized media to another. See docs/security-review-2026-06.md.
      res.setHeader("cache-control", "private, max-age=3600");
      res.setHeader("etag", `"${record.sha256}"`);
      if (range === "invalid") {
        res.setHeader("content-range", `bytes */${bytes.byteLength}`);
        return res.status(416).end();
      }
      if (range) {
        const chunk = bytes.subarray(range.start, range.end + 1);
        scheduleExportMediaBytes(
          config.prisma,
          req.params.creator_id,
          "content",
          chunk.byteLength,
          { media_id: req.params.media_id, ranged: true }
        );
        res.setHeader("content-length", String(chunk.byteLength));
        res.setHeader(
          "content-range",
          `bytes ${range.start}-${range.end}/${bytes.byteLength}`
        );
        return res.status(206).send(chunk);
      }
      scheduleExportMediaBytes(
        config.prisma,
        req.params.creator_id,
        "content",
        bytes.byteLength,
        { media_id: req.params.media_id }
      );
      res.setHeader("content-length", String(bytes.byteLength));
      return res.status(200).send(bytes);
    } catch (error) {
      recordContentDeliveryFailure();
      return res
        .status(404)
        .json(errorEnvelope("NOT_FOUND", (error as Error).message, traceId));
    }
  });

  /**
   * WebP thumbnail for library/grid (images only). Tier gate matches `/content` when
   * `RELAY_EXPORT_REQUIRE_TIER_ACCESS=1`.
   */
  app.get("/api/v1/export/media/:creator_id/:media_id/thumb", async (req, res) => {
    const traceId = traceIdFrom(req);
    try {
      const content = await exportService.getExportContent(
        req.params.creator_id,
        req.params.media_id
      );
      if (!content) {
        recordContentDeliveryFailure();
        return res
          .status(404)
          .json(errorEnvelope("NOT_FOUND", "Exported media not found.", traceId));
      }
      const { record, buffer: bytes } = content;
      // [R-SEC-09 @security-review 2026-06] Same as /content: enforce the "hide 18+" preference on thumbnail
      // bytes regardless of the tier paywall flag; skip resolution for anonymous requests. See docs/security-review-2026-06.md.
      const bearer = req.header("authorization")?.replace(/^Bearer\s+/i, "").trim() ?? "";
      const session = bearer ? await identityService.resolveSession(bearer) : null;
      const mediaAccess = await resolveMediaExportAccessContext(
        config.prisma,
        session,
        req.params.creator_id
      );
      if (
        shouldApplyMediaExportEntitlementGates({
          session,
          exportRequireTierAccess,
          isContentOwner: mediaAccess.isContentOwner
        })
      ) {
        const snapshot = await canonicalStore.load();
        const overrides = await galleryOverridesStore.load();
        const matureGate = await patronMatureGateForMediaExport(config, {
          session,
          creatorId: req.params.creator_id,
          mediaId: req.params.media_id,
          snapshot,
          overrides,
          isContentOwner: mediaAccess.isContentOwner
        });
        if (matureGate.hideMatureContent && matureGate.isPostMature) {
          recordContentDeliveryFailure();
          return res
            .status(403)
            .json(errorEnvelope("FORBIDDEN", "18+ content hidden by your settings.", traceId));
        }
        if (exportRequireTierAccess) {
          const gate = patronMayFetchMediaExport({
            snapshot,
            creatorId: req.params.creator_id,
            mediaId: req.params.media_id,
            session,
            isContentOwner: mediaAccess.isContentOwner,
            ...matureGate
          });
          if (!gate.allowed) {
            const postId = findPostIdForExportedMedia(
              snapshot,
              req.params.creator_id,
              req.params.media_id
            );
            const tipOk =
              Boolean(postId) &&
              Boolean(mediaAccess.accountId) &&
              Boolean(config.prisma) &&
              (await hasOpenTipReveal(config.prisma!, {
                patronAccountId: mediaAccess.accountId!,
                postId: postId!
              }));
            if (!tipOk) {
              recordContentDeliveryFailure();
              return res
                .status(403)
                .json(errorEnvelope("FORBIDDEN", gate.reason, traceId));
            }
          }
        }
      }
      const mime = record.mime_type ?? "application/octet-stream";
      const thumb = await buildGridThumbnailImage(bytes, mime);
      if (!thumb) {
        recordContentDeliveryFailure();
        return res
          .status(415)
          .json(
            errorEnvelope(
              "THUMB_UNSUPPORTED",
              "Thumbnail not available for this media type or processing failed.",
              traceId
            )
          );
      }
      recordContentDeliverySuccess();
      res.setHeader("content-type", "image/webp");
      // [R-SEC-18 @security-review 2026-06] Gated thumbnail bytes: `private` to prevent shared-cache leakage.
      res.setHeader("cache-control", "private, max-age=86400");
      res.setHeader("etag", `"${record.sha256}-${GRID_THUMB_ETAG_TOKEN}"`);
      res.setHeader("content-length", String(thumb.byteLength));
      scheduleExportMediaBytes(
        config.prisma,
        req.params.creator_id,
        "thumb",
        thumb.byteLength,
        { media_id: req.params.media_id }
      );
      return res.status(200).send(thumb);
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
      const content = await exportService.getExportContent(creatorId, mediaId);
      if (!content) {
        recordPreviewDeliveryFailure();
        return res
          .status(404)
          .json(errorEnvelope("NOT_FOUND", "Exported media not found.", traceId));
      }
      const { record, buffer: bytes } = content;
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
      const bearer = req.header("authorization")?.replace(/^Bearer\s+/i, "").trim() ?? "";
      const session = bearer ? await identityService.resolveSession(bearer) : null;
      let isContentOwner = false;
      if (config.prisma && session) {
        const accountId = await getAccountIdForSession(config.prisma, session);
        if (accountId) {
          const acc = await config.prisma.account.findUnique({
            where: { id: accountId },
            select: { primaryRelayCreatorId: true }
          });
          isContentOwner = acc?.primaryRelayCreatorId === creatorId;
        }
      }
      const matureGate = await patronMatureGateForMediaExport(config, {
        session,
        creatorId,
        mediaId,
        snapshot,
        overrides,
        isContentOwner
      });
      if (matureGate.hideMatureContent && matureGate.isPostMature) {
        recordPreviewDeliveryFailure();
        return res
          .status(403)
          .json(errorEnvelope("FORBIDDEN", "18+ content hidden by your settings.", traceId));
      }
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
      res.setHeader("content-type", preview.contentType);
      res.setHeader("cache-control", "public, max-age=600");
      scheduleExportMediaBytes(
        config.prisma,
        creatorId,
        "preview",
        preview.buffer.byteLength,
        { media_id: mediaId }
      );
      return res.status(200).send(preview.buffer);
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
    const includeInstances = parseQueryTruthy(req.query.include_instances);

    const bearer = req.header("authorization")?.replace(/^Bearer\s+/i, "").trim() ?? "";
    const fromCookie = readSessionCookie(req)?.trim() ?? "";
    const opaque = bearer || fromCookie;
    let patronSession = opaque ? await identityService.resolveSession(opaque) : null;
    const devSimPatron = parseQueryTruthy(req.query.dev_sim_patron);
    const simulate_tier_ids = queryStringList(req, "simulate_tier_ids");
    patronSession = resolveVisitorPatronSessionForRedaction({
      visitor,
      creatorId,
      devSimPatron,
      simulateTierIds: simulate_tier_ids,
      bearerSession: patronSession
    });
    if (visitor && patronSession && config.prisma) {
      const accountId = await getAccountIdForSession(config.prisma, patronSession);
      if (accountId) {
        const memberships = await config.prisma.tenantMembership.findMany({
          where: { accountId },
          select: { id: true }
        });
        const snap = memberships.length
          ? await config.prisma.patronEntitlementSnapshot.findFirst({
              where: {
                patronMembershipId: { in: memberships.map((m) => m.id) },
                relayCreatorId: creatorId
              },
              orderBy: { asOf: "desc" },
              select: { active: true, entitledTierIds: true }
            })
          : null;
        patronSession = {
          ...patronSession,
          creator_id: creatorId,
          tier_ids: snap?.active ? snap.entitledTierIds : []
        };
      }
    }

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
    if (visitor && !cursor) {
      enqueueRelayEngagementEvent(config, {
        creatorId,
        eventType: "gallery_view",
        sessionKey: readVisitorSessionKey(req)
      });
    }
    if (!visitor && config.prisma && result.items.length > 0) {
      try {
        const postIds = [...new Set(result.items.map((item) => item.post_id))];
        const summaries = await getDistributionSummariesForPosts(
          config.prisma,
          creatorId,
          postIds
        );
        if (summaries.size > 0) {
          result.items = result.items.map((item) => {
            const summary = summaries.get(item.post_id);
            return summary ? { ...item, distribution_summary: summary } : item;
          });
        }
      } catch (error) {
        serverLog.warn(
          { err: error, creator_id: creatorId, trace_id: traceId },
          "Gallery distribution summary enrichment failed; returning base gallery items."
        );
      }
      try {
        const postIds = [...new Set(result.items.map((item) => item.post_id))];
        const memberships = await getCreativeWorkMembershipForPosts(
          config.prisma,
          creatorId,
          postIds
        );
        if (memberships.size > 0) {
          result.items = result.items.map((item) => {
            const membership = memberships.get(item.post_id);
            if (!membership) return item;
            return {
              ...item,
              creative_work_id: membership.creative_work_id,
              is_default_bundle: membership.is_default_bundle,
              creative_work_member_count: membership.creative_work_member_count,
              member_label: membership.member_label,
              variant_role: membership.variant_role,
              creative_work_sort_order: membership.sort_order
            };
          });
        }
      } catch (error) {
        serverLog.warn(
          { err: error, creator_id: creatorId, trace_id: traceId },
          "Gallery creative work membership enrichment failed; returning base gallery items."
        );
      }
      try {
        const markers = await loadPromoPieceMarkersByPostId(config.prisma, creatorId);
        result.items = applyOwnerPromoPieceMarkers(result.items, markers);
      } catch (error) {
        serverLog.warn(
          { err: error, creator_id: creatorId, trace_id: traceId },
          "Gallery promo piece marker enrichment failed; returning base gallery items."
        );
      }
      if (includeInstances) {
        try {
          const postIds = [...new Set(result.items.map((item) => item.post_id))];
          const instanceSummaries = await getGalleryPlatformInstanceSummariesForPosts(
            config.prisma,
            creatorId,
            postIds
          );
          result.items = result.items.map((item) => ({
            ...item,
            platform_instances: instanceSummaries.get(item.post_id) ?? []
          }));
        } catch (error) {
          serverLog.warn(
            { err: error, creator_id: creatorId, trace_id: traceId },
            "Gallery platform instance enrichment failed; returning base gallery items."
          );
        }
      }
    }
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
    let payload: typeof facets & {
      visitor_hero?: Record<string, string>;
      tip_gated?: Awaited<ReturnType<typeof buildTipGatedDiscoverSection>>;
      tips_beta?: boolean;
    } = facets;
    if (visitor) {
      enqueueRelayEngagementEvent(config, {
        creatorId,
        eventType: "profile_view",
        sessionKey: readVisitorSessionKey(req)
      });
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
      if (isTipsBetaEnabled() && config.prisma) {
        const bearer = req.header("authorization")?.replace(/^Bearer\s+/i, "").trim() ?? "";
        const fromCookie = readSessionCookie(req)?.trim() ?? "";
        const opaque = bearer || fromCookie;
        const patronSession = opaque ? await identityService.resolveSession(opaque) : null;
        const accountId = patronSession
          ? await getAccountIdForSession(config.prisma, patronSession)
          : null;
        payload.tips_beta = true;
        payload.tip_gated = await buildTipGatedDiscoverSection(config.prisma, {
          viewerAccountId: accountId,
          creatorId
        });
      }
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
    const fromCookie = readSessionCookie(req)?.trim() ?? "";
    const opaque = bearer || fromCookie;
    let patronSession = opaque ? await identityService.resolveSession(opaque) : null;
    const devSimPatron = parseQueryTruthy(req.query.dev_sim_patron);
    const simulate_tier_ids = queryStringList(req, "simulate_tier_ids");
    patronSession = resolveVisitorPatronSessionForRedaction({
      visitor,
      creatorId,
      devSimPatron,
      simulateTierIds: simulate_tier_ids,
      bearerSession: patronSession
    });
    if (visitor && patronSession && config.prisma) {
      const accountId = await getAccountIdForSession(config.prisma, patronSession);
      if (accountId) {
        const memberships = await config.prisma.tenantMembership.findMany({
          where: { accountId },
          select: { id: true }
        });
        const snap = memberships.length
          ? await config.prisma.patronEntitlementSnapshot.findFirst({
              where: {
                patronMembershipId: { in: memberships.map((m) => m.id) },
                relayCreatorId: creatorId
              },
              orderBy: { asOf: "desc" },
              select: { active: true, entitledTierIds: true }
            })
          : null;
        patronSession = {
          ...patronSession,
          creator_id: creatorId,
          tier_ids: snap?.active ? snap.entitledTierIds : []
        };
      }
    }
    const detail = await galleryService.postDetail(creatorId, postId, {
      visitor_catalog: visitor,
      patron_session: patronSession
    });
    if (!detail) {
      return res.status(404).json(errorEnvelope("NOT_FOUND", "Post not found.", traceId));
    }
    if (patronSession && config.prisma && !devSimPatron) {
      let isContentOwner = false;
      const accountId = await getAccountIdForSession(config.prisma, patronSession);
      if (accountId) {
        const acc = await config.prisma.account.findUnique({
          where: { id: accountId },
          select: { primaryRelayCreatorId: true }
        });
        isContentOwner = acc?.primaryRelayCreatorId === creatorId;
      }
      if (!isContentOwner) {
        const hideMatureContent = await loadPatronHideMatureContent(
          config.prisma,
          patronSession.user_id
        );
        if (hideMatureContent) {
          const [snapshot, overrides] = await Promise.all([
            canonicalStore.load(),
            galleryOverridesStore.load()
          ]);
          const postRow = snapshot.posts[creatorId]?.[postId];
          if (
            postRow &&
            isPostMatureFromPatronSurfaces({
              overrides,
              creatorId,
              postId,
              activeMediaIds: postRow.current.media_ids ?? []
            })
          ) {
            return res.status(404).json(errorEnvelope("NOT_FOUND", "Post not found.", traceId));
          }
        }
      }
    }
    if (visitor) {
      const sessionKey = readVisitorSessionKey(req);
      enqueueRelayEngagementEvent(config, {
        creatorId,
        eventType: "gallery_view",
        postId,
        sessionKey
      });
      void ingestFirstPartyEvent(
        config,
        {
          event_name: "post_view",
          occurred_at: new Date().toISOString(),
          producer: "api",
          session_key: sessionKey ?? undefined,
          payload: {
            creator_id: creatorId,
            post_id: postId,
            surface: "visitor_post_detail"
          }
        },
        traceId
      );
    }
    let distributionSummary: Awaited<ReturnType<typeof getPostDistributionSummary>> | undefined;
    if (config.prisma && patronSession) {
      const accountId = await getAccountIdForSession(config.prisma, patronSession);
      if (accountId) {
        const acc = await config.prisma.account.findUnique({
          where: { id: accountId },
          select: { primaryRelayCreatorId: true }
        });
        if (acc?.primaryRelayCreatorId === creatorId) {
          distributionSummary = await getPostDistributionSummary(
            config.prisma,
            creatorId,
            postId
          );
        }
      }
    }
    let effectivePromo: Awaited<ReturnType<typeof resolveViewerEffectivePromo>> | undefined;
    if (visitor && config.prisma) {
      try {
        const [snapshot, overrides] = await Promise.all([
          canonicalStore.load(),
          galleryOverridesStore.load()
        ]);
        const relayVis = overrides.creators[creatorId]?.posts[postId]?.visibility ?? null;
        effectivePromo = await resolveViewerEffectivePromo({
          prisma: config.prisma,
          snapshot,
          creatorId,
          postId,
          session: patronSession,
          relayPostVisibility: relayVis ?? null,
          isPostMature: relayVis === "review"
        });
      } catch {
        effectivePromo = null;
      }
    }
    res.setHeader("Cache-Control", "private, no-store");
    const payload = {
      ...detail,
      ...(distributionSummary ? { distribution_summary: distributionSummary } : {}),
      ...(visitor ? { effective_promo: effectivePromo ?? null } : {})
    };
    return res.status(200).json(successEnvelope(payload, traceId));
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
    // Creators must see their own Library unblurred regardless of tier configuration.
    // A creator's session.creator_id is '__relay_platform' (account-first), NOT the
    // studio relay_creator_id, so `session.creator_id === creatorId` is unreliable.
    // Use Account.primaryRelayCreatorId as the authoritative ownership signal.
    let isContentOwner = false;
    if (config.prisma && session) {
      const accountId = await getAccountIdForSession(config.prisma, session);
      if (accountId) {
        const acc = await config.prisma.account.findUnique({
          where: { id: accountId },
          select: { primaryRelayCreatorId: true }
        });
        isContentOwner = acc?.primaryRelayCreatorId === creatorId;
      }
    }
    const overrides = await galleryOverridesStore.load();
    const postRow = snapshot.posts[creatorId]?.[postId];
    const hiddenFromPatron = postRow
      ? isPostHiddenFromPatronSurfaces({
          overrides,
          creatorId,
          postId,
          activeMediaIds: postRow.current.media_ids ?? []
        })
      : false;
    const relayPostVisibility = hiddenFromPatron
      ? "hidden"
      : (overrides.creators[creatorId]?.posts[postId]?.visibility ?? null);
    let hideMatureContent = false;
    let isPostMature = false;
    if (session && config.prisma && !isContentOwner) {
      hideMatureContent = await loadPatronHideMatureContent(config.prisma, session.user_id);
      if (hideMatureContent && postRow) {
        isPostMature = isPostMatureFromPatronSurfaces({
          overrides,
          creatorId,
          postId,
          activeMediaIds: postRow.current.media_ids ?? []
        });
      }
    }
    const perm = evaluatePostPermission({
      snapshot,
      creatorId,
      postId,
      session,
      isContentOwner,
      relayPostVisibility,
      hideMatureContent,
      isPostMature
    });
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
    if (session.kind === "extension") {
      void identityService.touchSessionExpiry(opaque).catch(() => {});
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
    const emailVerified =
      config.prisma != null
        ? await getSessionEmailVerifiedForPatronLink(config.prisma, session)
        : true;
    // PE-I (BO-P4-01) — enrich with role-switcher data: which roles the account is allowed to
    // occupy + which one is currently active per the relay_active_role cookie. UI lens only.
    let activeRole: ActiveRole | null = null;
    let availableRoles: ActiveRole[] = [];
    if (config.prisma) {
      const accountId = await getAccountIdForSession(config.prisma, session);
      if (accountId) {
        const resolved = await resolveAvailableRolesForAccount(config.prisma, accountId);
        availableRoles = resolved.roles;
      }
    }
    const cookieRole = req.header("cookie")?.match(/(?:^|;\s*)relay_active_role=(creator|supporter)/);
    if (cookieRole) {
      activeRole = cookieRole[1] as ActiveRole;
    }
    res.setHeader("Cache-Control", "private, no-store");
    return res.status(200).json(
      successEnvelope(
        {
          user_id: session.user_id,
          creator_id: session.creator_id,
          email: user?.email ?? null,
          username: user?.username ?? null,
          username_norm: user?.username_norm ?? null,
          auth_provider: user?.auth_provider ?? null,
          patreon_user_id: user?.patreon_user_id ?? null,
          email_verified: emailVerified,
          expires_at: session.expires_at,
          active_role: activeRole,
          available_roles: availableRoles
        },
        traceId
      )
    );
  });

  /**
   * Canonical Relay username for the signed-in account. This is the one public @mention alias
   * used across creator and supporter surfaces; profile-level username/handle fields are mirrors.
   */
  app.patch(
    "/api/v1/me/username",
    async (req: Request, res: Response, next) => {
      const traceId = traceIdFrom(req);
      if (!config.prisma) {
        return res.status(503).json(
          errorEnvelope("SERVICE_UNAVAILABLE", "Database not configured.", traceId)
        );
      }
      try {
        const { context } = await requireAccount(req, { prisma: config.prisma, identityService });
        (req as Request & { relayRateLimitKey?: string }).relayRateLimitKey = context.accountId;
        next();
      } catch (err) {
        if (sendRelayAuthError(res, err, traceId)) return;
        return res.status(500).json(errorEnvelope("INTERNAL", (err as Error).message, traceId));
      }
    },
    patronProfileMutate,
    buildIdem("me-username-patch"),
    async (req: Request, res: Response) => {
      const traceId = traceIdFrom(req);
      if (!config.prisma) {
        return res.status(503).json(
          errorEnvelope("SERVICE_UNAVAILABLE", "Database not configured.", traceId)
        );
      }
      try {
        const { context } = await requireAccount(req, { prisma: config.prisma, identityService });
        const body = (req.body ?? {}) as Record<string, unknown>;
        const username = readOptionalString(body.username);
        if (typeof username !== "string") {
          return res.status(400).json(
            errorEnvelope("VALIDATION_ERROR", "username is required.", traceId, [
              { field: "username", issue: "required" }
            ])
          );
        }

        const updated = await setRelayUsernameForAccount(config.prisma, {
          accountId: context.accountId,
          username
        });

        if (context.primaryRelayCreatorId) {
          await config.prisma.creatorProfile.updateMany({
            where: { tenant: { relayCreatorId: context.primaryRelayCreatorId } },
            data: { username: updated.username, usernameNorm: updated.usernameNorm }
          });
        }
        await config.prisma.patronProfile.updateMany({
          where: { tenantMembership: { accountId: context.accountId } },
          data: { handle: updated.username, handleNorm: updated.usernameNorm }
        });

        res.setHeader("Cache-Control", "private, no-store");
        return res.status(200).json(
          successEnvelope(
            { username: updated.username, username_norm: updated.usernameNorm },
            traceId
          )
        );
      } catch (err) {
        const code =
          typeof err === "object" && err !== null && "code" in err
            ? (err as { code: string }).code
            : "INTERNAL";
        if (code === "CONFLICT" || code === "VALIDATION_ERROR") {
          return res.status(code === "CONFLICT" ? 409 : 400).json(
            errorEnvelope(code, err instanceof Error ? err.message : "Invalid username.", traceId)
          );
        }
        if (sendRelayAuthError(res, err, traceId)) return;
        return res.status(500).json(errorEnvelope("INTERNAL", (err as Error).message, traceId));
      }
    }
  );

  /**
   * PE-I (BO-P4-01) — flip the `relay_active_role` UI lens cookie at runtime.
   *
   * NOT an authz boundary -- every protected route already evaluates the caller's actual
   * permissions independently. This endpoint just lets the UI choose which shell to render
   * (studio vs patron) and where to redirect after the switch.
   *
   * Rejects roles the caller's account doesn't legitimately occupy (resolveAvailableRolesForAccount).
   * That keeps a confused client from setting role=creator on a patron-only account and showing
   * an empty studio shell.
   */
  app.post("/api/v1/me/active-role", async (req: Request, res: Response) => {
    const traceId = traceIdFrom(req);
    const session = await requirePatronBearerSession(req, res, traceId);
    if (!session) return;
    const body = (req.body ?? {}) as Record<string, unknown>;
    const requested =
      typeof body.role === "string" ? body.role.trim() : "";
    if (requested !== "creator" && requested !== "supporter") {
      return res.status(400).json(
        errorEnvelope("VALIDATION_ERROR", "role must be 'creator' or 'supporter'.", traceId, [
          { field: "role", issue: "invalid" }
        ])
      );
    }
    if (!config.prisma) {
      // File-backed identity has no membership graph; we can't validate the role. Set
      // optimistically and rely on the per-route guards downstream.
      setActiveRoleCookie(res, requested, { expiresAtIso: session.expires_at });
      res.setHeader("Cache-Control", "private, no-store");
      return res.status(200).json(
        successEnvelope({ active_role: requested, available_roles: ["creator", "supporter"] }, traceId)
      );
    }
    const accountId = await getAccountIdForSession(config.prisma, session);
    if (!accountId) {
      return res.status(403).json(errorEnvelope("FORBIDDEN", "Account required.", traceId));
    }
    const resolved = await resolveAvailableRolesForAccount(config.prisma, accountId);
    if (!resolved.roles.includes(requested)) {
      return res.status(403).json(
        errorEnvelope(
          "FORBIDDEN",
          `Account cannot occupy role '${requested}'. Available: ${resolved.roles.join(", ") || "(none)"}.`,
          traceId
        )
      );
    }
    setActiveRoleCookie(res, requested, { expiresAtIso: session.expires_at });
    res.setHeader("Cache-Control", "private, no-store");
    return res.status(200).json(
      successEnvelope(
        { active_role: requested, available_roles: resolved.roles },
        traceId
      )
    );
  });

  /**
   * MT-032 — Idempotent artist studio: `Tenant` + creator `User` + `CreatorProfile`; sets
   * `Account.primaryRelayCreatorId`. Requires opaque Bearer session with `Account`-backed membership.
   * First-time provision (no studio yet) requires JSON body `{ "confirm_creator_intent": true }` so
   * supporter sessions cannot accidentally create a studio; idempotent calls when a studio exists
   * may omit the flag.
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
    const accountRow = await config.prisma.account.findUnique({
      where: { id: accountId },
      select: { primaryRelayCreatorId: true }
    });
    if (!accountRow) {
      return res.status(404).json(errorEnvelope("NOT_FOUND", "Account not found.", traceId));
    }
    const body = (req.body ?? {}) as Record<string, unknown>;
    if (!accountRow.primaryRelayCreatorId) {
      if (body.confirm_creator_intent !== true) {
        return res.status(403).json(
          errorEnvelope(
            "FORBIDDEN",
            "Creator workspace provisioning requires request body { confirm_creator_intent: true }. " +
              "This guard prevents supporter-only accounts from accidentally receiving a studio.",
            traceId
          )
        );
      }
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
      select: { publicSlug: true, slugSource: true }
    });
    if (!prof) {
      return res.status(404).json(errorEnvelope("NOT_FOUND", "Creator profile missing.", traceId));
    }
    res.setHeader("Cache-Control", "private, no-store");
    return res
      .status(200)
      .json(
        successEnvelope({ public_slug: prof.publicSlug, slug_source: prof.slugSource }, traceId)
      );
  });

  /**
   * Manual Relay Import setup: inspect Relay-owned access bins plus provider-synced suggestions.
   * Provider rows are never rewritten here; POST only upserts `relay_manual_tier_*` bins.
   */
  app.get("/api/v1/relay/manual-import/setup", async (req: Request, res: Response) => {
    const traceId = traceIdFrom(req);
    if (!config.prisma) {
      return res
        .status(503)
        .json(errorEnvelope("SERVICE_UNAVAILABLE", "Database not configured.", traceId));
    }
    const session = await requirePatronBearerSession(req, res, traceId);
    if (!session) {
      return;
    }
    const creatorId =
      typeof req.query.creator_id === "string" ? req.query.creator_id.trim() : "";
    if (!creatorId) {
      return res
        .status(400)
        .json(
          errorEnvelope("VALIDATION_ERROR", "creator_id query parameter is required.", traceId)
        );
    }
    if (!(await requireAccountMatchesCreator(req, res, traceId, creatorId))) {
      return;
    }
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
    const data = await getManualImportSetup(
      config.prisma,
      creatorId,
      Boolean(getR2ClientConfigFromEnv())
    );
    res.setHeader("Cache-Control", "private, no-store");
    return res.status(200).json(successEnvelope(data, traceId));
  });

  app.post("/api/v1/relay/manual-import/setup", async (req: Request, res: Response) => {
    const traceId = traceIdFrom(req);
    if (!config.prisma) {
      return res
        .status(503)
        .json(errorEnvelope("SERVICE_UNAVAILABLE", "Database not configured.", traceId));
    }
    const session = await requirePatronBearerSession(req, res, traceId);
    if (!session) {
      return;
    }
    const body = (req.body ?? {}) as Record<string, unknown>;
    const creatorId = typeof body.creator_id === "string" ? body.creator_id.trim() : "";
    if (!creatorId) {
      return res
        .status(400)
        .json(errorEnvelope("VALIDATION_ERROR", "creator_id is required.", traceId));
    }
    if (!(await requireAccountMatchesCreator(req, res, traceId, creatorId))) {
      return;
    }
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
    // Manual import setup is the fallback when provider sync is degraded, so do not hard-block on
    // Patreon sync health here.
    const binsRaw = Array.isArray(body.bins) ? body.bins : [];
    const bins: ManualImportBinInput[] = binsRaw.map((row) => {
      const r = row && typeof row === "object" ? (row as Record<string, unknown>) : {};
      const amountCents =
        r.amount_cents === null || r.amount_cents === undefined
          ? null
          : typeof r.amount_cents === "number"
            ? r.amount_cents
            : Number.NaN;
      const parsed: ManualImportBinInput = {
        name: typeof r.name === "string" ? r.name : "",
        amountCents,
        sourceHint: typeof r.source_hint === "string" ? r.source_hint : null
      };
      if (Object.prototype.hasOwnProperty.call(r, "linked_provider_relay_tier_id")) {
        const lp = r.linked_provider_relay_tier_id;
        parsed.linked_provider_relay_tier_id =
          lp === null ? null : typeof lp === "string" ? lp.trim() || null : null;
      }
      return parsed;
    });
    try {
      const manualBins = await upsertManualTierBins(config.prisma, creatorId, bins);
      const setup = await getManualImportSetup(
        config.prisma,
        creatorId,
        Boolean(getR2ClientConfigFromEnv())
      );
      res.setHeader("Cache-Control", "private, no-store");
      return res.status(200).json(
        successEnvelope(
          {
            ...setup,
            manual_bins: manualBins
          },
          traceId
        )
      );
    } catch (e) {
      if (e instanceof ManualImportCatalogError) {
        return res.status(e.statusCode).json(errorEnvelope(e.code, e.message, traceId));
      }
      throw e;
    }
  });

  /**
   * Tier rows for compose UX: each `tier_id` is the Prisma primary key expected by `POST /api/v1/relay/posts`.
   * Excludes ingest-only synthetic tiers (`relay_tier_public`, `relay_tier_all_patrons`); open-web audience
   * is `is_public: true` with empty `tier_ids`, not a selected tier row.
   */
  app.get("/api/v1/relay/compose-tiers", async (req: Request, res: Response) => {
    const traceId = traceIdFrom(req);
    if (!config.prisma) {
      return res
        .status(503)
        .json(errorEnvelope("SERVICE_UNAVAILABLE", "Database not configured.", traceId));
    }
    const session = await requirePatronBearerSession(req, res, traceId);
    if (!session) {
      return;
    }
    const creatorId =
      typeof req.query.creator_id === "string" ? req.query.creator_id.trim() : "";
    if (!creatorId) {
      return res
        .status(400)
        .json(
          errorEnvelope("VALIDATION_ERROR", "creator_id query parameter is required.", traceId)
        );
    }
    if (!(await requireAccountMatchesCreator(req, res, traceId, creatorId))) {
      return;
    }
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
    const rows = await config.prisma.tier.findMany({
      where: {
        creatorId,
        relayTierId: { notIn: [RELAY_TIER_ALL_PATRONS, RELAY_TIER_PUBLIC] }
      },
      orderBy: [{ amountCents: "asc" }, { title: "asc" }],
      select: {
        id: true,
        relayTierId: true,
        title: true,
        amountCents: true,
        campaignId: true
      }
    });
    const tiers = rows.map((r) => ({
      tier_id: r.id,
      relay_tier_id: r.relayTierId,
      title: r.title,
      amount_cents: r.amountCents,
      campaign_id: r.campaignId
    }));
    res.setHeader("Cache-Control", "private, no-store");
    return res.status(200).json(successEnvelope({ tiers }, traceId));
  });

  /**
   * T-4.2 — Relay-native post: `Post` + `PostVersion` + `PostTier` + media link in one transaction.
   * Schema: `docs/api/relay-native-posts.md`
   */
  app.post("/api/v1/relay/posts", async (req: Request, res: Response) => {
    const traceId = traceIdFrom(req);
    if (!config.prisma) {
      return res
        .status(503)
        .json(errorEnvelope("SERVICE_UNAVAILABLE", "Database not configured.", traceId));
    }
    const session = await requirePatronBearerSession(req, res, traceId);
    if (!session) {
      return;
    }
    const body = (req.body ?? {}) as Record<string, unknown>;
    const creatorId = typeof body.creator_id === "string" ? body.creator_id.trim() : "";
    if (!creatorId) {
      return res
        .status(400)
        .json(errorEnvelope("VALIDATION_ERROR", "creator_id is required.", traceId));
    }
    if (!(await requireAccountMatchesCreator(req, res, traceId, creatorId))) {
      return;
    }
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
    const campaignId =
      typeof body.campaign_id === "string" && body.campaign_id.trim()
        ? body.campaign_id.trim()
        : null;
    const isManualCampaignRequest = Boolean(
      campaignId?.startsWith(MANUAL_RELAY_CAMPAIGN_PREFIX)
    );
    if (!isManualCampaignRequest && !(await guardStudioSyncWritable(res, traceId, creatorId))) {
      return;
    }
    const titleRaw = body.title;
    const title = typeof titleRaw === "string" ? titleRaw : "";
    const description =
      body.description === null || body.description === undefined
        ? null
        : typeof body.description === "string"
          ? body.description
          : null;
    const isPublic = body.is_public === true;
    const isPublicFalse = body.is_public === false;
    if (!isPublic && !isPublicFalse) {
      return res
        .status(400)
        .json(errorEnvelope("VALIDATION_ERROR", "is_public must be a boolean.", traceId));
    }
    const requiredTierId =
      typeof body.required_tier_id === "string" && body.required_tier_id.trim()
        ? body.required_tier_id.trim()
        : null;
    const tierIds = Array.isArray(body.tier_ids) ? (body.tier_ids as unknown[]) : [];
    const tagIds = Array.isArray(body.tag_ids) ? (body.tag_ids as unknown[]) : [];
    const mediaIds = Array.isArray(body.media_ids) ? (body.media_ids as unknown[]) : [];
    const publish = body.publish === true;
    const publishFalse = body.publish === false;
    if (!publish && !publishFalse) {
      return res
        .status(400)
        .json(errorEnvelope("VALIDATION_ERROR", "publish must be a boolean.", traceId));
    }
    // Publish-only v1: drafts (`publish: false` → epoch publishedAt sentinel) are not
    // supported until `PostVersion.published_at` semantics for drafts are decided.
    if (!publish) {
      return res
        .status(400)
        .json(
          errorEnvelope(
            "DRAFT_NOT_SUPPORTED",
            "Publish-only mode is active. Pass publish: true.",
            traceId
          )
        );
    }
    const publishedAtInput =
      typeof body.published_at === "string" && body.published_at.trim()
        ? body.published_at.trim()
        : null;
    if (!tierIds.every((t) => typeof t === "string" && t.trim())) {
      return res
        .status(400)
        .json(errorEnvelope("VALIDATION_ERROR", "tier_ids must be an array of strings.", traceId));
    }
    if (!tagIds.every((t) => typeof t === "string" && t.trim())) {
      return res
        .status(400)
        .json(errorEnvelope("VALIDATION_ERROR", "tag_ids must be an array of strings.", traceId));
    }
    if (!mediaIds.every((t) => typeof t === "string" && t.trim())) {
      return res
        .status(400)
        .json(errorEnvelope("VALIDATION_ERROR", "media_ids must be an array of strings.", traceId));
    }
    const postId = `relay_p_${randomUUID()}`;
    try {
      const out = await createRelayPostTransaction(config.prisma, postId, {
        creatorId,
        campaignId,
        title,
        description,
        isPublic,
        requiredTierId,
        tierIds: tierIds as string[],
        tagIds: tagIds as string[],
        mediaIds: mediaIds as string[],
        publish,
        publishedAtInput
      });
      res.setHeader("Cache-Control", "private, no-store");
      return res.status(201).json(
        successEnvelope(
          {
            post: { ...out.post, source: "RELAY" as const },
            version: {
              id: out.version.id,
              version_seq: out.version.versionSeq,
              upstream_revision: out.version.upstreamRevision,
              title: out.version.title,
              description: out.version.description,
              published_at: out.version.publishedAt
                ? out.version.publishedAt.toISOString()
                : null,
              tag_ids: out.version.tagIds,
              tier_ids: out.version.tierIds,
              media_ids: out.version.mediaIds
            }
          },
          traceId
        )
      );
    } catch (e) {
      if (e instanceof RelayCreatePostError) {
        return res
          .status(e.statusCode)
          .json(errorEnvelope(e.code, e.message, traceId));
      }
      throw e;
    }
  });

  /**
   * Relay-native post unpublish (soft delete): sets `Post.upstreamStatus = deleted`.
   * Only `source = RELAY` posts owned by the session creator — Patreon/SubscribeStar
   * mirrors are managed by ingest and respond 404 here. `PostVersion` / `MediaAsset`
   * rows are preserved; all read paths already exclude `upstream_status = deleted`.
   */
  app.delete("/api/v1/relay/posts/:post_id", async (req: Request, res: Response) => {
    const traceId = traceIdFrom(req);
    if (!config.prisma) {
      return res
        .status(503)
        .json(errorEnvelope("SERVICE_UNAVAILABLE", "Database not configured.", traceId));
    }
    const session = await requirePatronBearerSession(req, res, traceId);
    if (!session) {
      return;
    }
    const postId = typeof req.params.post_id === "string" ? req.params.post_id.trim() : "";
    const creatorId =
      typeof req.query.creator_id === "string" ? req.query.creator_id.trim() : "";
    if (!postId || !creatorId) {
      return res
        .status(400)
        .json(errorEnvelope("VALIDATION_ERROR", "post_id and creator_id are required.", traceId));
    }
    if (!(await requireAccountMatchesCreator(req, res, traceId, creatorId))) {
      return;
    }
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
    const post = await config.prisma.post.findFirst({
      where: { id: postId, creatorId, source: PostSource.RELAY }
    });
    if (!post) {
      return res
        .status(404)
        .json(errorEnvelope("NOT_FOUND", "Relay-native post not found for this creator.", traceId));
    }
    if (post.upstreamStatus !== PostUpstreamStatus.deleted) {
      await config.prisma.post.update({
        where: { id: postId },
        data: { upstreamStatus: PostUpstreamStatus.deleted }
      });
    }
    res.setHeader("Cache-Control", "private, no-store");
    return res.status(200).json(
      successEnvelope({ post_id: postId, upstream_status: "deleted" as const }, traceId)
    );
  });

  /**
   * T-3.2 — Presigned R2 `PUT` for creator uploads; `MediaAsset` created with `ingestOrigin=RELAY_UPLOAD`
   * and `currentStorageKey` set on commit. See `docs/architecture/adr/002-r2-creator-uploads-presigned-vs-server.md`.
   */
  app.post("/api/v1/relay/upload/init", async (req: Request, res: Response) => {
    const traceId = traceIdFrom(req);
    if (!config.prisma) {
      return res
        .status(503)
        .json(errorEnvelope("SERVICE_UNAVAILABLE", "Database not configured.", traceId));
    }
    const session = await requirePatronBearerSession(req, res, traceId);
    if (!session) {
      return;
    }
    const body = (req.body ?? {}) as Record<string, unknown>;
    const creatorId = typeof body.creator_id === "string" ? body.creator_id.trim() : "";
    const contentType = typeof body.content_type === "string" ? body.content_type.trim() : "";
    const byteSize = typeof body.byte_size === "number" && Number.isFinite(body.byte_size) ? body.byte_size : -1;
    const postIdOpt = typeof body.post_id === "string" ? body.post_id.trim() : undefined;
    if (!creatorId || !contentType || byteSize < 0) {
      return res
        .status(400)
        .json(
          errorEnvelope("VALIDATION_ERROR", "creator_id, content_type, byte_size (number) are required.", traceId)
        );
    }
    if (!(await requireAccountMatchesCreator(req, res, traceId, creatorId))) {
      return;
    }
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
    /**
     * Omit Patreon **`guardStudioSyncWritable`** — presigned uploads (Library + Manual Import)
     * must succeed when ingest sync rollup is degraded.
     */
    if (!isMimeTypeAllowed(contentType, getAllowedMimePrefixesFromEnv())) {
      return res
        .status(400)
        .json(
          errorEnvelope("VALIDATION_ERROR", "content_type is not in the allowlist for uploads.", traceId)
        );
    }
    if (byteSize > getRelayUploadMaxBytes()) {
      return res
        .status(400)
        .json(
          errorEnvelope("VALIDATION_ERROR", "byte_size exceeds configured maximum.", traceId)
        );
    }
    const r2 = getR2ClientConfigFromEnv();
    if (!r2) {
      return res
        .status(503)
        .json(
          errorEnvelope("SERVICE_UNAVAILABLE", "Object storage (R2) is not configured. See .env.example.", traceId)
        );
    }
    let primaryPostId: string | null = null;
    let postIds: string[] = [];
    if (postIdOpt) {
      const ownedPost = await config.prisma.post.findFirst({
        where: { id: postIdOpt, creatorId }
      });
      if (!ownedPost) {
        return res
          .status(400)
          .json(
            errorEnvelope(
              "VALIDATION_ERROR",
              "post_id not found for this creator.",
              traceId
            )
          );
      }
      primaryPostId = ownedPost.id;
      postIds = [ownedPost.id];
    }
    const mediaId = `relay_m_${randomUUID()}`;
    const key = buildRelayR2ObjectKey(creatorId, mediaId);
    const now = new Date();
    const nowIso = now.toISOString();
    const pendingVersion = {
      version_seq: 1,
      upstream_revision: "relay:upload:pending",
      ingested_at: nowIso
    };
    await config.prisma.mediaAsset.create({
      data: {
        id: mediaId,
        creatorId,
        postIds,
        primaryPostId,
        upstreamStatus: MediaUpstreamStatus.active,
        currentVersionSeq: 1,
        currentUpstreamRevision: "relay:upload:pending",
        currentMimeType: null,
        currentUpstreamUrl: null,
        currentRole: null,
        currentStorageKey: null,
        currentIngestedAt: now,
        versionsJson: [pendingVersion] as unknown as Prisma.InputJsonValue,
        ingestOrigin: MediaIngestOrigin.RELAY_UPLOAD,
        processingStatus: MediaProcessingStatus.PENDING_UPLOAD,
        processingError: null
      }
    });
    const exp = getPresignExpiresSec();
    const uploadUrl = await presignR2Put(r2, key, contentType, exp);
    res.setHeader("Cache-Control", "private, no-store");
    return res.status(201).json(
      successEnvelope(
        {
          media_id: mediaId,
          storage_key: key,
          byte_size: byteSize,
          upload: { method: "PUT" as const, url: uploadUrl, headers: { "Content-Type": contentType } },
          expires_in_sec: exp
        },
        traceId
      )
    );
  });

  app.post("/api/v1/relay/upload/commit", async (req: Request, res: Response) => {
    const traceId = traceIdFrom(req);
    if (!config.prisma) {
      return res
        .status(503)
        .json(errorEnvelope("SERVICE_UNAVAILABLE", "Database not configured.", traceId));
    }
    const session = await requirePatronBearerSession(req, res, traceId);
    if (!session) {
      return;
    }
    const body = (req.body ?? {}) as Record<string, unknown>;
    const creatorId = typeof body.creator_id === "string" ? body.creator_id.trim() : "";
    const mediaId = typeof body.media_id === "string" ? body.media_id.trim() : "";
    const contentType = typeof body.content_type === "string" ? body.content_type.trim() : "";
    const byteSize = typeof body.byte_size === "number" && Number.isFinite(body.byte_size) ? body.byte_size : -1;
    const postIdOpt = typeof body.post_id === "string" ? body.post_id.trim() : undefined;
    const manualImportBinTierId =
      typeof body.manual_import_bin_tier_id === "string"
        ? body.manual_import_bin_tier_id.trim()
        : "";
    if (!creatorId || !mediaId || !contentType || byteSize < 0) {
      return res
        .status(400)
        .json(
          errorEnvelope(
            "VALIDATION_ERROR",
            "creator_id, media_id, content_type, byte_size (number) are required.",
            traceId
          )
        );
    }
    if (!(await requireAccountMatchesCreator(req, res, traceId, creatorId))) {
      return;
    }
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
    /**
     * Omit Patreon **`guardStudioSyncWritable`** — uploads commit even when ingest sync rollup is degraded.
     */
    if (!isMimeTypeAllowed(contentType, getAllowedMimePrefixesFromEnv())) {
      return res
        .status(400)
        .json(
          errorEnvelope("VALIDATION_ERROR", "content_type is not in the allowlist for uploads.", traceId)
        );
    }
    const r2 = getR2ClientConfigFromEnv();
    if (!r2) {
      return res
        .status(503)
        .json(
          errorEnvelope("SERVICE_UNAVAILABLE", "Object storage (R2) is not configured. See .env.example.", traceId)
        );
    }
    const key = buildRelayR2ObjectKey(creatorId, mediaId);
    const row = await config.prisma.mediaAsset.findFirst({
      where: { id: mediaId, creatorId, ingestOrigin: MediaIngestOrigin.RELAY_UPLOAD }
    });
    if (!row) {
      return res
        .status(404)
        .json(errorEnvelope("NOT_FOUND", "Unknown media_id for this creator.", traceId));
    }
    if (row.currentStorageKey) {
      return res
        .status(409)
        .json(errorEnvelope("CONFLICT", "This media was already committed.", traceId));
    }
    let head: { contentLength: number; contentType: string | undefined; etag: string | undefined };
    try {
      head = await headR2ObjectContentLength(r2, key);
    } catch {
      const msgHead =
        "Object not found in storage at the expected key. Complete the PUT to the presigned URL first.";
      await markMediaAssetProcessingFailed(config.prisma, mediaId, msgHead);
      return res.status(400).json(errorEnvelope("VALIDATION_ERROR", msgHead, traceId));
    }

    let manualImportStagingJson: Prisma.InputJsonValue | undefined;
    if (manualImportBinTierId) {
      const resolved = await resolveManualImportUploadStagingPayload(
        config.prisma,
        creatorId,
        manualImportBinTierId
      );
      if (!resolved.ok) {
        return res
          .status(400)
          .json(errorEnvelope("VALIDATION_ERROR", resolved.message, traceId));
      }
      manualImportStagingJson = resolved.payload as unknown as Prisma.InputJsonValue;
    }

    const finalized = await applyRelayUploadCommitUpdate(config.prisma, {
      mediaId,
      creatorId,
      key,
      contentType,
      byteSize,
      postIdOpt,
      head,
      row,
      manualImportStagingJson
    });

    if (!finalized.ok) {
      return res
        .status(finalized.httpStatus)
        .json(errorEnvelope("VALIDATION_ERROR", finalized.message, traceId));
    }

    res.setHeader("Cache-Control", "private, no-store");
    return res.status(200).json(
      successEnvelope(
        {
          media_id: mediaId,
          storage_key: key,
          content_length: finalized.payload.content_length,
          etag: finalized.payload.etag
        },
        traceId
      )
    );
  });

  /**
   * Mint a short-lived code for `/relay-link` in Discord (hashed at rest).
   */
  app.post("/api/v1/relay/discord/link-codes", async (req: Request, res: Response) => {
    const traceId = traceIdFrom(req);
    if (!config.prisma) {
      return res
        .status(503)
        .json(errorEnvelope("SERVICE_UNAVAILABLE", "Database not configured.", traceId));
    }
    const session = await requirePatronBearerSession(req, res, traceId);
    if (!session) {
      return;
    }
    const body = (req.body ?? {}) as Record<string, unknown>;
    const creatorId = typeof body.creator_id === "string" ? body.creator_id.trim() : "";
    if (!creatorId) {
      return res
        .status(400)
        .json(errorEnvelope("VALIDATION_ERROR", "creator_id is required.", traceId));
    }
    if (!(await requireAccountMatchesCreator(req, res, traceId, creatorId))) {
      return;
    }
    if (
      !(await assertCreatorRelayMutationAllowed(req, res, traceId, config.prisma, creatorId))
    ) {
      return;
    }
    if (!(await guardStudioSyncWritable(res, traceId, creatorId))) {
      return;
    }
    const accountId = await getAccountIdForSession(config.prisma, session);
    if (!accountId) {
      return res
        .status(403)
        .json(errorEnvelope("FORBIDDEN", "Session is not linked to an account.", traceId));
    }
    const plain = generateDiscordLinkPlainCode();
    const codeHash = hashDiscordLinkCode(normalizeDiscordLinkCodeInput(plain));
    const expiresAt = new Date(Date.now() + DISCORD_LINK_CODE_TTL_MS);
    await config.prisma.discordLinkToken.create({
      data: {
        codeHash,
        relayCreatorId: creatorId,
        accountId,
        expiresAt
      }
    });
    res.setHeader("Cache-Control", "private, no-store");
    return res.status(201).json(
      successEnvelope({ code: plain, expires_at: expiresAt.toISOString() }, traceId)
    );
  });

  /** Discord channel binding status for the studio. */
  app.get("/api/v1/relay/discord/connection", async (req: Request, res: Response) => {
    const traceId = traceIdFrom(req);
    if (!config.prisma) {
      return res
        .status(503)
        .json(errorEnvelope("SERVICE_UNAVAILABLE", "Database not configured.", traceId));
    }
    const session = await requirePatronBearerSession(req, res, traceId);
    if (!session) {
      return;
    }
    const creatorId =
      typeof req.query.creator_id === "string" ? req.query.creator_id.trim() : "";
    if (!creatorId) {
      return res
        .status(400)
        .json(errorEnvelope("VALIDATION_ERROR", "creator_id query parameter is required.", traceId));
    }
    if (!(await requireAccountMatchesCreator(req, res, traceId, creatorId))) {
      return;
    }
    const binding = await config.prisma.discordChannelBinding.findUnique({
      where: { relayCreatorId: creatorId }
    });
    res.setHeader("Cache-Control", "private, no-store");
    return res.status(200).json(
      successEnvelope(
        {
          linked: Boolean(binding),
          discord_guild_id: binding?.discordGuildId ?? null,
          discord_channel_id: binding?.discordChannelId ?? null,
          updated_at: binding?.updatedAt.toISOString() ?? null
        },
        traceId
      )
    );
  });

  /**
   * Manual Import bin-local staging: Relay uploads held inside access bins before creator commits them to Library.
   */
  app.get("/api/v1/relay/manual-import/staging", async (req: Request, res: Response) => {
    const traceId = traceIdFrom(req);
    if (!config.prisma) {
      return res
        .status(503)
        .json(errorEnvelope("SERVICE_UNAVAILABLE", "Database not configured.", traceId));
    }
    const session = await requirePatronBearerSession(req, res, traceId);
    if (!session) {
      return;
    }
    const creatorId =
      typeof req.query.creator_id === "string" ? req.query.creator_id.trim() : "";
    if (!creatorId) {
      return res
        .status(400)
        .json(errorEnvelope("VALIDATION_ERROR", "creator_id query parameter is required.", traceId));
    }
    if (!(await requireAccountMatchesCreator(req, res, traceId, creatorId))) {
      return;
    }
    const rows = await findRelayLibraryStagingRows(
      config.prisma,
      creatorId,
      [MediaIngestOrigin.RELAY_UPLOAD]
    );
    const pendingRows = rows.filter((row) => isManualImportBinPending(row.manualImportStagingJson));
    const items = mapRelayLibraryStagingListItems(creatorId, pendingRows);
    res.setHeader("Cache-Control", "private, no-store");
    return res.status(200).json(successEnvelope({ items }, traceId));
  });

  app.post("/api/v1/relay/manual-import/commit-to-library", async (req: Request, res: Response) => {
    const traceId = traceIdFrom(req);
    if (!config.prisma) {
      return res
        .status(503)
        .json(errorEnvelope("SERVICE_UNAVAILABLE", "Database not configured.", traceId));
    }
    const session = await requirePatronBearerSession(req, res, traceId);
    if (!session) {
      return;
    }
    const body = (req.body ?? {}) as Record<string, unknown>;
    const creatorId = typeof body.creator_id === "string" ? body.creator_id.trim() : "";
    if (!creatorId) {
      return res
        .status(400)
        .json(errorEnvelope("VALIDATION_ERROR", "creator_id is required.", traceId));
    }
    if (!(await requireAccountMatchesCreator(req, res, traceId, creatorId))) {
      return;
    }
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

    const rows = await findRelayLibraryStagingRows(
      config.prisma,
      creatorId,
      [MediaIngestOrigin.RELAY_UPLOAD]
    );
    const pendingRows = rows.filter((row) => isManualImportBinPending(row.manualImportStagingJson));
    const committedAt = new Date().toISOString();
    for (const row of pendingRows) {
      const record = manualImportStagingRecord(row.manualImportStagingJson);
      if (!record) continue;
      await config.prisma.mediaAsset.update({
        where: { id: row.id },
        data: {
          manualImportStagingJson: {
            ...record,
            committed_to_library_at: committedAt
          } as Prisma.InputJsonValue
        }
      });
    }

    res.setHeader("Cache-Control", "private, no-store");
    return res.status(200).json(
      successEnvelope(
        {
          committed_count: pendingRows.length,
          committed_at: committedAt,
          media_ids: pendingRows.map((row) => row.id)
        },
        traceId
      )
    );
  });

  /**
   * Unified Library staging: Discord captures + direct Relay uploads not yet attached to a post (`primaryPostId` null, READY).
   */
  app.get("/api/v1/relay/library/staging", async (req: Request, res: Response) => {
    const traceId = traceIdFrom(req);
    if (!config.prisma) {
      return res
        .status(503)
        .json(errorEnvelope("SERVICE_UNAVAILABLE", "Database not configured.", traceId));
    }
    const session = await requirePatronBearerSession(req, res, traceId);
    if (!session) {
      return;
    }
    const creatorId =
      typeof req.query.creator_id === "string" ? req.query.creator_id.trim() : "";
    if (!creatorId) {
      return res
        .status(400)
        .json(errorEnvelope("VALIDATION_ERROR", "creator_id query parameter is required.", traceId));
    }
    if (!(await requireAccountMatchesCreator(req, res, traceId, creatorId))) {
      return;
    }
    const rows = await findRelayLibraryStagingRows(
      config.prisma,
      creatorId,
      RELAY_LIBRARY_STAGING_INGEST_ORIGINS
    );
    const libraryRows = rows.filter((row) => isManualImportLibraryCommitted(row.manualImportStagingJson));
    const items = mapRelayLibraryStagingListItems(creatorId, libraryRows);
    res.setHeader("Cache-Control", "private, no-store");
    return res.status(200).json(successEnvelope({ items }, traceId));
  });

  /**
   * Discard staged Library media (Discord or Relay upload) before publish.
   * Enqueues `currentStorageKey` for async R2 delete when set; removes `MediaAsset`.
   */
  app.delete("/api/v1/relay/library/staging/:mediaId", async (req: Request, res: Response) => {
    const traceId = traceIdFrom(req);
    if (!config.prisma) {
      return res
        .status(503)
        .json(errorEnvelope("SERVICE_UNAVAILABLE", "Database not configured.", traceId));
    }
    const session = await requirePatronBearerSession(req, res, traceId);
    if (!session) {
      return;
    }
    const mediaId =
      typeof req.params.mediaId === "string" ? req.params.mediaId.trim() : "";
    const creatorId =
      typeof req.query.creator_id === "string" ? req.query.creator_id.trim() : "";
    if (!mediaId || !creatorId) {
      return res
        .status(400)
        .json(
          errorEnvelope(
            "VALIDATION_ERROR",
            "mediaId path and creator_id query parameter are required.",
            traceId
          )
        );
    }
    if (!(await requireAccountMatchesCreator(req, res, traceId, creatorId))) {
      return;
    }
    if (!(await guardStudioSyncWritable(res, traceId, creatorId))) {
      return;
    }
    const deleted = await deleteRelayStagedMediaForOrigins(
      config.prisma,
      mediaId,
      creatorId,
      RELAY_LIBRARY_STAGING_INGEST_ORIGINS,
      MEDIA_STORAGE_PURGE_REASON_LIBRARY_STAGING
    );
    if (!deleted) {
      return res
        .status(404)
        .json(errorEnvelope("NOT_FOUND", "Staged media not found for this studio.", traceId));
    }
    res.setHeader("Cache-Control", "private, no-store");
    return res.status(200).json(successEnvelope({ deleted: true, media_id: mediaId }, traceId));
  });

  /** Discord-captured media not yet attached to a Relay post. */
  app.get("/api/v1/relay/discord/staging", async (req: Request, res: Response) => {
    const traceId = traceIdFrom(req);
    if (!config.prisma) {
      return res
        .status(503)
        .json(errorEnvelope("SERVICE_UNAVAILABLE", "Database not configured.", traceId));
    }
    const session = await requirePatronBearerSession(req, res, traceId);
    if (!session) {
      return;
    }
    const creatorId =
      typeof req.query.creator_id === "string" ? req.query.creator_id.trim() : "";
    if (!creatorId) {
      return res
        .status(400)
        .json(errorEnvelope("VALIDATION_ERROR", "creator_id query parameter is required.", traceId));
    }
    if (!(await requireAccountMatchesCreator(req, res, traceId, creatorId))) {
      return;
    }
    const rows = await findRelayLibraryStagingRows(config.prisma, creatorId, [
      MediaIngestOrigin.DISCORD
    ]);
    const items = mapDiscordStagingListItems(creatorId, rows);
    res.setHeader("Cache-Control", "private, no-store");
    return res.status(200).json(successEnvelope({ items }, traceId));
  });

  /**
   * Remove a staged Discord capture before it is published.
   * Enqueues `currentStorageKey` for async R2 delete (`media_storage_purge_queue` + sweeper);
   * removes `MediaAsset` (cascades `discord_media_ingest_keys`).
   */
  app.delete("/api/v1/relay/discord/staging/:mediaId", async (req: Request, res: Response) => {
    const traceId = traceIdFrom(req);
    if (!config.prisma) {
      return res
        .status(503)
        .json(errorEnvelope("SERVICE_UNAVAILABLE", "Database not configured.", traceId));
    }
    const session = await requirePatronBearerSession(req, res, traceId);
    if (!session) {
      return;
    }
    const mediaId =
      typeof req.params.mediaId === "string" ? req.params.mediaId.trim() : "";
    const creatorId =
      typeof req.query.creator_id === "string" ? req.query.creator_id.trim() : "";
    if (!mediaId || !creatorId) {
      return res
        .status(400)
        .json(
          errorEnvelope(
            "VALIDATION_ERROR",
            "mediaId path and creator_id query parameter are required.",
            traceId
          )
        );
    }
    if (!(await requireAccountMatchesCreator(req, res, traceId, creatorId))) {
      return;
    }
    if (!(await guardStudioSyncWritable(res, traceId, creatorId))) {
      return;
    }
    const deleted = await deleteRelayStagedMediaForOrigins(
      config.prisma,
      mediaId,
      creatorId,
      [MediaIngestOrigin.DISCORD],
      MEDIA_STORAGE_PURGE_REASON_DISCORD_STAGING
    );
    if (!deleted) {
      return res
        .status(404)
        .json(errorEnvelope("NOT_FOUND", "Staged media not found for this studio.", traceId));
    }
    res.setHeader("Cache-Control", "private, no-store");
    return res.status(200).json(successEnvelope({ deleted: true, media_id: mediaId }, traceId));
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
      data: { publicSlug: raw, slugSource: PublicSlugSource.user_chosen }
    });
    res.setHeader("Cache-Control", "private, no-store");
    return res
      .status(200)
      .json(
        successEnvelope({ public_slug: raw, slug_source: PublicSlugSource.user_chosen }, traceId)
      );
  });

  // ── APD-S1: Creator profile identity ─────────────────────────────────

  app.get("/api/v1/creator/onboarding", async (req: Request, res: Response) => {
    const traceId = traceIdFrom(req);
    if (!config.prisma) {
      return res.status(503).json(
        errorEnvelope("SERVICE_UNAVAILABLE", "Database not configured.", traceId)
      );
    }
    try {
      const { context } = await requireAccountWithRole(
        req,
        { prisma: config.prisma, identityService },
        "creator"
      );
      const relayCreatorId = context.primaryRelayCreatorId?.trim();
      if (!relayCreatorId) {
        return res.status(404).json(
          errorEnvelope(
            "NOT_FOUND",
            "No creator studio — call POST /api/v1/creator/workspace first.",
            traceId
          )
        );
      }
      const payload = await getCreatorOnboardingForStudio(config.prisma, relayCreatorId);
      res.setHeader("Cache-Control", "private, no-store");
      return res.status(200).json(successEnvelope(payload, traceId));
    } catch (err) {
      if (sendRelayAuthError(res, err, traceId)) return;
      return res.status(500).json(errorEnvelope("INTERNAL", (err as Error).message, traceId));
    }
  });

  app.patch("/api/v1/creator/onboarding", async (req: Request, res: Response) => {
    const traceId = traceIdFrom(req);
    if (!config.prisma) {
      return res.status(503).json(
        errorEnvelope("SERVICE_UNAVAILABLE", "Database not configured.", traceId)
      );
    }
    const body = (req.body ?? {}) as Record<string, unknown>;
    const hasStepKey = typeof body.step === "string";
    const hasMetadataKey = "metadata" in body;
    if (!hasStepKey && !hasMetadataKey) {
      return res.status(400).json(
        errorEnvelope(
          "VALIDATION_ERROR",
          "Request body must include `step` (string) and/or `metadata`.",
          traceId,
          [{ field: "body", issue: "empty" }]
        )
      );
    }
    try {
      const { context } = await requireAccountWithRole(
        req,
        { prisma: config.prisma, identityService },
        "creator"
      );
      const relayCreatorId = context.primaryRelayCreatorId?.trim();
      if (!relayCreatorId) {
        return res.status(404).json(
          errorEnvelope(
            "NOT_FOUND",
            "No creator studio — call POST /api/v1/creator/workspace first.",
            traceId
          )
        );
      }
      const patch: PatchCreatorOnboardingInput = {};
      if (hasStepKey) {
        patch.step = body.step as PatchCreatorOnboardingInput["step"];
      }
      if (hasMetadataKey) {
        patch.metadata =
          body.metadata === null
            ? null
            : (body.metadata as Prisma.InputJsonValue);
      }
      const payload = await patchCreatorOnboarding(config.prisma, relayCreatorId, patch);
      res.setHeader("Cache-Control", "private, no-store");
      return res.status(200).json(successEnvelope(payload, traceId));
    } catch (err) {
      if (sendRelayAuthError(res, err, traceId)) return;
      if (err instanceof OnboardingTransitionError) {
        const invalid = err.reason === "invalid_step";
        return res
          .status(invalid ? 400 : 409)
          .json(
            errorEnvelope(invalid ? "VALIDATION_ERROR" : "CONFLICT", err.message, traceId)
          );
      }
      if (err instanceof OnboardingPublishBlockedError) {
        const block = err.block;
        const details =
          block.code === "SYNC_DEGRADED"
            ? [
                { field: "sync_health.status", issue: block.sync_health_status },
                { field: "sync_health.message_key", issue: block.message_key }
              ]
            : [{ field: "sync", issue: "last_post_scrape_failed" }];
        return res.status(409).json(errorEnvelope(block.code, err.message, traceId, details));
      }
      if (err instanceof Error && err.message.includes("PATCH body must include")) {
        return res.status(400).json(errorEnvelope("VALIDATION_ERROR", err.message, traceId));
      }
      return res.status(500).json(errorEnvelope("INTERNAL", (err as Error).message, traceId));
    }
  });

  /**
   * Autopost WI-3 — tone preset catalog for Style Profile picker.
   */
  app.get("/api/v1/creator/style-profile/presets", async (req: Request, res: Response) => {
    const traceId = traceIdFrom(req);
    res.setHeader("Cache-Control", "public, max-age=3600");
    return res.status(200).json(
      successEnvelope({ presets: listStyleTonePresets() }, traceId)
    );
  });

  app.get("/api/v1/creator/style-profile", async (req: Request, res: Response) => {
    const traceId = traceIdFrom(req);
    if (!config.prisma) {
      return res.status(503).json(
        errorEnvelope("SERVICE_UNAVAILABLE", "Database not configured.", traceId)
      );
    }
    try {
      const { context } = await requireAccountWithRole(
        req,
        { prisma: config.prisma, identityService },
        "creator"
      );
      const relayCreatorId = context.primaryRelayCreatorId?.trim();
      if (!relayCreatorId) {
        return res.status(404).json(
          errorEnvelope(
            "NOT_FOUND",
            "No creator studio — call POST /api/v1/creator/workspace first.",
            traceId
          )
        );
      }
      const profile = await getCreatorStyleProfile(config.prisma, relayCreatorId);
      res.setHeader("Cache-Control", "private, no-store");
      return res.status(200).json(successEnvelope({ profile }, traceId));
    } catch (err) {
      if (sendRelayAuthError(res, err, traceId)) return;
      return res.status(500).json(errorEnvelope("INTERNAL", (err as Error).message, traceId));
    }
  });

  app.put("/api/v1/creator/style-profile", async (req: Request, res: Response) => {
    const traceId = traceIdFrom(req);
    if (!config.prisma) {
      return res.status(503).json(
        errorEnvelope("SERVICE_UNAVAILABLE", "Database not configured.", traceId)
      );
    }
    const body = (req.body ?? {}) as Record<string, unknown>;
    try {
      const { context } = await requireAccountWithRole(
        req,
        { prisma: config.prisma, identityService },
        "creator"
      );
      const relayCreatorId = context.primaryRelayCreatorId?.trim();
      if (!relayCreatorId) {
        return res.status(404).json(
          errorEnvelope(
            "NOT_FOUND",
            "No creator studio — call POST /api/v1/creator/workspace first.",
            traceId
          )
        );
      }
      const profile = await putCreatorStyleProfile(config.prisma, relayCreatorId, {
        tone_preset: typeof body.tone_preset === "string" ? body.tone_preset : "",
        user_prompt:
          body.user_prompt === null || body.user_prompt === undefined
            ? null
            : typeof body.user_prompt === "string"
              ? body.user_prompt
              : null,
        label: typeof body.label === "string" ? body.label : undefined
      });
      res.setHeader("Cache-Control", "private, no-store");
      return res.status(200).json(successEnvelope({ profile }, traceId));
    } catch (err) {
      if (sendRelayAuthError(res, err, traceId)) return;
      if (err instanceof StyleProfileValidationError) {
        return res.status(400).json(
          errorEnvelope("VALIDATION_ERROR", err.message, traceId, err.details)
        );
      }
      return res.status(500).json(errorEnvelope("INTERNAL", (err as Error).message, traceId));
    }
  });

  /**
   * Autopost WI-5 — monthly Relay posting goal + nudge state.
   */
  app.get("/api/v1/creator/posting-goal", async (req: Request, res: Response) => {
    const traceId = traceIdFrom(req);
    if (!config.prisma) {
      return res.status(503).json(
        errorEnvelope("SERVICE_UNAVAILABLE", "Database not configured.", traceId)
      );
    }
    try {
      const { context } = await requireAccountWithRole(
        req,
        { prisma: config.prisma, identityService },
        "creator"
      );
      const relayCreatorId = context.primaryRelayCreatorId?.trim();
      if (!relayCreatorId) {
        return res.status(404).json(
          errorEnvelope(
            "NOT_FOUND",
            "No creator studio — call POST /api/v1/creator/workspace first.",
            traceId
          )
        );
      }
      const goal = await getCreatorPostingGoal(config.prisma, relayCreatorId);
      res.setHeader("Cache-Control", "private, no-store");
      return res.status(200).json(successEnvelope({ goal }, traceId));
    } catch (err) {
      if (sendRelayAuthError(res, err, traceId)) return;
      return res.status(500).json(errorEnvelope("INTERNAL", (err as Error).message, traceId));
    }
  });

  /**
   * Creator SaaS billing (MB-2) — Checkout / Portal / subscription mirror.
   * Off when `RELAY_BILLING_ENABLED` is unset or Stripe secrets missing → 404.
   * @see docs/BILLING_SPINE_BUILD_PLAN.md
   */
  app.post("/api/v1/billing/checkout", async (req: Request, res: Response) => {
    const traceId = traceIdFrom(req);
    if (!isBillingEnabled()) {
      return res.status(404).json(errorEnvelope("NOT_FOUND", "Billing is not enabled.", traceId));
    }
    if (!config.prisma) {
      return res.status(503).json(
        errorEnvelope("SERVICE_UNAVAILABLE", "Database not configured.", traceId)
      );
    }
    const body = (req.body ?? {}) as Record<string, unknown>;
    const reloadPack = body.reload_pack === true || body.reload_pack === "1";
    const planRaw = typeof body.plan === "string" ? body.plan.trim() : "";

    try {
      if (reloadPack) {
        if (!isFanPremiumEnabled()) {
          return res
            .status(404)
            .json(errorEnvelope("NOT_FOUND", "Fan premium is not enabled.", traceId));
        }
        const { context } = await requireAccountWithRole(
          req,
          { prisma: config.prisma, identityService },
          "supporter"
        );
        const result = await createReloadPackCheckoutSession(config.prisma, {
          accountId: context.accountId
        });
        if (!result.ok) {
          const status =
            result.error === "price_not_configured" || result.error === "billing_disabled"
              ? 503
              : 400;
          return res
            .status(status)
            .json(errorEnvelope("BILLING_ERROR", result.error, traceId));
        }
        res.setHeader("Cache-Control", "private, no-store");
        return res
          .status(200)
          .json(successEnvelope({ checkout_url: result.checkout_url }, traceId));
      }

      if (isPaidFanPlanId(planRaw)) {
        if (!isFanPremiumEnabled()) {
          return res
            .status(404)
            .json(errorEnvelope("NOT_FOUND", "Fan premium is not enabled.", traceId));
        }
        const { context } = await requireAccountWithRole(
          req,
          { prisma: config.prisma, identityService },
          "supporter"
        );
        const result = await createFanCheckoutSession(config.prisma, {
          accountId: context.accountId,
          plan: planRaw
        });
        if (!result.ok) {
          const status =
            result.error === "price_not_configured" ||
            result.error === "billing_disabled" ||
            result.error === "fan_premium_disabled"
              ? 503
              : 400;
          return res
            .status(status)
            .json(errorEnvelope("BILLING_ERROR", result.error, traceId));
        }
        res.setHeader("Cache-Control", "private, no-store");
        return res
          .status(200)
          .json(successEnvelope({ checkout_url: result.checkout_url }, traceId));
      }

      if (!isCreatorPlanId(planRaw)) {
        return res.status(400).json(
          errorEnvelope(
            "VALIDATION_ERROR",
            "Body requires plan: studio_core | autopost | growth_engine | supporter | curator, or reload_pack: true.",
            traceId
          )
        );
      }
      const { context } = await requireAccountWithRole(
        req,
        { prisma: config.prisma, identityService },
        "creator"
      );
      const relayCreatorId = context.primaryRelayCreatorId?.trim();
      if (!relayCreatorId) {
        return res.status(404).json(
          errorEnvelope(
            "NOT_FOUND",
            "No creator studio — call POST /api/v1/creator/workspace first.",
            traceId
          )
        );
      }
      const result = await createCreatorCheckoutSession(config.prisma, {
        accountId: context.accountId,
        creatorId: relayCreatorId,
        plan: planRaw
      });
      if (!result.ok) {
        const status =
          result.error === "price_not_configured" || result.error === "billing_disabled"
            ? 503
            : 400;
        return res
          .status(status)
          .json(errorEnvelope("BILLING_ERROR", result.error, traceId));
      }
      res.setHeader("Cache-Control", "private, no-store");
      return res
        .status(200)
        .json(successEnvelope({ checkout_url: result.checkout_url }, traceId));
    } catch (err) {
      if (sendRelayAuthError(res, err, traceId)) return;
      return res.status(500).json(errorEnvelope("INTERNAL", (err as Error).message, traceId));
    }
  });

  app.post("/api/v1/billing/portal", async (req: Request, res: Response) => {
    const traceId = traceIdFrom(req);
    if (!isBillingEnabled()) {
      return res.status(404).json(errorEnvelope("NOT_FOUND", "Billing is not enabled.", traceId));
    }
    if (!config.prisma) {
      return res.status(503).json(
        errorEnvelope("SERVICE_UNAVAILABLE", "Database not configured.", traceId)
      );
    }
    try {
      const { context } = await requireAccountWithRole(
        req,
        { prisma: config.prisma, identityService },
        "creator"
      );
      const result = await createPortalSession(config.prisma, {
        accountId: context.accountId
      });
      if (!result.ok) {
        const status = result.error === "no_billing_customer" ? 404 : 503;
        return res
          .status(status)
          .json(errorEnvelope("BILLING_ERROR", result.error, traceId));
      }
      res.setHeader("Cache-Control", "private, no-store");
      return res.status(200).json(successEnvelope({ portal_url: result.portal_url }, traceId));
    } catch (err) {
      if (sendRelayAuthError(res, err, traceId)) return;
      return res.status(500).json(errorEnvelope("INTERNAL", (err as Error).message, traceId));
    }
  });

  app.get("/api/v1/billing/subscription", async (req: Request, res: Response) => {
    const traceId = traceIdFrom(req);
    if (!isBillingEnabled()) {
      return res.status(404).json(errorEnvelope("NOT_FOUND", "Billing is not enabled.", traceId));
    }
    if (!config.prisma) {
      return res.status(503).json(
        errorEnvelope("SERVICE_UNAVAILABLE", "Database not configured.", traceId)
      );
    }
    try {
      const { context } = await requireAccountWithRole(
        req,
        { prisma: config.prisma, identityService },
        "creator"
      );
      const wire = await getCreatorSubscriptionWire(config.prisma, context.accountId);
      res.setHeader("Cache-Control", "private, no-store");
      return res.status(200).json(successEnvelope(wire, traceId));
    } catch (err) {
      if (sendRelayAuthError(res, err, traceId)) return;
      return res.status(500).json(errorEnvelope("INTERNAL", (err as Error).message, traceId));
    }
  });

  /**
   * Tip beta (MB-5) — wallet + reveals. Off → 404.
   */
  app.get("/api/v1/tips/wallet", async (req: Request, res: Response) => {
    const traceId = traceIdFrom(req);
    if (!isTipsBetaEnabled()) {
      return res.status(404).json(errorEnvelope("NOT_FOUND", "Tips beta is not enabled.", traceId));
    }
    if (!config.prisma) {
      return res.status(503).json(
        errorEnvelope("SERVICE_UNAVAILABLE", "Database not configured.", traceId)
      );
    }
    try {
      const { context } = await requireAccountWithRole(
        req,
        { prisma: config.prisma, identityService },
        "supporter"
      );
      const wallet = await getWallet(config.prisma, context.accountId);
      const premiumOn = isFanPremiumEnabled();
      const fanSub = premiumOn
        ? await getActiveFanSubscription(config.prisma, context.accountId)
        : null;
      const planId = fanSub?.fanPlan ?? "free";
      const params = fanPlanParams(planId);
      const cfg = resolveTipsBetaConfig();
      const period = tipPeriodKeyUtc();
      const [y, m] = period.split("-").map(Number);
      const nextMonth = m === 12 ? 1 : m + 1;
      const nextYear = m === 12 ? y + 1 : y;
      const nextGrantPeriod = `${nextYear}-${String(nextMonth).padStart(2, "0")}`;
      const nextGrantAt = fanSub
        ? fanSub.currentPeriodEnd.toISOString()
        : `${nextGrantPeriod}-01T00:00:00.000Z`;

      res.setHeader("Cache-Control", "private, no-store");
      return res.status(200).json(
        successEnvelope(
          {
            granted_balance: wallet.granted_balance,
            purchased_balance: wallet.purchased_balance,
            next_grant_period: nextGrantPeriod,
            monthly_grant: premiumOn ? params.monthlyTips : cfg.monthlyGrant,
            beta: !premiumOn,
            plan: planId,
            monthly_allowance: premiumOn ? params.monthlyTips : cfg.monthlyGrant,
            rollover_cap: premiumOn
              ? params.rolloverCap
              : cfg.monthlyGrant * 2,
            next_grant_at: nextGrantAt
          },
          traceId
        )
      );
    } catch (err) {
      if (sendRelayAuthError(res, err, traceId)) return;
      return res.status(500).json(errorEnvelope("INTERNAL", (err as Error).message, traceId));
    }
  });

  app.post("/api/v1/tips/reveals", async (req: Request, res: Response) => {
    const traceId = traceIdFrom(req);
    if (!isTipsBetaEnabled()) {
      return res.status(404).json(errorEnvelope("NOT_FOUND", "Tips beta is not enabled.", traceId));
    }
    if (!config.prisma) {
      return res.status(503).json(
        errorEnvelope("SERVICE_UNAVAILABLE", "Database not configured.", traceId)
      );
    }
    const body = (req.body ?? {}) as Record<string, unknown>;
    const postId = typeof body.post_id === "string" ? body.post_id.trim() : "";
    const surface = typeof body.surface === "string" ? body.surface.trim() : "discover";
    if (!postId) {
      return res.status(400).json(
        errorEnvelope("VALIDATION_ERROR", "Body requires post_id.", traceId)
      );
    }
    try {
      const { context } = await requireAccountWithRole(
        req,
        { prisma: config.prisma, identityService },
        "supporter"
      );
      const result = await revealPost(config.prisma, {
        patronAccountId: context.accountId,
        postId,
        surface
      });
      res.setHeader("Cache-Control", "private, no-store");
      const status = result.reused ? 200 : 201;
      return res.status(status).json(
        successEnvelope(
          {
            reveal_id: result.reveal_id,
            expires_at: result.expires_at,
            media: result.media
          },
          traceId
        )
      );
    } catch (err) {
      if (sendRelayAuthError(res, err, traceId)) return;
      if (err instanceof InsufficientTipsError) {
        return res.status(402).json({ error: "insufficient_tips" });
      }
      if (err instanceof TipNotEligibleError) {
        return res.status(409).json({
          error: "not_eligible",
          reason: err.reasons[0] ?? "not_in_promo_pool",
          reasons: err.reasons
        });
      }
      return res.status(500).json(errorEnvelope("INTERNAL", (err as Error).message, traceId));
    }
  });

  app.get("/api/v1/tips/reveals", async (req: Request, res: Response) => {
    const traceId = traceIdFrom(req);
    if (!isTipsBetaEnabled()) {
      return res.status(404).json(errorEnvelope("NOT_FOUND", "Tips beta is not enabled.", traceId));
    }
    if (!config.prisma) {
      return res.status(503).json(
        errorEnvelope("SERVICE_UNAVAILABLE", "Database not configured.", traceId)
      );
    }
    try {
      const { context } = await requireAccountWithRole(
        req,
        { prisma: config.prisma, identityService },
        "supporter"
      );
      const reveals = await listActiveReveals(config.prisma, context.accountId);
      res.setHeader("Cache-Control", "private, no-store");
      return res.status(200).json(successEnvelope({ reveals }, traceId));
    } catch (err) {
      if (sendRelayAuthError(res, err, traceId)) return;
      return res.status(500).json(errorEnvelope("INTERNAL", (err as Error).message, traceId));
    }
  });

  /** MB-8 — creator Tip beta readout (reveals + offer CTR). */
  app.get("/api/v1/creator/tips/beta-stats", async (req: Request, res: Response) => {
    const traceId = traceIdFrom(req);
    if (!config.prisma) {
      return res.status(503).json(
        errorEnvelope("SERVICE_UNAVAILABLE", "Database not configured.", traceId)
      );
    }
    try {
      const { context } = await requireAccountWithRole(
        req,
        { prisma: config.prisma, identityService },
        "creator"
      );
      const relayCreatorId = context.primaryRelayCreatorId?.trim();
      if (!relayCreatorId) {
        return res.status(404).json(
          errorEnvelope(
            "NOT_FOUND",
            "No creator studio — call POST /api/v1/creator/workspace first.",
            traceId
          )
        );
      }
      const periodRaw =
        typeof req.query.period === "string" ? req.query.period.trim() : "";
      const payload = await computeCreatorTipBetaStats(config.prisma, {
        creatorId: relayCreatorId,
        periodKey: periodRaw || undefined
      });
      res.setHeader("Cache-Control", "private, no-store");
      return res.status(200).json(successEnvelope(payload, traceId));
    } catch (err) {
      if (sendRelayAuthError(res, err, traceId)) return;
      if (err instanceof Error && err.message.includes("Invalid period_key")) {
        return res.status(400).json(
          errorEnvelope("VALIDATION_ERROR", err.message, traceId, [
            { field: "period", issue: "invalid_yyyy_mm" }
          ])
        );
      }
      return res.status(500).json(errorEnvelope("INTERNAL", (err as Error).message, traceId));
    }
  });

  /** MB-10 — artist Tip earnings ledger + balance. */
  app.get("/api/v1/creator/earnings", async (req: Request, res: Response) => {
    const traceId = traceIdFrom(req);
    if (!isFanPremiumEnabled()) {
      return res
        .status(404)
        .json(errorEnvelope("NOT_FOUND", "Fan premium is not enabled.", traceId));
    }
    if (!config.prisma) {
      return res.status(503).json(
        errorEnvelope("SERVICE_UNAVAILABLE", "Database not configured.", traceId)
      );
    }
    try {
      const { context } = await requireAccountWithRole(
        req,
        { prisma: config.prisma, identityService },
        "creator"
      );
      const relayCreatorId = context.primaryRelayCreatorId?.trim();
      if (!relayCreatorId) {
        return res.status(404).json(
          errorEnvelope(
            "NOT_FOUND",
            "No creator studio — call POST /api/v1/creator/workspace first.",
            traceId
          )
        );
      }
      if (!(await requireAccountMatchesCreator(req, res, traceId, relayCreatorId))) {
        return;
      }
      const wire = await getCreatorEarningsWire(config.prisma, relayCreatorId);
      const payoutAccount = await config.prisma.payoutAccount.findUnique({
        where: { creatorId: relayCreatorId }
      });
      res.setHeader("Cache-Control", "private, no-store");
      return res.status(200).json(
        successEnvelope(
          {
            ...wire,
            payout_threshold_cents: payoutThresholdCents(),
            payouts_enabled: payoutAccount?.payoutsEnabled === true,
            onboarding_status: payoutAccount?.onboardingStatus ?? null
          },
          traceId
        )
      );
    } catch (err) {
      if (sendRelayAuthError(res, err, traceId)) return;
      return res.status(500).json(errorEnvelope("INTERNAL", (err as Error).message, traceId));
    }
  });

  /** MB-12 — Stripe Connect Express onboarding. */
  app.post("/api/v1/creator/payouts/onboard", async (req: Request, res: Response) => {
    const traceId = traceIdFrom(req);
    if (!isFanPremiumEnabled()) {
      return res
        .status(404)
        .json(errorEnvelope("NOT_FOUND", "Fan premium is not enabled.", traceId));
    }
    if (!config.prisma) {
      return res.status(503).json(
        errorEnvelope("SERVICE_UNAVAILABLE", "Database not configured.", traceId)
      );
    }
    try {
      const { context } = await requireAccountWithRole(
        req,
        { prisma: config.prisma, identityService },
        "creator"
      );
      const relayCreatorId = context.primaryRelayCreatorId?.trim();
      if (!relayCreatorId) {
        return res.status(404).json(
          errorEnvelope(
            "NOT_FOUND",
            "No creator studio — call POST /api/v1/creator/workspace first.",
            traceId
          )
        );
      }
      if (!(await requireAccountMatchesCreator(req, res, traceId, relayCreatorId))) {
        return;
      }
      const result = await startConnectOnboarding(config.prisma, {
        creatorId: relayCreatorId
      });
      if (!result.ok) {
        const status = result.error === "billing_disabled" ? 503 : 400;
        return res.status(status).json(errorEnvelope("BILLING_ERROR", result.error, traceId));
      }
      res.setHeader("Cache-Control", "private, no-store");
      return res
        .status(200)
        .json(successEnvelope({ onboarding_url: result.onboarding_url }, traceId));
    } catch (err) {
      if (sendRelayAuthError(res, err, traceId)) return;
      return res.status(500).json(errorEnvelope("INTERNAL", (err as Error).message, traceId));
    }
  });

  app.post("/api/v1/creator/payouts", async (req: Request, res: Response) => {
    const traceId = traceIdFrom(req);
    if (!isFanPremiumEnabled()) {
      return res
        .status(404)
        .json(errorEnvelope("NOT_FOUND", "Fan premium is not enabled.", traceId));
    }
    if (!config.prisma) {
      return res.status(503).json(
        errorEnvelope("SERVICE_UNAVAILABLE", "Database not configured.", traceId)
      );
    }
    try {
      const { context } = await requireAccountWithRole(
        req,
        { prisma: config.prisma, identityService },
        "creator"
      );
      const relayCreatorId = context.primaryRelayCreatorId?.trim();
      if (!relayCreatorId) {
        return res.status(404).json(
          errorEnvelope(
            "NOT_FOUND",
            "No creator studio — call POST /api/v1/creator/workspace first.",
            traceId
          )
        );
      }
      if (!(await requireAccountMatchesCreator(req, res, traceId, relayCreatorId))) {
        return;
      }
      const result = await requestPayout(config.prisma, { creatorId: relayCreatorId });
      if (!result.ok) {
        if (
          result.error === "below_threshold" ||
          result.error === "payouts_not_enabled" ||
          result.error === "balance_not_positive"
        ) {
          return res.status(409).json(
            errorEnvelope("PAYOUT_ERROR", result.error, traceId, [
              { field: "payout", issue: result.error }
            ])
          );
        }
        const status = result.error === "billing_disabled" ? 503 : 400;
        return res.status(status).json(errorEnvelope("PAYOUT_ERROR", result.error, traceId));
      }
      res.setHeader("Cache-Control", "private, no-store");
      return res.status(201).json(
        successEnvelope(
          { payout_id: result.payout_id, amount_cents: result.amount_cents },
          traceId
        )
      );
    } catch (err) {
      if (sendRelayAuthError(res, err, traceId)) return;
      return res.status(500).json(errorEnvelope("INTERNAL", (err as Error).message, traceId));
    }
  });

  app.get("/api/v1/creator/payouts", async (req: Request, res: Response) => {
    const traceId = traceIdFrom(req);
    if (!isFanPremiumEnabled()) {
      return res
        .status(404)
        .json(errorEnvelope("NOT_FOUND", "Fan premium is not enabled.", traceId));
    }
    if (!config.prisma) {
      return res.status(503).json(
        errorEnvelope("SERVICE_UNAVAILABLE", "Database not configured.", traceId)
      );
    }
    try {
      const { context } = await requireAccountWithRole(
        req,
        { prisma: config.prisma, identityService },
        "creator"
      );
      const relayCreatorId = context.primaryRelayCreatorId?.trim();
      if (!relayCreatorId) {
        return res.status(404).json(
          errorEnvelope(
            "NOT_FOUND",
            "No creator studio — call POST /api/v1/creator/workspace first.",
            traceId
          )
        );
      }
      if (!(await requireAccountMatchesCreator(req, res, traceId, relayCreatorId))) {
        return;
      }
      const payouts = await listCreatorPayouts(config.prisma, relayCreatorId);
      res.setHeader("Cache-Control", "private, no-store");
      return res.status(200).json(successEnvelope({ payouts }, traceId));
    } catch (err) {
      if (sendRelayAuthError(res, err, traceId)) return;
      return res.status(500).json(errorEnvelope("INTERNAL", (err as Error).message, traceId));
    }
  });

  app.put("/api/v1/creator/posting-goal", async (req: Request, res: Response) => {
    const traceId = traceIdFrom(req);
    if (!config.prisma) {
      return res.status(503).json(
        errorEnvelope("SERVICE_UNAVAILABLE", "Database not configured.", traceId)
      );
    }
    const body = (req.body ?? {}) as Record<string, unknown>;
    try {
      const { context } = await requireAccountWithRole(
        req,
        { prisma: config.prisma, identityService },
        "creator"
      );
      const relayCreatorId = context.primaryRelayCreatorId?.trim();
      if (!relayCreatorId) {
        return res.status(404).json(
          errorEnvelope(
            "NOT_FOUND",
            "No creator studio — call POST /api/v1/creator/workspace first.",
            traceId
          )
        );
      }
      const goal = await putCreatorPostingGoal(config.prisma, relayCreatorId, {
        monthly_post_target:
          typeof body.monthly_post_target === "number"
            ? body.monthly_post_target
            : typeof body.monthly_post_target === "string"
              ? Number.parseInt(body.monthly_post_target, 10)
              : undefined,
        bonus_nudges_enabled:
          body.bonus_nudges_enabled === undefined
            ? undefined
            : Boolean(body.bonus_nudges_enabled),
        timezone:
          body.timezone === null || body.timezone === undefined
            ? body.timezone === null
              ? null
              : undefined
            : typeof body.timezone === "string"
              ? body.timezone
              : undefined,
        enabled: body.enabled === undefined ? undefined : Boolean(body.enabled),
        remind_me_global:
          body.remind_me_global === undefined ? undefined : Boolean(body.remind_me_global)
      });
      res.setHeader("Cache-Control", "private, no-store");
      return res.status(200).json(successEnvelope({ goal }, traceId));
    } catch (err) {
      if (sendRelayAuthError(res, err, traceId)) return;
      if (err instanceof PostingGoalValidationError) {
        return res.status(400).json(
          errorEnvelope("VALIDATION_ERROR", err.message, traceId, err.details)
        );
      }
      return res.status(500).json(errorEnvelope("INTERNAL", (err as Error).message, traceId));
    }
  });

  app.get("/api/v1/creator/posting-goal/status", async (req: Request, res: Response) => {
    const traceId = traceIdFrom(req);
    if (!config.prisma) {
      return res.status(503).json(
        errorEnvelope("SERVICE_UNAVAILABLE", "Database not configured.", traceId)
      );
    }
    try {
      const { context } = await requireAccountWithRole(
        req,
        { prisma: config.prisma, identityService },
        "creator"
      );
      const relayCreatorId = context.primaryRelayCreatorId?.trim();
      if (!relayCreatorId) {
        return res.status(404).json(
          errorEnvelope(
            "NOT_FOUND",
            "No creator studio — call POST /api/v1/creator/workspace first.",
            traceId
          )
        );
      }
      const status = await getCreatorPostingGoalStatus(config.prisma, relayCreatorId);
      res.setHeader("Cache-Control", "private, no-store");
      return res.status(200).json(successEnvelope({ status }, traceId));
    } catch (err) {
      if (sendRelayAuthError(res, err, traceId)) return;
      return res.status(500).json(errorEnvelope("INTERNAL", (err as Error).message, traceId));
    }
  });

  app.get("/api/v1/creator/schedule-rail", async (req: Request, res: Response) => {
    const traceId = traceIdFrom(req);
    if (!config.prisma) {
      return res.status(503).json(
        errorEnvelope("SERVICE_UNAVAILABLE", "Database not configured.", traceId)
      );
    }
    const monthRaw = typeof req.query.month === "string" ? req.query.month.trim() : undefined;
    try {
      const { context } = await requireAccountWithRole(
        req,
        { prisma: config.prisma, identityService },
        "creator"
      );
      const relayCreatorId = context.primaryRelayCreatorId?.trim();
      if (!relayCreatorId) {
        return res.status(404).json(
          errorEnvelope(
            "NOT_FOUND",
            "No creator studio — call POST /api/v1/creator/workspace first.",
            traceId
          )
        );
      }
      if (monthRaw && !/^\d{4}-\d{2}$/.test(monthRaw)) {
        return res.status(400).json(
          errorEnvelope("VALIDATION_ERROR", "month must be YYYY-MM.", traceId)
        );
      }
      const rail = await getCreatorScheduleRail(config.prisma, relayCreatorId, {
        month: monthRaw
      });
      res.setHeader("Cache-Control", "private, no-store");
      return res.status(200).json(successEnvelope({ rail }, traceId));
    } catch (err) {
      if (sendRelayAuthError(res, err, traceId)) return;
      return res.status(500).json(errorEnvelope("INTERNAL", (err as Error).message, traceId));
    }
  });

  app.post("/api/v1/creator/schedule-rail/scheduled-posts", async (req: Request, res: Response) => {
    const traceId = traceIdFrom(req);
    if (!config.prisma) {
      return res.status(503).json(
        errorEnvelope("SERVICE_UNAVAILABLE", "Database not configured.", traceId)
      );
    }
    const body = (req.body ?? {}) as Record<string, unknown>;
    const scheduledFor =
      typeof body.scheduled_for === "string" ? body.scheduled_for.trim() : "";
    if (!scheduledFor) {
      return res
        .status(400)
        .json(errorEnvelope("VALIDATION_ERROR", "scheduled_for is required.", traceId));
    }
    try {
      const { context } = await requireAccountWithRole(
        req,
        { prisma: config.prisma, identityService },
        "creator"
      );
      const relayCreatorId = context.primaryRelayCreatorId?.trim();
      if (!relayCreatorId) {
        return res.status(404).json(
          errorEnvelope(
            "NOT_FOUND",
            "No creator studio — call POST /api/v1/creator/workspace first.",
            traceId
          )
        );
      }
      const coreGate = await requireCreatorPlanAtLeast(
        config.prisma,
        relayCreatorId,
        CreatorPlan.studio_core
      );
      if (!coreGate.ok) {
        return res.status(402).json({
          error: "plan_required",
          required_plan: "studio_core"
        });
      }
      const destinations = Array.isArray(body.destinations)
        ? body.destinations.filter((d): d is string => typeof d === "string")
        : undefined;
      const event = await createScheduledPostForRail(config.prisma, relayCreatorId, {
        title: typeof body.title === "string" ? body.title : undefined,
        scheduled_for: scheduledFor,
        destination: typeof body.destination === "string" ? body.destination : undefined,
        destinations,
        notify: typeof body.notify === "boolean" ? body.notify : undefined,
        note: typeof body.note === "string" ? body.note : undefined,
        planned_format: typeof body.planned_format === "string" ? body.planned_format : undefined
      });
      res.setHeader("Cache-Control", "private, no-store");
      return res.status(201).json(successEnvelope({ event }, traceId));
    } catch (err) {
      if (sendRelayAuthError(res, err, traceId)) return;
      if (err instanceof ScheduleRailValidationError) {
        return res.status(err.statusCode).json(errorEnvelope("VALIDATION_ERROR", err.message, traceId));
      }
      return res.status(500).json(errorEnvelope("INTERNAL", (err as Error).message, traceId));
    }
  });

  /** Manual social events (Studio Core) — URL-only or Library-linked. */
  app.post("/api/v1/creator/schedule-rail/events", async (req: Request, res: Response) => {
    const traceId = traceIdFrom(req);
    if (!config.prisma) {
      return res.status(503).json(
        errorEnvelope("SERVICE_UNAVAILABLE", "Database not configured.", traceId)
      );
    }
    const body = (req.body ?? {}) as Record<string, unknown>;
    try {
      const { context } = await requireAccountWithRole(
        req,
        { prisma: config.prisma, identityService },
        "creator"
      );
      const relayCreatorId = context.primaryRelayCreatorId?.trim();
      if (!relayCreatorId) {
        return res.status(404).json(
          errorEnvelope(
            "NOT_FOUND",
            "No creator studio — call POST /api/v1/creator/workspace first.",
            traceId
          )
        );
      }

      // Optional: create Relay draft via legacy adapter when make_post + create_relay_draft
      if (
        body.create_relay_draft === true &&
        (body.event_type === "make_post" || body.event_type === "schedule_post") &&
        !body.post_id &&
        !body.external_url
      ) {
        const coreGate = await requireCreatorPlanAtLeast(
          config.prisma,
          relayCreatorId,
          CreatorPlan.studio_core
        );
        if (!coreGate.ok) {
          return res.status(402).json({
            error: "plan_required",
            required_plan: "studio_core"
          });
        }
        const dueAt = typeof body.due_at === "string" ? body.due_at.trim() : "";
        if (!dueAt) {
          return res
            .status(400)
            .json(errorEnvelope("VALIDATION_ERROR", "due_at is required.", traceId));
        }
        const destination =
          typeof body.destination === "string" ? body.destination.trim() : "patreon";
        const destinations = Array.isArray(body.destinations)
          ? body.destinations.filter((d): d is string => typeof d === "string" && d.trim().length > 0)
          : [destination];
        const event = await createScheduledPostForRail(config.prisma, relayCreatorId, {
          title: typeof body.title === "string" ? body.title : undefined,
          scheduled_for: dueAt,
          destination,
          destinations: destinations.length > 0 ? destinations : [destination],
          notify: typeof body.remind_me === "boolean" ? body.remind_me : undefined,
          note: typeof body.note === "string" ? body.note : undefined,
          planned_format: typeof body.planned_format === "string" ? body.planned_format : undefined
        });
        res.setHeader("Cache-Control", "private, no-store");
        return res.status(201).json(successEnvelope({ event, source: "postbot_task" }, traceId));
      }

      if (!isCreatorScheduleEventType(body.event_type)) {
        return res.status(400).json(
          errorEnvelope(
            "VALIDATION_ERROR",
            "event_type must be make_post, schedule_post, engage_comments, pin_comment, repost, or custom.",
            traceId
          )
        );
      }
      const isCustom = body.event_type === "custom";
      if (
        !isCustom &&
        !isCreatorScheduleDestination(body.destination)
      ) {
        return res.status(400).json(
          errorEnvelope(
            "VALIDATION_ERROR",
            "destination must be patreon, x, deviantart, or bluesky.",
            traceId
          )
        );
      }
      const dueAt = typeof body.due_at === "string" ? body.due_at.trim() : "";
      if (!dueAt) {
        return res
          .status(400)
          .json(errorEnvelope("VALIDATION_ERROR", "due_at is required.", traceId));
      }

      const out = await createCreatorScheduleEvent(config.prisma, relayCreatorId, {
        event_type: body.event_type,
        destination: isCustom
          ? null
          : isCreatorScheduleDestination(body.destination)
            ? body.destination
            : null,
        due_at: dueAt,
        title: typeof body.title === "string" ? body.title : undefined,
        note: typeof body.note === "string" ? body.note : body.note === null ? null : undefined,
        remind_me: typeof body.remind_me === "boolean" ? body.remind_me : undefined,
        post_id: typeof body.post_id === "string" ? body.post_id : null,
        external_url: typeof body.external_url === "string" ? body.external_url : null,
        target_mode:
          body.target_mode === "new_post" ||
          body.target_mode === "existing_post" ||
          body.target_mode === "external_url"
            ? body.target_mode
            : undefined
      });
      if (!out.ok) {
        return res.status(409).json({
          ...out.missing_link,
          trace_id: traceId
        });
      }
      res.setHeader("Cache-Control", "private, no-store");
      return res.status(201).json(successEnvelope({ event: out.event }, traceId));
    } catch (err) {
      if (sendRelayAuthError(res, err, traceId)) return;
      if (err instanceof CreatorScheduleEventPlanRequiredError) {
        return res.status(402).json({
          error: "plan_required",
          required_plan: err.required_plan
        });
      }
      if (err instanceof CreatorScheduleEventValidationError) {
        return res.status(err.statusCode).json(errorEnvelope("VALIDATION_ERROR", err.message, traceId));
      }
      if (err instanceof CreatorScheduleEventNotFoundError) {
        return res.status(err.statusCode).json(errorEnvelope("NOT_FOUND", err.message, traceId));
      }
      if (err instanceof ScheduleRailValidationError) {
        return res.status(err.statusCode).json(errorEnvelope("VALIDATION_ERROR", err.message, traceId));
      }
      return res.status(500).json(errorEnvelope("INTERNAL", (err as Error).message, traceId));
    }
  });

  app.patch(
    "/api/v1/creator/schedule-rail/events/:event_id",
    async (req: Request, res: Response) => {
      const traceId = traceIdFrom(req);
      if (!config.prisma) {
        return res.status(503).json(
          errorEnvelope("SERVICE_UNAVAILABLE", "Database not configured.", traceId)
        );
      }
      const eventId = String(req.params.event_id ?? "").trim();
      if (!eventId) {
        return res
          .status(400)
          .json(errorEnvelope("VALIDATION_ERROR", "event_id is required.", traceId));
      }
      const body = (req.body ?? {}) as Record<string, unknown>;
      try {
        const { context } = await requireAccountWithRole(
          req,
          { prisma: config.prisma, identityService },
          "creator"
        );
        const relayCreatorId = context.primaryRelayCreatorId?.trim();
        if (!relayCreatorId) {
          return res.status(404).json(
            errorEnvelope(
              "NOT_FOUND",
              "No creator studio — call POST /api/v1/creator/workspace first.",
              traceId
            )
          );
        }
        const event = await patchCreatorScheduleEvent(config.prisma, relayCreatorId, eventId, {
          title: typeof body.title === "string" ? body.title : undefined,
          note: typeof body.note === "string" ? body.note : body.note === null ? null : undefined,
          due_at: typeof body.due_at === "string" ? body.due_at : undefined,
          remind_me: typeof body.remind_me === "boolean" ? body.remind_me : undefined,
          status:
            body.status === "pending" || body.status === "done" || body.status === "dismissed"
              ? body.status
              : undefined,
          external_url:
            typeof body.external_url === "string"
              ? body.external_url
              : body.external_url === null
                ? null
                : undefined
        });
        res.setHeader("Cache-Control", "private, no-store");
        return res.status(200).json(successEnvelope({ event }, traceId));
      } catch (err) {
        if (sendRelayAuthError(res, err, traceId)) return;
        if (err instanceof CreatorScheduleEventPlanRequiredError) {
          return res.status(402).json({
            error: "plan_required",
            required_plan: err.required_plan
          });
        }
        if (err instanceof CreatorScheduleEventValidationError) {
          return res
            .status(err.statusCode)
            .json(errorEnvelope("VALIDATION_ERROR", err.message, traceId));
        }
        if (err instanceof CreatorScheduleEventNotFoundError) {
          return res.status(err.statusCode).json(errorEnvelope("NOT_FOUND", err.message, traceId));
        }
        return res.status(500).json(errorEnvelope("INTERNAL", (err as Error).message, traceId));
      }
    }
  );

  app.get("/api/v1/creator/schedule-rail/library-posts", async (req: Request, res: Response) => {
    const traceId = traceIdFrom(req);
    if (!config.prisma) {
      return res.status(503).json(
        errorEnvelope("SERVICE_UNAVAILABLE", "Database not configured.", traceId)
      );
    }
    try {
      const { context } = await requireAccountWithRole(
        req,
        { prisma: config.prisma, identityService },
        "creator"
      );
      const relayCreatorId = context.primaryRelayCreatorId?.trim();
      if (!relayCreatorId) {
        return res.status(404).json(
          errorEnvelope(
            "NOT_FOUND",
            "No creator studio — call POST /api/v1/creator/workspace first.",
            traceId
          )
        );
      }
      const q = typeof req.query.q === "string" ? req.query.q : undefined;
      const posts = await listScheduleLibraryPosts(config.prisma, relayCreatorId, { q });
      res.setHeader("Cache-Control", "private, no-store");
      return res.status(200).json(successEnvelope({ posts }, traceId));
    } catch (err) {
      if (sendRelayAuthError(res, err, traceId)) return;
      if (err instanceof CreatorScheduleEventPlanRequiredError) {
        return res.status(402).json({
          error: "plan_required",
          required_plan: err.required_plan
        });
      }
      return res.status(500).json(errorEnvelope("INTERNAL", (err as Error).message, traceId));
    }
  });

  app.post(
    "/api/v1/creator/schedule-rail/events/:task_id/attach-media",
    async (req: Request, res: Response) => {
      const traceId = traceIdFrom(req);
      if (!config.prisma) {
        return res.status(503).json(
          errorEnvelope("SERVICE_UNAVAILABLE", "Database not configured.", traceId)
        );
      }
      const taskId = String(req.params.task_id ?? "").trim();
      const body = (req.body ?? {}) as Record<string, unknown>;
      const mediaIds = Array.isArray(body.media_ids) ? (body.media_ids as unknown[]) : null;
      const modeRaw = typeof body.mode === "string" ? body.mode.trim() : "append";
      const mode =
        modeRaw === "replace" || modeRaw === "remove" || modeRaw === "append"
          ? modeRaw
          : null;
      if (!mode) {
        return res.status(400).json(
          errorEnvelope(
            "VALIDATION_ERROR",
            "mode must be append, replace, or remove.",
            traceId
          )
        );
      }
      if (mode !== "remove" && (!mediaIds || !mediaIds.every((t) => typeof t === "string"))) {
        return res.status(400).json(
          errorEnvelope("VALIDATION_ERROR", "media_ids must be an array of strings.", traceId)
        );
      }
      try {
        const { context } = await requireAccountWithRole(
          req,
          { prisma: config.prisma, identityService },
          "creator"
        );
        const relayCreatorId = context.primaryRelayCreatorId?.trim();
        if (!relayCreatorId) {
          return res.status(404).json(
            errorEnvelope(
              "NOT_FOUND",
              "No creator studio — call POST /api/v1/creator/workspace first.",
              traceId
            )
          );
        }
        const result = await attachMediaToScheduleRailEvent(
          config.prisma,
          relayCreatorId,
          taskId,
          mode === "remove" ? [] : (mediaIds as string[]),
          { mode }
        );
        res.setHeader("Cache-Control", "private, no-store");
        return res.status(200).json(successEnvelope({ attach: result }, traceId));
      } catch (err) {
        if (sendRelayAuthError(res, err, traceId)) return;
        if (err instanceof ScheduleRailValidationError) {
          return res
            .status(err.statusCode)
            .json(errorEnvelope("VALIDATION_ERROR", err.message, traceId));
        }
        if (err instanceof ScheduleRailNotFoundError) {
          return res.status(err.statusCode).json(errorEnvelope("NOT_FOUND", err.message, traceId));
        }
        return res.status(500).json(errorEnvelope("INTERNAL", (err as Error).message, traceId));
      }
    }
  );

  app.patch(
    "/api/v1/creator/schedule-rail/events/:event_id/post-details",
    async (req: Request, res: Response) => {
      const traceId = traceIdFrom(req);
      if (!config.prisma) {
        return res.status(503).json(
          errorEnvelope("SERVICE_UNAVAILABLE", "Database not configured.", traceId)
        );
      }
      const eventId = String(req.params.event_id ?? "").trim();
      const body = (req.body ?? {}) as Record<string, unknown>;
      const fitRaw = typeof body.fit_mode === "string" ? body.fit_mode.trim() : "as_written";
      const fitMode =
        fitRaw === "fit_platforms" || fitRaw === "as_written" ? fitRaw : null;
      if (!fitMode) {
        return res.status(400).json(
          errorEnvelope(
            "VALIDATION_ERROR",
            "fit_mode must be as_written or fit_platforms.",
            traceId
          )
        );
      }
      if (body.tags !== undefined && !Array.isArray(body.tags)) {
        return res.status(400).json(
          errorEnvelope("VALIDATION_ERROR", "tags must be an array of strings.", traceId)
        );
      }
      if (
        body.tags !== undefined &&
        !(body.tags as unknown[]).every((t) => typeof t === "string")
      ) {
        return res.status(400).json(
          errorEnvelope("VALIDATION_ERROR", "tags must be an array of strings.", traceId)
        );
      }
      const overridesRaw = Array.isArray(body.variant_overrides)
        ? (body.variant_overrides as unknown[])
        : undefined;
      const variant_overrides = overridesRaw?.map((row) => {
        const o = (row ?? {}) as Record<string, unknown>;
        return {
          destination: String(o.destination ?? ""),
          use_original: o.use_original === true,
          title: o.title === null || typeof o.title === "string" ? (o.title as string | null) : undefined,
          body_text:
            o.body_text === null || typeof o.body_text === "string"
              ? (o.body_text as string | null)
              : undefined,
          post_text:
            o.post_text === null || typeof o.post_text === "string"
              ? (o.post_text as string | null)
              : undefined
        };
      });
      try {
        const { context } = await requireAccountWithRole(
          req,
          { prisma: config.prisma, identityService },
          "creator"
        );
        const relayCreatorId = context.primaryRelayCreatorId?.trim();
        if (!relayCreatorId) {
          return res.status(404).json(
            errorEnvelope(
              "NOT_FOUND",
              "No creator studio — call POST /api/v1/creator/workspace first.",
              traceId
            )
          );
        }
        const result = await updateScheduleRailEventPostDetails(
          config.prisma,
          relayCreatorId,
          eventId,
          {
            title:
              body.title === null || typeof body.title === "string"
                ? (body.title as string | null)
                : undefined,
            description:
              body.description === null || typeof body.description === "string"
                ? (body.description as string | null)
                : undefined,
            tags: body.tags as string[] | undefined,
            fit_mode: fitMode,
            preview: body.preview === true,
            variant_overrides
          }
        );
        res.setHeader("Cache-Control", "private, no-store");
        return res.status(200).json(successEnvelope({ post_details: result }, traceId));
      } catch (err) {
        if (sendRelayAuthError(res, err, traceId)) return;
        if (err instanceof ScheduleRailValidationError) {
          return res
            .status(err.statusCode)
            .json(errorEnvelope("VALIDATION_ERROR", err.message, traceId));
        }
        if (err instanceof ScheduleRailNotFoundError) {
          return res.status(err.statusCode).json(errorEnvelope("NOT_FOUND", err.message, traceId));
        }
        return res.status(500).json(errorEnvelope("INTERNAL", (err as Error).message, traceId));
      }
    }
  );

  app.post(
    "/api/v1/creator/posting-goal/nudge/current/snooze",
    async (req: Request, res: Response) => {
      const traceId = traceIdFrom(req);
      if (!config.prisma) {
        return res.status(503).json(
          errorEnvelope("SERVICE_UNAVAILABLE", "Database not configured.", traceId)
        );
      }
      const body = (req.body ?? {}) as Record<string, unknown>;
      try {
        const { context } = await requireAccountWithRole(
          req,
          { prisma: config.prisma, identityService },
          "creator"
        );
        const relayCreatorId = context.primaryRelayCreatorId?.trim();
        if (!relayCreatorId) {
          return res.status(404).json(
            errorEnvelope(
              "NOT_FOUND",
              "No creator studio — call POST /api/v1/creator/workspace first.",
              traceId
            )
          );
        }
        const nudge = await snoozeCurrentCreatorPostingNudge(
          config.prisma,
          relayCreatorId,
          body.snoozed_until
        );
        res.setHeader("Cache-Control", "private, no-store");
        return res.status(200).json(successEnvelope({ nudge }, traceId));
      } catch (err) {
        if (sendRelayAuthError(res, err, traceId)) return;
        if (err instanceof PostingGoalValidationError) {
          return res.status(400).json(
            errorEnvelope("VALIDATION_ERROR", err.message, traceId, err.details)
          );
        }
        if (err instanceof PostingGoalNotFoundError) {
          return res.status(404).json(errorEnvelope("NOT_FOUND", err.message, traceId));
        }
        return res.status(500).json(errorEnvelope("INTERNAL", (err as Error).message, traceId));
      }
    }
  );

  app.post(
    "/api/v1/creator/posting-goal/nudge/current/skip",
    async (req: Request, res: Response) => {
      const traceId = traceIdFrom(req);
      if (!config.prisma) {
        return res.status(503).json(
          errorEnvelope("SERVICE_UNAVAILABLE", "Database not configured.", traceId)
        );
      }
      try {
        const { context } = await requireAccountWithRole(
          req,
          { prisma: config.prisma, identityService },
          "creator"
        );
        const relayCreatorId = context.primaryRelayCreatorId?.trim();
        if (!relayCreatorId) {
          return res.status(404).json(
            errorEnvelope(
              "NOT_FOUND",
              "No creator studio — call POST /api/v1/creator/workspace first.",
              traceId
            )
          );
        }
        const nudge = await skipCurrentCreatorPostingNudge(config.prisma, relayCreatorId);
        res.setHeader("Cache-Control", "private, no-store");
        return res.status(200).json(successEnvelope({ nudge }, traceId));
      } catch (err) {
        if (sendRelayAuthError(res, err, traceId)) return;
        if (err instanceof PostingGoalValidationError) {
          return res.status(400).json(
            errorEnvelope("VALIDATION_ERROR", err.message, traceId, err.details)
          );
        }
        if (err instanceof PostingGoalNotFoundError) {
          return res.status(404).json(errorEnvelope("NOT_FOUND", err.message, traceId));
        }
        return res.status(500).json(errorEnvelope("INTERNAL", (err as Error).message, traceId));
      }
    }
  );

  app.post(
    "/api/v1/creator/posting-goal/nudge/:nudge_id/snooze",
    async (req: Request, res: Response) => {
      const traceId = traceIdFrom(req);
      if (!config.prisma) {
        return res.status(503).json(
          errorEnvelope("SERVICE_UNAVAILABLE", "Database not configured.", traceId)
        );
      }
      const body = (req.body ?? {}) as Record<string, unknown>;
      const nudgeId = typeof req.params.nudge_id === "string" ? req.params.nudge_id.trim() : "";
      if (!nudgeId) {
        return res.status(400).json(
          errorEnvelope("VALIDATION_ERROR", "nudge_id required.", traceId, [
            { field: "nudge_id", issue: "required" }
          ])
        );
      }
      try {
        const { context } = await requireAccountWithRole(
          req,
          { prisma: config.prisma, identityService },
          "creator"
        );
        const relayCreatorId = context.primaryRelayCreatorId?.trim();
        if (!relayCreatorId) {
          return res.status(404).json(
            errorEnvelope(
              "NOT_FOUND",
              "No creator studio — call POST /api/v1/creator/workspace first.",
              traceId
            )
          );
        }
        const nudge = await snoozeCreatorPostingNudge(
          config.prisma,
          relayCreatorId,
          nudgeId,
          body.snoozed_until
        );
        res.setHeader("Cache-Control", "private, no-store");
        return res.status(200).json(successEnvelope({ nudge }, traceId));
      } catch (err) {
        if (sendRelayAuthError(res, err, traceId)) return;
        if (err instanceof PostingGoalValidationError) {
          return res.status(400).json(
            errorEnvelope("VALIDATION_ERROR", err.message, traceId, err.details)
          );
        }
        if (err instanceof PostingGoalNotFoundError) {
          return res.status(404).json(errorEnvelope("NOT_FOUND", err.message, traceId));
        }
        return res.status(500).json(errorEnvelope("INTERNAL", (err as Error).message, traceId));
      }
    }
  );

  app.post(
    "/api/v1/creator/posting-goal/nudge/:nudge_id/skip",
    async (req: Request, res: Response) => {
      const traceId = traceIdFrom(req);
      if (!config.prisma) {
        return res.status(503).json(
          errorEnvelope("SERVICE_UNAVAILABLE", "Database not configured.", traceId)
        );
      }
      const nudgeId = typeof req.params.nudge_id === "string" ? req.params.nudge_id.trim() : "";
      if (!nudgeId) {
        return res.status(400).json(
          errorEnvelope("VALIDATION_ERROR", "nudge_id required.", traceId, [
            { field: "nudge_id", issue: "required" }
          ])
        );
      }
      try {
        const { context } = await requireAccountWithRole(
          req,
          { prisma: config.prisma, identityService },
          "creator"
        );
        const relayCreatorId = context.primaryRelayCreatorId?.trim();
        if (!relayCreatorId) {
          return res.status(404).json(
            errorEnvelope(
              "NOT_FOUND",
              "No creator studio — call POST /api/v1/creator/workspace first.",
              traceId
            )
          );
        }
        const nudge = await skipCreatorPostingNudge(config.prisma, relayCreatorId, nudgeId);
        res.setHeader("Cache-Control", "private, no-store");
        return res.status(200).json(successEnvelope({ nudge }, traceId));
      } catch (err) {
        if (sendRelayAuthError(res, err, traceId)) return;
        if (err instanceof PostingGoalNotFoundError) {
          return res.status(404).json(errorEnvelope("NOT_FOUND", err.message, traceId));
        }
        return res.status(500).json(errorEnvelope("INTERNAL", (err as Error).message, traceId));
      }
    }
  );

  /**
   * Autopost WI-2 — hybrid draft workspace (creator-only).
   */
  app.get("/api/v1/creator/autopost/drafts", async (req: Request, res: Response) => {
    const traceId = traceIdFrom(req);
    if (!config.prisma) {
      return res.status(503).json(
        errorEnvelope("SERVICE_UNAVAILABLE", "Database not configured.", traceId)
      );
    }
    const statusRaw = String(req.query.status ?? "active").trim().toLowerCase();
    const status =
      statusRaw === "published" || statusRaw === "all" || statusRaw === "active"
        ? statusRaw
        : "active";
    const limitRaw = Number(req.query.limit);
    const limit = Number.isFinite(limitRaw) ? limitRaw : undefined;
    try {
      const { context } = await requireAccountWithRole(
        req,
        { prisma: config.prisma, identityService },
        "creator"
      );
      const relayCreatorId = context.primaryRelayCreatorId?.trim();
      if (!relayCreatorId) {
        return res.status(404).json(
          errorEnvelope(
            "NOT_FOUND",
            "No creator studio — call POST /api/v1/creator/workspace first.",
            traceId
          )
        );
      }
      const drafts = await listAutopostDrafts(config.prisma, relayCreatorId, {
        status,
        limit
      });
      res.setHeader("Cache-Control", "private, no-store");
      return res.status(200).json(successEnvelope({ drafts }, traceId));
    } catch (err) {
      if (sendRelayAuthError(res, err, traceId)) return;
      return res.status(500).json(errorEnvelope("INTERNAL", (err as Error).message, traceId));
    }
  });

  app.get("/api/v1/creator/autopost/draft", async (req: Request, res: Response) => {
    const traceId = traceIdFrom(req);
    if (!config.prisma) {
      return res.status(503).json(
        errorEnvelope("SERVICE_UNAVAILABLE", "Database not configured.", traceId)
      );
    }
    try {
      const { context } = await requireAccountWithRole(
        req,
        { prisma: config.prisma, identityService },
        "creator"
      );
      const relayCreatorId = context.primaryRelayCreatorId?.trim();
      if (!relayCreatorId) {
        return res.status(404).json(
          errorEnvelope(
            "NOT_FOUND",
            "No creator studio — call POST /api/v1/creator/workspace first.",
            traceId
          )
        );
      }
      const draft = await getActiveAutopostDraft(config.prisma, relayCreatorId);
      res.setHeader("Cache-Control", "private, no-store");
      return res.status(200).json(successEnvelope({ draft }, traceId));
    } catch (err) {
      if (sendRelayAuthError(res, err, traceId)) return;
      return res.status(500).json(errorEnvelope("INTERNAL", (err as Error).message, traceId));
    }
  });

  app.get("/api/v1/creator/autopost/draft/:draft_id", async (req: Request, res: Response) => {
    const traceId = traceIdFrom(req);
    if (!config.prisma) {
      return res.status(503).json(
        errorEnvelope("SERVICE_UNAVAILABLE", "Database not configured.", traceId)
      );
    }
    const draftId = String(req.params.draft_id ?? "").trim();
    try {
      const { context } = await requireAccountWithRole(
        req,
        { prisma: config.prisma, identityService },
        "creator"
      );
      const relayCreatorId = context.primaryRelayCreatorId?.trim();
      if (!relayCreatorId) {
        return res.status(404).json(
          errorEnvelope(
            "NOT_FOUND",
            "No creator studio — call POST /api/v1/creator/workspace first.",
            traceId
          )
        );
      }
      const draft = await getAutopostDraft(config.prisma, relayCreatorId, draftId);
      res.setHeader("Cache-Control", "private, no-store");
      return res.status(200).json(successEnvelope({ draft }, traceId));
    } catch (err) {
      if (sendRelayAuthError(res, err, traceId)) return;
      if (err instanceof AutopostDraftValidationError) {
        return res.status(404).json(
          errorEnvelope("NOT_FOUND", err.message, traceId, err.details)
        );
      }
      return res.status(500).json(errorEnvelope("INTERNAL", (err as Error).message, traceId));
    }
  });

  app.post("/api/v1/creator/autopost/draft", async (req: Request, res: Response) => {
    const traceId = traceIdFrom(req);
    if (!config.prisma) {
      return res.status(503).json(
        errorEnvelope("SERVICE_UNAVAILABLE", "Database not configured.", traceId)
      );
    }
    const body = (req.body ?? {}) as Record<string, unknown>;
    const mediaIds = Array.isArray(body.media_ids) ? (body.media_ids as unknown[]) : [];
    const statusRaw =
      typeof body.status === "string" ? body.status.trim().toLowerCase() : undefined;
    const status =
      statusRaw === "nudged" || statusRaw === "drafting" || statusRaw === "previewing"
        ? statusRaw
        : undefined;
    try {
      const { context } = await requireAccountWithRole(
        req,
        { prisma: config.prisma, identityService },
        "creator"
      );
      const relayCreatorId = context.primaryRelayCreatorId?.trim();
      if (!relayCreatorId) {
        return res.status(404).json(
          errorEnvelope(
            "NOT_FOUND",
            "No creator studio — call POST /api/v1/creator/workspace first.",
            traceId
          )
        );
      }
      if (!(await isAutopostBetterAllowed(config.prisma, relayCreatorId))) {
        return res.status(402).json({
          error: "plan_required",
          required_plan: "autopost"
        });
      }
      const workspace =
        body.workspace && typeof body.workspace === "object" && !Array.isArray(body.workspace)
          ? (body.workspace as Record<string, unknown>)
          : undefined;
      const draft = await saveAutopostDraft(config.prisma, relayCreatorId, {
        media_ids: mediaIds.map(String),
        title: typeof body.title === "string" ? body.title : null,
        body_text: typeof body.body_text === "string" ? body.body_text : null,
        generate: body.generate === true ? true : body.generate === false ? false : undefined,
        intent: typeof body.intent === "string" ? body.intent : body.intent === null ? null : undefined,
        performance_goal_id:
          typeof body.performance_goal_id === "string"
            ? body.performance_goal_id
            : body.performance_goal_id === null
              ? null
              : undefined,
        status,
        composer_step: typeof body.composer_step === "string" ? body.composer_step : undefined,
        workspace: workspace as
          | {
              selected_destinations?: string[];
              tags?: string[];
              tier_ids?: string[];
              is_public?: boolean;
              campaign_id?: string | null;
              needs_preview?: boolean | null;
            }
          | undefined
      });
      res.setHeader("Cache-Control", "private, no-store");
      return res.status(201).json(successEnvelope({ draft }, traceId));
    } catch (err) {
      if (sendRelayAuthError(res, err, traceId)) return;
      if (err instanceof StyleProfileValidationError) {
        return res.status(400).json(
          errorEnvelope("VALIDATION_ERROR", err.message, traceId, err.details)
        );
      }
      if (err instanceof AutopostDraftConflictError) {
        return res.status(409).json(
          errorEnvelope("CONFLICT", err.message, traceId, [
            { field: "active_draft_id", issue: err.active_draft_id }
          ])
        );
      }
      if (err instanceof AutopostDraftValidationError) {
        return res.status(400).json(
          errorEnvelope("VALIDATION_ERROR", err.message, traceId, err.details)
        );
      }
      return res.status(500).json(errorEnvelope("INTERNAL", (err as Error).message, traceId));
    }
  });

  app.patch("/api/v1/creator/autopost/draft/:draft_id", async (req: Request, res: Response) => {
    const traceId = traceIdFrom(req);
    if (!config.prisma) {
      return res.status(503).json(
        errorEnvelope("SERVICE_UNAVAILABLE", "Database not configured.", traceId)
      );
    }
    const draftId = String(req.params.draft_id ?? "").trim();
    const body = (req.body ?? {}) as Record<string, unknown>;
    try {
      const { context } = await requireAccountWithRole(
        req,
        { prisma: config.prisma, identityService },
        "creator"
      );
      const relayCreatorId = context.primaryRelayCreatorId?.trim();
      if (!relayCreatorId) {
        return res.status(404).json(
          errorEnvelope(
            "NOT_FOUND",
            "No creator studio — call POST /api/v1/creator/workspace first.",
            traceId
          )
        );
      }
      if (!(await isAutopostBetterAllowed(config.prisma, relayCreatorId))) {
        return res.status(402).json({
          error: "plan_required",
          required_plan: "autopost"
        });
      }
      const draft = await patchAutopostDraft(config.prisma, relayCreatorId, draftId, {
        title: body.title === undefined ? undefined : typeof body.title === "string" ? body.title : null,
        body_text:
          body.body_text === undefined
            ? undefined
            : typeof body.body_text === "string"
              ? body.body_text
              : null,
        regenerate: body.regenerate === true,
        status: typeof body.status === "string" ? body.status : undefined,
        intent:
          body.intent === undefined
            ? undefined
            : typeof body.intent === "string"
              ? body.intent
              : null,
        performance_goal_id:
          body.performance_goal_id === undefined
            ? undefined
            : typeof body.performance_goal_id === "string"
              ? body.performance_goal_id
              : null,
        composer_step: typeof body.composer_step === "string" ? body.composer_step : undefined,
        workspace:
          body.workspace && typeof body.workspace === "object" && !Array.isArray(body.workspace)
            ? (body.workspace as {
                selected_destinations?: string[];
                tags?: string[];
                tier_ids?: string[];
                is_public?: boolean;
                campaign_id?: string | null;
                needs_preview?: boolean | null;
              })
            : undefined,
        media_ids: Array.isArray(body.media_ids)
          ? (body.media_ids as unknown[]).map(String)
          : undefined
      });
      res.setHeader("Cache-Control", "private, no-store");
      return res.status(200).json(successEnvelope({ draft }, traceId));
    } catch (err) {
      if (sendRelayAuthError(res, err, traceId)) return;
      if (err instanceof AutopostDraftValidationError) {
        return res.status(400).json(
          errorEnvelope("VALIDATION_ERROR", err.message, traceId, err.details)
        );
      }
      return res.status(500).json(errorEnvelope("INTERNAL", (err as Error).message, traceId));
    }
  });

  app.post("/api/v1/creator/autopost/draft/:draft_id/publish", async (req: Request, res: Response) => {
    const traceId = traceIdFrom(req);
    if (!config.prisma) {
      return res.status(503).json(
        errorEnvelope("SERVICE_UNAVAILABLE", "Database not configured.", traceId)
      );
    }
    const draftId = String(req.params.draft_id ?? "").trim();
    const body = (req.body ?? {}) as Record<string, unknown>;
    const isPublic = body.is_public === true;
    const isPublicFalse = body.is_public === false;
    if (!isPublic && !isPublicFalse) {
      return res.status(400).json(
        errorEnvelope("VALIDATION_ERROR", "is_public must be a boolean.", traceId)
      );
    }
    try {
      const { context } = await requireAccountWithRole(
        req,
        { prisma: config.prisma, identityService },
        "creator"
      );
      const relayCreatorId = context.primaryRelayCreatorId?.trim();
      if (!relayCreatorId) {
        return res.status(404).json(
          errorEnvelope(
            "NOT_FOUND",
            "No creator studio — call POST /api/v1/creator/workspace first.",
            traceId
          )
        );
      }
      if (!(await isAutopostBetterAllowed(config.prisma, relayCreatorId))) {
        return res.status(402).json({
          error: "plan_required",
          required_plan: "autopost"
        });
      }
      if (
        !(await assertCreatorRelayMutationAllowed(
          req,
          res,
          traceId,
          config.prisma,
          relayCreatorId
        ))
      ) {
        return;
      }
      const result = await publishAutopostDraft(config.prisma, relayCreatorId, draftId, {
        campaign_id:
          typeof body.campaign_id === "string" && body.campaign_id.trim()
            ? body.campaign_id.trim()
            : null,
        is_public: isPublic,
        required_tier_id:
          typeof body.required_tier_id === "string" && body.required_tier_id.trim()
            ? body.required_tier_id.trim()
            : null,
        tier_ids: Array.isArray(body.tier_ids) ? (body.tier_ids as unknown[]).map(String) : [],
        tag_ids: Array.isArray(body.tag_ids) ? (body.tag_ids as unknown[]).map(String) : [],
        title: typeof body.title === "string" ? body.title : null,
        description: typeof body.description === "string" ? body.description : null
      });
      res.setHeader("Cache-Control", "private, no-store");
      return res.status(200).json(successEnvelope(result, traceId));
    } catch (err) {
      if (sendRelayAuthError(res, err, traceId)) return;
      if (err instanceof AutopostDraftValidationError) {
        return res.status(400).json(
          errorEnvelope("VALIDATION_ERROR", err.message, traceId, err.details)
        );
      }
      return res.status(500).json(errorEnvelope("INTERNAL", (err as Error).message, traceId));
    }
  });

  app.delete("/api/v1/creator/autopost/draft/:draft_id", async (req: Request, res: Response) => {
    const traceId = traceIdFrom(req);
    if (!config.prisma) {
      return res.status(503).json(
        errorEnvelope("SERVICE_UNAVAILABLE", "Database not configured.", traceId)
      );
    }
    const draftId = String(req.params.draft_id ?? "").trim();
    const force = req.query.force === "true" || req.query.force === "1";
    try {
      const { context } = await requireAccountWithRole(
        req,
        { prisma: config.prisma, identityService },
        "creator"
      );
      const relayCreatorId = context.primaryRelayCreatorId?.trim();
      if (!relayCreatorId) {
        return res.status(404).json(
          errorEnvelope(
            "NOT_FOUND",
            "No creator studio — call POST /api/v1/creator/workspace first.",
            traceId
          )
        );
      }
      const draft = await discardAutopostDraft(config.prisma, relayCreatorId, draftId, force);
      res.setHeader("Cache-Control", "private, no-store");
      return res.status(200).json(successEnvelope({ draft }, traceId));
    } catch (err) {
      if (sendRelayAuthError(res, err, traceId)) return;
      if (err instanceof AutopostDraftDiscardWarningError) {
        return res.status(409).json(
          errorEnvelope("DISCARD_WARNING", err.message, traceId, [
            { field: "distribution_log", issue: JSON.stringify(err.distribution_log) }
          ])
        );
      }
      if (err instanceof AutopostDraftValidationError) {
        return res.status(400).json(
          errorEnvelope("VALIDATION_ERROR", err.message, traceId, err.details)
        );
      }
      return res.status(500).json(errorEnvelope("INTERNAL", (err as Error).message, traceId));
    }
  });

  app.post(
    "/api/v1/creator/autopost/draft/:draft_id/distribution",
    async (req: Request, res: Response) => {
      const traceId = traceIdFrom(req);
      if (!config.prisma) {
        return res.status(503).json(
          errorEnvelope("SERVICE_UNAVAILABLE", "Database not configured.", traceId)
        );
      }
      const draftId = String(req.params.draft_id ?? "").trim();
      const body = (req.body ?? {}) as Record<string, unknown>;
      const destination = typeof body.destination === "string" ? body.destination.trim() : "";
      const allowed: AutopostDistributionDestination[] = [
        "patreon",
        "x",
        "bluesky",
        "deviantart",
        "relay"
      ];
      if (!allowed.includes(destination as AutopostDistributionDestination)) {
        return res.status(400).json(
          errorEnvelope("VALIDATION_ERROR", "destination is invalid.", traceId)
        );
      }
      try {
        const { context } = await requireAccountWithRole(
          req,
          { prisma: config.prisma, identityService },
          "creator"
        );
        const relayCreatorId = context.primaryRelayCreatorId?.trim();
        if (!relayCreatorId) {
          return res.status(404).json(
            errorEnvelope(
              "NOT_FOUND",
              "No creator studio — call POST /api/v1/creator/workspace first.",
              traceId
            )
          );
        }
        const draft = await recordAutopostDistribution(
          config.prisma,
          relayCreatorId,
          draftId,
          destination as AutopostDistributionDestination
        );
        res.setHeader("Cache-Control", "private, no-store");
        return res.status(200).json(successEnvelope({ draft }, traceId));
      } catch (err) {
        if (sendRelayAuthError(res, err, traceId)) return;
        if (err instanceof AutopostDraftValidationError) {
          return res.status(400).json(
            errorEnvelope("VALIDATION_ERROR", err.message, traceId, err.details)
          );
        }
        return res.status(500).json(errorEnvelope("INTERNAL", (err as Error).message, traceId));
      }
    }
  );

  // —— Autopost schedule series (recurring routines) ——
  app.get("/api/v1/creator/autopost/schedule-series", async (req: Request, res: Response) => {
    const traceId = traceIdFrom(req);
    if (!config.prisma) {
      return res.status(503).json(
        errorEnvelope("SERVICE_UNAVAILABLE", "Database not configured.", traceId)
      );
    }
    try {
      const { context } = await requireAccountWithRole(
        req,
        { prisma: config.prisma, identityService },
        "creator"
      );
      const relayCreatorId = context.primaryRelayCreatorId?.trim();
      if (!relayCreatorId) {
        return res.status(404).json(
          errorEnvelope(
            "NOT_FOUND",
            "No creator studio — call POST /api/v1/creator/workspace first.",
            traceId
          )
        );
      }
      const series = await listScheduleSeries(config.prisma, relayCreatorId);
      res.setHeader("Cache-Control", "private, no-store");
      return res.status(200).json(successEnvelope({ series }, traceId));
    } catch (err) {
      if (sendRelayAuthError(res, err, traceId)) return;
      if (err instanceof ScheduleSeriesPlanRequiredError) {
        return res.status(402).json({
          error: "plan_required",
          required_plan: err.required_plan,
          message: err.message
        });
      }
      return res.status(500).json(errorEnvelope("INTERNAL", (err as Error).message, traceId));
    }
  });

  app.post("/api/v1/creator/autopost/schedule-series", async (req: Request, res: Response) => {
    const traceId = traceIdFrom(req);
    if (!config.prisma) {
      return res.status(503).json(
        errorEnvelope("SERVICE_UNAVAILABLE", "Database not configured.", traceId)
      );
    }
    const body = (req.body ?? {}) as Record<string, unknown>;
    try {
      const { context } = await requireAccountWithRole(
        req,
        { prisma: config.prisma, identityService },
        "creator"
      );
      const relayCreatorId = context.primaryRelayCreatorId?.trim();
      if (!relayCreatorId) {
        return res.status(404).json(
          errorEnvelope(
            "NOT_FOUND",
            "No creator studio — call POST /api/v1/creator/workspace first.",
            traceId
          )
        );
      }
      if (
        !(await assertCreatorRelayMutationAllowed(
          req,
          res,
          traceId,
          config.prisma,
          relayCreatorId
        ))
      ) {
        return;
      }
      const seedRaw =
        body.seed && typeof body.seed === "object" && !Array.isArray(body.seed)
          ? (body.seed as Record<string, unknown>)
          : null;
      const input: CreateScheduleSeriesInput = {
        cadence: body.cadence === "monthly" ? "monthly" : "weekly",
        interval: typeof body.interval === "number" ? body.interval : undefined,
        local_time: String(body.local_time ?? ""),
        timezone: typeof body.timezone === "string" ? body.timezone : undefined,
        weekdays: Array.isArray(body.weekdays)
          ? body.weekdays.map((n) => Number(n)).filter((n) => Number.isFinite(n))
          : undefined,
        month_days: Array.isArray(body.month_days)
          ? body.month_days.map((n) => Number(n)).filter((n) => Number.isFinite(n))
          : undefined,
        planned_format: typeof body.planned_format === "string" ? body.planned_format : undefined,
        destinations: Array.isArray(body.destinations)
          ? body.destinations.map(String)
          : [],
        remind_me: body.remind_me !== false,
        title_hint: typeof body.title_hint === "string" ? body.title_hint : null,
        starts_at: typeof body.starts_at === "string" ? body.starts_at : undefined,
        ends_at: typeof body.ends_at === "string" ? body.ends_at : body.ends_at === null ? null : undefined,
        source_post_id: typeof body.source_post_id === "string" ? body.source_post_id : null,
        materialization_kind:
          body.materialization_kind === "automation_trigger"
            ? "automation_trigger"
            : body.materialization_kind === "post_draft"
              ? "post_draft"
              : undefined,
        seed: seedRaw
          ? {
              due_at: String(seedRaw.due_at ?? ""),
              post_id: typeof seedRaw.post_id === "string" ? seedRaw.post_id : null,
              draft_id: typeof seedRaw.draft_id === "string" ? seedRaw.draft_id : null,
              primary_task_id:
                typeof seedRaw.primary_task_id === "string" ? seedRaw.primary_task_id : null
            }
          : undefined
      };
      const series = await createScheduleSeries(config.prisma, relayCreatorId, input);
      res.setHeader("Cache-Control", "private, no-store");
      return res.status(201).json(successEnvelope({ series }, traceId));
    } catch (err) {
      if (sendRelayAuthError(res, err, traceId)) return;
      if (err instanceof ScheduleSeriesPlanRequiredError) {
        return res.status(402).json({
          error: "plan_required",
          required_plan: err.required_plan,
          message: err.message
        });
      }
      if (err instanceof ScheduleSeriesValidationError) {
        return res.status(400).json(errorEnvelope("VALIDATION_ERROR", err.message, traceId));
      }
      return res.status(500).json(errorEnvelope("INTERNAL", (err as Error).message, traceId));
    }
  });

  app.patch(
    "/api/v1/creator/autopost/schedule-series/:series_id",
    async (req: Request, res: Response) => {
      const traceId = traceIdFrom(req);
      if (!config.prisma) {
        return res.status(503).json(
          errorEnvelope("SERVICE_UNAVAILABLE", "Database not configured.", traceId)
        );
      }
      const seriesId = String(req.params.series_id ?? "").trim();
      const body = (req.body ?? {}) as Record<string, unknown>;
      try {
        const { context } = await requireAccountWithRole(
          req,
          { prisma: config.prisma, identityService },
          "creator"
        );
        const relayCreatorId = context.primaryRelayCreatorId?.trim();
        if (!relayCreatorId) {
          return res.status(404).json(
            errorEnvelope(
              "NOT_FOUND",
              "No creator studio — call POST /api/v1/creator/workspace first.",
              traceId
            )
          );
        }
        if (
          !(await assertCreatorRelayMutationAllowed(
            req,
            res,
            traceId,
            config.prisma,
            relayCreatorId
          ))
        ) {
          return;
        }
        const input: PatchScheduleSeriesInput = {
          status:
            body.status === "active" || body.status === "paused" || body.status === "ended"
              ? body.status
              : undefined,
          cadence:
            body.cadence === "weekly" || body.cadence === "monthly" ? body.cadence : undefined,
          interval: typeof body.interval === "number" ? body.interval : undefined,
          local_time: typeof body.local_time === "string" ? body.local_time : undefined,
          timezone: typeof body.timezone === "string" ? body.timezone : undefined,
          weekdays: Array.isArray(body.weekdays)
            ? body.weekdays.map((n) => Number(n)).filter((n) => Number.isFinite(n))
            : undefined,
          month_days: Array.isArray(body.month_days)
            ? body.month_days.map((n) => Number(n)).filter((n) => Number.isFinite(n))
            : undefined,
          planned_format:
            typeof body.planned_format === "string" ? body.planned_format : undefined,
          destinations: Array.isArray(body.destinations)
            ? body.destinations.map(String)
            : undefined,
          remind_me: typeof body.remind_me === "boolean" ? body.remind_me : undefined,
          title_hint:
            typeof body.title_hint === "string" || body.title_hint === null
              ? (body.title_hint as string | null)
              : undefined,
          ends_at:
            typeof body.ends_at === "string" || body.ends_at === null
              ? (body.ends_at as string | null)
              : undefined,
          delete_future: body.delete_future === true
        };
        const series = await patchScheduleSeries(
          config.prisma,
          relayCreatorId,
          seriesId,
          input
        );
        res.setHeader("Cache-Control", "private, no-store");
        return res.status(200).json(successEnvelope({ series }, traceId));
      } catch (err) {
        if (sendRelayAuthError(res, err, traceId)) return;
        if (err instanceof ScheduleSeriesPlanRequiredError) {
          return res.status(402).json({
            error: "plan_required",
            required_plan: err.required_plan,
            message: err.message
          });
        }
        if (err instanceof ScheduleSeriesNotFoundError) {
          return res.status(404).json(errorEnvelope("NOT_FOUND", err.message, traceId));
        }
        if (err instanceof ScheduleSeriesValidationError) {
          return res.status(400).json(errorEnvelope("VALIDATION_ERROR", err.message, traceId));
        }
        return res.status(500).json(errorEnvelope("INTERNAL", (err as Error).message, traceId));
      }
    }
  );

  app.delete(
    "/api/v1/creator/autopost/schedule-series/:series_id",
    async (req: Request, res: Response) => {
      const traceId = traceIdFrom(req);
      if (!config.prisma) {
        return res.status(503).json(
          errorEnvelope("SERVICE_UNAVAILABLE", "Database not configured.", traceId)
        );
      }
      const seriesId = String(req.params.series_id ?? "").trim();
      const deleteFutureOnly =
        req.query.delete_future_only === "true" || req.query.delete_future_only === "1";
      try {
        const { context } = await requireAccountWithRole(
          req,
          { prisma: config.prisma, identityService },
          "creator"
        );
        const relayCreatorId = context.primaryRelayCreatorId?.trim();
        if (!relayCreatorId) {
          return res.status(404).json(
            errorEnvelope(
              "NOT_FOUND",
              "No creator studio — call POST /api/v1/creator/workspace first.",
              traceId
            )
          );
        }
        if (
          !(await assertCreatorRelayMutationAllowed(
            req,
            res,
            traceId,
            config.prisma,
            relayCreatorId
          ))
        ) {
          return;
        }
        const result = await deleteScheduleSeries(config.prisma, relayCreatorId, seriesId, {
          delete_future_only: deleteFutureOnly
        });
        res.setHeader("Cache-Control", "private, no-store");
        return res.status(200).json(successEnvelope(result, traceId));
      } catch (err) {
        if (sendRelayAuthError(res, err, traceId)) return;
        if (err instanceof ScheduleSeriesPlanRequiredError) {
          return res.status(402).json({
            error: "plan_required",
            required_plan: err.required_plan,
            message: err.message
          });
        }
        if (err instanceof ScheduleSeriesNotFoundError) {
          return res.status(404).json(errorEnvelope("NOT_FOUND", err.message, traceId));
        }
        return res.status(500).json(errorEnvelope("INTERNAL", (err as Error).message, traceId));
      }
    }
  );

  app.post(
    "/api/v1/creator/autopost/schedule-series/:series_id/reconcile",
    async (req: Request, res: Response) => {
      const traceId = traceIdFrom(req);
      if (!config.prisma) {
        return res.status(503).json(
          errorEnvelope("SERVICE_UNAVAILABLE", "Database not configured.", traceId)
        );
      }
      const seriesId = String(req.params.series_id ?? "").trim();
      try {
        const { context } = await requireAccountWithRole(
          req,
          { prisma: config.prisma, identityService },
          "creator"
        );
        const relayCreatorId = context.primaryRelayCreatorId?.trim();
        if (!relayCreatorId) {
          return res.status(404).json(
            errorEnvelope(
              "NOT_FOUND",
              "No creator studio — call POST /api/v1/creator/workspace first.",
              traceId
            )
          );
        }
        const owned = await config.prisma.creatorScheduleSeries.findFirst({
          where: { id: seriesId, creatorId: relayCreatorId },
          select: { id: true }
        });
        if (!owned) {
          return res.status(404).json(errorEnvelope("NOT_FOUND", "Schedule series not found.", traceId));
        }
        const result = await reconcileSeriesMaterialization(config.prisma, seriesId);
        res.setHeader("Cache-Control", "private, no-store");
        return res.status(200).json(successEnvelope(result, traceId));
      } catch (err) {
        if (sendRelayAuthError(res, err, traceId)) return;
        return res.status(500).json(errorEnvelope("INTERNAL", (err as Error).message, traceId));
      }
    }
  );

  app.post(
    "/api/v1/creator/autopost/schedule-series/occurrences/:occurrence_id/materialize",
    async (req: Request, res: Response) => {
      const traceId = traceIdFrom(req);
      if (!config.prisma) {
        return res.status(503).json(
          errorEnvelope("SERVICE_UNAVAILABLE", "Database not configured.", traceId)
        );
      }
      const occurrenceId = String(req.params.occurrence_id ?? "").trim();
      try {
        const { context } = await requireAccountWithRole(
          req,
          { prisma: config.prisma, identityService },
          "creator"
        );
        const relayCreatorId = context.primaryRelayCreatorId?.trim();
        if (!relayCreatorId) {
          return res.status(404).json(
            errorEnvelope(
              "NOT_FOUND",
              "No creator studio — call POST /api/v1/creator/workspace first.",
              traceId
            )
          );
        }
        if (
          !(await assertCreatorRelayMutationAllowed(
            req,
            res,
            traceId,
            config.prisma,
            relayCreatorId
          ))
        ) {
          return;
        }
        const owned = await config.prisma.creatorScheduleOccurrence.findFirst({
          where: { id: occurrenceId, creatorId: relayCreatorId },
          select: { id: true }
        });
        if (!owned) {
          return res
            .status(404)
            .json(errorEnvelope("NOT_FOUND", "Occurrence not found.", traceId));
        }
        const occurrence = await materializeOccurrence(config.prisma, occurrenceId);
        res.setHeader("Cache-Control", "private, no-store");
        return res.status(200).json(successEnvelope({ occurrence }, traceId));
      } catch (err) {
        if (sendRelayAuthError(res, err, traceId)) return;
        if (err instanceof ScheduleSeriesValidationError) {
          return res.status(400).json(errorEnvelope("VALIDATION_ERROR", err.message, traceId));
        }
        if (err instanceof ScheduleSeriesNotFoundError) {
          return res.status(404).json(errorEnvelope("NOT_FOUND", err.message, traceId));
        }
        return res.status(500).json(errorEnvelope("INTERNAL", (err as Error).message, traceId));
      }
    }
  );

  // —— Autopost distribution rules ——
  app.get("/api/v1/creator/autopost/distribution-rules", async (req: Request, res: Response) => {
    const traceId = traceIdFrom(req);
    if (!config.prisma) {
      return res.status(503).json(
        errorEnvelope("SERVICE_UNAVAILABLE", "Database not configured.", traceId)
      );
    }
    try {
      const { context } = await requireAccountWithRole(
        req,
        { prisma: config.prisma, identityService },
        "creator"
      );
      const relayCreatorId = context.primaryRelayCreatorId?.trim();
      if (!relayCreatorId) {
        return res.status(404).json(
          errorEnvelope(
            "NOT_FOUND",
            "No creator studio — call POST /api/v1/creator/workspace first.",
            traceId
          )
        );
      }
      const rules = await listDistributionRules(config.prisma, relayCreatorId);
      res.setHeader("Cache-Control", "private, no-store");
      return res.status(200).json(successEnvelope({ rules }, traceId));
    } catch (err) {
      if (sendRelayAuthError(res, err, traceId)) return;
      if (err instanceof DistributionRulePlanRequiredError) {
        return res.status(402).json({
          error: "plan_required",
          required_plan: err.required_plan,
          message: err.message
        });
      }
      return res.status(500).json(errorEnvelope("INTERNAL", (err as Error).message, traceId));
    }
  });

  app.post("/api/v1/creator/autopost/distribution-rules", async (req: Request, res: Response) => {
    const traceId = traceIdFrom(req);
    if (!config.prisma) {
      return res.status(503).json(
        errorEnvelope("SERVICE_UNAVAILABLE", "Database not configured.", traceId)
      );
    }
    const body = (req.body ?? {}) as Record<string, unknown>;
    try {
      const { context } = await requireAccountWithRole(
        req,
        { prisma: config.prisma, identityService },
        "creator"
      );
      const relayCreatorId = context.primaryRelayCreatorId?.trim();
      if (!relayCreatorId) {
        return res.status(404).json(
          errorEnvelope(
            "NOT_FOUND",
            "No creator studio — call POST /api/v1/creator/workspace first.",
            traceId
          )
        );
      }
      if (
        !(await assertCreatorRelayMutationAllowed(
          req,
          res,
          traceId,
          config.prisma,
          relayCreatorId
        ))
      ) {
        return;
      }
      const input: CreateDistributionRuleInput = {
        offset_days: typeof body.offset_days === "number" ? body.offset_days : undefined,
        target_destinations: Array.isArray(body.target_destinations)
          ? body.target_destinations.map(String)
          : [],
        remind_me: body.remind_me !== false,
        title: typeof body.title === "string" ? body.title : null
      };
      const rule = await createDistributionRule(config.prisma, relayCreatorId, input);
      res.setHeader("Cache-Control", "private, no-store");
      return res.status(201).json(successEnvelope({ rule }, traceId));
    } catch (err) {
      if (sendRelayAuthError(res, err, traceId)) return;
      if (err instanceof DistributionRulePlanRequiredError) {
        return res.status(402).json({
          error: "plan_required",
          required_plan: err.required_plan,
          message: err.message
        });
      }
      if (err instanceof DistributionRuleValidationError) {
        return res.status(400).json(errorEnvelope("VALIDATION_ERROR", err.message, traceId));
      }
      return res.status(500).json(errorEnvelope("INTERNAL", (err as Error).message, traceId));
    }
  });

  app.patch(
    "/api/v1/creator/autopost/distribution-rules/:rule_id",
    async (req: Request, res: Response) => {
      const traceId = traceIdFrom(req);
      if (!config.prisma) {
        return res.status(503).json(
          errorEnvelope("SERVICE_UNAVAILABLE", "Database not configured.", traceId)
        );
      }
      const ruleId = String(req.params.rule_id ?? "").trim();
      const body = (req.body ?? {}) as Record<string, unknown>;
      try {
        const { context } = await requireAccountWithRole(
          req,
          { prisma: config.prisma, identityService },
          "creator"
        );
        const relayCreatorId = context.primaryRelayCreatorId?.trim();
        if (!relayCreatorId) {
          return res.status(404).json(
            errorEnvelope(
              "NOT_FOUND",
              "No creator studio — call POST /api/v1/creator/workspace first.",
              traceId
            )
          );
        }
        if (
          !(await assertCreatorRelayMutationAllowed(
            req,
            res,
            traceId,
            config.prisma,
            relayCreatorId
          ))
        ) {
          return;
        }
        const input: PatchDistributionRuleInput = {
          status: body.status === "active" || body.status === "paused" ? body.status : undefined,
          offset_days: typeof body.offset_days === "number" ? body.offset_days : undefined,
          target_destinations: Array.isArray(body.target_destinations)
            ? body.target_destinations.map(String)
            : undefined,
          remind_me: typeof body.remind_me === "boolean" ? body.remind_me : undefined,
          title:
            typeof body.title === "string" || body.title === null
              ? (body.title as string | null)
              : undefined
        };
        const rule = await patchDistributionRule(
          config.prisma,
          relayCreatorId,
          ruleId,
          input
        );
        res.setHeader("Cache-Control", "private, no-store");
        return res.status(200).json(successEnvelope({ rule }, traceId));
      } catch (err) {
        if (sendRelayAuthError(res, err, traceId)) return;
        if (err instanceof DistributionRulePlanRequiredError) {
          return res.status(402).json({
            error: "plan_required",
            required_plan: err.required_plan,
            message: err.message
          });
        }
        if (err instanceof DistributionRuleNotFoundError) {
          return res.status(404).json(errorEnvelope("NOT_FOUND", err.message, traceId));
        }
        if (err instanceof DistributionRuleValidationError) {
          return res.status(400).json(errorEnvelope("VALIDATION_ERROR", err.message, traceId));
        }
        return res.status(500).json(errorEnvelope("INTERNAL", (err as Error).message, traceId));
      }
    }
  );

  app.delete(
    "/api/v1/creator/autopost/distribution-rules/:rule_id",
    async (req: Request, res: Response) => {
      const traceId = traceIdFrom(req);
      if (!config.prisma) {
        return res.status(503).json(
          errorEnvelope("SERVICE_UNAVAILABLE", "Database not configured.", traceId)
        );
      }
      const ruleId = String(req.params.rule_id ?? "").trim();
      try {
        const { context } = await requireAccountWithRole(
          req,
          { prisma: config.prisma, identityService },
          "creator"
        );
        const relayCreatorId = context.primaryRelayCreatorId?.trim();
        if (!relayCreatorId) {
          return res.status(404).json(
            errorEnvelope(
              "NOT_FOUND",
              "No creator studio — call POST /api/v1/creator/workspace first.",
              traceId
            )
          );
        }
        if (
          !(await assertCreatorRelayMutationAllowed(
            req,
            res,
            traceId,
            config.prisma,
            relayCreatorId
          ))
        ) {
          return;
        }
        await deleteDistributionRule(config.prisma, relayCreatorId, ruleId);
        res.setHeader("Cache-Control", "private, no-store");
        return res.status(200).json(successEnvelope({ deleted: true }, traceId));
      } catch (err) {
        if (sendRelayAuthError(res, err, traceId)) return;
        if (err instanceof DistributionRulePlanRequiredError) {
          return res.status(402).json({
            error: "plan_required",
            required_plan: err.required_plan,
            message: err.message
          });
        }
        if (err instanceof DistributionRuleNotFoundError) {
          return res.status(404).json(errorEnvelope("NOT_FOUND", err.message, traceId));
        }
        return res.status(500).json(errorEnvelope("INTERNAL", (err as Error).message, traceId));
      }
    }
  );

  app.get(
    "/api/v1/creator/autopost/distribution-rules/:rule_id/runs",
    async (req: Request, res: Response) => {
      const traceId = traceIdFrom(req);
      if (!config.prisma) {
        return res.status(503).json(
          errorEnvelope("SERVICE_UNAVAILABLE", "Database not configured.", traceId)
        );
      }
      const ruleId = String(req.params.rule_id ?? "").trim();
      try {
        const { context } = await requireAccountWithRole(
          req,
          { prisma: config.prisma, identityService },
          "creator"
        );
        const relayCreatorId = context.primaryRelayCreatorId?.trim();
        if (!relayCreatorId) {
          return res.status(404).json(
            errorEnvelope(
              "NOT_FOUND",
              "No creator studio — call POST /api/v1/creator/workspace first.",
              traceId
            )
          );
        }
        const runs = await listDistributionRuleRuns(config.prisma, relayCreatorId, ruleId);
        res.setHeader("Cache-Control", "private, no-store");
        return res.status(200).json(successEnvelope({ runs }, traceId));
      } catch (err) {
        if (sendRelayAuthError(res, err, traceId)) return;
        if (err instanceof DistributionRulePlanRequiredError) {
          return res.status(402).json({
            error: "plan_required",
            required_plan: err.required_plan,
            message: err.message
          });
        }
        if (err instanceof DistributionRuleNotFoundError) {
          return res.status(404).json(errorEnvelope("NOT_FOUND", err.message, traceId));
        }
        return res.status(500).json(errorEnvelope("INTERNAL", (err as Error).message, traceId));
      }
    }
  );

  // —— Schedule Rail Automations (connector lifecycle; composition over series + rules) ——
  const sendAutomationError = (
    res: Response,
    err: unknown,
    traceId: string
  ): boolean => {
    if (!(err instanceof AutomationServiceError)) return false;
    if (err.code === "AUTOMATION_PLAN_REQUIRED") {
      res.status(402).json({
        error: "plan_required",
        required_plan: "autopost",
        message: err.message,
        code: err.code
      });
      return true;
    }
    res
      .status(err.statusCode)
      .json(errorEnvelope(err.code, err.message, traceId, err.details));
    return true;
  };

  app.get("/api/v1/creator/autopost/automations", async (req: Request, res: Response) => {
    const traceId = traceIdFrom(req);
    if (!config.prisma) {
      return res.status(503).json(
        errorEnvelope("SERVICE_UNAVAILABLE", "Database not configured.", traceId)
      );
    }
    try {
      const { context } = await requireAccountWithRole(
        req,
        { prisma: config.prisma, identityService },
        "creator"
      );
      const relayCreatorId = context.primaryRelayCreatorId?.trim();
      if (!relayCreatorId) {
        return res.status(404).json(
          errorEnvelope(
            "NOT_FOUND",
            "No creator studio — call POST /api/v1/creator/workspace first.",
            traceId
          )
        );
      }
      const automations = await listAutomations(config.prisma, relayCreatorId);
      res.setHeader("Cache-Control", "private, no-store");
      return res.status(200).json(successEnvelope({ automations }, traceId));
    } catch (err) {
      if (sendRelayAuthError(res, err, traceId)) return;
      if (sendAutomationError(res, err, traceId)) return;
      return res.status(500).json(errorEnvelope("INTERNAL", (err as Error).message, traceId));
    }
  });

  app.post("/api/v1/creator/autopost/automations", async (req: Request, res: Response) => {
    const traceId = traceIdFrom(req);
    if (!config.prisma) {
      return res.status(503).json(
        errorEnvelope("SERVICE_UNAVAILABLE", "Database not configured.", traceId)
      );
    }
    try {
      const { context } = await requireAccountWithRole(
        req,
        { prisma: config.prisma, identityService },
        "creator"
      );
      const relayCreatorId = context.primaryRelayCreatorId?.trim();
      if (!relayCreatorId) {
        return res.status(404).json(
          errorEnvelope(
            "NOT_FOUND",
            "No creator studio — call POST /api/v1/creator/workspace first.",
            traceId
          )
        );
      }
      if (
        !(await assertCreatorRelayMutationAllowed(
          req,
          res,
          traceId,
          config.prisma,
          relayCreatorId
        ))
      ) {
        return;
      }
      const result = await createAutomation(config.prisma, relayCreatorId, req.body ?? {});
      res.setHeader("Cache-Control", "private, no-store");
      return res.status(result.receipt.created ? 201 : 200).json(
        successEnvelope(
          { automation: result.automation, receipt: result.receipt },
          traceId
        )
      );
    } catch (err) {
      if (sendRelayAuthError(res, err, traceId)) return;
      if (sendAutomationError(res, err, traceId)) return;
      return res.status(500).json(errorEnvelope("INTERNAL", (err as Error).message, traceId));
    }
  });

  app.get(
    "/api/v1/creator/autopost/automations/:automation_id",
    async (req: Request, res: Response) => {
      const traceId = traceIdFrom(req);
      if (!config.prisma) {
        return res.status(503).json(
          errorEnvelope("SERVICE_UNAVAILABLE", "Database not configured.", traceId)
        );
      }
      const automationId = String(req.params.automation_id ?? "").trim();
      try {
        const { context } = await requireAccountWithRole(
          req,
          { prisma: config.prisma, identityService },
          "creator"
        );
        const relayCreatorId = context.primaryRelayCreatorId?.trim();
        if (!relayCreatorId) {
          return res.status(404).json(
            errorEnvelope(
              "NOT_FOUND",
              "No creator studio — call POST /api/v1/creator/workspace first.",
              traceId
            )
          );
        }
        const automation = await getAutomation(config.prisma, relayCreatorId, automationId);
        res.setHeader("Cache-Control", "private, no-store");
        return res.status(200).json(successEnvelope({ automation }, traceId));
      } catch (err) {
        if (sendRelayAuthError(res, err, traceId)) return;
        if (sendAutomationError(res, err, traceId)) return;
        return res.status(500).json(errorEnvelope("INTERNAL", (err as Error).message, traceId));
      }
    }
  );

  app.patch(
    "/api/v1/creator/autopost/automations/:automation_id",
    async (req: Request, res: Response) => {
      const traceId = traceIdFrom(req);
      if (!config.prisma) {
        return res.status(503).json(
          errorEnvelope("SERVICE_UNAVAILABLE", "Database not configured.", traceId)
        );
      }
      const automationId = String(req.params.automation_id ?? "").trim();
      try {
        const { context } = await requireAccountWithRole(
          req,
          { prisma: config.prisma, identityService },
          "creator"
        );
        const relayCreatorId = context.primaryRelayCreatorId?.trim();
        if (!relayCreatorId) {
          return res.status(404).json(
            errorEnvelope(
              "NOT_FOUND",
              "No creator studio — call POST /api/v1/creator/workspace first.",
              traceId
            )
          );
        }
        if (
          !(await assertCreatorRelayMutationAllowed(
            req,
            res,
            traceId,
            config.prisma,
            relayCreatorId
          ))
        ) {
          return;
        }
        const result = await patchAutomation(
          config.prisma,
          relayCreatorId,
          automationId,
          req.body ?? {}
        );
        res.setHeader("Cache-Control", "private, no-store");
        return res.status(200).json(
          successEnvelope(
            { automation: result.automation, receipt: result.receipt },
            traceId
          )
        );
      } catch (err) {
        if (sendRelayAuthError(res, err, traceId)) return;
        if (sendAutomationError(res, err, traceId)) return;
        return res.status(500).json(errorEnvelope("INTERNAL", (err as Error).message, traceId));
      }
    }
  );

  app.delete(
    "/api/v1/creator/autopost/automations/:automation_id",
    async (req: Request, res: Response) => {
      const traceId = traceIdFrom(req);
      if (!config.prisma) {
        return res.status(503).json(
          errorEnvelope("SERVICE_UNAVAILABLE", "Database not configured.", traceId)
        );
      }
      const automationId = String(req.params.automation_id ?? "").trim();
      try {
        const { context } = await requireAccountWithRole(
          req,
          { prisma: config.prisma, identityService },
          "creator"
        );
        const relayCreatorId = context.primaryRelayCreatorId?.trim();
        if (!relayCreatorId) {
          return res.status(404).json(
            errorEnvelope(
              "NOT_FOUND",
              "No creator studio — call POST /api/v1/creator/workspace first.",
              traceId
            )
          );
        }
        if (
          !(await assertCreatorRelayMutationAllowed(
            req,
            res,
            traceId,
            config.prisma,
            relayCreatorId
          ))
        ) {
          return;
        }
        // Archive semantics — retains runs/drafts/events/history.
        const result = await archiveAutomation(config.prisma, relayCreatorId, automationId);
        res.setHeader("Cache-Control", "private, no-store");
        return res.status(200).json(
          successEnvelope(
            { automation: result.automation, receipt: result.receipt, archived: true },
            traceId
          )
        );
      } catch (err) {
        if (sendRelayAuthError(res, err, traceId)) return;
        if (sendAutomationError(res, err, traceId)) return;
        return res.status(500).json(errorEnvelope("INTERNAL", (err as Error).message, traceId));
      }
    }
  );

  app.get(
    "/api/v1/creator/autopost/automations/:automation_id/runs",
    async (req: Request, res: Response) => {
      const traceId = traceIdFrom(req);
      if (!config.prisma) {
        return res.status(503).json(
          errorEnvelope("SERVICE_UNAVAILABLE", "Database not configured.", traceId)
        );
      }
      const automationId = String(req.params.automation_id ?? "").trim();
      try {
        const { context } = await requireAccountWithRole(
          req,
          { prisma: config.prisma, identityService },
          "creator"
        );
        const relayCreatorId = context.primaryRelayCreatorId?.trim();
        if (!relayCreatorId) {
          return res.status(404).json(
            errorEnvelope(
              "NOT_FOUND",
              "No creator studio — call POST /api/v1/creator/workspace first.",
              traceId
            )
          );
        }
        const runs = await listAutomationRuns(config.prisma, relayCreatorId, automationId);
        res.setHeader("Cache-Control", "private, no-store");
        return res.status(200).json(successEnvelope({ runs }, traceId));
      } catch (err) {
        if (sendRelayAuthError(res, err, traceId)) return;
        if (sendAutomationError(res, err, traceId)) return;
        return res.status(500).json(errorEnvelope("INTERNAL", (err as Error).message, traceId));
      }
    }
  );

  app.get(
    "/api/v1/creator/autopost/automations/:automation_id/runs/:run_id/approval-context",
    async (req: Request, res: Response) => {
      const traceId = traceIdFrom(req);
      if (!config.prisma) {
        return res.status(503).json(
          errorEnvelope("SERVICE_UNAVAILABLE", "Database not configured.", traceId)
        );
      }
      const automationId = String(req.params.automation_id ?? "").trim();
      const runId = String(req.params.run_id ?? "").trim();
      try {
        const { context } = await requireAccountWithRole(
          req,
          { prisma: config.prisma, identityService },
          "creator"
        );
        const relayCreatorId = context.primaryRelayCreatorId?.trim();
        if (!relayCreatorId) {
          return res.status(404).json(
            errorEnvelope(
              "NOT_FOUND",
              "No creator studio — call POST /api/v1/creator/workspace first.",
              traceId
            )
          );
        }
        const approval_context = await getAutomationApprovalContext(
          config.prisma,
          relayCreatorId,
          automationId,
          runId
        );
        res.setHeader("Cache-Control", "private, no-store");
        return res.status(200).json(successEnvelope({ approval_context }, traceId));
      } catch (err) {
        if (sendRelayAuthError(res, err, traceId)) return;
        if (sendAutomationError(res, err, traceId)) return;
        return res.status(500).json(errorEnvelope("INTERNAL", (err as Error).message, traceId));
      }
    }
  );

  app.post(
    "/api/v1/creator/autopost/automations/:automation_id/runs/:run_id/correlate-plan",
    async (req: Request, res: Response) => {
      const traceId = traceIdFrom(req);
      if (!config.prisma) {
        return res.status(503).json(
          errorEnvelope("SERVICE_UNAVAILABLE", "Database not configured.", traceId)
        );
      }
      const automationId = String(req.params.automation_id ?? "").trim();
      const runId = String(req.params.run_id ?? "").trim();
      const planId =
        typeof req.body?.plan_id === "string" ? req.body.plan_id.trim() : "";
      try {
        const { context } = await requireAccountWithRole(
          req,
          { prisma: config.prisma, identityService },
          "creator"
        );
        const relayCreatorId = context.primaryRelayCreatorId?.trim();
        if (!relayCreatorId) {
          return res.status(404).json(
            errorEnvelope(
              "NOT_FOUND",
              "No creator studio — call POST /api/v1/creator/workspace first.",
              traceId
            )
          );
        }
        if (
          !(await assertCreatorRelayMutationAllowed(
            req,
            res,
            traceId,
            config.prisma,
            relayCreatorId
          ))
        ) {
          return;
        }
        if (!planId) {
          return res
            .status(400)
            .json(errorEnvelope("BAD_REQUEST", "plan_id is required.", traceId));
        }
        const result = await correlateAutomationRunPlan(config.prisma, relayCreatorId, {
          automationId,
          runId,
          planId
        });
        res.setHeader("Cache-Control", "private, no-store");
        return res.status(200).json(successEnvelope(result, traceId));
      } catch (err) {
        if (sendRelayAuthError(res, err, traceId)) return;
        if (sendAutomationError(res, err, traceId)) return;
        return res.status(500).json(errorEnvelope("INTERNAL", (err as Error).message, traceId));
      }
    }
  );

  app.post(
    "/api/v1/creator/autopost/automations/:automation_id/runs/:run_id/complete",
    async (req: Request, res: Response) => {
      const traceId = traceIdFrom(req);
      if (!config.prisma) {
        return res.status(503).json(
          errorEnvelope("SERVICE_UNAVAILABLE", "Database not configured.", traceId)
        );
      }
      const automationId = String(req.params.automation_id ?? "").trim();
      const runId = String(req.params.run_id ?? "").trim();
      const attemptId =
        typeof req.body?.attempt_id === "string" ? req.body.attempt_id.trim() : null;
      try {
        const { context } = await requireAccountWithRole(
          req,
          { prisma: config.prisma, identityService },
          "creator"
        );
        const relayCreatorId = context.primaryRelayCreatorId?.trim();
        if (!relayCreatorId) {
          return res.status(404).json(
            errorEnvelope(
              "NOT_FOUND",
              "No creator studio — call POST /api/v1/creator/workspace first.",
              traceId
            )
          );
        }
        if (
          !(await assertCreatorRelayMutationAllowed(
            req,
            res,
            traceId,
            config.prisma,
            relayCreatorId
          ))
        ) {
          return;
        }
        const result = await completeAutomationRunFromHandoff(
          config.prisma,
          relayCreatorId,
          { automationId, runId, attemptId }
        );
        res.setHeader("Cache-Control", "private, no-store");
        return res.status(200).json(successEnvelope(result, traceId));
      } catch (err) {
        if (sendRelayAuthError(res, err, traceId)) return;
        if (sendAutomationError(res, err, traceId)) return;
        return res.status(500).json(errorEnvelope("INTERNAL", (err as Error).message, traceId));
      }
    }
  );

  app.post(
    "/api/v1/creator/autopost/automations/:automation_id/runs/:run_id/cancel",
    async (req: Request, res: Response) => {
      const traceId = traceIdFrom(req);
      if (!config.prisma) {
        return res.status(503).json(
          errorEnvelope("SERVICE_UNAVAILABLE", "Database not configured.", traceId)
        );
      }
      const automationId = String(req.params.automation_id ?? "").trim();
      const runId = String(req.params.run_id ?? "").trim();
      try {
        const { context } = await requireAccountWithRole(
          req,
          { prisma: config.prisma, identityService },
          "creator"
        );
        const relayCreatorId = context.primaryRelayCreatorId?.trim();
        if (!relayCreatorId) {
          return res.status(404).json(
            errorEnvelope(
              "NOT_FOUND",
              "No creator studio — call POST /api/v1/creator/workspace first.",
              traceId
            )
          );
        }
        if (
          !(await assertCreatorRelayMutationAllowed(
            req,
            res,
            traceId,
            config.prisma,
            relayCreatorId
          ))
        ) {
          return;
        }
        const result = await cancelAutomationRun(config.prisma, relayCreatorId, {
          automationId,
          runId
        });
        res.setHeader("Cache-Control", "private, no-store");
        return res.status(200).json(successEnvelope(result, traceId));
      } catch (err) {
        if (sendRelayAuthError(res, err, traceId)) return;
        if (sendAutomationError(res, err, traceId)) return;
        return res.status(500).json(errorEnvelope("INTERNAL", (err as Error).message, traceId));
      }
    }
  );

  // —— Autopost social playbooks (follow-up templates after Make a Post) ——
  app.get(
    "/api/v1/creator/autopost/social-playbooks/templates",
    async (req: Request, res: Response) => {
      const traceId = traceIdFrom(req);
      if (!config.prisma) {
        return res.status(503).json(
          errorEnvelope("SERVICE_UNAVAILABLE", "Database not configured.", traceId)
        );
      }
      try {
        const { context } = await requireAccountWithRole(
          req,
          { prisma: config.prisma, identityService },
          "creator"
        );
        const relayCreatorId = context.primaryRelayCreatorId?.trim();
        if (!relayCreatorId) {
          return res.status(404).json(
            errorEnvelope(
              "NOT_FOUND",
              "No creator studio — call POST /api/v1/creator/workspace first.",
              traceId
            )
          );
        }
        // Templates are readable for preview; apply remains Autopost-gated.
        const templates = listSocialPlaybookTemplates();
        res.setHeader("Cache-Control", "private, no-store");
        return res.status(200).json(successEnvelope({ templates }, traceId));
      } catch (err) {
        if (sendRelayAuthError(res, err, traceId)) return;
        return res.status(500).json(errorEnvelope("INTERNAL", (err as Error).message, traceId));
      }
    }
  );

  app.post("/api/v1/creator/autopost/social-playbooks/runs", async (req: Request, res: Response) => {
    const traceId = traceIdFrom(req);
    if (!config.prisma) {
      return res.status(503).json(
        errorEnvelope("SERVICE_UNAVAILABLE", "Database not configured.", traceId)
      );
    }
    const body = (req.body ?? {}) as Record<string, unknown>;
    try {
      const { context } = await requireAccountWithRole(
        req,
        { prisma: config.prisma, identityService },
        "creator"
      );
      const relayCreatorId = context.primaryRelayCreatorId?.trim();
      if (!relayCreatorId) {
        return res.status(404).json(
          errorEnvelope(
            "NOT_FOUND",
            "No creator studio — call POST /api/v1/creator/workspace first.",
            traceId
          )
        );
      }
      if (
        !(await assertCreatorRelayMutationAllowed(
          req,
          res,
          traceId,
          config.prisma,
          relayCreatorId
        ))
      ) {
        return;
      }

      const templateKey = String(body.template_key ?? "").trim();
      if (!isSocialPlaybookTemplateKey(templateKey)) {
        return res
          .status(400)
          .json(errorEnvelope("VALIDATION_ERROR", "Unknown playbook template_key.", traceId));
      }

      const applyBody: ApplySocialPlaybookBody = {
        template_key: templateKey,
        anchor_due_at: String(body.anchor_due_at ?? ""),
        anchor_post_id: String(body.anchor_post_id ?? ""),
        anchor_task_id:
          body.anchor_task_id == null ? null : String(body.anchor_task_id),
        destination: String(body.destination ?? "").trim().toLowerCase() as ApplySocialPlaybookBody["destination"],
        destinations: Array.isArray(body.destinations)
          ? (body.destinations as string[]).map((d) =>
              String(d).trim().toLowerCase()
            ) as ApplySocialPlaybookBody["destinations"]
          : undefined,
        remind_me: body.remind_me !== false,
        step_overrides: Array.isArray(body.step_overrides)
          ? (body.step_overrides as ApplySocialPlaybookBody["step_overrides"])
          : undefined
      };

      const run = await applySocialPlaybook(config.prisma, relayCreatorId, applyBody);
      res.setHeader("Cache-Control", "private, no-store");
      return res.status(201).json(successEnvelope({ run }, traceId));
    } catch (err) {
      if (sendRelayAuthError(res, err, traceId)) return;
      if (err instanceof SocialPlaybookPlanRequiredError) {
        return res.status(402).json({
          error: "plan_required",
          required_plan: err.required_plan,
          message: err.message
        });
      }
      if (err instanceof SocialPlaybookFeatureDisabledError) {
        return res.status(404).json(errorEnvelope("NOT_FOUND", err.message, traceId));
      }
      if (err instanceof SocialPlaybookValidationError) {
        return res.status(400).json(errorEnvelope("VALIDATION_ERROR", err.message, traceId));
      }
      return res.status(500).json(errorEnvelope("INTERNAL", (err as Error).message, traceId));
    }
  });

  app.get("/api/v1/creator/connected-platforms", async (req: Request, res: Response) => {
    const traceId = traceIdFrom(req);
    if (!config.prisma) {
      return res.status(503).json(
        errorEnvelope("SERVICE_UNAVAILABLE", "Database not configured.", traceId)
      );
    }
    try {
      const { context } = await requireAccountWithRole(
        req,
        { prisma: config.prisma, identityService },
        "creator"
      );
      const relayCreatorId = context.primaryRelayCreatorId?.trim();
      if (!relayCreatorId) {
        return res.status(404).json(
          errorEnvelope(
            "NOT_FOUND",
            "No creator studio — call POST /api/v1/creator/workspace first.",
            traceId
          )
        );
      }
      const platforms = await listConnectedPlatforms(config.prisma, relayCreatorId);
      res.setHeader("Cache-Control", "private, no-store");
      return res.status(200).json(successEnvelope({ platforms }, traceId));
    } catch (err) {
      if (sendRelayAuthError(res, err, traceId)) return;
      return res.status(500).json(errorEnvelope("INTERNAL", (err as Error).message, traceId));
    }
  });

  /** Creator-facing read of their own feature gates (Posting Assistant, etc). */
  app.get("/api/v1/creator/feature-flags", async (req: Request, res: Response) => {
    const traceId = traceIdFrom(req);
    if (!config.prisma) {
      return res.status(503).json(
        errorEnvelope("SERVICE_UNAVAILABLE", "Database not configured.", traceId)
      );
    }
    try {
      const { context } = await requireAccountWithRole(
        req,
        { prisma: config.prisma, identityService },
        "creator"
      );
      const relayCreatorId = context.primaryRelayCreatorId?.trim();
      if (!relayCreatorId) {
        return res.status(404).json(errorEnvelope("NOT_FOUND", "No creator studio.", traceId));
      }
      const flags = await getCreatorFeatureFlags(config.prisma, relayCreatorId);
      const posting_assistant_allowed = await isPostingAssistantAllowedForCreator(
        config.prisma,
        relayCreatorId
      );
      res.setHeader("Cache-Control", "private, no-store");
      return res.status(200).json(
        successEnvelope({ flags: { ...flags, posting_assistant_allowed } }, traceId)
      );
    } catch (err) {
      if (sendRelayAuthError(res, err, traceId)) return;
      return res.status(500).json(errorEnvelope("INTERNAL", (err as Error).message, traceId));
    }
  });

  /** MB-15A — unified creator plan/capability presentation (Postgres only). */
  app.get("/api/v1/creator/plan-access", async (req: Request, res: Response) => {
    const traceId = traceIdFrom(req);
    if (!config.prisma) {
      return res.status(503).json(
        errorEnvelope("SERVICE_UNAVAILABLE", "Database not configured.", traceId)
      );
    }
    try {
      const { context } = await requireAccountWithRole(
        req,
        { prisma: config.prisma, identityService },
        "creator"
      );
      const relayCreatorId = context.primaryRelayCreatorId?.trim();
      if (!relayCreatorId) {
        return res.status(404).json(errorEnvelope("NOT_FOUND", "No creator studio.", traceId));
      }
      const wire = await getCreatorPlanAccessWire(config.prisma, {
        creatorId: relayCreatorId,
        accountId: context.accountId
      });
      res.setHeader("Cache-Control", "private, no-store");
      return res.status(200).json(successEnvelope(wire, traceId));
    } catch (err) {
      if (sendRelayAuthError(res, err, traceId)) return;
      return res.status(500).json(errorEnvelope("INTERNAL", (err as Error).message, traceId));
    }
  });

  /** Insights Action Hub — durable studio brief (goals / notes / locale / trend). */
  app.get("/api/v1/creator/studio-brief", async (req: Request, res: Response) => {
    const traceId = traceIdFrom(req);
    if (!config.prisma) {
      return res.status(503).json(
        errorEnvelope("SERVICE_UNAVAILABLE", "Database not configured.", traceId)
      );
    }
    try {
      const { context } = await requireAccountWithRole(
        req,
        { prisma: config.prisma, identityService },
        "creator"
      );
      const relayCreatorId = context.primaryRelayCreatorId?.trim();
      if (!relayCreatorId) {
        return res.status(404).json(errorEnvelope("NOT_FOUND", "No creator studio.", traceId));
      }
      const brief = await getCreatorStudioBrief(config.prisma, relayCreatorId);
      res.setHeader("Cache-Control", "private, no-store");
      return res.status(200).json(successEnvelope({ brief }, traceId));
    } catch (err) {
      if (sendRelayAuthError(res, err, traceId)) return;
      if (err instanceof StudioBriefValidationError) {
        return res.status(err.statusCode).json(errorEnvelope(err.code, err.message, traceId));
      }
      return res.status(500).json(errorEnvelope("INTERNAL", (err as Error).message, traceId));
    }
  });

  app.patch("/api/v1/creator/studio-brief", async (req: Request, res: Response) => {
    const traceId = traceIdFrom(req);
    if (!config.prisma) {
      return res.status(503).json(
        errorEnvelope("SERVICE_UNAVAILABLE", "Database not configured.", traceId)
      );
    }
    try {
      const { context } = await requireAccountWithRole(
        req,
        { prisma: config.prisma, identityService },
        "creator"
      );
      const relayCreatorId = context.primaryRelayCreatorId?.trim();
      if (!relayCreatorId) {
        return res.status(404).json(errorEnvelope("NOT_FOUND", "No creator studio.", traceId));
      }
      const body = (req.body ?? {}) as Record<string, unknown>;
      const brief = await patchCreatorStudioBrief(config.prisma, relayCreatorId, {
        goals: body.goals,
        user_notes: body.user_notes,
        locale: body.locale,
        trend_note: body.trend_note
      });
      res.setHeader("Cache-Control", "private, no-store");
      return res.status(200).json(successEnvelope({ brief }, traceId));
    } catch (err) {
      if (sendRelayAuthError(res, err, traceId)) return;
      if (err instanceof StudioBriefValidationError) {
        return res.status(err.statusCode).json(errorEnvelope(err.code, err.message, traceId));
      }
      return res.status(500).json(errorEnvelope("INTERNAL", (err as Error).message, traceId));
    }
  });

  /**
   * Ops-only: flip a creator's manual feature flags. Better surfaces also unlock via
   * `POST /api/v1/ops/creator-plan-grant` (MB-3). Guarded by `RELAY_OPS_FEATURE_FLAG_SECRET`.
   */
  app.patch(
    "/api/v1/ops/creator-feature-flags/:creator_id",
    async (req: Request, res: Response) => {
      const traceId = traceIdFrom(req);
      const expected = process.env.RELAY_OPS_FEATURE_FLAG_SECRET?.trim();
      const provided = req.header("x-relay-ops-feature-flag-secret")?.trim();
      if (!expected || provided !== expected) {
        return res.status(404).json(
          errorEnvelope(
            "NOT_FOUND",
            "Ops feature-flag API disabled (set RELAY_OPS_FEATURE_FLAG_SECRET and send X-Relay-Ops-Feature-Flag-Secret).",
            traceId
          )
        );
      }
      if (!config.prisma) {
        return res.status(503).json(
          errorEnvelope("SERVICE_UNAVAILABLE", "Database not configured.", traceId)
        );
      }
      const creatorId = String(req.params.creator_id ?? "").trim();
      const body = (req.body ?? {}) as Record<string, unknown>;
      if (!creatorId || typeof body.posting_assistant_enabled !== "boolean") {
        return res.status(400).json(
          errorEnvelope(
            "VALIDATION_ERROR",
            "creator_id (param) and posting_assistant_enabled (boolean body field) are required.",
            traceId
          )
        );
      }
      try {
        const flags = await setCreatorPostingAssistantEnabled(
          config.prisma,
          creatorId,
          body.posting_assistant_enabled
        );
        return res.status(200).json(successEnvelope({ flags }, traceId));
      } catch (err) {
        return res.status(500).json(errorEnvelope("INTERNAL", (err as Error).message, traceId));
      }
    }
  );

  /**
   * Ops-only: grant a CreatorPlan entitlement (source operator_grant / pilot).
   * Same secret header as feature-flag ops. Audited via PlatformOperatorAccessAudit.
   */
  app.post("/api/v1/ops/creator-plan-grant", async (req: Request, res: Response) => {
    const traceId = traceIdFrom(req);
    const expected = process.env.RELAY_OPS_FEATURE_FLAG_SECRET?.trim();
    const provided = req.header("x-relay-ops-feature-flag-secret")?.trim();
    if (!expected || provided !== expected) {
      return res.status(404).json(
        errorEnvelope(
          "NOT_FOUND",
          "Ops plan-grant API disabled (set RELAY_OPS_FEATURE_FLAG_SECRET and send X-Relay-Ops-Feature-Flag-Secret).",
          traceId
        )
      );
    }
    if (!config.prisma) {
      return res.status(503).json(
        errorEnvelope("SERVICE_UNAVAILABLE", "Database not configured.", traceId)
      );
    }
    const body = (req.body ?? {}) as Record<string, unknown>;
    const creatorId =
      typeof body.creator_id === "string" ? body.creator_id.trim() : "";
    const planRaw = typeof body.plan === "string" ? body.plan.trim() : "";
    if (!creatorId || !isCreatorPlanId(planRaw)) {
      return res.status(400).json(
        errorEnvelope(
          "VALIDATION_ERROR",
          "Body requires creator_id and plan: studio_core | autopost | growth_engine.",
          traceId
        )
      );
    }
    let expiresAt: Date | null | undefined;
    if (body.expires_at === null) expiresAt = null;
    else if (typeof body.expires_at === "string" && body.expires_at.trim()) {
      const parsed = new Date(body.expires_at);
      if (Number.isNaN(parsed.getTime())) {
        return res.status(400).json(
          errorEnvelope("VALIDATION_ERROR", "expires_at must be an ISO datetime or null.", traceId)
        );
      }
      expiresAt = parsed;
    }
    try {
      const entitlement = await grantOperatorCreatorPlan(config.prisma, {
        creatorId,
        plan: planRaw as CreatorPlan,
        expiresAt,
        source: "operator_grant"
      });
      await config.prisma.platformOperatorAccessAudit.create({
        data: {
          action: "creator_plan_grant",
          outcome: "allowed",
          reason: `plan=${entitlement.plan};source=${entitlement.source}`,
          accountId: null,
          traceId,
          route: "/api/v1/ops/creator-plan-grant",
          method: "POST"
        }
      });
      return res.status(200).json(successEnvelope({ entitlement }, traceId));
    } catch (err) {
      return res.status(500).json(errorEnvelope("INTERNAL", (err as Error).message, traceId));
    }
  });

  /** Creator-owned description templates for Transformer Node / cross-post filler. */
  app.get("/api/v1/creator/post-templates", async (req: Request, res: Response) => {
    const traceId = traceIdFrom(req);
    if (!config.prisma) {
      return res.status(503).json(
        errorEnvelope("SERVICE_UNAVAILABLE", "Database not configured.", traceId)
      );
    }
    try {
      const { context } = await requireAccountWithRole(
        req,
        { prisma: config.prisma, identityService },
        "creator"
      );
      const relayCreatorId = context.primaryRelayCreatorId?.trim();
      if (!relayCreatorId) {
        return res.status(404).json(errorEnvelope("NOT_FOUND", "No creator studio.", traceId));
      }
      const templates = await listPostTemplates(config.prisma, relayCreatorId);
      res.setHeader("Cache-Control", "private, no-store");
      return res.status(200).json(successEnvelope({ templates }, traceId));
    } catch (err) {
      if (sendRelayAuthError(res, err, traceId)) return;
      return res.status(500).json(errorEnvelope("INTERNAL", (err as Error).message, traceId));
    }
  });

  app.post("/api/v1/creator/post-templates", async (req: Request, res: Response) => {
    const traceId = traceIdFrom(req);
    if (!config.prisma) {
      return res.status(503).json(
        errorEnvelope("SERVICE_UNAVAILABLE", "Database not configured.", traceId)
      );
    }
    const body = (req.body ?? {}) as Record<string, unknown>;
    try {
      const { context } = await requireAccountWithRole(
        req,
        { prisma: config.prisma, identityService },
        "creator"
      );
      const relayCreatorId = context.primaryRelayCreatorId?.trim();
      if (!relayCreatorId) {
        return res.status(404).json(errorEnvelope("NOT_FOUND", "No creator studio.", traceId));
      }
      const template = await createPostTemplate(config.prisma, relayCreatorId, {
        name: typeof body.name === "string" ? body.name : "",
        body: typeof body.body === "string" ? body.body : "",
        tags: Array.isArray(body.tags) ? (body.tags as string[]) : []
      });
      res.setHeader("Cache-Control", "private, no-store");
      return res.status(201).json(successEnvelope({ template }, traceId));
    } catch (err) {
      if (sendRelayAuthError(res, err, traceId)) return;
      if (err instanceof PostTemplateValidationError) {
        return res.status(400).json(
          errorEnvelope("VALIDATION_ERROR", err.message, traceId, err.details)
        );
      }
      return res.status(500).json(errorEnvelope("INTERNAL", (err as Error).message, traceId));
    }
  });

  app.patch("/api/v1/creator/post-templates/:template_id", async (req: Request, res: Response) => {
    const traceId = traceIdFrom(req);
    if (!config.prisma) {
      return res.status(503).json(
        errorEnvelope("SERVICE_UNAVAILABLE", "Database not configured.", traceId)
      );
    }
    const templateId = String(req.params.template_id ?? "").trim();
    const body = (req.body ?? {}) as Record<string, unknown>;
    if (!templateId) {
      return res.status(400).json(
        errorEnvelope("VALIDATION_ERROR", "template_id is required.", traceId)
      );
    }
    try {
      const { context } = await requireAccountWithRole(
        req,
        { prisma: config.prisma, identityService },
        "creator"
      );
      const relayCreatorId = context.primaryRelayCreatorId?.trim();
      if (!relayCreatorId) {
        return res.status(404).json(errorEnvelope("NOT_FOUND", "No creator studio.", traceId));
      }
      const template = await updatePostTemplate(config.prisma, relayCreatorId, templateId, {
        ...(typeof body.name === "string" ? { name: body.name } : {}),
        ...(typeof body.body === "string" ? { body: body.body } : {}),
        ...(body.tags !== undefined ? { tags: Array.isArray(body.tags) ? (body.tags as string[]) : [] } : {})
      });
      res.setHeader("Cache-Control", "private, no-store");
      return res.status(200).json(successEnvelope({ template }, traceId));
    } catch (err) {
      if (sendRelayAuthError(res, err, traceId)) return;
      if (err instanceof PostTemplateValidationError) {
        return res.status(400).json(
          errorEnvelope("VALIDATION_ERROR", err.message, traceId, err.details)
        );
      }
      if (err instanceof PostTemplateNotFoundError) {
        return res.status(404).json(errorEnvelope("NOT_FOUND", err.message, traceId));
      }
      return res.status(500).json(errorEnvelope("INTERNAL", (err as Error).message, traceId));
    }
  });

  app.delete("/api/v1/creator/post-templates/:template_id", async (req: Request, res: Response) => {
    const traceId = traceIdFrom(req);
    if (!config.prisma) {
      return res.status(503).json(
        errorEnvelope("SERVICE_UNAVAILABLE", "Database not configured.", traceId)
      );
    }
    const templateId = String(req.params.template_id ?? "").trim();
    if (!templateId) {
      return res.status(400).json(
        errorEnvelope("VALIDATION_ERROR", "template_id is required.", traceId)
      );
    }
    try {
      const { context } = await requireAccountWithRole(
        req,
        { prisma: config.prisma, identityService },
        "creator"
      );
      const relayCreatorId = context.primaryRelayCreatorId?.trim();
      if (!relayCreatorId) {
        return res.status(404).json(errorEnvelope("NOT_FOUND", "No creator studio.", traceId));
      }
      const deleted = await deletePostTemplate(config.prisma, relayCreatorId, templateId);
      res.setHeader("Cache-Control", "private, no-store");
      return res.status(200).json(successEnvelope(deleted, traceId));
    } catch (err) {
      if (sendRelayAuthError(res, err, traceId)) return;
      if (err instanceof PostTemplateNotFoundError) {
        return res.status(404).json(errorEnvelope("NOT_FOUND", err.message, traceId));
      }
      return res.status(500).json(errorEnvelope("INTERNAL", (err as Error).message, traceId));
    }
  });

  /** Creator-owned Previewizer overlay/settings templates (max 3). */
  app.get("/api/v1/creator/preview-templates", async (req: Request, res: Response) => {
    const traceId = traceIdFrom(req);
    if (!config.prisma) {
      return res.status(503).json(
        errorEnvelope("SERVICE_UNAVAILABLE", "Database not configured.", traceId)
      );
    }
    try {
      const { context } = await requireAccountWithRole(
        req,
        { prisma: config.prisma, identityService },
        "creator"
      );
      const relayCreatorId = context.primaryRelayCreatorId?.trim();
      if (!relayCreatorId) {
        return res.status(404).json(errorEnvelope("NOT_FOUND", "No creator studio.", traceId));
      }
      const templates = await listPreviewTemplates(config.prisma, relayCreatorId);
      res.setHeader("Cache-Control", "private, no-store");
      return res.status(200).json(successEnvelope({ templates }, traceId));
    } catch (err) {
      if (sendRelayAuthError(res, err, traceId)) return;
      return res.status(500).json(errorEnvelope("INTERNAL", (err as Error).message, traceId));
    }
  });

  app.post("/api/v1/creator/preview-templates", async (req: Request, res: Response) => {
    const traceId = traceIdFrom(req);
    if (!config.prisma) {
      return res.status(503).json(
        errorEnvelope("SERVICE_UNAVAILABLE", "Database not configured.", traceId)
      );
    }
    const body = (req.body ?? {}) as Record<string, unknown>;
    try {
      const { context } = await requireAccountWithRole(
        req,
        { prisma: config.prisma, identityService },
        "creator"
      );
      const relayCreatorId = context.primaryRelayCreatorId?.trim();
      if (!relayCreatorId) {
        return res.status(404).json(errorEnvelope("NOT_FOUND", "No creator studio.", traceId));
      }
      const replaceRaw = body.replace_template_id;
      const template = await createPreviewTemplate(config.prisma, relayCreatorId, {
        name: typeof body.name === "string" ? body.name : "",
        config: body.config,
        replaceTemplateId:
          typeof replaceRaw === "string" && replaceRaw.trim() ? replaceRaw.trim() : null
      });
      res.setHeader("Cache-Control", "private, no-store");
      return res.status(201).json(successEnvelope({ template }, traceId));
    } catch (err) {
      if (sendRelayAuthError(res, err, traceId)) return;
      if (err instanceof PreviewTemplateValidationError) {
        return res.status(400).json(
          errorEnvelope("VALIDATION_ERROR", err.message, traceId, err.details)
        );
      }
      if (err instanceof PreviewTemplateNotFoundError) {
        return res.status(404).json(errorEnvelope("NOT_FOUND", err.message, traceId));
      }
      return res.status(500).json(errorEnvelope("INTERNAL", (err as Error).message, traceId));
    }
  });

  app.patch("/api/v1/creator/preview-templates/:template_id", async (req: Request, res: Response) => {
    const traceId = traceIdFrom(req);
    if (!config.prisma) {
      return res.status(503).json(
        errorEnvelope("SERVICE_UNAVAILABLE", "Database not configured.", traceId)
      );
    }
    const templateId = String(req.params.template_id ?? "").trim();
    const body = (req.body ?? {}) as Record<string, unknown>;
    if (!templateId) {
      return res.status(400).json(
        errorEnvelope("VALIDATION_ERROR", "template_id is required.", traceId)
      );
    }
    try {
      const { context } = await requireAccountWithRole(
        req,
        { prisma: config.prisma, identityService },
        "creator"
      );
      const relayCreatorId = context.primaryRelayCreatorId?.trim();
      if (!relayCreatorId) {
        return res.status(404).json(errorEnvelope("NOT_FOUND", "No creator studio.", traceId));
      }
      const template = await updatePreviewTemplate(config.prisma, relayCreatorId, templateId, {
        ...(typeof body.name === "string" ? { name: body.name } : {}),
        ...(body.config !== undefined ? { config: body.config } : {})
      });
      res.setHeader("Cache-Control", "private, no-store");
      return res.status(200).json(successEnvelope({ template }, traceId));
    } catch (err) {
      if (sendRelayAuthError(res, err, traceId)) return;
      if (err instanceof PreviewTemplateValidationError) {
        return res.status(400).json(
          errorEnvelope("VALIDATION_ERROR", err.message, traceId, err.details)
        );
      }
      if (err instanceof PreviewTemplateNotFoundError) {
        return res.status(404).json(errorEnvelope("NOT_FOUND", err.message, traceId));
      }
      return res.status(500).json(errorEnvelope("INTERNAL", (err as Error).message, traceId));
    }
  });

  app.delete("/api/v1/creator/preview-templates/:template_id", async (req: Request, res: Response) => {
    const traceId = traceIdFrom(req);
    if (!config.prisma) {
      return res.status(503).json(
        errorEnvelope("SERVICE_UNAVAILABLE", "Database not configured.", traceId)
      );
    }
    const templateId = String(req.params.template_id ?? "").trim();
    if (!templateId) {
      return res.status(400).json(
        errorEnvelope("VALIDATION_ERROR", "template_id is required.", traceId)
      );
    }
    try {
      const { context } = await requireAccountWithRole(
        req,
        { prisma: config.prisma, identityService },
        "creator"
      );
      const relayCreatorId = context.primaryRelayCreatorId?.trim();
      if (!relayCreatorId) {
        return res.status(404).json(errorEnvelope("NOT_FOUND", "No creator studio.", traceId));
      }
      const deleted = await deletePreviewTemplate(config.prisma, relayCreatorId, templateId);
      res.setHeader("Cache-Control", "private, no-store");
      return res.status(200).json(successEnvelope(deleted, traceId));
    } catch (err) {
      if (sendRelayAuthError(res, err, traceId)) return;
      if (err instanceof PreviewTemplateNotFoundError) {
        return res.status(404).json(errorEnvelope("NOT_FOUND", err.message, traceId));
      }
      return res.status(500).json(errorEnvelope("INTERNAL", (err as Error).message, traceId));
    }
  });

  app.patch("/api/v1/creator/postbot-tasks/:task_id", async (req: Request, res: Response) => {
    const traceId = traceIdFrom(req);
    if (!config.prisma) {
      return res.status(503).json(
        errorEnvelope("SERVICE_UNAVAILABLE", "Database not configured.", traceId)
      );
    }
    const taskId = String(req.params.task_id ?? "").trim();
    const body = (req.body ?? {}) as Record<string, unknown>;
    const status = body.status === "done" || body.status === "dismissed" ? body.status : null;
    const hasRemindMe = body.remind_me !== undefined;
    if (!status && !hasRemindMe) {
      return res.status(400).json(
        errorEnvelope(
          "VALIDATION_ERROR",
          "status must be done or dismissed, or remind_me must be provided.",
          traceId
        )
      );
    }
    try {
      const { context } = await requireAccountWithRole(
        req,
        { prisma: config.prisma, identityService },
        "creator"
      );
      const relayCreatorId = context.primaryRelayCreatorId?.trim();
      if (!relayCreatorId) {
        return res.status(404).json(errorEnvelope("NOT_FOUND", "No creator studio.", traceId));
      }
      let task;
      if (hasRemindMe && !status) {
        task = await updatePostbotTaskRemindMe(
          config.prisma,
          relayCreatorId,
          taskId,
          Boolean(body.remind_me)
        );
      } else if (status) {
        if (status === "done") {
          const existing = await config.prisma.postbotTask.findFirst({
            where: { id: taskId, creatorId: relayCreatorId },
            select: { id: true, goalCycleCampaignKey: true }
          });
          if (existing?.goalCycleCampaignKey?.trim()) {
            try {
              await completeBoundedGoalCycleTask(config.prisma, {
                creatorId: relayCreatorId,
                taskId
              });
              const row = await config.prisma.postbotTask.findUniqueOrThrow({
                where: { id: existing.id }
              });
              task = mapPostbotTaskRow(row);
            } catch (boundedErr) {
              if (boundedErr instanceof GoalCycleContractError) {
                return res
                  .status(400)
                  .json(errorEnvelope(boundedErr.code, boundedErr.message, traceId));
              }
              throw boundedErr;
            }
          } else {
            task = await updatePostbotTaskStatus(
              config.prisma,
              relayCreatorId,
              taskId,
              status
            );
          }
        } else {
          task = await updatePostbotTaskStatus(config.prisma, relayCreatorId, taskId, status);
        }
        if (hasRemindMe) {
          task = await updatePostbotTaskRemindMe(
            config.prisma,
            relayCreatorId,
            taskId,
            Boolean(body.remind_me)
          );
        }
      }
      res.setHeader("Cache-Control", "private, no-store");
      return res.status(200).json(successEnvelope({ task }, traceId));
    } catch (err) {
      if (sendRelayAuthError(res, err, traceId)) return;
      if (err instanceof PostbotTaskValidationError) {
        return res.status(400).json(errorEnvelope("VALIDATION_ERROR", err.message, traceId));
      }
      if (err instanceof PostbotTaskNotFoundError) {
        return res.status(404).json(errorEnvelope("NOT_FOUND", err.message, traceId));
      }
      return res.status(500).json(errorEnvelope("INTERNAL", (err as Error).message, traceId));
    }
  });

  app.post("/api/v1/relay/posts/:post_id/coach/propose", async (req: Request, res: Response) => {
    const traceId = traceIdFrom(req);
    if (!config.prisma) {
      return res.status(503).json(
        errorEnvelope("SERVICE_UNAVAILABLE", "Database not configured.", traceId)
      );
    }
    const postId = String(req.params.post_id ?? "").trim();
    const body = (req.body ?? {}) as Record<string, unknown>;
    try {
      const { context } = await requireAccountWithRole(
        req,
        { prisma: config.prisma, identityService },
        "creator"
      );
      const relayCreatorId = context.primaryRelayCreatorId?.trim();
      if (!relayCreatorId) {
        return res.status(404).json(
          errorEnvelope("NOT_FOUND", "No creator studio.", traceId)
        );
      }
      if (!(await requireAccountMatchesCreator(req, res, traceId, relayCreatorId))) {
        return;
      }
      if (!(await isAutopostBetterAllowed(config.prisma, relayCreatorId))) {
        return res.status(402).json({
          error: "plan_required",
          required_plan: "autopost"
        });
      }
      const destinations = Array.isArray(body.destinations)
        ? body.destinations.map(String)
        : [];
      const assistantByDestination =
        body.assistant_by_destination &&
        typeof body.assistant_by_destination === "object" &&
        !Array.isArray(body.assistant_by_destination)
          ? (body.assistant_by_destination as Record<string, boolean>)
          : undefined;
      const assistantContext =
        body.assistant_context &&
        typeof body.assistant_context === "object" &&
        !Array.isArray(body.assistant_context)
          ? (body.assistant_context as Record<string, unknown>)
          : undefined;

      await assertCoachProposeAllowed(config.prisma, relayCreatorId, postId);

      const proposal = await proposeCoachAttackPlans(config.prisma, relayCreatorId, postId, {
        destinations,
        assistant_by_destination: assistantByDestination,
        assistant_context: assistantContext as PostingAssistantContext | undefined
      });

      const coachDestinations =
        assistantByDestination != null
          ? Object.entries(assistantByDestination)
              .filter(([, enabled]) => Boolean(enabled))
              .map(([dest]) => dest)
          : destinations;

      const checkpoint = await saveCoachReviewCheckpoint(config.prisma, relayCreatorId, postId, {
        proposal,
        assistant_context: assistantContext as PostingAssistantContext | undefined,
        coach_destinations: coachDestinations,
        coach_phase: "findings",
        platform_review_index: 0
      });

      res.setHeader("Cache-Control", "private, no-store");
      return res.status(200).json(
        successEnvelope({ proposal, plan_id: checkpoint.plan_id }, traceId)
      );
    } catch (err) {
      if (sendRelayAuthError(res, err, traceId)) return;
      if (err instanceof PostDistributionValidationError) {
        return res.status(400).json(
          errorEnvelope("VALIDATION_ERROR", err.message, traceId, err.details)
        );
      }
      if (err instanceof PostDistributionNotFoundError) {
        return res.status(404).json(errorEnvelope("NOT_FOUND", err.message, traceId));
      }
      return res.status(500).json(errorEnvelope("INTERNAL", (err as Error).message, traceId));
    }
  });

  app.patch("/api/v1/relay/posts/:post_id/coach/progress", async (req: Request, res: Response) => {
    const traceId = traceIdFrom(req);
    if (!config.prisma) {
      return res.status(503).json(
        errorEnvelope("SERVICE_UNAVAILABLE", "Database not configured.", traceId)
      );
    }
    const postId = String(req.params.post_id ?? "").trim();
    const body = (req.body ?? {}) as Record<string, unknown>;
    try {
      const { context } = await requireAccountWithRole(
        req,
        { prisma: config.prisma, identityService },
        "creator"
      );
      const relayCreatorId = context.primaryRelayCreatorId?.trim();
      if (!relayCreatorId) {
        return res.status(404).json(errorEnvelope("NOT_FOUND", "No creator studio.", traceId));
      }
      if (!(await requireAccountMatchesCreator(req, res, traceId, relayCreatorId))) {
        return;
      }
      const coachPhase =
        typeof body.coach_phase === "string" ? body.coach_phase : undefined;
      const platformReviewIndex =
        typeof body.platform_review_index === "number"
          ? body.platform_review_index
          : typeof body.platform_review_index === "string" &&
              body.platform_review_index.trim() !== "" &&
              Number.isFinite(Number(body.platform_review_index))
            ? Number(body.platform_review_index)
            : undefined;
      const acceptedCopy =
        body.accepted_copy_by_destination &&
        typeof body.accepted_copy_by_destination === "object" &&
        !Array.isArray(body.accepted_copy_by_destination)
          ? (body.accepted_copy_by_destination as PostingAssistantContext["accepted_copy_by_destination"])
          : undefined;

      if (
        coachPhase !== undefined &&
        coachPhase !== "findings" &&
        coachPhase !== "platformReview" &&
        coachPhase !== "gathering"
      ) {
        return res.status(400).json(
          errorEnvelope("VALIDATION_ERROR", "Invalid coach_phase.", traceId, [
            { field: "coach_phase", issue: "invalid" }
          ])
        );
      }

      const plan = await patchCoachReviewProgress(config.prisma, relayCreatorId, postId, {
        coach_phase: coachPhase as "findings" | "platformReview" | "gathering" | undefined,
        platform_review_index: platformReviewIndex,
        accepted_copy_by_destination: acceptedCopy
      });
      res.setHeader("Cache-Control", "private, no-store");
      return res.status(200).json(successEnvelope({ plan }, traceId));
    } catch (err) {
      if (sendRelayAuthError(res, err, traceId)) return;
      if (err instanceof PostDistributionValidationError) {
        return res.status(400).json(
          errorEnvelope("VALIDATION_ERROR", err.message, traceId, err.details)
        );
      }
      return res.status(500).json(errorEnvelope("INTERNAL", (err as Error).message, traceId));
    }
  });

  app.delete(
    "/api/v1/relay/posts/:post_id/coach/checkpoint",
    async (req: Request, res: Response) => {
      const traceId = traceIdFrom(req);
      if (!config.prisma) {
        return res.status(503).json(
          errorEnvelope("SERVICE_UNAVAILABLE", "Database not configured.", traceId)
        );
      }
      const postId = String(req.params.post_id ?? "").trim();
      try {
        const { context } = await requireAccountWithRole(
          req,
          { prisma: config.prisma, identityService },
          "creator"
        );
        const relayCreatorId = context.primaryRelayCreatorId?.trim();
        if (!relayCreatorId) {
          return res.status(404).json(errorEnvelope("NOT_FOUND", "No creator studio.", traceId));
        }
        if (!(await requireAccountMatchesCreator(req, res, traceId, relayCreatorId))) {
          return;
        }
        const result = await clearCoachReviewCheckpoint(
          config.prisma,
          relayCreatorId,
          postId
        );
        res.setHeader("Cache-Control", "private, no-store");
        return res.status(200).json(successEnvelope(result, traceId));
      } catch (err) {
        if (sendRelayAuthError(res, err, traceId)) return;
        return res.status(500).json(errorEnvelope("INTERNAL", (err as Error).message, traceId));
      }
    }
  );

  app.post("/api/v1/relay/posts/:post_id/distribution-plan", async (req: Request, res: Response) => {
    const traceId = traceIdFrom(req);
    if (!config.prisma) {
      return res.status(503).json(
        errorEnvelope("SERVICE_UNAVAILABLE", "Database not configured.", traceId)
      );
    }
    const postId = String(req.params.post_id ?? "").trim();
    const body = (req.body ?? {}) as Record<string, unknown>;
    try {
      const { context } = await requireAccountWithRole(
        req,
        { prisma: config.prisma, identityService },
        "creator"
      );
      const relayCreatorId = context.primaryRelayCreatorId?.trim();
      if (!relayCreatorId) {
        return res.status(404).json(
          errorEnvelope("NOT_FOUND", "No creator studio.", traceId)
        );
      }
      if (!(await requireAccountMatchesCreator(req, res, traceId, relayCreatorId))) {
        return;
      }
      const destinations = Array.isArray(body.destinations)
        ? body.destinations.map(String)
        : [];
      const assistantByDestination =
        body.assistant_by_destination &&
        typeof body.assistant_by_destination === "object" &&
        !Array.isArray(body.assistant_by_destination)
          ? (body.assistant_by_destination as Record<string, boolean>)
          : undefined;
      const assistantContext =
        body.assistant_context &&
        typeof body.assistant_context === "object" &&
        !Array.isArray(body.assistant_context)
          ? (body.assistant_context as Record<string, unknown>)
          : undefined;
      const mediaRoutingByDestination =
        body.media_routing_by_destination &&
        typeof body.media_routing_by_destination === "object" &&
        !Array.isArray(body.media_routing_by_destination)
          ? (body.media_routing_by_destination as Record<string, string>)
          : undefined;
      const needsPreview =
        typeof body.needs_preview === "boolean" ? body.needs_preview : undefined;
      const previewMediaId =
        typeof body.preview_media_id === "string" ? body.preview_media_id : null;
      const plan = await createPostDistributionPlan(config.prisma, relayCreatorId, postId, {
        destinations,
        assistant_by_destination: assistantByDestination,
        assistant_context: assistantContext as {
          user_notes?: string | null;
          target_audience?: string | null;
          locale?: string | null;
          timezone?: string | null;
        },
        source_draft_id:
          typeof body.source_draft_id === "string" ? body.source_draft_id : null,
        needs_preview: needsPreview,
        media_routing_by_destination: mediaRoutingByDestination,
        preview_media_id: previewMediaId
      });
      res.setHeader("Cache-Control", "private, no-store");
      return res.status(201).json(successEnvelope({ plan }, traceId));
    } catch (err) {
      if (sendRelayAuthError(res, err, traceId)) return;
      if (err instanceof PostDistributionValidationError) {
        return res.status(400).json(
          errorEnvelope("VALIDATION_ERROR", err.message, traceId, err.details)
        );
      }
      if (err instanceof PostDistributionNotFoundError) {
        return res.status(404).json(errorEnvelope("NOT_FOUND", err.message, traceId));
      }
      return res.status(500).json(errorEnvelope("INTERNAL", (err as Error).message, traceId));
    }
  });

  app.get("/api/v1/relay/posts/:post_id/distribution-plan", async (req: Request, res: Response) => {
    const traceId = traceIdFrom(req);
    if (!config.prisma) {
      return res.status(503).json(
        errorEnvelope("SERVICE_UNAVAILABLE", "Database not configured.", traceId)
      );
    }
    const postId = String(req.params.post_id ?? "").trim();
    try {
      const { context } = await requireAccountWithRole(
        req,
        { prisma: config.prisma, identityService },
        "creator"
      );
      const relayCreatorId = context.primaryRelayCreatorId?.trim();
      if (!relayCreatorId) {
        return res.status(404).json(errorEnvelope("NOT_FOUND", "No creator studio.", traceId));
      }
      if (!(await requireAccountMatchesCreator(req, res, traceId, relayCreatorId))) {
        return;
      }
      const plan = await getPostDistributionPlan(config.prisma, relayCreatorId, postId);
      res.setHeader("Cache-Control", "private, no-store");
      return res.status(200).json(successEnvelope({ plan }, traceId));
    } catch (err) {
      if (sendRelayAuthError(res, err, traceId)) return;
      return res.status(500).json(errorEnvelope("INTERNAL", (err as Error).message, traceId));
    }
  });

  app.get("/api/v1/relay/posts/:post_id/distribution-summary", async (req: Request, res: Response) => {
    const traceId = traceIdFrom(req);
    if (!config.prisma) {
      return res.status(503).json(
        errorEnvelope("SERVICE_UNAVAILABLE", "Database not configured.", traceId)
      );
    }
    const postId = String(req.params.post_id ?? "").trim();
    try {
      const { context } = await requireAccountWithRole(
        req,
        { prisma: config.prisma, identityService },
        "creator"
      );
      const relayCreatorId = context.primaryRelayCreatorId?.trim();
      if (!relayCreatorId) {
        return res.status(404).json(errorEnvelope("NOT_FOUND", "No creator studio.", traceId));
      }
      if (!(await requireAccountMatchesCreator(req, res, traceId, relayCreatorId))) {
        return;
      }
      const summary = await getPostDistributionSummary(config.prisma, relayCreatorId, postId);
      res.setHeader("Cache-Control", "private, no-store");
      return res.status(200).json(successEnvelope({ summary }, traceId));
    } catch (err) {
      if (sendRelayAuthError(res, err, traceId)) return;
      return res.status(500).json(errorEnvelope("INTERNAL", (err as Error).message, traceId));
    }
  });

  app.get("/api/v1/relay/posts/:post_id/external-metrics", async (req: Request, res: Response) => {
    const traceId = traceIdFrom(req);
    if (!config.prisma) {
      return res.status(503).json(
        errorEnvelope("SERVICE_UNAVAILABLE", "Database not configured.", traceId)
      );
    }
    const postId = String(req.params.post_id ?? "").trim();
    try {
      const { context } = await requireAccountWithRole(
        req,
        { prisma: config.prisma, identityService },
        "creator"
      );
      const relayCreatorId = context.primaryRelayCreatorId?.trim();
      if (!relayCreatorId) {
        return res.status(404).json(errorEnvelope("NOT_FOUND", "No creator studio.", traceId));
      }
      if (!(await requireAccountMatchesCreator(req, res, traceId, relayCreatorId))) {
        return;
      }
      const metrics = await getPostExternalMetrics(config.prisma, relayCreatorId, postId);
      res.setHeader("Cache-Control", "private, no-store");
      return res.status(200).json(successEnvelope({ metrics }, traceId));
    } catch (err) {
      if (sendRelayAuthError(res, err, traceId)) return;
      return res.status(500).json(errorEnvelope("INTERNAL", (err as Error).message, traceId));
    }
  });

  app.patch("/api/v1/relay/distribution-variants/:variant_id", async (req: Request, res: Response) => {
    const traceId = traceIdFrom(req);
    if (!config.prisma) {
      return res.status(503).json(
        errorEnvelope("SERVICE_UNAVAILABLE", "Database not configured.", traceId)
      );
    }
    const variantId = String(req.params.variant_id ?? "").trim();
    const body = (req.body ?? {}) as Record<string, unknown>;
    try {
      const { context } = await requireAccountWithRole(
        req,
        { prisma: config.prisma, identityService },
        "creator"
      );
      const relayCreatorId = context.primaryRelayCreatorId?.trim();
      if (!relayCreatorId) {
        return res.status(404).json(errorEnvelope("NOT_FOUND", "No creator studio.", traceId));
      }
      const variant = await patchDistributionVariant(config.prisma, relayCreatorId, variantId, {
        title: body.title !== undefined ? (body.title as string | null) : undefined,
        body_text: body.body_text !== undefined ? (body.body_text as string | null) : undefined,
        post_text: body.post_text !== undefined ? (body.post_text as string | null) : undefined,
        tags: Array.isArray(body.tags) ? body.tags.map(String) : undefined,
        locale: body.locale !== undefined ? (body.locale as string | null) : undefined,
        scheduled_for:
          body.scheduled_for !== undefined ? (body.scheduled_for as string | null) : undefined,
        remind_me: typeof body.remind_me === "boolean" ? body.remind_me : undefined,
        platform_fields:
          body.platform_fields &&
          typeof body.platform_fields === "object" &&
          !Array.isArray(body.platform_fields)
            ? (body.platform_fields as Record<string, unknown>)
            : undefined
      });
      res.setHeader("Cache-Control", "private, no-store");
      return res.status(200).json(successEnvelope({ variant }, traceId));
    } catch (err) {
      if (sendRelayAuthError(res, err, traceId)) return;
      if (err instanceof PostDistributionValidationError) {
        return res.status(400).json(
          errorEnvelope("VALIDATION_ERROR", err.message, traceId, err.details)
        );
      }
      if (err instanceof PostDistributionNotFoundError) {
        return res.status(404).json(errorEnvelope("NOT_FOUND", err.message, traceId));
      }
      return res.status(500).json(errorEnvelope("INTERNAL", (err as Error).message, traceId));
    }
  });

  app.post(
    "/api/v1/relay/distribution-variants/:variant_id/approve",
    async (req: Request, res: Response) => {
      const traceId = traceIdFrom(req);
      if (!config.prisma) {
        return res.status(503).json(
          errorEnvelope("SERVICE_UNAVAILABLE", "Database not configured.", traceId)
        );
      }
      const variantId = String(req.params.variant_id ?? "").trim();
      try {
        const { context } = await requireAccountWithRole(
          req,
          { prisma: config.prisma, identityService },
          "creator"
        );
        const relayCreatorId = context.primaryRelayCreatorId?.trim();
        if (!relayCreatorId) {
          return res.status(404).json(errorEnvelope("NOT_FOUND", "No creator studio.", traceId));
        }
        const variant = await approveDistributionVariant(
          config.prisma,
          relayCreatorId,
          variantId
        );
        res.setHeader("Cache-Control", "private, no-store");
        return res.status(200).json(successEnvelope({ variant }, traceId));
      } catch (err) {
        if (sendRelayAuthError(res, err, traceId)) return;
        if (err instanceof PostDistributionNotFoundError) {
          return res.status(404).json(errorEnvelope("NOT_FOUND", err.message, traceId));
        }
        return res.status(500).json(errorEnvelope("INTERNAL", (err as Error).message, traceId));
      }
    }
  );

  app.post(
    "/api/v1/relay/distribution-variants/:variant_id/handoff",
    async (req: Request, res: Response) => {
      const traceId = traceIdFrom(req);
      if (!config.prisma) {
        return res.status(503).json(
          errorEnvelope("SERVICE_UNAVAILABLE", "Database not configured.", traceId)
        );
      }
      const variantId = String(req.params.variant_id ?? "").trim();
      const body = (req.body ?? {}) as Record<string, unknown>;
      try {
        const { context } = await requireAccountWithRole(
          req,
          { prisma: config.prisma, identityService },
          "creator"
        );
        const relayCreatorId = context.primaryRelayCreatorId?.trim();
        if (!relayCreatorId) {
          return res.status(404).json(errorEnvelope("NOT_FOUND", "No creator studio.", traceId));
        }
        const attempt = await startDistributionHandoff(config.prisma, relayCreatorId, variantId, {
          extension_installation_id:
            typeof body.extension_installation_id === "string"
              ? body.extension_installation_id
              : null,
          extension_tab_id:
            typeof body.extension_tab_id === "number" ? body.extension_tab_id : null
        });
        res.setHeader("Cache-Control", "private, no-store");
        return res.status(201).json(successEnvelope({ attempt }, traceId));
      } catch (err) {
        if (sendRelayAuthError(res, err, traceId)) return;
        if (err instanceof PostDistributionValidationError) {
          return res.status(400).json(
            errorEnvelope("VALIDATION_ERROR", err.message, traceId, err.details)
          );
        }
        if (err instanceof PostDistributionNotFoundError) {
          return res.status(404).json(errorEnvelope("NOT_FOUND", err.message, traceId));
        }
        return res.status(500).json(errorEnvelope("INTERNAL", (err as Error).message, traceId));
      }
    }
  );

  app.post(
    "/api/v1/relay/distribution-attempts/:attempt_id/fill-result",
    async (req: Request, res: Response) => {
      const traceId = traceIdFrom(req);
      if (!config.prisma) {
        return res.status(503).json(
          errorEnvelope("SERVICE_UNAVAILABLE", "Database not configured.", traceId)
        );
      }
      const attemptId = String(req.params.attempt_id ?? "").trim();
      const body = (req.body ?? {}) as Record<string, unknown>;
      const session = await requirePatronBearerSession(req, res, traceId);
      if (!session) return;
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
      const relayCreatorId = account?.primaryRelayCreatorId?.trim() ?? "";
      if (!relayCreatorId) {
        return res.status(403).json(errorEnvelope("FORBIDDEN", "No creator studio.", traceId));
      }
      const statusRaw = typeof body.status === "string" ? body.status.trim() : "";
      if (
        statusRaw !== "fill_succeeded" &&
        statusRaw !== "fill_partial" &&
        statusRaw !== "fill_failed"
      ) {
        return res.status(400).json(
          errorEnvelope("VALIDATION_ERROR", "status is invalid.", traceId)
        );
      }
      try {
        const attempt = await recordDistributionFillResult(
          config.prisma,
          relayCreatorId,
          attemptId,
          {
            status: statusRaw,
            fill_result:
              body.fill_result &&
              typeof body.fill_result === "object" &&
              !Array.isArray(body.fill_result)
                ? (body.fill_result as Record<string, unknown>)
                : {},
            extension_tab_id:
              typeof body.extension_tab_id === "number" ? body.extension_tab_id : null,
            error_code: typeof body.error_code === "string" ? body.error_code : null,
            error_detail: typeof body.error_detail === "string" ? body.error_detail : null
          }
        );
        res.setHeader("Cache-Control", "private, no-store");
        return res.status(200).json(successEnvelope({ attempt }, traceId));
      } catch (err) {
        if (sendRelayAuthError(res, err, traceId)) return;
        if (err instanceof PostDistributionNotFoundError) {
          return res.status(404).json(errorEnvelope("NOT_FOUND", err.message, traceId));
        }
        return res.status(500).json(errorEnvelope("INTERNAL", (err as Error).message, traceId));
      }
    }
  );

  app.post(
    "/api/v1/relay/distribution-attempts/:attempt_id/complete",
    async (req: Request, res: Response) => {
      const traceId = traceIdFrom(req);
      if (!config.prisma) {
        return res.status(503).json(
          errorEnvelope("SERVICE_UNAVAILABLE", "Database not configured.", traceId)
        );
      }
      const attemptId = String(req.params.attempt_id ?? "").trim();
      const body = (req.body ?? {}) as Record<string, unknown>;
      try {
        const session = await requirePatronBearerSession(req, res, traceId);
        let relayCreatorId: string | null = null;
        if (session) {
          const accountId = await getAccountIdForSession(config.prisma, session);
          if (accountId) {
            const account = await config.prisma.account.findUnique({
              where: { id: accountId },
              select: { primaryRelayCreatorId: true }
            });
            relayCreatorId = account?.primaryRelayCreatorId?.trim() ?? null;
          }
        }
        if (!relayCreatorId) {
          const { context } = await requireAccountWithRole(
            req,
            { prisma: config.prisma, identityService },
            "creator"
          );
          relayCreatorId = context.primaryRelayCreatorId?.trim() ?? null;
        }
        if (!relayCreatorId) {
          return res.status(404).json(errorEnvelope("NOT_FOUND", "No creator studio.", traceId));
        }
        const statusRaw =
          typeof body.status === "string" ? body.status.trim() : "posted";
        const attempt = await completeDistributionAttempt(
          config.prisma,
          relayCreatorId,
          attemptId,
          {
            external_url: typeof body.external_url === "string" ? body.external_url : null,
            external_id: typeof body.external_id === "string" ? body.external_id : null,
            status:
              statusRaw === "posted" || statusRaw === "abandoned" || statusRaw === "failed"
                ? statusRaw
                : "posted"
          }
        );
        res.setHeader("Cache-Control", "private, no-store");
        return res.status(200).json(successEnvelope({ attempt }, traceId));
      } catch (err) {
        if (sendRelayAuthError(res, err, traceId)) return;
        if (err instanceof PostDistributionNotFoundError) {
          return res.status(404).json(errorEnvelope("NOT_FOUND", err.message, traceId));
        }
        return res.status(500).json(errorEnvelope("INTERNAL", (err as Error).message, traceId));
      }
    }
  );

  app.post(
    "/api/v1/relay/distribution-attempts/:attempt_id/metrics",
    async (req: Request, res: Response) => {
      const traceId = traceIdFrom(req);
      if (!config.prisma) {
        return res.status(503).json(
          errorEnvelope("SERVICE_UNAVAILABLE", "Database not configured.", traceId)
        );
      }
      const attemptId = String(req.params.attempt_id ?? "").trim();
      const body = (req.body ?? {}) as Record<string, unknown>;
      const session = await requirePatronBearerSession(req, res, traceId);
      if (!session) return;
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
      const relayCreatorId = account?.primaryRelayCreatorId?.trim() ?? "";
      if (!relayCreatorId) {
        return res.status(403).json(errorEnvelope("FORBIDDEN", "No creator studio.", traceId));
      }
      const sourceRaw = typeof body.source === "string" ? body.source.trim() : "";
      const metricsRaw = Array.isArray(body.metrics) ? body.metrics : null;
      if (!sourceRaw || !metricsRaw) {
        return res.status(400).json(
          errorEnvelope("VALIDATION_ERROR", "source and metrics are required.", traceId)
        );
      }
      try {
        const snapshots = await recordExternalPostMetricSnapshots(
          config.prisma,
          relayCreatorId,
          attemptId,
          {
            source: sourceRaw as "extension_dom",
            metrics: metricsRaw.map((entry) => {
              const row =
                entry && typeof entry === "object" && !Array.isArray(entry)
                  ? (entry as Record<string, unknown>)
                  : {};
              return {
                metric_type:
                  typeof row.metric_type === "string"
                    ? row.metric_type
                    : typeof row.metricType === "string"
                      ? row.metricType
                      : "",
                value:
                  row.value === null || row.value === undefined
                    ? null
                    : typeof row.value === "number"
                      ? row.value
                      : undefined,
                raw:
                  row.raw &&
                  typeof row.raw === "object" &&
                  !Array.isArray(row.raw)
                    ? (row.raw as Record<string, unknown>)
                    : undefined
              };
            })
          }
        );
        const attempt = await getDistributionAttempt(config.prisma, relayCreatorId, attemptId);
        res.setHeader("Cache-Control", "private, no-store");
        return res.status(201).json(
          successEnvelope(
            {
              snapshots,
              attempt: attempt
                ? {
                    attempt_id: attempt.attempt_id,
                    post_id: attempt.post_id,
                    destination: attempt.destination,
                    external_url: attempt.external_url,
                    external_id: attempt.external_id,
                    status: attempt.status
                  }
                : null
            },
            traceId
          )
        );
      } catch (err) {
        if (sendRelayAuthError(res, err, traceId)) return;
        if (err instanceof ExternalPostMetricsValidationError) {
          return res.status(400).json(
            errorEnvelope("VALIDATION_ERROR", err.message, traceId, err.details)
          );
        }
        if (err instanceof PostDistributionNotFoundError) {
          return res.status(404).json(errorEnvelope("NOT_FOUND", err.message, traceId));
        }
        return res.status(500).json(errorEnvelope("INTERNAL", (err as Error).message, traceId));
      }
    }
  );

  app.get(
    "/api/v1/relay/distribution-attempts/:attempt_id",
    async (req: Request, res: Response) => {
      const traceId = traceIdFrom(req);
      if (!config.prisma) {
        return res.status(503).json(
          errorEnvelope("SERVICE_UNAVAILABLE", "Database not configured.", traceId)
        );
      }
      const attemptId = String(req.params.attempt_id ?? "").trim();
      try {
        const { context } = await requireAccountWithRole(
          req,
          { prisma: config.prisma, identityService },
          "creator"
        );
        const relayCreatorId = context.primaryRelayCreatorId?.trim();
        if (!relayCreatorId) {
          return res.status(404).json(errorEnvelope("NOT_FOUND", "No creator studio.", traceId));
        }
        const attempt = await getDistributionAttempt(
          config.prisma,
          relayCreatorId,
          attemptId
        );
        if (!attempt) {
          return res.status(404).json(errorEnvelope("NOT_FOUND", "Attempt not found.", traceId));
        }
        res.setHeader("Cache-Control", "private, no-store");
        return res.status(200).json(successEnvelope({ attempt }, traceId));
      } catch (err) {
        if (sendRelayAuthError(res, err, traceId)) return;
        return res.status(500).json(errorEnvelope("INTERNAL", (err as Error).message, traceId));
      }
    }
  );

  /**
   * Slice D — Creator promo slots (Step 5 review): ranked 1..5 picks of post/media targets.
   */
  app.get("/api/v1/creator/promo-slots", async (req: Request, res: Response) => {
    const traceId = traceIdFrom(req);
    if (!config.prisma) {
      return res.status(503).json(
        errorEnvelope("SERVICE_UNAVAILABLE", "Database not configured.", traceId)
      );
    }
    try {
      const { context } = await requireAccountWithRole(
        req,
        { prisma: config.prisma, identityService },
        "creator"
      );
      const relayCreatorId = context.primaryRelayCreatorId?.trim();
      if (!relayCreatorId) {
        return res.status(404).json(
          errorEnvelope(
            "NOT_FOUND",
            "No creator studio — call POST /api/v1/creator/workspace first.",
            traceId
          )
        );
      }
      const payload = await getCreatorPromoSlots(config.prisma, relayCreatorId);
      res.setHeader("Cache-Control", "private, no-store");
      return res.status(200).json(successEnvelope(payload, traceId));
    } catch (err) {
      if (sendRelayAuthError(res, err, traceId)) return;
      if (err instanceof CreatorPromoSlotValidationError) {
        return res.status(400).json(
          errorEnvelope("VALIDATION_ERROR", err.message, traceId, err.details)
        );
      }
      return res.status(500).json(errorEnvelope("INTERNAL", (err as Error).message, traceId));
    }
  });

  app.put("/api/v1/creator/promo-slots", async (req: Request, res: Response) => {
    const traceId = traceIdFrom(req);
    if (!config.prisma) {
      return res.status(503).json(
        errorEnvelope("SERVICE_UNAVAILABLE", "Database not configured.", traceId)
      );
    }
    const body = (req.body ?? {}) as Record<string, unknown>;
    if (!Array.isArray(body.slots)) {
      return res.status(400).json(
        errorEnvelope(
          "VALIDATION_ERROR",
          "Request body must include `slots` as an array.",
          traceId,
          [{ field: "slots", issue: "required_array" }]
        )
      );
    }
    try {
      const { context } = await requireAccountWithRole(
        req,
        { prisma: config.prisma, identityService },
        "creator"
      );
      const relayCreatorId = context.primaryRelayCreatorId?.trim();
      if (!relayCreatorId) {
        return res.status(404).json(
          errorEnvelope(
            "NOT_FOUND",
            "No creator studio — call POST /api/v1/creator/workspace first.",
            traceId
          )
        );
      }
      const slots = body.slots as CreatorPromoSlotPutRow[];
      const payload = await putCreatorPromoSlots(config.prisma, relayCreatorId, slots);
      res.setHeader("Cache-Control", "private, no-store");
      return res.status(200).json(successEnvelope(payload, traceId));
    } catch (err) {
      if (sendRelayAuthError(res, err, traceId)) return;
      if (err instanceof CreatorPromoSlotValidationError) {
        return res.status(400).json(
          errorEnvelope("VALIDATION_ERROR", err.message, traceId, err.details)
        );
      }
      if (err instanceof CreatorPromoSlotTargetNotFoundError) {
        return res.status(404).json(
          errorEnvelope("NOT_FOUND", err.message, traceId, err.details)
        );
      }
      return res.status(500).json(errorEnvelope("INTERNAL", (err as Error).message, traceId));
    }
  });

  /**
   * MB-7 — toggle Tips eligibility for one Promo Pool slot.
   */
  app.patch("/api/v1/creator/promo-slots/:id", async (req: Request, res: Response) => {
    const traceId = traceIdFrom(req);
    if (!config.prisma) {
      return res.status(503).json(
        errorEnvelope("SERVICE_UNAVAILABLE", "Database not configured.", traceId)
      );
    }
    const promoPieceId = String(req.params.id ?? "").trim();
    const body = (req.body ?? {}) as Record<string, unknown>;
    if (typeof body.tip_eligible !== "boolean") {
      return res.status(400).json(
        errorEnvelope(
          "VALIDATION_ERROR",
          "`tip_eligible` boolean is required.",
          traceId,
          [{ field: "tip_eligible", issue: "required_boolean" }]
        )
      );
    }
    try {
      const { context } = await requireAccountWithRole(
        req,
        { prisma: config.prisma, identityService },
        "creator"
      );
      const relayCreatorId = context.primaryRelayCreatorId?.trim();
      if (!relayCreatorId) {
        return res.status(404).json(
          errorEnvelope(
            "NOT_FOUND",
            "No creator studio — call POST /api/v1/creator/workspace first.",
            traceId
          )
        );
      }
      const slot = await patchCreatorPromoSlotTipEligible(
        config.prisma,
        relayCreatorId,
        promoPieceId,
        body.tip_eligible
      );
      res.setHeader("Cache-Control", "private, no-store");
      return res.status(200).json(successEnvelope({ slot }, traceId));
    } catch (err) {
      if (sendRelayAuthError(res, err, traceId)) return;
      if (err instanceof CreatorPromoSlotValidationError) {
        return res.status(400).json(
          errorEnvelope("VALIDATION_ERROR", err.message, traceId, err.details)
        );
      }
      if (err instanceof CreatorPromoSlotTargetNotFoundError) {
        return res.status(404).json(
          errorEnvelope("NOT_FOUND", err.message, traceId, err.details)
        );
      }
      return res.status(500).json(errorEnvelope("INTERNAL", (err as Error).message, traceId));
    }
  });

  /**
   * Creator-only Promo Hub summary: Promo Piece gates ↔ tier-default inheritance counts.
   */
  app.get("/api/v1/creator/promotion-hub-summary", async (req: Request, res: Response) => {
    const traceId = traceIdFrom(req);
    if (!config.prisma) {
      return res.status(503).json(
        errorEnvelope("SERVICE_UNAVAILABLE", "Database not configured.", traceId)
      );
    }
    try {
      const { context } = await requireAccountWithRole(
        req,
        { prisma: config.prisma, identityService },
        "creator"
      );
      const relayCreatorId = context.primaryRelayCreatorId?.trim();
      if (!relayCreatorId) {
        return res.status(404).json(
          errorEnvelope(
            "NOT_FOUND",
            "No creator studio — call POST /api/v1/creator/workspace first.",
            traceId
          )
        );
      }
      const payload = await loadPromotionHubSummary(config.prisma, relayCreatorId);
      res.setHeader("Cache-Control", "private, no-store");
      return res.status(200).json(successEnvelope(payload, traceId));
    } catch (err) {
      if (sendRelayAuthError(res, err, traceId)) return;
      return res.status(500).json(errorEnvelope("INTERNAL", (err as Error).message, traceId));
    }
  });

  /** PUX — repeatable creator onboarding walkthrough (dev-only; single seeded account). */
  app.post("/api/v1/pilot-ux/dev/onboarding-walkthrough/reset", async (req: Request, res: Response) => {
    const traceId = traceIdFrom(req);
    if (!isPilotUxDevWalkthroughApiEnabled()) {
      return res.status(404).json(errorEnvelope("NOT_FOUND", "Not found.", traceId));
    }
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
      const { relayCreatorId } = await assertPilotUxOnboardingWalkthroughAccount(
        config.prisma,
        accountId
      );
      await resetPilotUxOnboardingWalkthrough(config.prisma, relayCreatorId);
      return res.status(200).json(successEnvelope({ ok: true, relay_creator_id: relayCreatorId }, traceId));
    } catch (err) {
      if (err instanceof PilotUxWalkthroughForbiddenError) {
        return res.status(403).json(errorEnvelope("FORBIDDEN", err.message, traceId));
      }
      return res.status(500).json(errorEnvelope("INTERNAL", (err as Error).message, traceId));
    }
  });

  /** PUX — repeatable patron onboarding walkthrough reset (dev-only; single seeded account). */
  app.post("/api/v1/pilot-ux/dev/patron-onboarding/reset", async (req: Request, res: Response) => {
    const traceId = traceIdFrom(req);
    if (!isPilotUxDevWalkthroughApiEnabled()) {
      return res.status(404).json(errorEnvelope("NOT_FOUND", "Not found.", traceId));
    }
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
      const patronWalkthrough = await assertPilotUxPatronOnboardingWalkthroughAccount(
        config.prisma,
        accountId
      );
      await resetPilotUxPatronOnboardingWalkthrough(config.prisma, patronWalkthrough);
      return res.status(200).json(
        successEnvelope(
          {
            ok: true,
            tenant_membership_id: patronWalkthrough.platformMembershipId
          },
          traceId
        )
      );
    } catch (err) {
      if (err instanceof PilotUxWalkthroughForbiddenError) {
        return res.status(403).json(errorEnvelope("FORBIDDEN", err.message, traceId));
      }
      return res.status(500).json(errorEnvelope("INTERNAL", (err as Error).message, traceId));
    }
  });

  app.post(
    "/api/v1/pilot-ux/dev/onboarding-walkthrough/simulate-patreon-connect",
    async (req: Request, res: Response) => {
      const traceId = traceIdFrom(req);
      if (!isPilotUxDevWalkthroughApiEnabled()) {
        return res.status(404).json(errorEnvelope("NOT_FOUND", "Not found.", traceId));
      }
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
        const { relayCreatorId } = await assertPilotUxOnboardingWalkthroughAccount(
          config.prisma,
          accountId
        );
        await simulatePilotUxPatreonConnect(config.prisma, relayCreatorId);
        return res
          .status(200)
          .json(successEnvelope({ ok: true, relay_creator_id: relayCreatorId }, traceId));
      } catch (err) {
        if (err instanceof PilotUxWalkthroughForbiddenError) {
          return res.status(403).json(errorEnvelope("FORBIDDEN", err.message, traceId));
        }
        return res.status(500).json(errorEnvelope("INTERNAL", (err as Error).message, traceId));
      }
    }
  );

  app.post(
    "/api/v1/pilot-ux/dev/onboarding-walkthrough/simulate-media-import",
    async (req: Request, res: Response) => {
      const traceId = traceIdFrom(req);
      if (!isPilotUxDevWalkthroughApiEnabled()) {
        return res.status(404).json(errorEnvelope("NOT_FOUND", "Not found.", traceId));
      }
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
        const { relayCreatorId } = await assertPilotUxOnboardingWalkthroughAccount(
          config.prisma,
          accountId
        );
        const result = await simulatePilotUxMediaImport(
          config.prisma,
          exportIndex,
          relayCreatorId
        );
        return res.status(200).json(
          successEnvelope({ ok: true, relay_creator_id: relayCreatorId, ...result }, traceId)
        );
      } catch (err) {
        if (err instanceof PilotUxWalkthroughForbiddenError) {
          return res.status(403).json(errorEnvelope("FORBIDDEN", err.message, traceId));
        }
        return res.status(500).json(errorEnvelope("INTERNAL", (err as Error).message, traceId));
      }
    }
  );

  app.get("/api/v1/creator/profile", async (req: Request, res: Response) => {
    const traceId = traceIdFrom(req);
    if (!config.prisma) {
      return res.status(503).json(
        errorEnvelope("SERVICE_UNAVAILABLE", "Database not configured.", traceId)
      );
    }
    try {
      const { context } = await requireAccountWithRole(req, { prisma: config.prisma, identityService }, "creator");
      const profile = await getCreatorIdentity(config.prisma, context.accountId);
      if (!profile) {
        return res.status(404).json(
          errorEnvelope("NOT_FOUND", "No creator profile found.", traceId)
        );
      }
      if (profile.needs_setup) {
        await promoteSnapshotToProfile(config.prisma, creatorCampaignDisplayStore, context.primaryRelayCreatorId!);
        const refreshed = await getCreatorIdentity(config.prisma, context.accountId);
        if (refreshed) {
          res.setHeader("Cache-Control", "private, no-store");
          return res.status(200).json(successEnvelope(refreshed, traceId));
        }
      }
      res.setHeader("Cache-Control", "private, no-store");
      return res.status(200).json(successEnvelope(profile, traceId));
    } catch (err) {
      if (sendRelayAuthError(res, err, traceId)) return;
      return res.status(500).json(errorEnvelope("INTERNAL", (err as Error).message, traceId));
    }
  });

  app.get("/api/v1/creator/patron-tier-summary", async (req: Request, res: Response) => {
    const traceId = traceIdFrom(req);
    if (!config.prisma) {
      return res.status(503).json(
        errorEnvelope("SERVICE_UNAVAILABLE", "Database not configured.", traceId)
      );
    }
    try {
      const { context } = await requireAccountWithRole(req, { prisma: config.prisma, identityService }, "creator");
      const relayCreatorId = context.primaryRelayCreatorId?.trim();
      if (!relayCreatorId) {
        return res.status(404).json(
          errorEnvelope("NOT_FOUND", "No creator studio — call POST /api/v1/creator/workspace first.", traceId)
        );
      }

      if (
        relayCreatorId === PILOT_UX_ONBOARDING_RELAY_CREATOR_ID &&
        isPilotUxDevWalkthroughApiEnabled()
      ) {
        const walkthroughProfile = await config.prisma.creatorProfile.findFirst({
          where: { tenant: { relayCreatorId } },
          select: { patreonCampaignId: true }
        });
        if (walkthroughProfile?.patreonCampaignId?.trim()) {
          res.setHeader("Cache-Control", "private, no-store");
          return res.status(200).json(
            successEnvelope(pilotUxOnboardingWalkthroughPatronTierSummary(), traceId)
          );
        }
      }

      const tenant = await config.prisma.tenant.findUnique({
        where: { relayCreatorId },
        select: { id: true }
      });
      if (!tenant) {
        return res.status(404).json(errorEnvelope("NOT_FOUND", "Creator tenant missing.", traceId));
      }

      const [memberships, tiers] = await Promise.all([
        config.prisma.tenantMembership.findMany({
          where: { tenantId: tenant.id, role: "patron" },
          select: { tierIds: true }
        }),
        config.prisma.tier.findMany({
          where: { creatorId: relayCreatorId },
          select: { id: true, relayTierId: true, title: true, amountCents: true },
          orderBy: [{ amountCents: "asc" }, { title: "asc" }]
        })
      ]);

      const pseudoTierIds = new Set([RELAY_TIER_PUBLIC, RELAY_TIER_ALL_PATRONS]);
      const isRealPaidTier = (tier: { relayTierId: string; title: string; amountCents: number | null }) => {
        const title = tier.title.trim().toLowerCase();
        if (pseudoTierIds.has(tier.relayTierId)) return false;
        if (title === "public" || title === "free" || title === "all patrons") return false;
        return (tier.amountCents ?? 0) > 0;
      };
      const realPaidTierIds = new Set(
        tiers.filter(isRealPaidTier).flatMap((tier) => [tier.relayTierId, tier.id])
      );

      const countsByTierId = new Map<string, number>();
      let freeCount = 0;
      for (const membership of memberships) {
        const tierIds = membership.tierIds.filter((tierId) => realPaidTierIds.has(tierId.trim()));
        if (tierIds.length === 0) {
          freeCount += 1;
          continue;
        }
        for (const tierId of new Set(tierIds)) {
          countsByTierId.set(tierId, (countsByTierId.get(tierId) ?? 0) + 1);
        }
      }

      const tierRows = tiers
        .filter(isRealPaidTier)
        .map((tier) => ({
          tier_id: tier.relayTierId,
          title: tier.title,
          amount_cents: tier.amountCents,
          patron_count: countsByTierId.get(tier.relayTierId) ?? countsByTierId.get(tier.id) ?? 0
        }));

      res.setHeader("Cache-Control", "private, no-store");
      return res.status(200).json(
        successEnvelope(
          {
            total_patrons: memberships.length,
            free_patrons: freeCount,
            tiers: tierRows
          },
          traceId
        )
      );
    } catch (err) {
      if (sendRelayAuthError(res, err, traceId)) return;
      return res.status(500).json(errorEnvelope("INTERNAL", (err as Error).message, traceId));
    }
  });

  /**
   * P5a-ins-003 — Membership summary for the authenticated creator studio (ledger + live roster).
   */
  app.get("/api/v1/creator/analytics/membership-summary", async (req: Request, res: Response) => {
    const traceId = traceIdFrom(req);
    if (!config.prisma) {
      return res.status(503).json(
        errorEnvelope("SERVICE_UNAVAILABLE", "Database not configured.", traceId)
      );
    }
    try {
      const { context } = await requireAccountWithRole(
        req,
        { prisma: config.prisma, identityService },
        "creator"
      );
      const relayCreatorId = context.primaryRelayCreatorId?.trim();
      if (!relayCreatorId) {
        return res.status(404).json(
          errorEnvelope(
            "NOT_FOUND",
            "No creator studio — call POST /api/v1/creator/workspace first.",
            traceId
          )
        );
      }
      const rawDays =
        typeof req.query.days === "string" ? Number.parseInt(req.query.days, 10) : 30;
      const days = Math.min(Math.max(Number.isFinite(rawDays) ? rawDays : 30, 1), 366);

      const payload = await getCreatorMembershipKpis(config.prisma, relayCreatorId, days);
      if (!payload) {
        return res
          .status(404)
          .json(errorEnvelope("NOT_FOUND", "Creator tenant missing.", traceId));
      }

      res.setHeader("Cache-Control", "private, no-store");
      return res.status(200).json(
        successEnvelope(
          {
            ...payload,
            note:
              "Event counts reflect rows written when Patreon member sync runs. Upgrade/downgrade times follow the sync batch clock unless Patreon provides pledge start."
          },
          traceId
        )
      );
    } catch (err) {
      if (sendRelayAuthError(res, err, traceId)) return;
      return res.status(500).json(errorEnvelope("INTERNAL", (err as Error).message, traceId));
    }
  });

  /**
   * P5a-ins-004 — Cohort retention grid (join month × months since join → retained %).
   */
  app.get("/api/v1/creator/analytics/membership-cohorts", async (req: Request, res: Response) => {
    const traceId = traceIdFrom(req);
    if (!config.prisma) {
      return res.status(503).json(
        errorEnvelope("SERVICE_UNAVAILABLE", "Database not configured.", traceId)
      );
    }
    try {
      const { context } = await requireAccountWithRole(
        req,
        { prisma: config.prisma, identityService },
        "creator"
      );
      const relayCreatorId = context.primaryRelayCreatorId?.trim();
      if (!relayCreatorId) {
        return res.status(404).json(
          errorEnvelope(
            "NOT_FOUND",
            "No creator studio — call POST /api/v1/creator/workspace first.",
            traceId
          )
        );
      }
      const rawCohortCap =
        typeof req.query.cohort_months === "string"
          ? Number.parseInt(req.query.cohort_months, 10)
          : 12;
      const rawOffsetCap =
        typeof req.query.max_offset === "string"
          ? Number.parseInt(req.query.max_offset, 10)
          : 12;
      const cohortMonths = Math.min(
        Math.max(Number.isFinite(rawCohortCap) ? rawCohortCap : 12, 1),
        36
      );
      const maxOffset = Math.min(
        Math.max(Number.isFinite(rawOffsetCap) ? rawOffsetCap : 12, 1),
        24
      );

      const payload = await getCreatorMembershipCohortRetention(
        config.prisma,
        relayCreatorId,
        cohortMonths,
        maxOffset
      );
      if (!payload) {
        return res
          .status(404)
          .json(errorEnvelope("NOT_FOUND", "Creator tenant missing.", traceId));
      }

      res.setHeader("Cache-Control", "private, no-store");
      return res.status(200).json(successEnvelope(payload, traceId));
    } catch (err) {
      if (sendRelayAuthError(res, err, traceId)) return;
      return res.status(500).json(errorEnvelope("INTERNAL", (err as Error).message, traceId));
    }
  });

  /**
   * P5a-ins-005 — Per-tier median tenure (current stint) + churn proxy from membership ledger replay.
   */
  app.get("/api/v1/creator/analytics/tier-stickiness", async (req: Request, res: Response) => {
    const traceId = traceIdFrom(req);
    if (!config.prisma) {
      return res.status(503).json(
        errorEnvelope("SERVICE_UNAVAILABLE", "Database not configured.", traceId)
      );
    }
    try {
      const { context } = await requireAccountWithRole(
        req,
        { prisma: config.prisma, identityService },
        "creator"
      );
      const relayCreatorId = context.primaryRelayCreatorId?.trim();
      if (!relayCreatorId) {
        return res.status(404).json(
          errorEnvelope(
            "NOT_FOUND",
            "No creator studio — call POST /api/v1/creator/workspace first.",
            traceId
          )
        );
      }
      const rawDays =
        typeof req.query.days === "string" ? Number.parseInt(req.query.days, 10) : 30;
      const days = Math.min(Math.max(Number.isFinite(rawDays) ? rawDays : 30, 1), 366);

      const payload = await getCreatorTierStickiness(config.prisma, relayCreatorId, days);
      if (!payload) {
        return res
          .status(404)
          .json(errorEnvelope("NOT_FOUND", "Creator tenant missing.", traceId));
      }

      res.setHeader("Cache-Control", "private, no-store");
      return res.status(200).json(successEnvelope(payload, traceId));
    } catch (err) {
      if (sendRelayAuthError(res, err, traceId)) return;
      return res.status(500).json(errorEnvelope("INTERNAL", (err as Error).message, traceId));
    }
  });

  /**
   * P5a-ins-006 — Multipart CSV upload: Patreon Insights post metrics; idempotent on SHA-256 of file bytes.
   */
  app.post("/api/v1/creator/analytics/patreon-insights-csv", async (req: Request, res: Response) => {
    const traceId = traceIdFrom(req);
    if (!config.prisma) {
      return res.status(503).json(
        errorEnvelope("SERVICE_UNAVAILABLE", "Database not configured.", traceId)
      );
    }
    try {
      const { context } = await requireAccountWithRole(
        req,
        { prisma: config.prisma, identityService },
        "creator"
      );
      const relayCreatorId = context.primaryRelayCreatorId?.trim();
      if (!relayCreatorId) {
        return res.status(404).json(
          errorEnvelope(
            "NOT_FOUND",
            "No creator studio — call POST /api/v1/creator/workspace first.",
            traceId
          )
        );
      }

      const tenant = await config.prisma.tenant.findUnique({
        where: { relayCreatorId },
        select: { id: true }
      });
      if (!tenant) {
        return res
          .status(404)
          .json(errorEnvelope("NOT_FOUND", "Creator tenant missing.", traceId));
      }

      const multipart = await readPatreonInsightsMultipart(req);
      if (!multipart.ok) {
        if (multipart.code === "NOT_MULTIPART") {
          return res
            .status(415)
            .json(errorEnvelope("UNSUPPORTED_MEDIA_TYPE", multipart.message, traceId));
        }
        if (multipart.code === "FILE_TOO_LARGE") {
          return res
            .status(413)
            .json(errorEnvelope("PAYLOAD_TOO_LARGE", multipart.message, traceId));
        }
        return res
          .status(400)
          .json(errorEnvelope("VALIDATION_ERROR", multipart.message, traceId));
      }

      let asOf: Date | null = null;
      if (typeof req.query.as_of === "string" && req.query.as_of.trim()) {
        const d = new Date(req.query.as_of.trim());
        if (!Number.isFinite(d.getTime())) {
          return res
            .status(400)
            .json(errorEnvelope("VALIDATION_ERROR", "Invalid as_of — use an ISO-8601 date/time.", traceId));
        }
        asOf = d;
      }

      const result = await ingestPatreonInsightsCsv(
        config.prisma,
        relayCreatorId,
        multipart.buffer,
        { label: multipart.label ?? null, asOf }
      );

      if (!result.ok) {
        return res.status(400).json(
          errorEnvelope(
            "VALIDATION_ERROR",
            result.errors.join(" "),
            traceId,
            result.errors.map((e) => ({ field: "csv", issue: e }))
          )
        );
      }

      res.setHeader("Cache-Control", "private, no-store");
      return res.status(200).json(
        successEnvelope(
          {
            import_id: result.import_id,
            file_hash: result.file_hash,
            rows_written: result.rows_written,
            already_imported: result.already_imported,
            filename: multipart.filename ?? null
          },
          traceId
        )
      );
    } catch (err) {
      if (sendRelayAuthError(res, err, traceId)) return;
      return res.status(500).json(errorEnvelope("INTERNAL", (err as Error).message, traceId));
    }
  });

  /**
   * P5a-ins-007 — Post performance: Patreon Insights metrics joined to Relay `Post` + version metadata; reports linkage gaps.
   */
  app.get("/api/v1/creator/analytics/post-performance", async (req: Request, res: Response) => {
    const traceId = traceIdFrom(req);
    if (!config.prisma) {
      return res.status(503).json(
        errorEnvelope("SERVICE_UNAVAILABLE", "Database not configured.", traceId)
      );
    }
    try {
      const { context } = await requireAccountWithRole(
        req,
        { prisma: config.prisma, identityService },
        "creator"
      );
      const relayCreatorId = context.primaryRelayCreatorId?.trim();
      if (!relayCreatorId) {
        return res.status(404).json(
          errorEnvelope(
            "NOT_FOUND",
            "No creator studio — call POST /api/v1/creator/workspace first.",
            traceId
          )
        );
      }

      const importId =
        typeof req.query.import_id === "string" && req.query.import_id.trim()
          ? req.query.import_id.trim()
          : undefined;
      const rawMetricsLimit =
        typeof req.query.metrics_limit === "string"
          ? Number.parseInt(req.query.metrics_limit, 10)
          : undefined;
      const rawRelayLimit =
        typeof req.query.relay_only_limit === "string"
          ? Number.parseInt(req.query.relay_only_limit, 10)
          : undefined;
      const includeRelayRaw = req.query.include_relay_only;
      const includeRelayOnly =
        includeRelayRaw === undefined ||
        includeRelayRaw === "1" ||
        includeRelayRaw === "true";

      const out = await getCreatorPostPerformance(config.prisma, relayCreatorId, {
        importId,
        metricsLimit: Number.isFinite(rawMetricsLimit) ? rawMetricsLimit : undefined,
        relayOnlyLimit: Number.isFinite(rawRelayLimit) ? rawRelayLimit : undefined,
        includeRelayOnly
      });

      if (!out.ok) {
        if (out.code === "NO_TENANT") {
          return res
            .status(404)
            .json(errorEnvelope("NOT_FOUND", "Creator tenant missing.", traceId));
        }
        return res
          .status(404)
          .json(errorEnvelope("NOT_FOUND", "Insights import not found for this studio.", traceId));
      }

      res.setHeader("Cache-Control", "private, no-store");
      return res.status(200).json(successEnvelope(out.report, traceId));
    } catch (err) {
      if (sendRelayAuthError(res, err, traceId)) return;
      return res.status(500).json(errorEnvelope("INTERNAL", (err as Error).message, traceId));
    }
  });

  /**
   * Slice 2d-4 — Unified cross-platform post performance from daily rollups (CSV fallback when empty).
   */
  app.get("/api/v1/creator/analytics/unified-performance", async (req: Request, res: Response) => {
    const traceId = traceIdFrom(req);
    if (!config.prisma) {
      return res.status(503).json(
        errorEnvelope("SERVICE_UNAVAILABLE", "Database not configured.", traceId)
      );
    }
    try {
      const { context } = await requireAccountWithRole(
        req,
        { prisma: config.prisma, identityService },
        "creator"
      );
      const relayCreatorId = context.primaryRelayCreatorId?.trim();
      if (!relayCreatorId) {
        return res.status(404).json(
          errorEnvelope(
            "NOT_FOUND",
            "No creator studio — call POST /api/v1/creator/workspace first.",
            traceId
          )
        );
      }

      const range = parseUnifiedPerformanceRange(
        typeof req.query.range === "string" ? req.query.range : undefined
      );
      const destination =
        typeof req.query.destination === "string" && req.query.destination.trim()
          ? req.query.destination.trim()
          : undefined;
      const rawTopPostsLimit =
        typeof req.query.top_posts_limit === "string"
          ? Number.parseInt(req.query.top_posts_limit, 10)
          : undefined;

      const out = await getCreatorUnifiedPerformance(config.prisma, relayCreatorId, {
        range,
        destination,
        topPostsLimit: Number.isFinite(rawTopPostsLimit) ? rawTopPostsLimit : undefined
      });

      if (!out.ok) {
        return res
          .status(404)
          .json(errorEnvelope("NOT_FOUND", "Creator tenant missing.", traceId));
      }

      res.setHeader("Cache-Control", "private, no-store");
      return res.status(200).json(successEnvelope(out.report, traceId));
    } catch (err) {
      if (sendRelayAuthError(res, err, traceId)) return;
      return res.status(500).json(errorEnvelope("INTERNAL", (err as Error).message, traceId));
    }
  });

  /**
   * Performance intelligence Phase 3 — scoped V2 read endpoints (Work/Bundle hierarchy).
   */
  app.get("/api/v1/creator/analytics/performance/overview", async (req: Request, res: Response) => {
    const traceId = traceIdFrom(req);
    if (!config.prisma) {
      return res.status(503).json(
        errorEnvelope("SERVICE_UNAVAILABLE", "Database not configured.", traceId)
      );
    }
    try {
      const { context } = await requireAccountWithRole(
        req,
        { prisma: config.prisma, identityService },
        "creator"
      );
      const relayCreatorId = context.primaryRelayCreatorId?.trim();
      if (!relayCreatorId) {
        return res.status(404).json(
          errorEnvelope(
            "NOT_FOUND",
            "No creator studio — call POST /api/v1/creator/workspace first.",
            traceId
          )
        );
      }

      const range = parseUnifiedPerformanceRange(
        typeof req.query.range === "string" ? req.query.range : undefined
      );
      const destination =
        typeof req.query.destination === "string" && req.query.destination.trim()
          ? req.query.destination.trim()
          : undefined;

      const out = await getPerformanceOverview(config.prisma, relayCreatorId, {
        range,
        destination
      });

      if (!out.ok) {
        return res
          .status(404)
          .json(errorEnvelope("NOT_FOUND", "Creator tenant missing.", traceId));
      }

      res.setHeader("Cache-Control", "private, no-store");
      return res.status(200).json(successEnvelope(out.report, traceId));
    } catch (err) {
      if (sendRelayAuthError(res, err, traceId)) return;
      return res.status(500).json(errorEnvelope("INTERNAL", (err as Error).message, traceId));
    }
  });

  app.get("/api/v1/creator/analytics/performance/campaigns", async (req: Request, res: Response) => {
    const traceId = traceIdFrom(req);
    if (!config.prisma) {
      return res.status(503).json(
        errorEnvelope("SERVICE_UNAVAILABLE", "Database not configured.", traceId)
      );
    }
    try {
      const { context } = await requireAccountWithRole(
        req,
        { prisma: config.prisma, identityService },
        "creator"
      );
      const relayCreatorId = context.primaryRelayCreatorId?.trim();
      if (!relayCreatorId) {
        return res.status(404).json(
          errorEnvelope(
            "NOT_FOUND",
            "No creator studio — call POST /api/v1/creator/workspace first.",
            traceId
          )
        );
      }

      const range = parseUnifiedPerformanceRange(
        typeof req.query.range === "string" ? req.query.range : undefined
      );
      const out = await getPerformanceCampaignRollups(config.prisma, relayCreatorId, { range });

      if (!out.ok) {
        return res
          .status(404)
          .json(errorEnvelope("NOT_FOUND", "Creator tenant missing.", traceId));
      }

      res.setHeader("Cache-Control", "private, no-store");
      return res.status(200).json(successEnvelope(out.report, traceId));
    } catch (err) {
      if (sendRelayAuthError(res, err, traceId)) return;
      return res.status(500).json(errorEnvelope("INTERNAL", (err as Error).message, traceId));
    }
  });

  app.get("/api/v1/creator/analytics/performance/tags", async (req: Request, res: Response) => {
    const traceId = traceIdFrom(req);
    if (!config.prisma) {
      return res.status(503).json(
        errorEnvelope("SERVICE_UNAVAILABLE", "Database not configured.", traceId)
      );
    }
    try {
      const { context } = await requireAccountWithRole(
        req,
        { prisma: config.prisma, identityService },
        "creator"
      );
      const relayCreatorId = context.primaryRelayCreatorId?.trim();
      if (!relayCreatorId) {
        return res.status(404).json(
          errorEnvelope(
            "NOT_FOUND",
            "No creator studio — call POST /api/v1/creator/workspace first.",
            traceId
          )
        );
      }

      const range = parseUnifiedPerformanceRange(
        typeof req.query.range === "string" ? req.query.range : undefined
      );
      const tag =
        typeof req.query.tag === "string" && req.query.tag.trim() ? req.query.tag.trim() : undefined;
      const out = await getPerformanceTagRollups(config.prisma, relayCreatorId, { range, tag });

      if (!out.ok) {
        return res
          .status(404)
          .json(errorEnvelope("NOT_FOUND", "Creator tenant missing.", traceId));
      }

      res.setHeader("Cache-Control", "private, no-store");
      return res.status(200).json(successEnvelope(out.report, traceId));
    } catch (err) {
      if (sendRelayAuthError(res, err, traceId)) return;
      return res.status(500).json(errorEnvelope("INTERNAL", (err as Error).message, traceId));
    }
  });

  app.get("/api/v1/creator/analytics/performance/works", async (req: Request, res: Response) => {
    const traceId = traceIdFrom(req);
    if (!config.prisma) {
      return res.status(503).json(
        errorEnvelope("SERVICE_UNAVAILABLE", "Database not configured.", traceId)
      );
    }
    try {
      const { context } = await requireAccountWithRole(
        req,
        { prisma: config.prisma, identityService },
        "creator"
      );
      const relayCreatorId = context.primaryRelayCreatorId?.trim();
      if (!relayCreatorId) {
        return res.status(404).json(
          errorEnvelope(
            "NOT_FOUND",
            "No creator studio — call POST /api/v1/creator/workspace first.",
            traceId
          )
        );
      }

      const range = parseUnifiedPerformanceRange(
        typeof req.query.range === "string" ? req.query.range : undefined
      );
      const rawLimit =
        typeof req.query.limit === "string" ? Number.parseInt(req.query.limit, 10) : undefined;
      const out = await listPerformanceWorks(config.prisma, relayCreatorId, {
        range,
        limit: Number.isFinite(rawLimit) ? rawLimit : undefined
      });

      if (!out.ok) {
        return res
          .status(404)
          .json(errorEnvelope("NOT_FOUND", "Creator tenant missing.", traceId));
      }

      res.setHeader("Cache-Control", "private, no-store");
      return res.status(200).json(successEnvelope(out.report, traceId));
    } catch (err) {
      if (sendRelayAuthError(res, err, traceId)) return;
      return res.status(500).json(errorEnvelope("INTERNAL", (err as Error).message, traceId));
    }
  });

  app.get(
    "/api/v1/creator/analytics/performance/works/:creative_work_id",
    async (req: Request, res: Response) => {
      const traceId = traceIdFrom(req);
      if (!config.prisma) {
        return res.status(503).json(
          errorEnvelope("SERVICE_UNAVAILABLE", "Database not configured.", traceId)
        );
      }
      const creativeWorkId = String(req.params.creative_work_id ?? "").trim();
      try {
        const { context } = await requireAccountWithRole(
          req,
          { prisma: config.prisma, identityService },
          "creator"
        );
        const relayCreatorId = context.primaryRelayCreatorId?.trim();
        if (!relayCreatorId) {
          return res.status(404).json(
            errorEnvelope(
              "NOT_FOUND",
              "No creator studio — call POST /api/v1/creator/workspace first.",
              traceId
            )
          );
        }

        const range = parseUnifiedPerformanceRange(
          typeof req.query.range === "string" ? req.query.range : undefined
        );
        const groupBy =
          typeof req.query.group_by === "string" ? req.query.group_by.trim() : undefined;
        const out = await getPerformanceWorkBundle(config.prisma, relayCreatorId, creativeWorkId, {
          range,
          groupByVariantRole: groupBy === "variant_role"
        });

        if (!out.ok) {
          const message =
            out.code === "NOT_FOUND" ? "Work/Bundle not found." : "Creator tenant missing.";
          return res.status(404).json(errorEnvelope("NOT_FOUND", message, traceId));
        }

        res.setHeader("Cache-Control", "private, no-store");
        return res.status(200).json(successEnvelope(out.report, traceId));
      } catch (err) {
        if (sendRelayAuthError(res, err, traceId)) return;
        return res.status(500).json(errorEnvelope("INTERNAL", (err as Error).message, traceId));
      }
    }
  );

  app.get(
    "/api/v1/creator/analytics/performance/works/:creative_work_id/instances",
    async (req: Request, res: Response) => {
      const traceId = traceIdFrom(req);
      if (!config.prisma) {
        return res.status(503).json(
          errorEnvelope("SERVICE_UNAVAILABLE", "Database not configured.", traceId)
        );
      }
      const creativeWorkId = String(req.params.creative_work_id ?? "").trim();
      try {
        const { context } = await requireAccountWithRole(
          req,
          { prisma: config.prisma, identityService },
          "creator"
        );
        const relayCreatorId = context.primaryRelayCreatorId?.trim();
        if (!relayCreatorId) {
          return res.status(404).json(
            errorEnvelope(
              "NOT_FOUND",
              "No creator studio — call POST /api/v1/creator/workspace first.",
              traceId
            )
          );
        }

        const out = await getPerformanceWorkInstances(
          config.prisma,
          relayCreatorId,
          creativeWorkId
        );

        if (!out.ok) {
          const message =
            out.code === "NOT_FOUND" ? "Work/Bundle not found." : "Creator tenant missing.";
          return res.status(404).json(errorEnvelope("NOT_FOUND", message, traceId));
        }

        res.setHeader("Cache-Control", "private, no-store");
        return res.status(200).json(successEnvelope(out.report, traceId));
      } catch (err) {
        if (sendRelayAuthError(res, err, traceId)) return;
        return res.status(500).json(errorEnvelope("INTERNAL", (err as Error).message, traceId));
      }
    }
  );

  app.get(
    "/api/v1/creator/analytics/performance/posts/:post_id",
    async (req: Request, res: Response) => {
      const traceId = traceIdFrom(req);
      if (!config.prisma) {
        return res.status(503).json(
          errorEnvelope("SERVICE_UNAVAILABLE", "Database not configured.", traceId)
        );
      }
      const postId = String(req.params.post_id ?? "").trim();
      try {
        const { context } = await requireAccountWithRole(
          req,
          { prisma: config.prisma, identityService },
          "creator"
        );
        const relayCreatorId = context.primaryRelayCreatorId?.trim();
        if (!relayCreatorId) {
          return res.status(404).json(
            errorEnvelope(
              "NOT_FOUND",
              "No creator studio — call POST /api/v1/creator/workspace first.",
              traceId
            )
          );
        }

        const range = parseUnifiedPerformanceRange(
          typeof req.query.range === "string" ? req.query.range : undefined
        );
        const out = await getPerformancePostVariant(config.prisma, relayCreatorId, postId, {
          range
        });

        if (!out.ok) {
          const message = out.code === "NOT_FOUND" ? "Post not found." : "Creator tenant missing.";
          return res.status(404).json(errorEnvelope("NOT_FOUND", message, traceId));
        }

        res.setHeader("Cache-Control", "private, no-store");
        return res.status(200).json(successEnvelope(out.report, traceId));
      } catch (err) {
        if (sendRelayAuthError(res, err, traceId)) return;
        return res.status(500).json(errorEnvelope("INTERNAL", (err as Error).message, traceId));
      }
    }
  );

  app.get(
    "/api/v1/creator/analytics/performance/platform-instances/:platform_instance_id",
    async (req: Request, res: Response) => {
      const traceId = traceIdFrom(req);
      if (!config.prisma) {
        return res.status(503).json(
          errorEnvelope("SERVICE_UNAVAILABLE", "Database not configured.", traceId)
        );
      }
      const platformInstanceId = String(req.params.platform_instance_id ?? "").trim();
      try {
        const { context } = await requireAccountWithRole(
          req,
          { prisma: config.prisma, identityService },
          "creator"
        );
        const relayCreatorId = context.primaryRelayCreatorId?.trim();
        if (!relayCreatorId) {
          return res.status(404).json(
            errorEnvelope(
              "NOT_FOUND",
              "No creator studio — call POST /api/v1/creator/workspace first.",
              traceId
            )
          );
        }

        const range = parseUnifiedPerformanceRange(
          typeof req.query.range === "string" ? req.query.range : undefined
        );
        const out = await getPerformancePlatformInstance(
          config.prisma,
          relayCreatorId,
          platformInstanceId,
          { range }
        );

        if (!out.ok) {
          const message =
            out.code === "NOT_FOUND"
              ? "Platform instance not found."
              : "Creator tenant missing.";
          return res.status(404).json(errorEnvelope("NOT_FOUND", message, traceId));
        }

        res.setHeader("Cache-Control", "private, no-store");
        return res.status(200).json(successEnvelope(out.report, traceId));
      } catch (err) {
        if (sendRelayAuthError(res, err, traceId)) return;
        return res.status(500).json(errorEnvelope("INTERNAL", (err as Error).message, traceId));
      }
    }
  );

  app.get(
    "/api/v1/creator/analytics/platform-instances/:platform_instance_id/refresh-status",
    async (req: Request, res: Response) => {
      const traceId = traceIdFrom(req);
      if (!config.prisma) {
        return res.status(503).json(
          errorEnvelope("SERVICE_UNAVAILABLE", "Database not configured.", traceId)
        );
      }
      const platformInstanceId = String(req.params.platform_instance_id ?? "").trim();
      try {
        const { context } = await requireAccountWithRole(
          req,
          { prisma: config.prisma, identityService },
          "creator"
        );
        const relayCreatorId = context.primaryRelayCreatorId?.trim();
        if (!relayCreatorId) {
          return res.status(404).json(
            errorEnvelope(
              "NOT_FOUND",
              "No creator studio — call POST /api/v1/creator/workspace first.",
              traceId
            )
          );
        }

        const out = await getPlatformInstanceRefreshStatus(
          config.prisma,
          relayCreatorId,
          platformInstanceId
        );

        if (!out.ok) {
          const message =
            out.code === "NOT_FOUND"
              ? "Platform instance not found."
              : "Creator tenant missing.";
          return res.status(404).json(errorEnvelope("NOT_FOUND", message, traceId));
        }

        res.setHeader("Cache-Control", "private, no-store");
        return res.status(200).json(successEnvelope(out.status, traceId));
      } catch (err) {
        if (sendRelayAuthError(res, err, traceId)) return;
        return res.status(500).json(errorEnvelope("INTERNAL", (err as Error).message, traceId));
      }
    }
  );

  app.post(
    "/api/v1/creator/analytics/platform-instances/:platform_instance_id/refresh",
    async (req: Request, res: Response) => {
      const traceId = traceIdFrom(req);
      if (!config.prisma) {
        return res.status(503).json(
          errorEnvelope("SERVICE_UNAVAILABLE", "Database not configured.", traceId)
        );
      }
      const platformInstanceId = String(req.params.platform_instance_id ?? "").trim();
      try {
        const { context } = await requireAccountWithRole(
          req,
          { prisma: config.prisma, identityService },
          "creator"
        );
        const relayCreatorId = context.primaryRelayCreatorId?.trim();
        if (!relayCreatorId) {
          return res.status(404).json(
            errorEnvelope(
              "NOT_FOUND",
              "No creator studio — call POST /api/v1/creator/workspace first.",
              traceId
            )
          );
        }

        const out = await requestPlatformInstanceManualRefresh(
          config.prisma,
          relayCreatorId,
          platformInstanceId
        );

        if (!out.ok) {
          const message =
            out.code === "NOT_FOUND"
              ? "Platform instance not found."
              : "Creator tenant missing.";
          return res.status(404).json(errorEnvelope("NOT_FOUND", message, traceId));
        }

        res.setHeader("Cache-Control", "private, no-store");
        return res.status(200).json(successEnvelope(out.result, traceId));
      } catch (err) {
        if (sendRelayAuthError(res, err, traceId)) return;
        return res.status(500).json(errorEnvelope("INTERNAL", (err as Error).message, traceId));
      }
    }
  );

  /**
   * Performance intelligence Phase 9 — platform adapter catalog and manual instance linking.
   */
  app.get("/api/v1/creator/analytics/platform-adapters", async (req: Request, res: Response) => {
    const traceId = traceIdFrom(req);
    if (!config.prisma) {
      return res.status(503).json(
        errorEnvelope("SERVICE_UNAVAILABLE", "Database not configured.", traceId)
      );
    }
    try {
      const { context } = await requireAccountWithRole(
        req,
        { prisma: config.prisma, identityService },
        "creator"
      );
      const relayCreatorId = context.primaryRelayCreatorId?.trim();
      if (!relayCreatorId) {
        return res.status(404).json(
          errorEnvelope(
            "NOT_FOUND",
            "No creator studio — call POST /api/v1/creator/workspace first.",
            traceId
          )
        );
      }

      res.setHeader("Cache-Control", "private, no-store");
      return res.status(200).json(
        successEnvelope(
          {
            creator_id: relayCreatorId,
            adapters: platformAdapterCatalog()
          },
          traceId
        )
      );
    } catch (err) {
      if (sendRelayAuthError(res, err, traceId)) return;
      return res.status(500).json(errorEnvelope("INTERNAL", (err as Error).message, traceId));
    }
  });

  app.post("/api/v1/creator/analytics/platform-instances/link", async (req: Request, res: Response) => {
    const traceId = traceIdFrom(req);
    if (!config.prisma) {
      return res.status(503).json(
        errorEnvelope("SERVICE_UNAVAILABLE", "Database not configured.", traceId)
      );
    }
    try {
      const { context } = await requireAccountWithRole(
        req,
        { prisma: config.prisma, identityService },
        "creator"
      );
      const relayCreatorId = context.primaryRelayCreatorId?.trim();
      if (!relayCreatorId) {
        return res.status(404).json(
          errorEnvelope(
            "NOT_FOUND",
            "No creator studio — call POST /api/v1/creator/workspace first.",
            traceId
          )
        );
      }

      const body = req.body as Record<string, unknown>;
      const out = await confirmPlatformInstanceLink(config.prisma, relayCreatorId, {
        postId: typeof body.post_id === "string" ? body.post_id : "",
        destination: typeof body.destination === "string" ? body.destination : "",
        externalUrl: typeof body.external_url === "string" ? body.external_url : "",
        attemptId:
          typeof body.attempt_id === "string"
            ? body.attempt_id
            : body.attempt_id === null
              ? null
              : undefined
      });

      if (!out.ok) {
        const status =
          out.code === "INVALID_INPUT" || out.code === "URL_DESTINATION_MISMATCH"
            ? 400
            : out.code === "UNSUPPORTED_DESTINATION"
              ? 422
              : 404;
        return res
          .status(status)
          .json(
            errorEnvelope(
              out.code,
              out.message ?? "Unable to link platform instance.",
              traceId
            )
          );
      }

      res.setHeader("Cache-Control", "private, no-store");
      return res.status(200).json(successEnvelope(out.link, traceId));
    } catch (err) {
      if (sendRelayAuthError(res, err, traceId)) return;
      return res.status(500).json(errorEnvelope("INTERNAL", (err as Error).message, traceId));
    }
  });

  /**
   * Performance intelligence Phase 8 — metric-grounded insight actions and targeted goals.
   */
  app.get("/api/v1/creator/analytics/performance/insight-actions", async (req: Request, res: Response) => {
    const traceId = traceIdFrom(req);
    if (!config.prisma) {
      return res.status(503).json(
        errorEnvelope("SERVICE_UNAVAILABLE", "Database not configured.", traceId)
      );
    }
    try {
      const { context } = await requireAccountWithRole(
        req,
        { prisma: config.prisma, identityService },
        "creator"
      );
      const relayCreatorId = context.primaryRelayCreatorId?.trim();
      if (!relayCreatorId) {
        return res.status(404).json(
          errorEnvelope(
            "NOT_FOUND",
            "No creator studio — call POST /api/v1/creator/workspace first.",
            traceId
          )
        );
      }

      const range = parseUnifiedPerformanceRange(
        typeof req.query.range === "string" ? req.query.range : undefined
      );
      const out = await getPerformanceInsightActions(config.prisma, relayCreatorId, { range });

      if (!out.ok) {
        return res
          .status(404)
          .json(errorEnvelope("NOT_FOUND", "Creator tenant missing.", traceId));
      }

      res.setHeader("Cache-Control", "private, no-store");
      return res.status(200).json(successEnvelope(out.report, traceId));
    } catch (err) {
      if (sendRelayAuthError(res, err, traceId)) return;
      return res.status(500).json(errorEnvelope("INTERNAL", (err as Error).message, traceId));
    }
  });

  app.get("/api/v1/creator/analytics/performance/goals", async (req: Request, res: Response) => {
    const traceId = traceIdFrom(req);
    if (!config.prisma) {
      return res.status(503).json(
        errorEnvelope("SERVICE_UNAVAILABLE", "Database not configured.", traceId)
      );
    }
    try {
      const { context } = await requireAccountWithRole(
        req,
        { prisma: config.prisma, identityService },
        "creator"
      );
      const relayCreatorId = context.primaryRelayCreatorId?.trim();
      if (!relayCreatorId) {
        return res.status(404).json(
          errorEnvelope(
            "NOT_FOUND",
            "No creator studio — call POST /api/v1/creator/workspace first.",
            traceId
          )
        );
      }

      const range = parseUnifiedPerformanceRange(
        typeof req.query.range === "string" ? req.query.range : undefined
      );
      const out = await listCreatorPerformanceGoals(config.prisma, relayCreatorId, { range });

      if (!out.ok) {
        return res
          .status(404)
          .json(errorEnvelope("NOT_FOUND", "Creator tenant missing.", traceId));
      }

      res.setHeader("Cache-Control", "private, no-store");
      return res.status(200).json(successEnvelope(out.report, traceId));
    } catch (err) {
      if (sendRelayAuthError(res, err, traceId)) return;
      return res.status(500).json(errorEnvelope("INTERNAL", (err as Error).message, traceId));
    }
  });

  app.post("/api/v1/creator/analytics/performance/goals", async (req: Request, res: Response) => {
    const traceId = traceIdFrom(req);
    if (!config.prisma) {
      return res.status(503).json(
        errorEnvelope("SERVICE_UNAVAILABLE", "Database not configured.", traceId)
      );
    }
    try {
      const { context } = await requireAccountWithRole(
        req,
        { prisma: config.prisma, identityService },
        "creator"
      );
      const relayCreatorId = context.primaryRelayCreatorId?.trim();
      if (!relayCreatorId) {
        return res.status(404).json(
          errorEnvelope(
            "NOT_FOUND",
            "No creator studio — call POST /api/v1/creator/workspace first.",
            traceId
          )
        );
      }

      const body = req.body as Record<string, unknown>;
      const out = await createCreatorPerformanceGoal(config.prisma, relayCreatorId, {
        scope: typeof body.scope === "string" ? (body.scope as "creator" | "work" | "campaign" | "platform") : "creator",
        scopeRef:
          typeof body.scope_ref === "string"
            ? body.scope_ref
            : body.scope_ref === null
              ? null
              : undefined,
        metric: typeof body.metric === "string" ? (body.metric as "reach" | "likes" | "comments") : "reach",
        targetValue:
          typeof body.target_value === "number"
            ? body.target_value
            : Number.parseInt(String(body.target_value ?? ""), 10),
        range:
          typeof body.range === "string" && (body.range === "7d" || body.range === "30d" || body.range === "90d")
            ? body.range
            : undefined,
        label: typeof body.label === "string" ? body.label : null
      });

      if (!out.ok) {
        const status = out.code === "INVALID_INPUT" ? 400 : 404;
        return res
          .status(status)
          .json(
            errorEnvelope(
              out.code === "INVALID_INPUT" ? "INVALID_INPUT" : "NOT_FOUND",
              out.message ?? "Unable to create goal.",
              traceId
            )
          );
      }

      res.setHeader("Cache-Control", "private, no-store");
      return res.status(201).json(successEnvelope({ goal: out.goal }, traceId));
    } catch (err) {
      if (sendRelayAuthError(res, err, traceId)) return;
      return res.status(500).json(errorEnvelope("INTERNAL", (err as Error).message, traceId));
    }
  });

  app.delete("/api/v1/creator/analytics/performance/goals/:goal_id", async (req: Request, res: Response) => {
    const traceId = traceIdFrom(req);
    if (!config.prisma) {
      return res.status(503).json(
        errorEnvelope("SERVICE_UNAVAILABLE", "Database not configured.", traceId)
      );
    }
    const goalId = String(req.params.goal_id ?? "").trim();
    try {
      const { context } = await requireAccountWithRole(
        req,
        { prisma: config.prisma, identityService },
        "creator"
      );
      const relayCreatorId = context.primaryRelayCreatorId?.trim();
      if (!relayCreatorId) {
        return res.status(404).json(
          errorEnvelope(
            "NOT_FOUND",
            "No creator studio — call POST /api/v1/creator/workspace first.",
            traceId
          )
        );
      }

      const out = await deleteCreatorPerformanceGoal(config.prisma, relayCreatorId, goalId);
      if (!out.ok) {
        return res.status(404).json(errorEnvelope("NOT_FOUND", "Goal not found.", traceId));
      }

      res.setHeader("Cache-Control", "private, no-store");
      return res.status(200).json(successEnvelope({ ok: true }, traceId));
    } catch (err) {
      if (sendRelayAuthError(res, err, traceId)) return;
      return res.status(500).json(errorEnvelope("INTERNAL", (err as Error).message, traceId));
    }
  });

  /**
   * Performance intelligence Phase 5 — suggested Work/Bundle merge + split (user-confirmed).
   */
  app.get("/api/v1/creator/analytics/creative-works/bundle-suggestions", async (req: Request, res: Response) => {
    const traceId = traceIdFrom(req);
    if (!config.prisma) {
      return res.status(503).json(
        errorEnvelope("SERVICE_UNAVAILABLE", "Database not configured.", traceId)
      );
    }
    try {
      const { context } = await requireAccountWithRole(
        req,
        { prisma: config.prisma, identityService },
        "creator"
      );
      const relayCreatorId = context.primaryRelayCreatorId?.trim();
      if (!relayCreatorId) {
        return res.status(404).json(
          errorEnvelope(
            "NOT_FOUND",
            "No creator studio — call POST /api/v1/creator/workspace first.",
            traceId
          )
        );
      }

      const rawLimit =
        typeof req.query.limit === "string" ? Number.parseInt(req.query.limit, 10) : undefined;
      const out = await listCreativeWorkBundleSuggestions(config.prisma, relayCreatorId, {
        limit: Number.isFinite(rawLimit) ? rawLimit : undefined
      });

      if (!out.ok) {
        return res
          .status(404)
          .json(errorEnvelope("NOT_FOUND", "Creator tenant missing.", traceId));
      }

      res.setHeader("Cache-Control", "private, no-store");
      return res.status(200).json(successEnvelope(out.report, traceId));
    } catch (err) {
      if (sendRelayAuthError(res, err, traceId)) return;
      return res.status(500).json(errorEnvelope("INTERNAL", (err as Error).message, traceId));
    }
  });

  app.post(
    "/api/v1/creator/analytics/creative-works/bundle-suggestions/dismiss",
    async (req: Request, res: Response) => {
      const traceId = traceIdFrom(req);
      if (!config.prisma) {
        return res.status(503).json(
          errorEnvelope("SERVICE_UNAVAILABLE", "Database not configured.", traceId)
        );
      }
      const body = (req.body ?? {}) as Record<string, unknown>;
      const sourcePostId = typeof body.source_post_id === "string" ? body.source_post_id.trim() : "";
      const targetCreativeWorkId =
        typeof body.target_creative_work_id === "string"
          ? body.target_creative_work_id.trim()
          : "";

      try {
        const { context } = await requireAccountWithRole(
          req,
          { prisma: config.prisma, identityService },
          "creator"
        );
        const relayCreatorId = context.primaryRelayCreatorId?.trim();
        if (!relayCreatorId) {
          return res.status(404).json(
            errorEnvelope(
              "NOT_FOUND",
              "No creator studio — call POST /api/v1/creator/workspace first.",
              traceId
            )
          );
        }

        const out = await dismissCreativeWorkBundleSuggestion(config.prisma, relayCreatorId, {
          sourcePostId,
          targetCreativeWorkId
        });

        if (!out.ok) {
          const code = out.code === "INVALID_INPUT" ? "VALIDATION_ERROR" : "NOT_FOUND";
          const message =
            out.code === "INVALID_INPUT"
              ? "source_post_id and target_creative_work_id are required."
              : out.code === "NOT_FOUND"
                ? "Target Work/Bundle not found."
                : "Creator tenant missing.";
          return res.status(out.code === "NO_TENANT" ? 404 : 400).json(
            errorEnvelope(code, message, traceId)
          );
        }

        res.setHeader("Cache-Control", "private, no-store");
        return res.status(200).json(successEnvelope(out, traceId));
      } catch (err) {
        if (sendRelayAuthError(res, err, traceId)) return;
        return res.status(500).json(errorEnvelope("INTERNAL", (err as Error).message, traceId));
      }
    }
  );

  app.post(
    "/api/v1/creator/analytics/creative-works/bundle-suggestions/confirm",
    async (req: Request, res: Response) => {
      const traceId = traceIdFrom(req);
      if (!config.prisma) {
        return res.status(503).json(
          errorEnvelope("SERVICE_UNAVAILABLE", "Database not configured.", traceId)
        );
      }
      const body = (req.body ?? {}) as Record<string, unknown>;
      const sourcePostId = typeof body.source_post_id === "string" ? body.source_post_id.trim() : "";
      const targetCreativeWorkId =
        typeof body.target_creative_work_id === "string"
          ? body.target_creative_work_id.trim()
          : "";
      const variantRoleRaw =
        typeof body.variant_role === "string" ? body.variant_role.trim() : undefined;
      const allowedRoles = new Set([
        "full",
        "teaser",
        "promo",
        "repost",
        "standalone"
      ]);
      const variantRole =
        variantRoleRaw && allowedRoles.has(variantRoleRaw)
          ? (variantRoleRaw as "full" | "teaser" | "promo" | "repost" | "standalone")
          : undefined;

      try {
        const { context } = await requireAccountWithRole(
          req,
          { prisma: config.prisma, identityService },
          "creator"
        );
        const relayCreatorId = context.primaryRelayCreatorId?.trim();
        if (!relayCreatorId) {
          return res.status(404).json(
            errorEnvelope(
              "NOT_FOUND",
              "No creator studio — call POST /api/v1/creator/workspace first.",
              traceId
            )
          );
        }

        const out = await confirmMergeCreativeWorkBundle(config.prisma, relayCreatorId, {
          sourcePostId,
          targetCreativeWorkId,
          variantRole
        });

        if (!out.ok) {
          if (out.code === "ALREADY_MERGED") {
            return res
              .status(409)
              .json(errorEnvelope("CONFLICT", "Post is already in the target Work/Bundle.", traceId));
          }
          const message =
            out.code === "INVALID_INPUT"
              ? "source_post_id and target_creative_work_id are required."
              : out.code === "NOT_FOUND"
                ? "Post or Work/Bundle not found."
                : "Creator tenant missing.";
          const status = out.code === "INVALID_INPUT" ? 400 : 404;
          return res.status(status).json(errorEnvelope("NOT_FOUND", message, traceId));
        }

        res.setHeader("Cache-Control", "private, no-store");
        return res.status(200).json(successEnvelope(out.result, traceId));
      } catch (err) {
        if (sendRelayAuthError(res, err, traceId)) return;
        return res.status(500).json(errorEnvelope("INTERNAL", (err as Error).message, traceId));
      }
    }
  );

  app.post(
    "/api/v1/creator/analytics/creative-works/link",
    async (req: Request, res: Response) => {
      const traceId = traceIdFrom(req);
      if (!config.prisma) {
        return res.status(503).json(
          errorEnvelope("SERVICE_UNAVAILABLE", "Database not configured.", traceId)
        );
      }
      const body = (req.body ?? {}) as Record<string, unknown>;
      const title = typeof body.title === "string" ? body.title.trim() : undefined;
      const rawMembers = Array.isArray(body.members) ? body.members : [];
      const allowedRoles = new Set([
        "full",
        "teaser",
        "promo",
        "repost",
        "standalone"
      ]);
      const members = rawMembers
        .map((row) => {
          if (!row || typeof row !== "object") return null;
          const rec = row as Record<string, unknown>;
          const postId = typeof rec.post_id === "string" ? rec.post_id.trim() : "";
          if (!postId) return null;
          const variantRoleRaw =
            typeof rec.variant_role === "string" ? rec.variant_role.trim() : undefined;
          const variantRole =
            variantRoleRaw && allowedRoles.has(variantRoleRaw)
              ? (variantRoleRaw as "full" | "teaser" | "promo" | "repost" | "standalone")
              : undefined;
          const memberLabel =
            typeof rec.member_label === "string"
              ? rec.member_label.trim() || null
              : rec.member_label === null
                ? null
                : undefined;
          return {
            postId,
            variantRole,
            memberLabel,
            isCover: Boolean(rec.is_cover)
          };
        })
        .filter((row): row is NonNullable<typeof row> => row !== null);

      try {
        const { context } = await requireAccountWithRole(
          req,
          { prisma: config.prisma, identityService },
          "creator"
        );
        const relayCreatorId = context.primaryRelayCreatorId?.trim();
        if (!relayCreatorId) {
          return res.status(404).json(
            errorEnvelope(
              "NOT_FOUND",
              "No creator studio — call POST /api/v1/creator/workspace first.",
              traceId
            )
          );
        }

        const out = await linkCreativeWorkMembers(config.prisma, relayCreatorId, {
          title,
          members
        });

        if (!out.ok) {
          const message =
            out.code === "INVALID_INPUT"
              ? "At least two distinct post_id members are required."
              : out.code === "NOT_FOUND"
                ? "One or more posts were not found for this creator."
                : "Creator tenant missing.";
          const status = out.code === "INVALID_INPUT" ? 400 : 404;
          return res.status(status).json(errorEnvelope("NOT_FOUND", message, traceId));
        }

        res.setHeader("Cache-Control", "private, no-store");
        return res.status(200).json(successEnvelope(out.result, traceId));
      } catch (err) {
        if (sendRelayAuthError(res, err, traceId)) return;
        return res.status(500).json(errorEnvelope("INTERNAL", (err as Error).message, traceId));
      }
    }
  );

  app.post(
    "/api/v1/creator/analytics/creative-works/members/:post_id/split",
    async (req: Request, res: Response) => {
      const traceId = traceIdFrom(req);
      if (!config.prisma) {
        return res.status(503).json(
          errorEnvelope("SERVICE_UNAVAILABLE", "Database not configured.", traceId)
        );
      }
      const postId = String(req.params.post_id ?? "").trim();
      const body = (req.body ?? {}) as Record<string, unknown>;
      const title = typeof body.title === "string" ? body.title.trim() : undefined;

      try {
        const { context } = await requireAccountWithRole(
          req,
          { prisma: config.prisma, identityService },
          "creator"
        );
        const relayCreatorId = context.primaryRelayCreatorId?.trim();
        if (!relayCreatorId) {
          return res.status(404).json(
            errorEnvelope(
              "NOT_FOUND",
              "No creator studio — call POST /api/v1/creator/workspace first.",
              traceId
            )
          );
        }

        const out = await splitCreativeWorkMember(config.prisma, relayCreatorId, postId, {
          title
        });

        if (!out.ok) {
          const message =
            out.code === "INVALID_INPUT"
              ? "post_id is required."
              : out.code === "NOT_FOUND"
                ? "Post membership not found."
                : "Creator tenant missing.";
          return res
            .status(out.code === "INVALID_INPUT" ? 400 : 404)
            .json(errorEnvelope("NOT_FOUND", message, traceId));
        }

        res.setHeader("Cache-Control", "private, no-store");
        return res.status(200).json(successEnvelope(out.result, traceId));
      } catch (err) {
        if (sendRelayAuthError(res, err, traceId)) return;
        return res.status(500).json(errorEnvelope("INTERNAL", (err as Error).message, traceId));
      }
    }
  );

  /**
   * P7 v0 / A14 — M1-lite usage preview for the studio (aggregated `usage_events`, non-binding).
   */
  app.get("/api/v1/creator/analytics/usage-preview", async (req: Request, res: Response) => {
    const traceId = traceIdFrom(req);
    if (!config.prisma) {
      return res.status(503).json(
        errorEnvelope("SERVICE_UNAVAILABLE", "Database not configured.", traceId)
      );
    }
    try {
      const { context } = await requireAccountWithRole(
        req,
        { prisma: config.prisma, identityService },
        "creator"
      );
      const relayCreatorId = context.primaryRelayCreatorId?.trim();
      if (!relayCreatorId) {
        return res.status(404).json(
          errorEnvelope(
            "NOT_FOUND",
            "No creator studio — call POST /api/v1/creator/workspace first.",
            traceId
          )
        );
      }
      const rawDays =
        typeof req.query.days === "string" ? Number.parseInt(req.query.days, 10) : 30;
      const days = Math.min(Math.max(Number.isFinite(rawDays) ? rawDays : 30, 1), 366);

      const payload = await getCreatorUsagePreview(config.prisma, relayCreatorId, days);
      if (!payload) {
        return res
          .status(404)
          .json(errorEnvelope("NOT_FOUND", "Creator tenant missing.", traceId));
      }

      res.setHeader("Cache-Control", "private, no-store");
      return res.status(200).json(successEnvelope(payload, traceId));
    } catch (err) {
      if (sendRelayAuthError(res, err, traceId)) return;
      return res.status(500).json(errorEnvelope("INTERNAL", (err as Error).message, traceId));
    }
  });

  app.patch(
    "/api/v1/creator/profile",
    async (req: Request, res: Response, next) => {
      const traceId = traceIdFrom(req);
      if (!config.prisma) {
        return res.status(503).json(
          errorEnvelope("SERVICE_UNAVAILABLE", "Database not configured.", traceId)
        );
      }
      try {
        const { context } = await requireAccountWithRole(req, { prisma: config.prisma, identityService }, "creator");
        (req as Request & { relayRateLimitKey?: string }).relayRateLimitKey = context.accountId;
        next();
      } catch (err) {
        if (sendRelayAuthError(res, err, traceId)) return;
        return res.status(500).json(errorEnvelope("INTERNAL", (err as Error).message, traceId));
      }
    },
    creatorProfileMutate,
    buildIdem("creator-profile-patch"),
    async (req: Request, res: Response) => {
      const traceId = traceIdFrom(req);
      if (!config.prisma) {
        return res.status(503).json(
          errorEnvelope("SERVICE_UNAVAILABLE", "Database not configured.", traceId)
        );
      }
      try {
        const { context } = await requireAccountWithRole(req, { prisma: config.prisma, identityService }, "creator");
        const body = (req.body ?? {}) as Record<string, unknown>;
        const patch = {
          username: readOptionalString(body.username),
          display_name: readOptionalString(body.display_name),
          bio: readOptionalString(body.bio),
          avatar_url: readOptionalString(body.avatar_url),
          banner_url: readOptionalString(body.banner_url),
          discipline: readOptionalString(body.discipline)
        };
        const hasAny = Object.values(patch).some((v) => v !== undefined);
        if (!hasAny) {
          return res
            .status(400)
            .json(errorEnvelope("VALIDATION_ERROR", "No updatable fields in body.", traceId));
        }
        const result = await patchCreatorIdentity(config.prisma, context.accountId, patch);
        if (!result.ok) {
          const status = result.code === "CONFLICT" ? 409 : result.code === "NOT_FOUND" ? 404 : 400;
          return res.status(status).json(errorEnvelope(result.code, result.message, traceId));
        }
        res.setHeader("Cache-Control", "private, no-store");
        return res.status(200).json(successEnvelope(result.profile, traceId));
      } catch (err) {
        if (sendRelayAuthError(res, err, traceId)) return;
        return res.status(500).json(errorEnvelope("INTERNAL", (err as Error).message, traceId));
      }
    }
  );

  // PUBLIC: Resolve creator identity + profile card by public slug (no auth; `/patron/c`, share links).
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
    const profile = await config.prisma.creatorProfile.findFirst({
      where: { tenant: { relayCreatorId: resolved.relayCreatorId } },
      select: {
        username: true,
        displayName: true,
        avatarUrl: true,
        bannerUrl: true,
        bio: true,
        discipline: true
      }
    });
    res.setHeader("Cache-Control", "public, max-age=60, s-maxage=60");
    return res.status(200).json(
      successEnvelope(
        {
          public_slug: resolved.publicSlug ?? "",
          relay_creator_id: resolved.relayCreatorId,
          username: profile?.username ?? null,
          display_name: profile?.displayName ?? null,
          avatar_url: profile?.avatarUrl ?? null,
          banner_url: profile?.bannerUrl ?? null,
          bio: profile?.bio ?? null,
          discipline: profile?.discipline ?? null
        },
        traceId
      )
    );
  });

  // PUBLIC: Creator gallery layout by public slug — no auth (visitor / patron/c/[handle] surfaces).
  /**
   * Public gallery layout for a creator slug (no auth). Unknown slug → 404.
   * When the gallery was never published, `published` is false and `layout` is null.
   */
  app.get("/api/v1/public/creators/:slug/gallery-layout", async (req: Request, res: Response) => {
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
    const row = await config.prisma.pageLayout.findUnique({
      where: { creatorId: resolved.relayCreatorId },
      select: { publishedAt: true }
    });
    if (!row?.publishedAt) {
      res.setHeader("Cache-Control", "private, no-store");
      return res.status(200).json(
        successEnvelope(
          {
            published: false,
            relay_creator_id: resolved.relayCreatorId,
            public_slug: resolved.publicSlug ?? "",
            layout: null
          },
          traceId
        )
      );
    }
    const layout = await layoutStore.load(resolved.relayCreatorId);
    res.setHeader("Cache-Control", "public, max-age=60, s-maxage=60");
    return res.status(200).json(
      successEnvelope(
        {
          published: true,
          relay_creator_id: resolved.relayCreatorId,
          public_slug: resolved.publicSlug ?? "",
          layout
        },
        traceId
      )
    );
  });

  /**
   * PE-K Rest (BO-P4-04) — public patron profile lookup for `/p/[handle]`.
   *
   * No auth required. Returns the same null-shaped 404 for both "private profile" and "no
   * such handle" responses to prevent enumeration. Cache-Control allows brief CDN caching;
   * matches the public creator slug pattern.
   *
   * Out of scope for v1: rate limiting (low traffic surface, public CDN absorbs scrapers),
   * follow-from-here action (PE-C account-follows already has its own endpoint), entitlement-
   * gated content (this is a profile, not a feed).
   */
  app.get("/api/v1/public/patrons/:handle", async (req: Request, res: Response) => {
    const traceId = traceIdFrom(req);
    if (!config.prisma) {
      return res.status(503).json(
        errorEnvelope("SERVICE_UNAVAILABLE", "Database not configured.", traceId)
      );
    }
    const raw = typeof req.params.handle === "string" ? req.params.handle : "";
    const profile = await getPublicPatronProfileByHandle(config.prisma, raw);
    if (!profile) {
      return res.status(404).json(errorEnvelope("NOT_FOUND", "Profile not found.", traceId));
    }
    // is_curator is live entitlement — avoid CDN stale badge after lapse.
    res.setHeader("Cache-Control", "private, no-store");
    return res.status(200).json(successEnvelope(profile, traceId));
  });

  /**
   * Public patron saved-collection detail — entries carry live viewer_entitlement for the caller.
   * Optional Bearer/cookie session; unauthenticated callers see gated entries as locked.
   */
  app.get(
    "/api/v1/public/patron-collections/:collection_id",
    async (req: Request, res: Response) => {
      const traceId = traceIdFrom(req);
      if (!config.prisma) {
        return res.status(503).json(
          errorEnvelope("SERVICE_UNAVAILABLE", "Database not configured.", traceId)
        );
      }
      const collectionId =
        typeof req.params.collection_id === "string" ? req.params.collection_id.trim() : "";
      if (!collectionId) {
        return res.status(404).json(errorEnvelope("NOT_FOUND", "Collection not found.", traceId));
      }
      const bearer = req.header("authorization")?.replace(/^Bearer\s+/i, "").trim() ?? "";
      const fromCookie = readSessionCookie(req)?.trim() ?? "";
      const opaque = bearer || fromCookie;
      let viewerAccountId: string | null = null;
      if (opaque) {
        const session = await identityService.resolveSession(opaque);
        if (session && config.prisma) {
          viewerAccountId = await getAccountIdForSession(config.prisma, session);
        }
      }
      const detail = await getPublicPatronCollectionDetail(
        config.prisma,
        collectionId,
        viewerAccountId
      );
      if (!detail) {
        return res.status(404).json(errorEnvelope("NOT_FOUND", "Collection not found.", traceId));
      }
      res.setHeader("Cache-Control", "private, no-store");
      return res.status(200).json(successEnvelope(detail, traceId));
    }
  );

  /**
   * Public delivery for patron profile avatar/banner objects in R2.
   * Readable when the profile is public and references the asset, or by the owning account.
   */
  app.get(
    "/api/v1/public/patron-profile-assets/:account_id/:kind/:asset_id/content",
    async (req: Request, res: Response) => {
      const traceId = traceIdFrom(req);
      if (!config.prisma) {
        return res.status(503).json(
          errorEnvelope("SERVICE_UNAVAILABLE", "Database not configured.", traceId)
        );
      }
      const accountId =
        typeof req.params.account_id === "string" ? req.params.account_id.trim() : "";
      const kindRaw = typeof req.params.kind === "string" ? req.params.kind.trim() : "";
      const assetId = typeof req.params.asset_id === "string" ? req.params.asset_id.trim() : "";
      if (!accountId || !isPatronProfileAssetKind(kindRaw) || !assetId) {
        return res.status(404).json(errorEnvelope("NOT_FOUND", "Asset not found.", traceId));
      }
      const bearer = req.header("authorization")?.replace(/^Bearer\s+/i, "").trim() ?? "";
      const fromCookie = readSessionCookie(req)?.trim() ?? "";
      const opaque = bearer || fromCookie;
      const session = opaque ? await identityService.resolveSession(opaque) : null;
      let sessionAccountId: string | null = null;
      if (session && config.prisma) {
        if (session.kind === "extension") {
          void identityService.touchSessionExpiry(opaque).catch(() => {});
        }
        await applyRelayAccountRlsIfPresent(config.prisma, session);
        sessionAccountId = await getAccountIdForSession(config.prisma, session);
      }
      const allowed = await mayReadPatronProfileAsset({
        prisma: config.prisma,
        accountId,
        kind: kindRaw,
        assetId,
        sessionAccountId,
      });
      if (!allowed) {
        return res.status(404).json(errorEnvelope("NOT_FOUND", "Asset not found.", traceId));
      }
      const r2 = getR2ClientConfigFromEnv();
      if (!r2) {
        return res.status(503).json(
          errorEnvelope("SERVICE_UNAVAILABLE", "Object storage is not configured.", traceId)
        );
      }
      const payload = await getPatronProfileAssetBytes({
        r2,
        accountId,
        kind: kindRaw,
        assetId,
      });
      if (!payload) {
        return res.status(404).json(errorEnvelope("NOT_FOUND", "Asset not found.", traceId));
      }
      res.setHeader("content-type", payload.contentType);
      res.setHeader("cache-control", "public, max-age=3600");
      res.setHeader("content-length", String(payload.buffer.byteLength));
      return res.status(200).send(payload.buffer);
    }
  );

  /**
   * Patron home (fan Relay): feed + sidebar bundle. Requires Bearer session from patron OAuth.
   * PE-B: when `RELAY_DB_STORE_IDENTITY` + Prisma are enabled, assembles from `PatronFollow` × `Post` ×
   * `PatronEntitlementSnapshot` with tier checks; otherwise serves fixture JSON from the repo.
   *
   * Query: `cursor` (opaque), `limit` (default 30, max 100), `filter` (`all`|`following`|`free`|`photos`|`audio`|`writing`).
   */
  async function handlePatronFeedGet(req: Request, res: Response, traceId: string) {
    const session = await requirePatronBearerSession(req, res, traceId);
    if (!session) {
      return;
    }
    try {
      if (useDbIdentityStore(config) && config.prisma) {
        const user = await identityStore.getUser(session.user_id);
        const rawLimit = req.query.limit;
        const limitStr =
          typeof rawLimit === "string"
            ? rawLimit
            : Array.isArray(rawLimit) && typeof rawLimit[0] === "string"
              ? rawLimit[0]
              : "";
        const parsedLimit = Number.parseInt(String(limitStr), 10);
        const limit =
          Number.isFinite(parsedLimit) && parsedLimit > 0
            ? Math.min(parsedLimit, PATRON_FEED_MAX_LIMIT)
            : PATRON_FEED_DEFAULT_LIMIT;
        const rawCursor = req.query.cursor;
        const cursor =
          typeof rawCursor === "string"
            ? rawCursor
            : Array.isArray(rawCursor) && typeof rawCursor[0] === "string"
              ? rawCursor[0]
              : undefined;
        const rawFilter = req.query.filter;
        const filterParam =
          typeof rawFilter === "string"
            ? rawFilter
            : Array.isArray(rawFilter) && typeof rawFilter[0] === "string"
              ? rawFilter[0]
              : undefined;
        const data = await assemblePatronFeed({
          prisma: config.prisma,
          patronMembershipId: session.user_id,
          viewerEmail: user?.email ?? null,
          limit,
          cursor: cursor ?? null,
          filter: parsePatronFeedFilter(filterParam),
          hideMatureContent: await loadPatronHideMatureContent(config.prisma, session.user_id)
        });
        res.setHeader("Cache-Control", "private, no-store");
        return res.status(200).json(successEnvelope(data, traceId));
      }
      // Non-DB identity: static fixture (web/lib/patron-relay-feed-bundle.json). No env toggle.
      const data = loadPatronRelayFeedBundleFromRepo();
      res.setHeader("Cache-Control", "private, no-store");
      return res.status(200).json(successEnvelope(data, traceId));
    } catch (error) {
      return res
        .status(500)
        .json(errorEnvelope("INTERNAL", (error as Error).message, traceId));
    }
  }

  app.get("/api/v1/patron/relay_feed", async (req: Request, res: Response) => {
    const traceId = traceIdFrom(req);
    return handlePatronFeedGet(req, res, traceId);
  });

  app.get("/api/v1/patron/feed", async (req: Request, res: Response) => {
    const traceId = traceIdFrom(req);
    return handlePatronFeedGet(req, res, traceId);
  });

  /**
   * PE-S (PGS-03) — Patron global search over followed creators (accessible + locked bins).
   *
   * Query: `q` (required, min 2 chars), `limit` (default 20, max 50), `cursor` (opaque),
   * `section` (`accessible` | `locked`; which bin `cursor` advances — default `accessible`),
   * `media_filter` (`all` | `photo` | `video` | `writing`; aliases `image`, `text`),
   * `sort` (`newest` | `oldest`; default `newest`),
   * `creator_id` (repeatable) or `creator_ids` (comma-separated) to scope to followed creators,
   * `q` optional when at least one `creator_id` is set (creator browse mode).
   */
  app.get("/api/v1/patron/search", async (req: Request, res: Response) => {
    const traceId = traceIdFrom(req);
    const session = await requirePatronBearerSession(req, res, traceId);
    if (!session) return;
    if (!useDbIdentityStore(config) || !config.prisma) {
      return res.status(503).json(
        errorEnvelope(
          "NOT_AVAILABLE",
          "Patron search requires database-backed identity (RELAY_DB_STORE_IDENTITY).",
          traceId
        )
      );
    }

    const rawQ = typeof req.query.q === "string" ? req.query.q : "";
    const rawLimit = req.query.limit;
    const limitStr =
      typeof rawLimit === "string"
        ? rawLimit
        : Array.isArray(rawLimit) && typeof rawLimit[0] === "string"
          ? rawLimit[0]
          : "";
    const parsedLimit = Number.parseInt(String(limitStr), 10);
    const limit =
      Number.isFinite(parsedLimit) && parsedLimit > 0
        ? Math.min(parsedLimit, PATRON_SEARCH_MAX_LIMIT)
        : PATRON_SEARCH_DEFAULT_LIMIT;

    const rawCursor = req.query.cursor;
    const cursor =
      typeof rawCursor === "string"
        ? rawCursor
        : Array.isArray(rawCursor) && typeof rawCursor[0] === "string"
          ? rawCursor[0]
          : undefined;

    const rawSection = req.query.section;
    const sectionRaw =
      typeof rawSection === "string"
        ? rawSection
        : Array.isArray(rawSection) && typeof rawSection[0] === "string"
          ? rawSection[0]
          : undefined;
    const section: "accessible" | "locked" =
      sectionRaw === "locked" ? "locked" : "accessible";

    const rawMediaFilter = req.query.media_filter ?? req.query.media;
    const mediaFilterRaw =
      typeof rawMediaFilter === "string"
        ? rawMediaFilter
        : Array.isArray(rawMediaFilter) && typeof rawMediaFilter[0] === "string"
          ? rawMediaFilter[0]
          : undefined;
    const media_filter = normalizePatronSearchMediaFilter(mediaFilterRaw);

    const rawSort = req.query.sort;
    const sortRaw =
      typeof rawSort === "string"
        ? rawSort
        : Array.isArray(rawSort) && typeof rawSort[0] === "string"
          ? rawSort[0]
          : undefined;
    const sort = normalizePatronSearchSort(sortRaw);

    const rawCreatorId = req.query.creator_id;
    const rawCreatorIdsCsv =
      typeof req.query.creator_ids === "string"
        ? req.query.creator_ids
        : Array.isArray(req.query.creator_ids) && typeof req.query.creator_ids[0] === "string"
          ? req.query.creator_ids[0]
          : undefined;
    const creator_ids = parsePatronSearchCreatorIdsFromQuery(
      rawCreatorId as string | string[] | undefined,
      rawCreatorIdsCsv
    );

    try {
      const data = await assemblePatronSearch({
        prisma: config.prisma,
        patronMembershipId: session.user_id,
        q: rawQ,
        limit,
        cursor: cursor ?? null,
        section,
        media_filter,
        sort,
        creator_ids,
        hideMatureContent: await loadPatronHideMatureContent(config.prisma, session.user_id)
      });
      res.setHeader("Cache-Control", "private, no-store");
      return res.status(200).json(successEnvelope(data, traceId));
    } catch (error) {
      if (error instanceof PatronSearchValidationError) {
        return res.status(400).json(errorEnvelope(error.code, error.message, traceId));
      }
      return res
        .status(500)
        .json(errorEnvelope("INTERNAL", (error as Error).message, traceId));
    }
  });

  /**
   * PE-A — Patron supporter profile + onboarding step for the session membership (`session.user_id`).
   */
  app.get("/api/v1/patron/me", async (req: Request, res: Response) => {
    const traceId = traceIdFrom(req);
    const session = await requirePatronBearerSession(req, res, traceId);
    if (!session) return;
    if (!useDbIdentityStore(config) || !config.prisma) {
      return res.status(503).json(
        errorEnvelope(
          "NOT_AVAILABLE",
          "Patron profile API requires database-backed identity (RELAY_DB_STORE_IDENTITY).",
          traceId
        )
      );
    }
    try {
      const profile = await getPatronProfileViewForMembership(config.prisma, session.user_id);
      res.setHeader("Cache-Control", "private, no-store");
      return res.status(200).json(successEnvelope(profile, traceId));
    } catch (error) {
      return res
        .status(500)
        .json(errorEnvelope("INTERNAL", (error as Error).message, traceId));
    }
  });

  /** MB-14 — "Your support this month" patronage summary (ledger truth). */
  app.get("/api/v1/patron/me/support-summary", async (req: Request, res: Response) => {
    const traceId = traceIdFrom(req);
    if (!isFanPremiumEnabled()) {
      return res
        .status(404)
        .json(errorEnvelope("NOT_FOUND", "Fan premium is not enabled.", traceId));
    }
    const session = await requirePatronBearerSession(req, res, traceId);
    if (!session) return;
    if (!useDbIdentityStore(config) || !config.prisma) {
      return res.status(503).json(
        errorEnvelope(
          "NOT_AVAILABLE",
          "Support summary requires database-backed identity (RELAY_DB_STORE_IDENTITY).",
          traceId
        )
      );
    }
    try {
      const accountId = await getAccountIdForSession(config.prisma, session);
      if (!accountId) {
        return res.status(401).json(errorEnvelope("UNAUTHORIZED", "No account for session.", traceId));
      }
      const summary = await getCuratorSupportSummary(config.prisma, accountId);
      if (!summary) {
        return res
          .status(404)
          .json(errorEnvelope("NOT_FOUND", "Fan premium is not enabled.", traceId));
      }
      res.setHeader("Cache-Control", "private, no-store");
      return res.status(200).json(successEnvelope(summary, traceId));
    } catch (error) {
      return res
        .status(500)
        .json(errorEnvelope("INTERNAL", (error as Error).message, traceId));
    }
  });

  app.patch(
    "/api/v1/patron/me",
    async (req: Request, res: Response, next) => {
      const traceId = traceIdFrom(req);
      const session = await requirePatronBearerSession(req, res, traceId);
      if (!session) return;
      const rateKey =
        (config.prisma ? await getAccountIdForSession(config.prisma, session) : null) ??
        session.user_id;
      (req as Request & { relayRateLimitKey?: string }).relayRateLimitKey = rateKey;
      next();
    },
    patronProfileMutate,
    buildIdem("patron-me-patch"),
    async (req: Request, res: Response) => {
    const traceId = traceIdFrom(req);
    const session = await requirePatronBearerSession(req, res, traceId);
    if (!session) return;
    if (!useDbIdentityStore(config) || !config.prisma) {
      return res.status(503).json(
        errorEnvelope(
          "NOT_AVAILABLE",
          "Patron profile API requires database-backed identity (RELAY_DB_STORE_IDENTITY).",
          traceId
        )
      );
    }
    const body = (req.body ?? {}) as Record<string, unknown>;
    const patch = {
      handle: readOptionalString(body.handle),
      display_name: readOptionalString(body.display_name),
      bio: readOptionalString(body.bio),
      avatar_url: readOptionalString(body.avatar_url),
      banner_url: readOptionalString(body.banner_url),
      is_public: readOptionalBoolean(body.is_public),
      onboarding_step: readOptionalInt(body.onboarding_step),
      notification_digest_enabled: readOptionalBoolean(body.notification_digest_enabled),
      notification_digest_cadence: readOptionalString(body.notification_digest_cadence),
      notification_digest_slot: readOptionalString(body.notification_digest_slot),
      notification_digest_timezone: readOptionalString(body.notification_digest_timezone),
      hide_mature_content: readOptionalBoolean(body.hide_mature_content),
    };
    const hasAny = Object.values(patch).some((v) => v !== undefined);
    if (!hasAny) {
      return res
        .status(400)
        .json(errorEnvelope("VALIDATION_ERROR", "No updatable fields in body.", traceId));
    }
    try {
      const result = await patchPatronProfileForMembership(config.prisma, session.user_id, patch);
      if (!result.ok) {
        const status = result.code === "CONFLICT" ? 409 : 400;
        return res.status(status).json(errorEnvelope(result.code, result.message, traceId));
      }
      res.setHeader("Cache-Control", "private, no-store");
      return res.status(200).json(successEnvelope(result.profile, traceId));
    } catch (error) {
      return res
        .status(500)
        .json(errorEnvelope("INTERNAL", (error as Error).message, traceId));
    }
    }
  );

  /**
   * Patron profile avatar/banner — presigned R2 upload (account-scoped, image/* only).
   * Commit returns a public URL path; PATCH /patron/me stores it on the profile row.
   */
  app.post("/api/v1/patron/profile/upload/init", async (req: Request, res: Response) => {
    const traceId = traceIdFrom(req);
    if (!config.prisma) {
      return res
        .status(503)
        .json(errorEnvelope("SERVICE_UNAVAILABLE", "Database not configured.", traceId));
    }
    const session = await requirePatronBearerSession(req, res, traceId);
    if (!session) return;
    const accountId = await getAccountIdForSession(config.prisma, session);
    if (!accountId) {
      return res
        .status(403)
        .json(errorEnvelope("FORBIDDEN", "No account for session.", traceId));
    }
    const body = (req.body ?? {}) as Record<string, unknown>;
    const kindRaw = typeof body.kind === "string" ? body.kind.trim() : "";
    const contentType = typeof body.content_type === "string" ? body.content_type.trim() : "";
    const byteSize =
      typeof body.byte_size === "number" && Number.isFinite(body.byte_size) ? body.byte_size : -1;
    if (!isPatronProfileAssetKind(kindRaw) || !contentType || byteSize < 0) {
      return res.status(400).json(
        errorEnvelope(
          "VALIDATION_ERROR",
          "kind (avatar|banner), content_type, byte_size (number) are required.",
          traceId
        )
      );
    }
    const r2 = getR2ClientConfigFromEnv();
    if (!r2) {
      return res.status(503).json(
        errorEnvelope(
          "SERVICE_UNAVAILABLE",
          "Object storage (R2) is not configured. See .env.example.",
          traceId
        )
      );
    }
    try {
      const result = await initPatronProfileImageUpload({
        accountId,
        kind: kindRaw,
        contentType,
        byteSize,
        r2,
      });
      if (!result.ok) {
        return res.status(400).json(errorEnvelope(result.code, result.message, traceId));
      }
      res.setHeader("Cache-Control", "private, no-store");
      return res.status(201).json(
        successEnvelope(
          {
            asset_id: result.asset_id,
            storage_key: result.storage_key,
            byte_size: byteSize,
            upload: result.upload,
            expires_in_sec: result.expires_in_sec,
          },
          traceId
        )
      );
    } catch (error) {
      return res
        .status(500)
        .json(errorEnvelope("INTERNAL", (error as Error).message, traceId));
    }
  });

  app.post("/api/v1/patron/profile/upload/commit", async (req: Request, res: Response) => {
    const traceId = traceIdFrom(req);
    if (!config.prisma) {
      return res
        .status(503)
        .json(errorEnvelope("SERVICE_UNAVAILABLE", "Database not configured.", traceId));
    }
    const session = await requirePatronBearerSession(req, res, traceId);
    if (!session) return;
    const accountId = await getAccountIdForSession(config.prisma, session);
    if (!accountId) {
      return res
        .status(403)
        .json(errorEnvelope("FORBIDDEN", "No account for session.", traceId));
    }
    const body = (req.body ?? {}) as Record<string, unknown>;
    const kindRaw = typeof body.kind === "string" ? body.kind.trim() : "";
    const assetId = typeof body.asset_id === "string" ? body.asset_id.trim() : "";
    const contentType = typeof body.content_type === "string" ? body.content_type.trim() : "";
    const byteSize =
      typeof body.byte_size === "number" && Number.isFinite(body.byte_size) ? body.byte_size : -1;
    if (!isPatronProfileAssetKind(kindRaw) || !assetId || !contentType || byteSize < 0) {
      return res.status(400).json(
        errorEnvelope(
          "VALIDATION_ERROR",
          "kind (avatar|banner), asset_id, content_type, byte_size (number) are required.",
          traceId
        )
      );
    }
    const r2 = getR2ClientConfigFromEnv();
    if (!r2) {
      return res.status(503).json(
        errorEnvelope(
          "SERVICE_UNAVAILABLE",
          "Object storage (R2) is not configured. See .env.example.",
          traceId
        )
      );
    }
    try {
      const result = await commitPatronProfileImageUpload({
        accountId,
        kind: kindRaw,
        assetId,
        contentType,
        byteSize,
        r2,
      });
      if (!result.ok) {
        const status = result.code === "NOT_FOUND" ? 404 : 400;
        return res.status(status).json(errorEnvelope(result.code, result.message, traceId));
      }
      res.setHeader("Cache-Control", "private, no-store");
      return res.status(200).json(
        successEnvelope(
          {
            asset_id: result.asset_id,
            public_url_path: result.public_url_path,
            content_length: result.content_length,
          },
          traceId
        )
      );
    } catch (error) {
      return res
        .status(500)
        .json(errorEnvelope("INTERNAL", (error as Error).message, traceId));
    }
  });

  /**
   * PE-C — Follow graph for the session membership (`session.user_id`): list Relay creators
   * this patron follows (ingest / gallery `relay_creator_id`).
   */
  app.get("/api/v1/patron/follows", async (req: Request, res: Response) => {
    const traceId = traceIdFrom(req);
    const session = await requirePatronBearerSession(req, res, traceId);
    if (!session) return;
    if (!useDbIdentityStore(config) || !config.prisma) {
      return res.status(503).json(
        errorEnvelope(
          "NOT_AVAILABLE",
          "Patron follows API requires database-backed identity (RELAY_DB_STORE_IDENTITY).",
          traceId
        )
      );
    }
    try {
      const items = await listPatronFollowsForMembership(config.prisma, session.user_id);
      res.setHeader("Cache-Control", "private, no-store");
      return res.status(200).json(successEnvelope({ items }, traceId));
    } catch (error) {
      return res
        .status(500)
        .json(errorEnvelope("INTERNAL", (error as Error).message, traceId));
    }
  });

  app.post(
    "/api/v1/patron/follows",
    async (req: Request, res: Response, next) => {
      const traceId = traceIdFrom(req);
      const session = await requirePatronBearerSession(req, res, traceId);
      if (!session) return;
      if (!useDbIdentityStore(config) || !config.prisma) {
        return res.status(503).json(
          errorEnvelope(
            "NOT_AVAILABLE",
            "Patron follows API requires database-backed identity (RELAY_DB_STORE_IDENTITY).",
            traceId
          )
        );
      }
      const rateKey =
        (await getAccountIdForSession(config.prisma, session)) ?? session.user_id;
      (req as Request & { relayRateLimitKey?: string }).relayRateLimitKey = rateKey;
      next();
    },
    patronFollowMutate,
    buildIdem("patron-follow-add"),
    async (req: Request, res: Response) => {
      const traceId = traceIdFrom(req);
      const body = (req.body ?? {}) as Record<string, unknown>;
      const details = validateRequiredFields(body, ["relay_creator_id"]);
      if (details.length > 0) {
        return res
          .status(400)
          .json(errorEnvelope("VALIDATION_ERROR", "Invalid request.", traceId, details));
      }
      const relayCreatorId = String(body.relay_creator_id).trim();
      if (!relayCreatorId) {
        return res.status(400).json(
          errorEnvelope("VALIDATION_ERROR", "relay_creator_id must be non-empty.", traceId, [
            { field: "relay_creator_id", issue: "invalid" }
          ])
        );
      }
      const session = await requirePatronBearerSession(req, res, traceId);
      if (!session) return;
      const prisma = config.prisma;
      if (!prisma) return;
      try {
        const result = await addPatronFollowForMembership(
          prisma,
          session.user_id,
          relayCreatorId
        );
        if (!result) {
          return res.status(404).json(
            errorEnvelope(
              "UNKNOWN_CREATOR_ID",
              "relay_creator_id does not match any provisioned studio.",
              traceId,
              [{ field: "relay_creator_id", issue: "unknown" }]
            )
          );
        }
        res.setHeader("Cache-Control", "private, no-store");
        return res.status(200).json(successEnvelope(result, traceId));
      } catch (error) {
        return res
          .status(500)
          .json(errorEnvelope("INTERNAL", (error as Error).message, traceId));
      }
    }
  );

  app.delete(
    "/api/v1/patron/follows",
    async (req: Request, res: Response, next) => {
      const traceId = traceIdFrom(req);
      const session = await requirePatronBearerSession(req, res, traceId);
      if (!session) return;
      if (!useDbIdentityStore(config) || !config.prisma) {
        return res.status(503).json(
          errorEnvelope(
            "NOT_AVAILABLE",
            "Patron follows API requires database-backed identity (RELAY_DB_STORE_IDENTITY).",
            traceId
          )
        );
      }
      const rateKey =
        (await getAccountIdForSession(config.prisma, session)) ?? session.user_id;
      (req as Request & { relayRateLimitKey?: string }).relayRateLimitKey = rateKey;
      next();
    },
    patronFollowMutate,
    async (req: Request, res: Response) => {
      const traceId = traceIdFrom(req);
      const body = (req.body ?? {}) as Record<string, unknown>;
      const q =
        typeof req.query.relay_creator_id === "string" ? req.query.relay_creator_id.trim() : "";
      const relayCreatorId =
        (typeof body.relay_creator_id === "string" ? body.relay_creator_id.trim() : "") || q;
      if (!relayCreatorId) {
        return res.status(400).json(
          errorEnvelope(
            "VALIDATION_ERROR",
            "relay_creator_id is required (body or query).",
            traceId,
            [{ field: "relay_creator_id", issue: "missing" }]
          )
        );
      }
      const session = await requirePatronBearerSession(req, res, traceId);
      if (!session) return;
      const prisma = config.prisma;
      if (!prisma) return;
      try {
        const removed = await removePatronFollowForMembership(
          prisma,
          session.user_id,
          relayCreatorId
        );
        if (!removed) {
          return res.status(404).json(errorEnvelope("NOT_FOUND", "Follow not found.", traceId));
        }
        res.setHeader("Cache-Control", "private, no-store");
        return res.status(200).json(successEnvelope({ deleted: true }, traceId));
      } catch (error) {
        return res
          .status(500)
          .json(errorEnvelope("INTERNAL", (error as Error).message, traceId));
      }
    }
  );

  /**
   * PE-C (C3) — Account-level follows: other Relay supporters this patron account follows.
   */
  app.get("/api/v1/patron/account-follows", async (req: Request, res: Response) => {
    const traceId = traceIdFrom(req);
    const session = await requirePatronBearerSession(req, res, traceId);
    if (!session) return;
    if (!useDbIdentityStore(config) || !config.prisma) {
      return res.status(503).json(
        errorEnvelope(
          "NOT_AVAILABLE",
          "Patron account-follows API requires database-backed identity (RELAY_DB_STORE_IDENTITY).",
          traceId
        )
      );
    }
    const accountId = await getAccountIdForSession(config.prisma, session);
    if (!accountId) {
      return res.status(503).json(
        errorEnvelope(
          "NOT_AVAILABLE",
          "Could not resolve Relay account for this session.",
          traceId
        )
      );
    }
    try {
      const items = await listAccountFollowsForAccount(config.prisma, accountId);
      res.setHeader("Cache-Control", "private, no-store");
      return res.status(200).json(successEnvelope({ items }, traceId));
    } catch (error) {
      return res
        .status(500)
        .json(errorEnvelope("INTERNAL", (error as Error).message, traceId));
    }
  });

  app.post(
    "/api/v1/patron/account-follows",
    async (req: Request, res: Response, next) => {
      const traceId = traceIdFrom(req);
      const session = await requirePatronBearerSession(req, res, traceId);
      if (!session) return;
      if (!useDbIdentityStore(config) || !config.prisma) {
        return res.status(503).json(
          errorEnvelope(
            "NOT_AVAILABLE",
            "Patron account-follows API requires database-backed identity (RELAY_DB_STORE_IDENTITY).",
            traceId
          )
        );
      }
      const accountId = await getAccountIdForSession(config.prisma, session);
      if (!accountId) {
        return res.status(503).json(
          errorEnvelope(
            "NOT_AVAILABLE",
            "Could not resolve Relay account for this session.",
            traceId
          )
        );
      }
      (req as Request & { relayRateLimitKey?: string }).relayRateLimitKey = accountId;
      next();
    },
    patronFollowMutate,
    buildIdem("patron-account-follow-add"),
    async (req: Request, res: Response) => {
      const traceId = traceIdFrom(req);
      const body = (req.body ?? {}) as Record<string, unknown>;
      const details = validateRequiredFields(body, ["followed_account_id"]);
      if (details.length > 0) {
        return res
          .status(400)
          .json(errorEnvelope("VALIDATION_ERROR", "Invalid request.", traceId, details));
      }
      const followedAccountId = String(body.followed_account_id).trim();
      if (!followedAccountId) {
        return res.status(400).json(
          errorEnvelope(
            "VALIDATION_ERROR",
            "followed_account_id must be non-empty.",
            traceId,
            [{ field: "followed_account_id", issue: "invalid" }]
          )
        );
      }
      const session = await requirePatronBearerSession(req, res, traceId);
      if (!session) return;
      const prisma = config.prisma;
      if (!prisma) return;
      const accountId = await getAccountIdForSession(prisma, session);
      if (!accountId) {
        return res.status(503).json(
          errorEnvelope(
            "NOT_AVAILABLE",
            "Could not resolve Relay account for this session.",
            traceId
          )
        );
      }
      if (followedAccountId === accountId) {
        return res.status(400).json(
          errorEnvelope(
            "VALIDATION_ERROR",
            "Cannot follow your own account.",
            traceId,
            [{ field: "followed_account_id", issue: "self_follow" }]
          )
        );
      }
      try {
        const result = await addAccountFollowForAccount(prisma, accountId, followedAccountId);
        if (!result) {
          return res.status(404).json(
            errorEnvelope(
              "UNKNOWN_ACCOUNT_ID",
              "followed_account_id does not match any Relay account.",
              traceId,
              [{ field: "followed_account_id", issue: "unknown" }]
            )
          );
        }
        res.setHeader("Cache-Control", "private, no-store");
        return res.status(200).json(successEnvelope(result, traceId));
      } catch (error) {
        return res
          .status(500)
          .json(errorEnvelope("INTERNAL", (error as Error).message, traceId));
      }
    }
  );

  app.delete(
    "/api/v1/patron/account-follows",
    async (req: Request, res: Response, next) => {
      const traceId = traceIdFrom(req);
      const session = await requirePatronBearerSession(req, res, traceId);
      if (!session) return;
      if (!useDbIdentityStore(config) || !config.prisma) {
        return res.status(503).json(
          errorEnvelope(
            "NOT_AVAILABLE",
            "Patron account-follows API requires database-backed identity (RELAY_DB_STORE_IDENTITY).",
            traceId
          )
        );
      }
      const accountId = await getAccountIdForSession(config.prisma, session);
      if (!accountId) {
        return res.status(503).json(
          errorEnvelope(
            "NOT_AVAILABLE",
            "Could not resolve Relay account for this session.",
            traceId
          )
        );
      }
      (req as Request & { relayRateLimitKey?: string }).relayRateLimitKey = accountId;
      next();
    },
    patronFollowMutate,
    async (req: Request, res: Response) => {
      const traceId = traceIdFrom(req);
      const body = (req.body ?? {}) as Record<string, unknown>;
      const q =
        typeof req.query.followed_account_id === "string"
          ? req.query.followed_account_id.trim()
          : "";
      const followedAccountId =
        (typeof body.followed_account_id === "string" ? body.followed_account_id.trim() : "") || q;
      if (!followedAccountId) {
        return res.status(400).json(
          errorEnvelope(
            "VALIDATION_ERROR",
            "followed_account_id is required (body or query).",
            traceId,
            [{ field: "followed_account_id", issue: "missing" }]
          )
        );
      }
      const session = await requirePatronBearerSession(req, res, traceId);
      if (!session) return;
      const prisma = config.prisma;
      if (!prisma) return;
      const accountId = await getAccountIdForSession(prisma, session);
      if (!accountId) {
        return res.status(503).json(
          errorEnvelope(
            "NOT_AVAILABLE",
            "Could not resolve Relay account for this session.",
            traceId
          )
        );
      }
      try {
        const removed = await removeAccountFollowForAccount(prisma, accountId, followedAccountId);
        if (!removed) {
          return res.status(404).json(errorEnvelope("NOT_FOUND", "Follow not found.", traceId));
        }
        res.setHeader("Cache-Control", "private, no-store");
        return res.status(200).json(successEnvelope({ deleted: true }, traceId));
      } catch (error) {
        return res
          .status(500)
          .json(errorEnvelope("INTERNAL", (error as Error).message, traceId));
      }
    }
  );

  // -----------------------------------------------------------------------------
  // PE-D / BO-P2-01 — viewer-aware enrichment helpers (live re-check, no freeze).
  // -----------------------------------------------------------------------------

  /**
   * Resolve the patron's CURRENT entitled tier ids for a creator. Used to write a forensic
   * `snapshot_tier_ids` value at favorite/save time. NEVER consulted at render time.
   */
  async function captureForensicSnapshotTierIds(
    session: SessionToken,
    creatorId: string
  ): Promise<string[]> {
    if (!config.prisma) {
      // File-backed identity has no PatronEntitlementSnapshot rows; fall back to the session's
      // tier_ids as a best-effort forensic record.
      return [...(session.tier_ids ?? [])];
    }
    try {
      const accountId = await getAccountIdForSession(config.prisma, session);
      return await resolveCurrentEntitledTierIdsForAccount(
        config.prisma,
        accountId,
        creatorId
      );
    } catch {
      return [];
    }
  }

  /**
   * Resolve favorite rows to (source_creator_id, source_post_id) targets for the live entitlement
   * re-check. Post-kind favorites map directly; media-kind favorites are resolved to their
   * `MediaAsset.primaryPostId` (one DB query).
   */
  async function resolveFavoriteTargets(
    items: ReadonlyArray<{
      creator_id: string;
      target_kind: string;
      target_id: string;
    }>
  ): Promise<Map<string, ViewerEntitlementSourceTarget>> {
    const out = new Map<string, ViewerEntitlementSourceTarget>();
    if (items.length === 0) {
      return out;
    }

    const postRows: Array<{ idx: number; target: ViewerEntitlementSourceTarget }> = [];
    const mediaIds: string[] = [];
    const mediaIdxByCreator: Array<{ idx: number; creator: string; media: string }> = [];

    items.forEach((it, idx) => {
      if (it.target_kind === "post") {
        postRows.push({
          idx,
          target: { source_creator_id: it.creator_id, source_post_id: it.target_id }
        });
      } else if (it.target_kind === "media") {
        mediaIds.push(it.target_id);
        mediaIdxByCreator.push({ idx, creator: it.creator_id, media: it.target_id });
      }
    });

    for (const r of postRows) {
      out.set(`${r.idx}`, r.target);
    }

    if (mediaIds.length > 0 && config.prisma) {
      const mediaRows = await config.prisma.mediaAsset.findMany({
        where: { id: { in: [...new Set(mediaIds)] } },
        select: { id: true, creatorId: true, primaryPostId: true }
      });
      const mediaByKey = new Map<string, string | null>();
      for (const m of mediaRows) {
        mediaByKey.set(`${m.creatorId}\0${m.id}`, m.primaryPostId);
      }
      for (const r of mediaIdxByCreator) {
        const postId = mediaByKey.get(`${r.creator}\0${r.media}`);
        if (postId && postId.length > 0) {
          out.set(`${r.idx}`, {
            source_creator_id: r.creator,
            source_post_id: postId
          });
        }
      }
    }

    return out;
  }

  async function enrichFavoritesWithViewerEntitlement(
    items: ReadonlyArray<PatronFavoriteRecord>,
    session: SessionToken
  ): Promise<PatronFavoriteWithViewerEntitlement[]> {
    if (items.length === 0 || !config.prisma) {
      // File-backed path skips live re-check (no PatronEntitlementSnapshot rows). UI fallback
      // remains the per-route gate already in place.
      return items.map((it) => ({
        ...it,
        viewer_entitlement: {
          state: "visible",
          required_tier_ids: [],
          source: "free_post"
        }
      }));
    }
    const accountId = await getAccountIdForSession(config.prisma, session);
    const targets = await resolveFavoriteTargets(items);
    const decisions = await computeViewerEntitlementsForPostsBulk({
      prisma: config.prisma,
      viewer_account_id: accountId,
      targets: [...targets.values()]
    });
    return items.map((it, idx) => {
      const t = targets.get(`${idx}`);
      const decision = t ? decisions.get(viewerEntitlementTargetKey(t)) : undefined;
      return {
        ...it,
        viewer_entitlement: decision ?? {
          state: "locked",
          required_tier_ids: [],
          source: "missing_snapshot"
        }
      };
    });
  }

  async function enrichCollectionsWithViewerEntitlement(
    collections: ReadonlyArray<PatronCollectionRecord & { entries: PatronCollectionEntryRecord[] }>,
    session: SessionToken
  ): Promise<
    Array<
      PatronCollectionRecord & {
        entries: PatronCollectionEntryWithViewerEntitlement[];
      }
    >
  > {
    if (collections.length === 0 || !config.prisma) {
      return collections.map((c) => ({
        ...c,
        entries: c.entries.map((e) => ({
          ...e,
          viewer_entitlement: {
            state: "visible",
            required_tier_ids: [],
            source: "free_post"
          }
        }))
      }));
    }
    const accountId = await getAccountIdForSession(config.prisma, session);
    const targets: ViewerEntitlementSourceTarget[] = [];
    for (const c of collections) {
      for (const e of c.entries) {
        targets.push({ source_creator_id: e.creator_id, source_post_id: e.post_id });
      }
    }
    const decisions = await computeViewerEntitlementsForPostsBulk({
      prisma: config.prisma,
      viewer_account_id: accountId,
      targets
    });
    return collections.map((c) => ({
      ...c,
      entries: c.entries.map((e) => ({
        ...e,
        viewer_entitlement:
          decisions.get(
            viewerEntitlementTargetKey({
              source_creator_id: e.creator_id,
              source_post_id: e.post_id
            })
          ) ?? {
            state: "locked",
            required_tier_ids: [],
            source: "missing_snapshot"
          }
      }))
    }));
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
    if (!(await requirePatronForCreatorId(req, res, traceId, session, creatorId))) {
      return;
    }
    const items = await patronFavoritesStore.listForUser(creatorId, session.user_id);
    const enriched = await enrichFavoritesWithViewerEntitlement(items, session);
    res.setHeader("Cache-Control", "private, no-store");
    return res.status(200).json(successEnvelope({ items: enriched }, traceId));
  });

  app.put(
    "/api/v1/patron/favorites",
    async (req: Request, res: Response, next) => {
      const traceId = traceIdFrom(req);
      const session = await requirePatronBearerSession(req, res, traceId);
      if (!session) return;
      const rateKey =
        (config.prisma ? await getAccountIdForSession(config.prisma, session) : null) ??
        session.user_id;
      (req as Request & { relayRateLimitKey?: string }).relayRateLimitKey = rateKey;
      next();
    },
    patronCollectionMutate,
    buildIdem("patron-favorites-add"),
    async (req: Request, res: Response) => {
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
    // PE-D / D29 — capture forensic snapshot of which tiers the favoriter is entitled to RIGHT
    // NOW. This is metadata only; viewer access at render time is always re-checked live against
    // the viewer's current `PatronEntitlementSnapshot`, never against this column.
    const snapshotTierIds = await captureForensicSnapshotTierIds(session, creatorId);
    const item = await patronFavoritesStore.add({
      user_id: session.user_id,
      creator_id: creatorId,
      target_kind: targetKind,
      target_id: targetId,
      snapshot_tier_ids: snapshotTierIds
    });
    res.setHeader("Cache-Control", "private, no-store");
    return res.status(200).json(successEnvelope({ item }, traceId));
    }
  );

  app.delete(
    "/api/v1/patron/favorites",
    async (req: Request, res: Response, next) => {
      const traceId = traceIdFrom(req);
      const session = await requirePatronBearerSession(req, res, traceId);
      if (!session) return;
      const rateKey =
        (config.prisma ? await getAccountIdForSession(config.prisma, session) : null) ??
        session.user_id;
      (req as Request & { relayRateLimitKey?: string }).relayRateLimitKey = rateKey;
      next();
    },
    patronCollectionMutate,
    async (req: Request, res: Response) => {
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
    }
  );

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
    const enriched = await enrichCollectionsWithViewerEntitlement(collections, session);
    res.setHeader("Cache-Control", "private, no-store");
    return res.status(200).json(successEnvelope({ collections: enriched }, traceId));
  });

  app.post(
    "/api/v1/patron/collections",
    async (req: Request, res: Response, next) => {
      const traceId = traceIdFrom(req);
      const session = await requirePatronBearerSession(req, res, traceId);
      if (!session) return;
      const rateKey =
        (config.prisma ? await getAccountIdForSession(config.prisma, session) : null) ??
        session.user_id;
      (req as Request & { relayRateLimitKey?: string }).relayRateLimitKey = rateKey;
      next();
    },
    patronCollectionMutate,
    buildIdem("patron-collections-create"),
    async (req: Request, res: Response) => {
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
    }
  );

  app.patch(
    "/api/v1/patron/collections/:collection_id",
    async (req: Request, res: Response, next) => {
      const traceId = traceIdFrom(req);
      const session = await requirePatronBearerSession(req, res, traceId);
      if (!session) return;
      const rateKey =
        (config.prisma ? await getAccountIdForSession(config.prisma, session) : null) ??
        session.user_id;
      (req as Request & { relayRateLimitKey?: string }).relayRateLimitKey = rateKey;
      next();
    },
    patronCollectionMutate,
    async (req: Request, res: Response) => {
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
    const patch: { title?: string; sort_order?: number; is_public?: boolean } = {};
    if (typeof body.title === "string") {
      patch.title = body.title;
    }
    if (body.sort_order !== undefined && body.sort_order !== null) {
      const n = Number(body.sort_order);
      if (Number.isFinite(n)) {
        patch.sort_order = n;
      }
    }
    if (typeof body.is_public === "boolean") {
      patch.is_public = body.is_public;
    }
    if (
      patch.title === undefined &&
      patch.sort_order === undefined &&
      patch.is_public === undefined
    ) {
      return res.status(400).json(
        errorEnvelope("VALIDATION_ERROR", "Provide title, sort_order, and/or is_public.", traceId, [
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
    }
  );

  app.delete(
    "/api/v1/patron/collections/:collection_id",
    async (req: Request, res: Response, next) => {
      const traceId = traceIdFrom(req);
      const session = await requirePatronBearerSession(req, res, traceId);
      if (!session) return;
      const rateKey =
        (config.prisma ? await getAccountIdForSession(config.prisma, session) : null) ??
        session.user_id;
      (req as Request & { relayRateLimitKey?: string }).relayRateLimitKey = rateKey;
      next();
    },
    patronCollectionMutate,
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
    }
  );

  app.post(
    "/api/v1/patron/collections/:collection_id/entries",
    async (req: Request, res: Response, next) => {
      const traceId = traceIdFrom(req);
      const session = await requirePatronBearerSession(req, res, traceId);
      if (!session) return;
      const rateKey =
        (config.prisma ? await getAccountIdForSession(config.prisma, session) : null) ??
        session.user_id;
      (req as Request & { relayRateLimitKey?: string }).relayRateLimitKey = rateKey;
      next();
    },
    patronCollectionMutate,
    buildIdem("patron-collection-entry-add"),
    async (req: Request, res: Response) => {
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
      // PE-D / D29 — capture forensic snapshot tier ids at save time. Same contract as PUT
      // /favorites: this is metadata, never consulted at render time.
      const snapshotTierIds = await captureForensicSnapshotTierIds(session, creatorId);
      const entry = await patronCollectionsStore.addEntry(
        creatorId,
        session.user_id,
        req.params.collection_id,
        postId,
        mediaId,
        { snapshot_tier_ids: snapshotTierIds }
      );
      res.setHeader("Cache-Control", "private, no-store");
      return res.status(200).json(successEnvelope({ entry }, traceId));
    } catch {
      return res.status(404).json(errorEnvelope("NOT_FOUND", "Collection not found.", traceId));
    }
    }
  );

  app.delete(
    "/api/v1/patron/collections/:collection_id/entries",
    async (req: Request, res: Response, next) => {
      const traceId = traceIdFrom(req);
      const session = await requirePatronBearerSession(req, res, traceId);
      if (!session) return;
      const rateKey =
        (config.prisma ? await getAccountIdForSession(config.prisma, session) : null) ??
        session.user_id;
      (req as Request & { relayRateLimitKey?: string }).relayRateLimitKey = rateKey;
      next();
    },
    patronCollectionMutate,
    async (req: Request, res: Response) => {
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
    }
  );

  // ---------------------------------------------------------------------------
  // PE-D / BO-P2-01 — cross-creator favorites & collections (live re-check, D29).
  // No `creator_id` filter; returns every favorite/collection the supporter has across every
  // creator they patron, joined through `Account → TenantMembership`. Each row carries a
  // `viewer_entitlement` decision computed live against the viewer's current snapshot.
  // ---------------------------------------------------------------------------

  app.get("/api/v1/patron/favorites/all", async (req: Request, res: Response) => {
    const traceId = traceIdFrom(req);
    const session = await requirePatronBearerSession(req, res, traceId);
    if (!session) {
      return;
    }
    let items;
    if (patronFavoritesStore instanceof FilePatronFavoritesStore) {
      items = await patronFavoritesStore.listAllForUser(session.user_id);
    } else if (patronFavoritesStore instanceof DbPatronFavoritesStore) {
      if (!config.prisma) {
        res.setHeader("Cache-Control", "private, no-store");
        return res.status(200).json(successEnvelope({ items: [] }, traceId));
      }
      const accountId = await getAccountIdForSession(config.prisma, session);
      if (!accountId) {
        res.setHeader("Cache-Control", "private, no-store");
        return res.status(200).json(successEnvelope({ items: [] }, traceId));
      }
      items = await patronFavoritesStore.listAllForAccount(accountId);
    } else {
      res.setHeader("Cache-Control", "private, no-store");
      return res.status(200).json(successEnvelope({ items: [] }, traceId));
    }
    const enriched = await enrichFavoritesWithViewerEntitlement(items, session);
    res.setHeader("Cache-Control", "private, no-store");
    return res.status(200).json(successEnvelope({ items: enriched }, traceId));
  });

  app.get("/api/v1/patron/collections/all", async (req: Request, res: Response) => {
    const traceId = traceIdFrom(req);
    const session = await requirePatronBearerSession(req, res, traceId);
    if (!session) {
      return;
    }
    let collections;
    if (patronCollectionsStore instanceof FilePatronCollectionsStore) {
      collections = await patronCollectionsStore.listAllCollectionsWithEntries(
        session.user_id
      );
    } else if (patronCollectionsStore instanceof DbPatronCollectionsStore) {
      if (!config.prisma) {
        res.setHeader("Cache-Control", "private, no-store");
        return res.status(200).json(successEnvelope({ collections: [] }, traceId));
      }
      const accountId = await getAccountIdForSession(config.prisma, session);
      if (!accountId) {
        res.setHeader("Cache-Control", "private, no-store");
        return res.status(200).json(successEnvelope({ collections: [] }, traceId));
      }
      collections = await patronCollectionsStore.listAllCollectionsWithEntriesForAccount(
        accountId
      );
    } else {
      res.setHeader("Cache-Control", "private, no-store");
      return res.status(200).json(successEnvelope({ collections: [] }, traceId));
    }
    const enriched = await enrichCollectionsWithViewerEntitlement(collections, session);
    res.setHeader("Cache-Control", "private, no-store");
    return res.status(200).json(successEnvelope({ collections: enriched }, traceId));
  });

  app.get("/api/v1/patron/collections/:collection_id", async (req: Request, res: Response) => {
    const traceId = traceIdFrom(req);
    const collectionId =
      typeof req.params.collection_id === "string" ? req.params.collection_id.trim() : "";
    if (!collectionId) {
      return res.status(400).json(
        errorEnvelope("VALIDATION_ERROR", "collection_id is required.", traceId, [
          { field: "collection_id", issue: "missing" }
        ])
      );
    }
    const session = await requirePatronBearerSession(req, res, traceId);
    if (!session) {
      return;
    }

    let collection:
      | (PatronCollectionRecord & { entries: PatronCollectionEntryRecord[] })
      | null = null;
    if (patronCollectionsStore instanceof FilePatronCollectionsStore) {
      collection = await patronCollectionsStore.getCollectionWithEntriesForUser(
        session.user_id,
        collectionId
      );
    } else if (patronCollectionsStore instanceof DbPatronCollectionsStore) {
      if (config.prisma) {
        const accountId = await getAccountIdForSession(config.prisma, session);
        if (accountId) {
          collection = await patronCollectionsStore.getCollectionWithEntriesForAccount(
            accountId,
            collectionId
          );
        }
      }
    }

    if (!collection) {
      return res.status(404).json(errorEnvelope("NOT_FOUND", "Collection not found.", traceId));
    }

    const [enriched] = await enrichCollectionsWithViewerEntitlement([collection], session);
    let collectionEntries = enriched.entries;
    if (config.prisma) {
      const hideMatureContent = await loadPatronHideMatureContent(
        config.prisma,
        session.user_id
      );
      if (hideMatureContent) {
        const matureCreatorIds = [...new Set(collectionEntries.map((e) => e.creator_id))];
        const maturePostIdsByCreator = await loadMaturePostIdsByCreator(
          config.prisma,
          matureCreatorIds
        );
        collectionEntries = collectionEntries.filter(
          (entry) =>
            !isPostExcludedByPatronMaturePref({
              hideMatureContent: true,
              maturePostIdsByCreator,
              creatorId: entry.creator_id,
              postId: entry.post_id
            })
        );
      }
    }
    const snapshot = await canonicalStore.load();
    const creatorIds = collectionEntries.map((entry) => entry.creator_id);
    const profileByCreator = config.prisma
      ? await loadCreatorProfilesForPatronCollection(config.prisma, creatorIds)
      : new Map();
    const hydratedEntries = hydratePatronCollectionDetailEntries(
      snapshot,
      collectionEntries,
      profileByCreator
    );
    const detail = toPatronOwnerCollectionDetail(
      { ...enriched, entries: collectionEntries },
      hydratedEntries
    );
    res.setHeader("Cache-Control", "private, no-store");
    return res.status(200).json(successEnvelope({ collection: detail }, traceId));
  });

  // ---------------------------------------------------------------------------
  // PE-E (BO-P2-03) — comments + moderation. Service layer in src/patron/comment-*.ts.
  // ---------------------------------------------------------------------------

  /** Internal helper: respond 503 when DB-backed identity isn't enabled. */
  function ensurePeEDbReady(res: Response, traceId: string): boolean {
    if (!useDbIdentityStore(config) || !config.prisma) {
      res
        .status(503)
        .json(
          errorEnvelope(
            "NOT_AVAILABLE",
            "Comments / moderation API requires database-backed identity (RELAY_DB_STORE_IDENTITY).",
            traceId
          )
        );
      return false;
    }
    return true;
  }

  /** Internal helper: is the calling session the studio owner of this relay_creator_id? */
  async function sessionOwnsCreator(
    session: SessionToken,
    relayCreatorId: string
  ): Promise<boolean> {
    if (!config.prisma) return false;
    const accountId = await getAccountIdForSession(config.prisma, session);
    if (!accountId) return false;
    const acc = await config.prisma.account.findUnique({
      where: { id: accountId },
      select: { primaryRelayCreatorId: true }
    });
    return acc?.primaryRelayCreatorId === relayCreatorId;
  }

  /**
   * Translate CommentService errors into the standard envelope. Returns `true` if a response
   * was sent. Keeps every route handler thin and consistent.
   */
  function handleCommentError(res: Response, traceId: string, err: unknown): boolean {
    if (err instanceof CommentValidationError) {
      res
        .status(400)
        .json(
          errorEnvelope("VALIDATION_ERROR", err.message, traceId, [
            { field: err.field, issue: err.issue }
          ])
        );
      return true;
    }
    if (err instanceof CommentNotFoundError) {
      res.status(404).json(errorEnvelope("NOT_FOUND", err.message, traceId));
      return true;
    }
    if (err instanceof CommentEditWindowClosedError) {
      res.status(409).json(errorEnvelope("EDIT_WINDOW_CLOSED", err.message, traceId));
      return true;
    }
    if (err instanceof CommentForbiddenError) {
      res.status(403).json(errorEnvelope("FORBIDDEN", err.message, traceId));
      return true;
    }
    if (err instanceof ContentReportValidationError) {
      res
        .status(400)
        .json(
          errorEnvelope("VALIDATION_ERROR", err.message, traceId, [
            { field: err.field, issue: err.issue }
          ])
        );
      return true;
    }
    return false;
  }

  /** GET — list visible comments on a post, optionally filtered to one media asset. */
  app.get("/api/v1/patron/posts/:post_id/comments", async (req: Request, res: Response) => {
    const traceId = traceIdFrom(req);
    if (!ensurePeEDbReady(res, traceId)) return;
    const prisma = config.prisma!;
    const postId = String(req.params.post_id ?? "").trim();
    const creatorId =
      typeof req.query.creator_id === "string" ? req.query.creator_id.trim() : "";
    if (!postId || !creatorId) {
      return res.status(400).json(
        errorEnvelope("VALIDATION_ERROR", "post_id and creator_id are required.", traceId, [
          { field: "post_id", issue: postId ? "ok" : "missing" },
          { field: "creator_id", issue: creatorId ? "ok" : "missing" }
        ])
      );
    }
    const session = await requirePatronBearerSession(req, res, traceId);
    if (!session) return;
    if (!(await requirePatronForCreatorId(req, res, traceId, session, creatorId))) return;
    const mediaId =
      typeof req.query.media_id === "string" && req.query.media_id.trim().length > 0
        ? req.query.media_id.trim()
        : undefined;
    const postLevelOnly =
      req.query.post_level_only === "1" || req.query.post_level_only === "true";
    if (postLevelOnly && mediaId) {
      return res.status(400).json(
        errorEnvelope("VALIDATION_ERROR", "Use either media_id or post_level_only, not both.", traceId, [
          { field: "query", issue: "invalid" }
        ])
      );
    }
    if (mediaId) {
      const att = await validateMediaIdsBelongToPost(prisma, creatorId, postId, [mediaId]);
      if (!att.ok) {
        return res
          .status(400)
          .json(
            errorEnvelope("VALIDATION_ERROR", att.message, traceId, [
              { field: "media_id", issue: "invalid" }
            ])
          );
      }
    }
    const accountId = await getAccountIdForSession(prisma, session);
    const isOwner = await sessionOwnsCreator(session, creatorId);
    // Viewer's tier ids on this creator scope -- used for `requiredTierId` filtering.
    let viewerTierIds: string[] = [];
    if (accountId) {
      const tenant = await prisma.tenant.findUnique({
        where: { relayCreatorId: creatorId },
        select: { id: true }
      });
      if (tenant) {
        const membership = await prisma.tenantMembership.findUnique({
          where: { accountId_tenantId: { accountId, tenantId: tenant.id } },
          select: { tierIds: true }
        });
        if (membership) viewerTierIds = membership.tierIds;
      }
    }
    const blockEdges = accountId ? await loadBlocksFor(prisma, accountId) : [];
    try {
      const items = await listComments(prisma, {
        relayCreatorId: creatorId,
        postId,
        options: {
          mediaId,
          postLevelOnly,
          includeModerated: isOwner,
          viewerTierIds,
          blockEdges
        }
      });
      const curatorIds = await activeCuratorMembershipIds(
        prisma,
        items.map((c) => c.patronUserId)
      );
      const reactions = await aggregateReactions(prisma, {
        commentIds: items.map((c) => c.id),
        viewerAccountId: accountId
      });
      const enriched = items.map((c) => ({
        ...c,
        is_curator: curatorIds.has(c.patronUserId),
        reactions: reactions.get(c.id) ?? []
      }));
      res.setHeader("Cache-Control", "private, no-store");
      return res.status(200).json(successEnvelope({ items: enriched }, traceId));
    } catch (error) {
      if (handleCommentError(res, traceId, error)) return;
      return res.status(500).json(errorEnvelope("INTERNAL", (error as Error).message, traceId));
    }
  });

  /** POST — create a comment under a post (body / mediaId / anchor / parent / tags). */
  app.post(
    "/api/v1/patron/posts/:post_id/comments",
    async (req: Request, res: Response, next) => {
      const traceId = traceIdFrom(req);
      if (!ensurePeEDbReady(res, traceId)) return;
      const session = await requirePatronBearerSession(req, res, traceId);
      if (!session) return;
      const rateKey =
        (await getAccountIdForSession(config.prisma!, session)) ?? session.user_id;
      (req as Request & { relayRateLimitKey?: string }).relayRateLimitKey = rateKey;
      next();
    },
    patronCommentMutate,
    buildIdem("patron-comment-create"),
    async (req: Request, res: Response) => {
      const traceId = traceIdFrom(req);
      const prisma = config.prisma!;
      const postId = String(req.params.post_id ?? "").trim();
      const body = (req.body ?? {}) as Record<string, unknown>;
      const details = validateRequiredFields(body, ["creator_id", "body"]);
      if (details.length > 0 || !postId) {
        return res.status(400).json(
          errorEnvelope("VALIDATION_ERROR", "Invalid request.", traceId, [
            ...details,
            ...(postId ? [] : [{ field: "post_id", issue: "missing" }])
          ])
        );
      }
      const creatorId = String(body.creator_id).trim();
      const session = await requirePatronBearerSession(req, res, traceId);
      if (!session) return;
      if (!(await requirePatronForCreatorId(req, res, traceId, session, creatorId))) return;
      try {
        const result = await createComment(prisma, galleryOverridesStore, {
          relayCreatorId: creatorId,
          postId,
          patronUserId: session.user_id,
          body: String(body.body),
          mediaId:
            typeof body.media_id === "string" && body.media_id.trim().length > 0
              ? body.media_id.trim()
              : null,
          anchorX: typeof body.anchor_x === "number" ? body.anchor_x : null,
          anchorY: typeof body.anchor_y === "number" ? body.anchor_y : null,
          parentCommentId:
            typeof body.parent_comment_id === "string" ? body.parent_comment_id : null,
          tagIds: Array.isArray(body.tag_ids)
            ? body.tag_ids.filter((t: unknown): t is string => typeof t === "string")
            : [],
          requiredTierId:
            typeof body.required_tier_id === "string" ? body.required_tier_id : null,
          visibility:
            body.visibility === "patrons_only" ? "patrons_only" : "everyone"
        });
        if (result.autoModFlags.some((f) => f.severity === "block")) {
          await recordModerationAction(prisma, {
            relayCreatorId: creatorId,
            actorKind: "system_auto_mod",
            kind: "auto_mod_flag",
            targetKind: "comment",
            targetId: result.record.id,
            payload: { flags: result.autoModFlags }
          });
        }
        res.setHeader("Cache-Control", "private, no-store");
        return res
          .status(201)
          .json(successEnvelope({ item: result.record, auto_mod_flags: result.autoModFlags }, traceId));
      } catch (error) {
        if (handleCommentError(res, traceId, error)) return;
        return res.status(500).json(errorEnvelope("INTERNAL", (error as Error).message, traceId));
      }
    }
  );

  /** PATCH — edit own comment within 15-min window, OR creator pin/unpin/hide/unhide. */
  app.patch(
    "/api/v1/patron/comments/:comment_id",
    async (req: Request, res: Response, next) => {
      const traceId = traceIdFrom(req);
      if (!ensurePeEDbReady(res, traceId)) return;
      const session = await requirePatronBearerSession(req, res, traceId);
      if (!session) return;
      const rateKey =
        (await getAccountIdForSession(config.prisma!, session)) ?? session.user_id;
      (req as Request & { relayRateLimitKey?: string }).relayRateLimitKey = rateKey;
      next();
    },
    patronCommentMutate,
    async (req: Request, res: Response) => {
      const traceId = traceIdFrom(req);
      const prisma = config.prisma!;
      const commentId = String(req.params.comment_id ?? "").trim();
      const session = await requirePatronBearerSession(req, res, traceId);
      if (!session) return;
      const body = (req.body ?? {}) as Record<string, unknown>;
      const existing = await prisma.comment.findUnique({ where: { id: commentId } });
      if (!existing) {
        return res.status(404).json(errorEnvelope("NOT_FOUND", "Comment not found.", traceId));
      }
      const isOwner = await sessionOwnsCreator(session, existing.relayCreatorId);
      try {
        // Creator-only ops: pin/unpin, hide/unhide -- all guarded by isOwner.
        if (typeof body.creator_pinned === "boolean") {
          if (!isOwner) throw new CommentForbiddenError("creator pin requires creator session");
          const updated = await setCreatorPinned(prisma, {
            commentId,
            pinned: body.creator_pinned
          });
          await recordModerationAction(prisma, {
            relayCreatorId: existing.relayCreatorId,
            actorKind: "creator",
            actorAccountId: (await getAccountIdForSession(prisma, session)) ?? null,
            kind: body.creator_pinned ? "comment_pin" : "comment_unpin",
            targetKind: "comment",
            targetId: commentId
          });
          return res.status(200).json(successEnvelope({ item: updated }, traceId));
        }
        if (typeof body.mod_state === "string") {
          if (!isOwner) throw new CommentForbiddenError("mod state change requires creator session");
          const next = body.mod_state;
          if (next !== "visible" && next !== "hidden" && next !== "removed") {
            throw new CommentValidationError("mod_state", "must be visible, hidden, or removed");
          }
          const updated = await setModState(prisma, { commentId, modState: next });
          const kind =
            next === "visible"
              ? "comment_unhide"
              : next === "hidden"
                ? "comment_hide"
                : "comment_remove";
          await recordModerationAction(prisma, {
            relayCreatorId: existing.relayCreatorId,
            actorKind: "creator",
            actorAccountId: (await getAccountIdForSession(prisma, session)) ?? null,
            kind,
            targetKind: "comment",
            targetId: commentId
          });
          return res.status(200).json(successEnvelope({ item: updated }, traceId));
        }
        // Author edit path.
        const updated = await patchComment(prisma, galleryOverridesStore, {
          commentId,
          actorUserId: session.user_id,
          patch: {
            body: typeof body.body === "string" ? body.body : undefined,
            tagIds: Array.isArray(body.tag_ids)
              ? body.tag_ids.filter((t: unknown): t is string => typeof t === "string")
              : undefined
          }
        });
        return res.status(200).json(successEnvelope({ item: updated }, traceId));
      } catch (error) {
        if (handleCommentError(res, traceId, error)) return;
        return res.status(500).json(errorEnvelope("INTERNAL", (error as Error).message, traceId));
      }
    }
  );

  /** DELETE — soft-delete (author always; creator with isCreator=true). */
  app.delete(
    "/api/v1/patron/comments/:comment_id",
    async (req: Request, res: Response, next) => {
      const traceId = traceIdFrom(req);
      if (!ensurePeEDbReady(res, traceId)) return;
      const session = await requirePatronBearerSession(req, res, traceId);
      if (!session) return;
      const rateKey =
        (await getAccountIdForSession(config.prisma!, session)) ?? session.user_id;
      (req as Request & { relayRateLimitKey?: string }).relayRateLimitKey = rateKey;
      next();
    },
    patronCommentMutate,
    async (req: Request, res: Response) => {
      const traceId = traceIdFrom(req);
      const prisma = config.prisma!;
      const commentId = String(req.params.comment_id ?? "").trim();
      const session = await requirePatronBearerSession(req, res, traceId);
      if (!session) return;
      const existing = await prisma.comment.findUnique({ where: { id: commentId } });
      if (!existing) {
        return res.status(404).json(errorEnvelope("NOT_FOUND", "Comment not found.", traceId));
      }
      const isOwner = await sessionOwnsCreator(session, existing.relayCreatorId);
      try {
        const updated = await softDeleteComment(prisma, galleryOverridesStore, {
          commentId,
          actorUserId: session.user_id,
          isCreator: isOwner
        });
        if (isOwner) {
          await recordModerationAction(prisma, {
            relayCreatorId: existing.relayCreatorId,
            actorKind: "creator",
            actorAccountId: (await getAccountIdForSession(prisma, session)) ?? null,
            kind: "comment_remove",
            targetKind: "comment",
            targetId: commentId
          });
        }
        return res.status(200).json(successEnvelope({ item: updated }, traceId));
      } catch (error) {
        if (handleCommentError(res, traceId, error)) return;
        return res.status(500).json(errorEnvelope("INTERNAL", (error as Error).message, traceId));
      }
    }
  );

  /** POST — toggle a reaction. Returns { active: boolean }. */
  app.post(
    "/api/v1/patron/comments/:comment_id/reactions",
    async (req: Request, res: Response, next) => {
      const traceId = traceIdFrom(req);
      if (!ensurePeEDbReady(res, traceId)) return;
      const session = await requirePatronBearerSession(req, res, traceId);
      if (!session) return;
      const rateKey =
        (await getAccountIdForSession(config.prisma!, session)) ?? session.user_id;
      (req as Request & { relayRateLimitKey?: string }).relayRateLimitKey = rateKey;
      next();
    },
    patronReactionMutate,
    async (req: Request, res: Response) => {
      const traceId = traceIdFrom(req);
      const prisma = config.prisma!;
      const commentId = String(req.params.comment_id ?? "").trim();
      const body = (req.body ?? {}) as Record<string, unknown>;
      const kindRaw = typeof body.kind === "string" ? body.kind : "";
      if (!["like", "heart", "insightful", "laugh"].includes(kindRaw)) {
        return res
          .status(400)
          .json(
            errorEnvelope("VALIDATION_ERROR", "kind must be a valid CommentReactionKind.", traceId, [
              { field: "kind", issue: "invalid" }
            ])
          );
      }
      const session = await requirePatronBearerSession(req, res, traceId);
      if (!session) return;
      const accountId = await getAccountIdForSession(prisma, session);
      if (!accountId) {
        return res.status(403).json(errorEnvelope("FORBIDDEN", "Account required.", traceId));
      }
      const result = await toggleCommentReaction(prisma, {
        commentId,
        accountId,
        kind: kindRaw as "like" | "heart" | "insightful" | "laugh"
      });
      res.setHeader("Cache-Control", "private, no-store");
      return res.status(200).json(successEnvelope(result, traceId));
    }
  );

  /** POST — creator-only per-comment per-tag revocation (D27). */
  app.post(
    "/api/v1/patron/comments/:comment_id/revoke-tag",
    async (req: Request, res: Response, next) => {
      const traceId = traceIdFrom(req);
      if (!ensurePeEDbReady(res, traceId)) return;
      const session = await requirePatronBearerSession(req, res, traceId);
      if (!session) return;
      const rateKey =
        (await getAccountIdForSession(config.prisma!, session)) ?? session.user_id;
      (req as Request & { relayRateLimitKey?: string }).relayRateLimitKey = rateKey;
      next();
    },
    patronCommentMutate,
    async (req: Request, res: Response) => {
      const traceId = traceIdFrom(req);
      const prisma = config.prisma!;
      const commentId = String(req.params.comment_id ?? "").trim();
      const body = (req.body ?? {}) as Record<string, unknown>;
      const tagId = typeof body.tag_id === "string" ? body.tag_id.trim().toLowerCase() : "";
      const unrevoke = body.unrevoke === true;
      if (!commentId || !tagId) {
        return res.status(400).json(
          errorEnvelope("VALIDATION_ERROR", "comment_id + tag_id required.", traceId, [
            { field: "tag_id", issue: tagId ? "ok" : "missing" }
          ])
        );
      }
      const session = await requirePatronBearerSession(req, res, traceId);
      if (!session) return;
      const existing = await prisma.comment.findUnique({ where: { id: commentId } });
      if (!existing) {
        return res.status(404).json(errorEnvelope("NOT_FOUND", "Comment not found.", traceId));
      }
      if (!(await sessionOwnsCreator(session, existing.relayCreatorId))) {
        return res
          .status(403)
          .json(errorEnvelope("FORBIDDEN", "Tag revocation requires creator session.", traceId));
      }
      try {
        if (unrevoke) {
          await unrevokeCommentTag(prisma, galleryOverridesStore, commentId, tagId);
        } else {
          await revokeCommentTag(prisma, galleryOverridesStore, commentId, tagId);
        }
        await recordModerationAction(prisma, {
          relayCreatorId: existing.relayCreatorId,
          actorKind: "creator",
          actorAccountId: (await getAccountIdForSession(prisma, session)) ?? null,
          kind: unrevoke ? "comment_tag_unrevoke" : "comment_tag_revoke",
          targetKind: "comment",
          targetId: commentId,
          payload: { tagId }
        });
        res.setHeader("Cache-Control", "private, no-store");
        return res.status(200).json(successEnvelope({ tag_id: tagId, unrevoked: unrevoke }, traceId));
      } catch (error) {
        if (handleCommentError(res, traceId, error)) return;
        return res.status(500).json(errorEnvelope("INTERNAL", (error as Error).message, traceId));
      }
    }
  );

  /** POST — patron submits a content report. */
  app.post(
    "/api/v1/patron/reports",
    async (req: Request, res: Response, next) => {
      const traceId = traceIdFrom(req);
      if (!ensurePeEDbReady(res, traceId)) return;
      const session = await requirePatronBearerSession(req, res, traceId);
      if (!session) return;
      const rateKey =
        (await getAccountIdForSession(config.prisma!, session)) ?? session.user_id;
      (req as Request & { relayRateLimitKey?: string }).relayRateLimitKey = rateKey;
      next();
    },
    patronReportMutate,
    buildIdem("patron-report-create"),
    async (req: Request, res: Response) => {
      const traceId = traceIdFrom(req);
      const prisma = config.prisma!;
      const body = (req.body ?? {}) as Record<string, unknown>;
      const targetKind = body.target_kind;
      if (targetKind !== "comment" && targetKind !== "post" && targetKind !== "account") {
        return res.status(400).json(
          errorEnvelope("VALIDATION_ERROR", "target_kind invalid.", traceId, [
            { field: "target_kind", issue: "invalid" }
          ])
        );
      }
      const session = await requirePatronBearerSession(req, res, traceId);
      if (!session) return;
      const accountId = await getAccountIdForSession(prisma, session);
      if (!accountId) {
        return res.status(403).json(errorEnvelope("FORBIDDEN", "Account required.", traceId));
      }
      try {
        const created = await createContentReport(prisma, {
          reporterAccountId: accountId,
          relayCreatorId:
            typeof body.relay_creator_id === "string" ? body.relay_creator_id.trim() : "",
          targetKind,
          targetId: typeof body.target_id === "string" ? body.target_id : "",
          reasonCode: typeof body.reason_code === "string" ? body.reason_code : "",
          body: typeof body.body === "string" ? body.body : null
        });
        res.setHeader("Cache-Control", "private, no-store");
        return res.status(201).json(successEnvelope(created, traceId));
      } catch (error) {
        if (handleCommentError(res, traceId, error)) return;
        return res.status(500).json(errorEnvelope("INTERNAL", (error as Error).message, traceId));
      }
    }
  );

  /** GET — creator moderation queue. Owner-only. */
  app.get("/api/v1/creator/moderation/reports", async (req: Request, res: Response) => {
    const traceId = traceIdFrom(req);
    if (!ensurePeEDbReady(res, traceId)) return;
    const prisma = config.prisma!;
    const session = await requirePatronBearerSession(req, res, traceId);
    if (!session) return;
    const creatorId =
      typeof req.query.relay_creator_id === "string" ? req.query.relay_creator_id.trim() : "";
    if (!creatorId) {
      return res
        .status(400)
        .json(
          errorEnvelope("VALIDATION_ERROR", "relay_creator_id is required.", traceId, [
            { field: "relay_creator_id", issue: "missing" }
          ])
        );
    }
    if (!(await sessionOwnsCreator(session, creatorId))) {
      return res
        .status(403)
        .json(errorEnvelope("FORBIDDEN", "Caller does not own this creator scope.", traceId));
    }
    const status =
      req.query.status === "open" ||
      req.query.status === "actioned" ||
      req.query.status === "dismissed"
        ? (req.query.status as "open" | "actioned" | "dismissed")
        : undefined;
    const cursor = typeof req.query.cursor === "string" ? req.query.cursor : undefined;
    const result = await listContentReports(prisma, { relayCreatorId: creatorId, status, cursor });
    res.setHeader("Cache-Control", "private, no-store");
    return res.status(200).json(successEnvelope(result, traceId));
  });

  /** POST — resolve a report (actioned / dismissed). Owner-only. */
  app.post(
    "/api/v1/creator/moderation/reports/:report_id/resolve",
    async (req: Request, res: Response) => {
      const traceId = traceIdFrom(req);
      if (!ensurePeEDbReady(res, traceId)) return;
      const prisma = config.prisma!;
      const reportId = String(req.params.report_id ?? "").trim();
      const session = await requirePatronBearerSession(req, res, traceId);
      if (!session) return;
      const accountId = await getAccountIdForSession(prisma, session);
      if (!accountId) {
        return res.status(403).json(errorEnvelope("FORBIDDEN", "Account required.", traceId));
      }
      const report = await prisma.contentReport.findUnique({ where: { id: reportId } });
      if (!report) {
        return res.status(404).json(errorEnvelope("NOT_FOUND", "Report not found.", traceId));
      }
      if (!(await sessionOwnsCreator(session, report.relayCreatorId))) {
        return res
          .status(403)
          .json(errorEnvelope("FORBIDDEN", "Caller does not own this creator scope.", traceId));
      }
      const body = (req.body ?? {}) as Record<string, unknown>;
      const outcome = body.outcome === "actioned" ? "actioned" : "dismissed";
      try {
        await resolveContentReport(prisma, {
          reportId,
          resolverAccountId: accountId,
          outcome
        });
        return res.status(200).json(successEnvelope({ resolved: true, outcome }, traceId));
      } catch (error) {
        if (handleCommentError(res, traceId, error)) return;
        return res.status(500).json(errorEnvelope("INTERNAL", (error as Error).message, traceId));
      }
    }
  );

  /** POST / DELETE — account-level block (D14, future-only semantics). */
  app.post(
    "/api/v1/patron/blocks",
    async (req: Request, res: Response, next) => {
      const traceId = traceIdFrom(req);
      if (!ensurePeEDbReady(res, traceId)) return;
      const session = await requirePatronBearerSession(req, res, traceId);
      if (!session) return;
      const rateKey =
        (await getAccountIdForSession(config.prisma!, session)) ?? session.user_id;
      (req as Request & { relayRateLimitKey?: string }).relayRateLimitKey = rateKey;
      next();
    },
    patronBlockMutate,
    buildIdem("patron-block-create"),
    async (req: Request, res: Response) => {
      const traceId = traceIdFrom(req);
      const prisma = config.prisma!;
      const body = (req.body ?? {}) as Record<string, unknown>;
      const target =
        typeof body.blocked_account_id === "string" ? body.blocked_account_id.trim() : "";
      if (!target) {
        return res.status(400).json(
          errorEnvelope("VALIDATION_ERROR", "blocked_account_id is required.", traceId, [
            { field: "blocked_account_id", issue: "missing" }
          ])
        );
      }
      const session = await requirePatronBearerSession(req, res, traceId);
      if (!session) return;
      const blockerAccountId = await getAccountIdForSession(prisma, session);
      if (!blockerAccountId) {
        return res.status(403).json(errorEnvelope("FORBIDDEN", "Account required.", traceId));
      }
      const result = await blockAccount(prisma, {
        blockerAccountId,
        blockedAccountId: target
      });
      res.setHeader("Cache-Control", "private, no-store");
      return res.status(200).json(successEnvelope(result, traceId));
    }
  );

  app.delete(
    "/api/v1/patron/blocks/:account_id",
    async (req: Request, res: Response, next) => {
      const traceId = traceIdFrom(req);
      if (!ensurePeEDbReady(res, traceId)) return;
      const session = await requirePatronBearerSession(req, res, traceId);
      if (!session) return;
      const rateKey =
        (await getAccountIdForSession(config.prisma!, session)) ?? session.user_id;
      (req as Request & { relayRateLimitKey?: string }).relayRateLimitKey = rateKey;
      next();
    },
    patronBlockMutate,
    async (req: Request, res: Response) => {
      const traceId = traceIdFrom(req);
      const prisma = config.prisma!;
      const target = String(req.params.account_id ?? "").trim();
      const session = await requirePatronBearerSession(req, res, traceId);
      if (!session) return;
      const blockerAccountId = await getAccountIdForSession(prisma, session);
      if (!blockerAccountId) {
        return res.status(403).json(errorEnvelope("FORBIDDEN", "Account required.", traceId));
      }
      const result = await unblockAccount(prisma, {
        blockerAccountId,
        blockedAccountId: target
      });
      res.setHeader("Cache-Control", "private, no-store");
      return res.status(200).json(successEnvelope(result, traceId));
    }
  );

  // ---------------------------------------------------------------------------
  // PE-F (BO-P3-01) — Discovery v1.
  // GET /api/v1/patron/discover  — open to any patron session; cross-creator recency feed
  //                                 of posts opted in via PostOverride.discoveryEligible.
  // PATCH /api/v1/gallery/posts/:post_id/discovery — owner-only opt-in/out.
  // ---------------------------------------------------------------------------

  app.get("/api/v1/patron/discover", async (req: Request, res: Response) => {
    const traceId = traceIdFrom(req);
    const session = await requirePatronBearerSession(req, res, traceId);
    if (!session) return;
    const q = typeof req.query.q === "string" ? req.query.q : undefined;
    const cursor = typeof req.query.cursor === "string" ? req.query.cursor : undefined;
    const limitRaw = typeof req.query.limit === "string" ? Number(req.query.limit) : undefined;
    const capRaw =
      typeof req.query.creator_cap === "string" ? Number(req.query.creator_cap) : undefined;
    // Resolve viewer's primary creator scope so we can exclude their own posts from Discover.
    let viewerCreatorId: string | null = null;
    if (config.prisma) {
      const accountId = await getAccountIdForSession(config.prisma, session);
      if (accountId) {
        const acc = await config.prisma.account.findUnique({
          where: { id: accountId },
          select: { primaryRelayCreatorId: true }
        });
        viewerCreatorId = acc?.primaryRelayCreatorId ?? null;
      }
    }
    try {
      const hideMatureContent = config.prisma
        ? await loadPatronHideMatureContent(config.prisma, session.user_id)
        : false;
      const [snapshot, overrides] = await Promise.all([
        canonicalStore.load(),
        galleryOverridesStore.load()
      ]);
      const page = buildDiscoverPage(snapshot, overrides, {
        q,
        cursor,
        limit: limitRaw,
        creator_cap: capRaw,
        viewer_relay_creator_id: viewerCreatorId,
        hide_mature_content: hideMatureContent
      });
      let tip_gated: Awaited<ReturnType<typeof buildTipGatedDiscoverSection>> = [];
      let tips_beta = false;
      if (isTipsBetaEnabled() && config.prisma) {
        tips_beta = true;
        const accountId = await getAccountIdForSession(config.prisma, session);
        tip_gated = await buildTipGatedDiscoverSection(config.prisma, {
          viewerAccountId: accountId
        });
      }
      res.setHeader("Cache-Control", "private, no-store");
      return res.status(200).json(
        successEnvelope({ ...page, tip_gated, tips_beta }, traceId)
      );
    } catch (error) {
      return res.status(500).json(errorEnvelope("INTERNAL", (error as Error).message, traceId));
    }
  });

  /**
   * PE-F (BO-P3-01) — Studio surface for opting a post in/out of `/patron/discover`.
   * Owner-only. Validates the caller's `Account.primaryRelayCreatorId` matches the requested
   * creator scope before mutating the override row.
   */
  app.patch(
    "/api/v1/gallery/posts/:post_id/discovery",
    async (req: Request, res: Response) => {
      const traceId = traceIdFrom(req);
      const session = await requirePatronBearerSession(req, res, traceId);
      if (!session) return;
      const postId = String(req.params.post_id ?? "").trim();
      const body = (req.body ?? {}) as Record<string, unknown>;
      const creatorId =
        typeof body.creator_id === "string" ? body.creator_id.trim() : "";
      const eligible = body.eligible === true;
      if (!postId || !creatorId || typeof body.eligible !== "boolean") {
        return res.status(400).json(
          errorEnvelope("VALIDATION_ERROR", "post_id, creator_id, and eligible are required.", traceId, [
            { field: "post_id", issue: postId ? "ok" : "missing" },
            { field: "creator_id", issue: creatorId ? "ok" : "missing" },
            { field: "eligible", issue: typeof body.eligible === "boolean" ? "ok" : "invalid" }
          ])
        );
      }
      // Owner-only: caller's primaryRelayCreatorId must match the requested scope.
      if (config.prisma) {
        const accountId = await getAccountIdForSession(config.prisma, session);
        if (!accountId) {
          return res.status(403).json(errorEnvelope("FORBIDDEN", "Account required.", traceId));
        }
        const acc = await config.prisma.account.findUnique({
          where: { id: accountId },
          select: { primaryRelayCreatorId: true }
        });
        if (acc?.primaryRelayCreatorId !== creatorId) {
          return res
            .status(403)
            .json(errorEnvelope("FORBIDDEN", "Caller does not own this creator scope.", traceId));
        }
      }
      if (!(await guardStudioSyncWritable(res, traceId, creatorId))) {
        return;
      }
      // Validate the post exists in the canonical snapshot for this creator -- prevents
      // accidental override rows for unknown post ids.
      const snapshot = await canonicalStore.load();
      const post = snapshot.posts[creatorId]?.[postId];
      if (!post || post.upstream_status !== "active") {
        return res.status(404).json(errorEnvelope("NOT_FOUND", "Post not found.", traceId));
      }
      // Soft warning surfaced in the response: opting in a tier-gated post has no v1 effect.
      const tierGated = post.current.tier_ids.length > 0;
      try {
        await galleryOverridesStore.setDiscoveryEligible(creatorId, postId, eligible);
        res.setHeader("Cache-Control", "private, no-store");
        return res.status(200).json(
          successEnvelope(
            {
              creator_id: creatorId,
              post_id: postId,
              eligible,
              warning: tierGated
                ? "Tier-gated posts are not surfaced in Discover v1; opt-in is recorded but has no effect until tier-gated discovery ships."
                : null
            },
            traceId
          )
        );
      } catch (error) {
        return res.status(500).json(errorEnvelope("INTERNAL", (error as Error).message, traceId));
      }
    }
  );

  // ---------------------------------------------------------------------------
  // PE-G (BO-P3-03) — Notifications.
  // GET    /api/v1/patron/notifications              — list (cursor-paged; ?unread_only=, ?limit=, ?cursor=)
  // GET    /api/v1/patron/notifications/unread-count — count badge
  // POST   /api/v1/patron/notifications/mark-read    — { notification_ids: [], all_unread?: bool }
  // GET    /api/v1/patron/notifications/preferences  — list (?relay_creator_id= optional filter)
  // PATCH  /api/v1/patron/notifications/preferences  — { relay_creator_id, preference_type, enabled }
  // ---------------------------------------------------------------------------

  app.get("/api/v1/patron/notifications", async (req: Request, res: Response) => {
    const traceId = traceIdFrom(req);
    if (!ensurePeEDbReady(res, traceId)) return;
    const session = await requirePatronBearerSession(req, res, traceId);
    if (!session) return;
    const unreadOnly = req.query.unread_only === "true" || req.query.unread_only === "1";
    const limitRaw =
      typeof req.query.limit === "string" ? Number(req.query.limit) : undefined;
    const cursor = typeof req.query.cursor === "string" ? req.query.cursor : undefined;
    const relayCreatorIdFilter =
      typeof req.query.relay_creator_id === "string"
        ? req.query.relay_creator_id.trim()
        : undefined;
    try {
      const accountId = await getAccountIdForSession(config.prisma!, session);
      const scope = await resolveNotificationRecipientScope(config.prisma!, {
        membershipId: session.user_id,
        accountId
      });
      const page = await listNotifications(config.prisma!, {
        recipientMembershipId: scope.recipientMembershipId,
        recipientCreatorAccountId: scope.recipientCreatorAccountId,
        unreadOnly,
        limit: limitRaw,
        cursor,
        relayCreatorId: relayCreatorIdFilter
      });
      res.setHeader("Cache-Control", "private, no-store");
      return res.status(200).json(successEnvelope(page, traceId));
    } catch (error) {
      return res
        .status(500)
        .json(errorEnvelope("INTERNAL", (error as Error).message, traceId));
    }
  });

  app.get(
    "/api/v1/patron/notifications/unread-count",
    async (req: Request, res: Response) => {
      const traceId = traceIdFrom(req);
      if (!ensurePeEDbReady(res, traceId)) return;
      const session = await requirePatronBearerSession(req, res, traceId);
      if (!session) return;
      const accountId = await getAccountIdForSession(config.prisma!, session);
      const scope = await resolveNotificationRecipientScope(config.prisma!, {
        membershipId: session.user_id,
        accountId
      });
      const count = await unreadCount(config.prisma!, scope);
      res.setHeader("Cache-Control", "private, no-store");
      return res.status(200).json(successEnvelope({ unread_count: count }, traceId));
    }
  );

  app.post(
    "/api/v1/patron/notifications/mark-read",
    async (req: Request, res: Response) => {
      const traceId = traceIdFrom(req);
      if (!ensurePeEDbReady(res, traceId)) return;
      const session = await requirePatronBearerSession(req, res, traceId);
      if (!session) return;
      const body = (req.body ?? {}) as Record<string, unknown>;
      const allUnread = body.all_unread === true;
      const ids = Array.isArray(body.notification_ids)
        ? body.notification_ids.filter((v): v is string => typeof v === "string")
        : [];
      try {
        const accountId = await getAccountIdForSession(config.prisma!, session);
        const scope = await resolveNotificationRecipientScope(config.prisma!, {
          membershipId: session.user_id,
          accountId
        });
        const result = allUnread
          ? await markAllRead(config.prisma!, scope)
          : await markRead(config.prisma!, {
              ...scope,
              notificationIds: ids
            });
        res.setHeader("Cache-Control", "private, no-store");
        return res.status(200).json(successEnvelope(result, traceId));
      } catch (error) {
        return res
          .status(500)
          .json(errorEnvelope("INTERNAL", (error as Error).message, traceId));
      }
    }
  );

  app.get(
    "/api/v1/patron/notifications/preferences",
    async (req: Request, res: Response) => {
      const traceId = traceIdFrom(req);
      if (!ensurePeEDbReady(res, traceId)) return;
      const session = await requirePatronBearerSession(req, res, traceId);
      if (!session) return;
      const relayCreatorId =
        typeof req.query.relay_creator_id === "string"
          ? req.query.relay_creator_id.trim()
          : undefined;
      const items = await listPreferences(config.prisma!, {
        membershipId: session.user_id,
        relayCreatorId
      });
      res.setHeader("Cache-Control", "private, no-store");
      return res.status(200).json(successEnvelope({ items }, traceId));
    }
  );

  app.patch(
    "/api/v1/patron/notifications/preferences",
    async (req: Request, res: Response) => {
      const traceId = traceIdFrom(req);
      if (!ensurePeEDbReady(res, traceId)) return;
      const session = await requirePatronBearerSession(req, res, traceId);
      if (!session) return;
      const body = (req.body ?? {}) as Record<string, unknown>;
      const relayCreatorId =
        typeof body.relay_creator_id === "string" ? body.relay_creator_id.trim() : "";
      const preferenceType =
        typeof body.preference_type === "string" ? body.preference_type.trim() : "";
      const enabled = body.enabled;
      if (!preferenceType || typeof enabled !== "boolean") {
        return res.status(400).json(
          errorEnvelope("VALIDATION_ERROR", "preference_type + enabled (boolean) required.", traceId, [
            { field: "preference_type", issue: preferenceType ? "ok" : "missing" },
            { field: "enabled", issue: typeof enabled === "boolean" ? "ok" : "invalid" }
          ])
        );
      }
      try {
        const result = await setPreference(config.prisma!, {
          membershipId: session.user_id,
          relayCreatorId,
          preferenceType,
          enabled
        });
        res.setHeader("Cache-Control", "private, no-store");
        return res.status(200).json(successEnvelope(result, traceId));
      } catch (error) {
        return res
          .status(500)
          .json(errorEnvelope("INTERNAL", (error as Error).message, traceId));
      }
    }
  );

  // ---------------------------------------------------------------------------
  // PE-J (BO-P4-02) — Data export + per-creator unwind + account deletion lifecycle.
  //
  // GET    /api/v1/patron/me/export                    — JSON bundle of everything we hold for you
  // DELETE /api/v1/patron/memberships/:relay_creator_id — drop one creator relationship
  // GET    /api/v1/patron/me/delete                    — current pending deletion (or null)
  // POST   /api/v1/patron/me/delete                    — schedule deletion (with grace)
  // DELETE /api/v1/patron/me/delete                    — cancel pending deletion
  //
  // All routes require a DB-backed identity (ensurePeEDbReady) so the cascade + soft-FK
  // purges have a real Account row to operate on. File-backed integration tests fall through
  // with a 503.
  // ---------------------------------------------------------------------------

  /** Helper: resolve account id from session, return 403 envelope if not available. */
  async function requireAccountIdForSession(
    req: Request,
    res: Response,
    traceId: string,
    session: SessionToken
  ): Promise<string | null> {
    if (!config.prisma) return null;
    const accountId = await getAccountIdForSession(config.prisma, session);
    if (!accountId) {
      res.status(403).json(errorEnvelope("FORBIDDEN", "Account required.", traceId));
      return null;
    }
    return accountId;
  }

  app.get("/api/v1/patron/me/export", async (req: Request, res: Response) => {
    const traceId = traceIdFrom(req);
    if (!ensurePeEDbReady(res, traceId)) return;
    const session = await requirePatronBearerSession(req, res, traceId);
    if (!session) return;
    const accountId = await requireAccountIdForSession(req, res, traceId, session);
    if (!accountId) return;
    try {
      const bundle = await buildPatronExportBundle(config.prisma!, accountId);
      res.setHeader("Cache-Control", "private, no-store");
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="relay-account-${accountId}-${new Date().toISOString().slice(0, 10)}.json"`
      );
      // Bypass envelope on this one route -- the bundle IS the response, and download tooling
      // (curl -O, browser save-as) shouldn't have to unwrap a meta layer.
      return res.status(200).send(JSON.stringify(bundle, null, 2));
    } catch (error) {
      return res
        .status(500)
        .json(errorEnvelope("INTERNAL", (error as Error).message, traceId));
    }
  });

  app.delete(
    "/api/v1/patron/memberships/:relay_creator_id",
    async (req: Request, res: Response) => {
      const traceId = traceIdFrom(req);
      if (!ensurePeEDbReady(res, traceId)) return;
      const session = await requirePatronBearerSession(req, res, traceId);
      if (!session) return;
      const accountId = await requireAccountIdForSession(req, res, traceId, session);
      if (!accountId) return;
      const relayCreatorId = String(req.params.relay_creator_id ?? "").trim();
      if (!relayCreatorId) {
        return res.status(400).json(
          errorEnvelope("VALIDATION_ERROR", "relay_creator_id is required.", traceId, [
            { field: "relay_creator_id", issue: "missing" }
          ])
        );
      }
      try {
        const counts = await deleteCreatorRelationship(config.prisma!, {
          accountId,
          relayCreatorId
        });
        res.setHeader("Cache-Control", "private, no-store");
        return res.status(200).json(successEnvelope({ counts }, traceId));
      } catch (error) {
        return res
          .status(500)
          .json(errorEnvelope("INTERNAL", (error as Error).message, traceId));
      }
    }
  );

  app.get("/api/v1/patron/me/delete", async (req: Request, res: Response) => {
    const traceId = traceIdFrom(req);
    if (!ensurePeEDbReady(res, traceId)) return;
    const session = await requirePatronBearerSession(req, res, traceId);
    if (!session) return;
    const accountId = await requireAccountIdForSession(req, res, traceId, session);
    if (!accountId) return;
    const pending = await getPendingDeletion(config.prisma!, accountId);
    res.setHeader("Cache-Control", "private, no-store");
    return res.status(200).json(
      successEnvelope(
        {
          pending_deletion: pending
            ? {
                id: pending.id,
                requested_at: pending.requestedAt.toISOString(),
                scheduled_for: pending.scheduledFor.toISOString(),
                reason: pending.reason
              }
            : null
        },
        traceId
      )
    );
  });

  app.post("/api/v1/patron/me/delete", async (req: Request, res: Response) => {
    const traceId = traceIdFrom(req);
    if (!ensurePeEDbReady(res, traceId)) return;
    const session = await requirePatronBearerSession(req, res, traceId);
    if (!session) return;
    const accountId = await requireAccountIdForSession(req, res, traceId, session);
    if (!accountId) return;
    const body = (req.body ?? {}) as Record<string, unknown>;
    const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 500) : null;
    const requesterIp =
      (typeof req.header("x-forwarded-for") === "string"
        ? req.header("x-forwarded-for")!.split(",")[0]?.trim()
        : null) ??
      req.socket?.remoteAddress ??
      null;
    try {
      const result = await requestDeletion(config.prisma!, {
        accountId,
        reason,
        requesterIp
      });
      res.setHeader("Cache-Control", "private, no-store");
      return res.status(result.created ? 201 : 200).json(
        successEnvelope(
          {
            created: result.created,
            id: result.record.id,
            requested_at: result.record.requestedAt.toISOString(),
            scheduled_for: result.record.scheduledFor.toISOString(),
            reason: result.record.reason
          },
          traceId
        )
      );
    } catch (error) {
      return res
        .status(500)
        .json(errorEnvelope("INTERNAL", (error as Error).message, traceId));
    }
  });

  app.delete("/api/v1/patron/me/delete", async (req: Request, res: Response) => {
    const traceId = traceIdFrom(req);
    if (!ensurePeEDbReady(res, traceId)) return;
    const session = await requirePatronBearerSession(req, res, traceId);
    if (!session) return;
    const accountId = await requireAccountIdForSession(req, res, traceId, session);
    if (!accountId) return;
    const cancelled = await cancelDeletion(config.prisma!, accountId);
    res.setHeader("Cache-Control", "private, no-store");
    return res.status(200).json(
      successEnvelope(
        {
          cancelled: cancelled !== null,
          id: cancelled?.id ?? null,
          cancelled_at: cancelled?.cancelledAt?.toISOString() ?? null
        },
        traceId
      )
    );
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
    if (!(await guardStudioSyncWritable(res, traceId, creatorId.trim()))) {
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

  /**
   * Audience & Promotion — creator-authorized simulation read (Layer A×C outcomes).
   * Not blocked by studio sync-write guard; always evaluates with isContentOwner: false.
   */
  app.get(
    "/api/v1/gallery/posts/:post_id/audience-simulation",
    async (req: Request, res: Response) => {
      const traceId = traceIdFrom(req);
      if (!config.prisma) {
        return res
          .status(503)
          .json(errorEnvelope("SERVICE_UNAVAILABLE", "Database not configured.", traceId));
      }
      const prisma = config.prisma;
      const session = await requirePatronBearerSession(req, res, traceId);
      if (!session) return;
      const postId = String(req.params.post_id ?? "").trim();
      const creatorId =
        typeof req.query.creator_id === "string" ? req.query.creator_id.trim() : "";
      if (!postId || !creatorId) {
        return res.status(400).json(
          errorEnvelope("VALIDATION_ERROR", "post_id and creator_id are required.", traceId, [
            { field: "post_id", issue: postId ? "ok" : "missing" },
            { field: "creator_id", issue: creatorId ? "ok" : "missing" }
          ])
        );
      }
      if (!(await requireAccountMatchesCreator(req, res, traceId, creatorId))) {
        return;
      }
      if (!(await assertCreatorRelayMutationAllowed(req, res, traceId, prisma, creatorId))) {
        return;
      }
      const envelope = await loadAudienceSimulationForCreatorPost(prisma, creatorId, postId);
      if (!envelope) {
        return res.status(404).json(errorEnvelope("NOT_FOUND", "Post not found.", traceId));
      }
      res.setHeader("Cache-Control", "private, no-store");
      return res.status(200).json(successEnvelope(envelope, traceId));
    }
  );

  /** Slice 4 — creator Patreon discount code library (creator-supplied; no coupon creation). */
  app.get("/api/v1/creator/discount-codes", async (req: Request, res: Response) => {
    const traceId = traceIdFrom(req);
    if (!config.prisma) {
      return res
        .status(503)
        .json(errorEnvelope("SERVICE_UNAVAILABLE", "Database not configured.", traceId));
    }
    const session = await requirePatronBearerSession(req, res, traceId);
    if (!session) return;
    const creatorId =
      typeof req.query.creator_id === "string" ? req.query.creator_id.trim() : "";
    if (!creatorId) {
      return res
        .status(400)
        .json(errorEnvelope("VALIDATION_ERROR", "creator_id is required.", traceId));
    }
    if (!(await requireAccountMatchesCreator(req, res, traceId, creatorId))) return;
    if (!(await assertCreatorRelayMutationAllowed(req, res, traceId, config.prisma, creatorId))) {
      return;
    }
    const codes = await listCreatorDiscountCodes(config.prisma, creatorId);
    res.setHeader("Cache-Control", "private, no-store");
    return res.status(200).json(successEnvelope({ codes }, traceId));
  });

  app.post("/api/v1/creator/discount-codes", async (req: Request, res: Response) => {
    const traceId = traceIdFrom(req);
    if (!config.prisma) {
      return res
        .status(503)
        .json(errorEnvelope("SERVICE_UNAVAILABLE", "Database not configured.", traceId));
    }
    const session = await requirePatronBearerSession(req, res, traceId);
    if (!session) return;
    const body = (req.body ?? {}) as Record<string, unknown>;
    const creatorId = typeof body.creator_id === "string" ? body.creator_id.trim() : "";
    if (!creatorId) {
      return res
        .status(400)
        .json(errorEnvelope("VALIDATION_ERROR", "creator_id is required.", traceId));
    }
    if (!(await requireAccountMatchesCreator(req, res, traceId, creatorId))) return;
    if (!(await assertCreatorRelayMutationAllowed(req, res, traceId, config.prisma, creatorId))) {
      return;
    }
    if (!(await guardStudioSyncWritable(res, traceId, creatorId))) return;
    try {
      const code = await createCreatorDiscountCode(config.prisma, {
        creatorId,
        code: body.code,
        percentOff: body.percent_off,
        label: body.label
      });
      res.setHeader("Cache-Control", "private, no-store");
      return res.status(201).json(successEnvelope({ code }, traceId));
    } catch (e) {
      if (e instanceof DiscountCodeValidationError) {
        return res
          .status(400)
          .json(errorEnvelope("VALIDATION_ERROR", e.message, traceId, e.details));
      }
      throw e;
    }
  });

  app.patch("/api/v1/creator/discount-codes/:code_id", async (req: Request, res: Response) => {
    const traceId = traceIdFrom(req);
    if (!config.prisma) {
      return res
        .status(503)
        .json(errorEnvelope("SERVICE_UNAVAILABLE", "Database not configured.", traceId));
    }
    const session = await requirePatronBearerSession(req, res, traceId);
    if (!session) return;
    const codeId = String(req.params.code_id ?? "").trim();
    const body = (req.body ?? {}) as Record<string, unknown>;
    const creatorId = typeof body.creator_id === "string" ? body.creator_id.trim() : "";
    if (!codeId || !creatorId) {
      return res
        .status(400)
        .json(errorEnvelope("VALIDATION_ERROR", "code_id and creator_id are required.", traceId));
    }
    if (!(await requireAccountMatchesCreator(req, res, traceId, creatorId))) return;
    if (!(await assertCreatorRelayMutationAllowed(req, res, traceId, config.prisma, creatorId))) {
      return;
    }
    if (!(await guardStudioSyncWritable(res, traceId, creatorId))) return;
    try {
      const code = await updateCreatorDiscountCode(config.prisma, {
        creatorId,
        codeId,
        label: body.label,
        percentOff: body.percent_off,
        active: body.active
      });
      if (!code) {
        return res.status(404).json(errorEnvelope("NOT_FOUND", "Code not found.", traceId));
      }
      res.setHeader("Cache-Control", "private, no-store");
      return res.status(200).json(successEnvelope({ code }, traceId));
    } catch (e) {
      if (e instanceof DiscountCodeValidationError) {
        return res
          .status(400)
          .json(errorEnvelope("VALIDATION_ERROR", e.message, traceId, e.details));
      }
      throw e;
    }
  });

  /** Slice 9 — live creator tier-promotion defaults (unpermissioned locked viewers). */
  app.get("/api/v1/creator/tier-promotion-defaults", async (req: Request, res: Response) => {
    const traceId = traceIdFrom(req);
    if (!config.prisma) {
      return res
        .status(503)
        .json(errorEnvelope("SERVICE_UNAVAILABLE", "Database not configured.", traceId));
    }
    const session = await requirePatronBearerSession(req, res, traceId);
    if (!session) return;
    const creatorId =
      typeof req.query.creator_id === "string" ? req.query.creator_id.trim() : "";
    if (!creatorId) {
      return res
        .status(400)
        .json(errorEnvelope("VALIDATION_ERROR", "creator_id is required.", traceId));
    }
    if (!(await requireAccountMatchesCreator(req, res, traceId, creatorId))) return;
    if (!(await assertCreatorRelayMutationAllowed(req, res, traceId, config.prisma, creatorId))) {
      return;
    }
    const defaults = await listCreatorTierPromotionDefaults(config.prisma, creatorId);
    res.setHeader("Cache-Control", "private, no-store");
    return res.status(200).json(successEnvelope({ defaults }, traceId));
  });

  app.put("/api/v1/creator/tier-promotion-defaults", async (req: Request, res: Response) => {
    const traceId = traceIdFrom(req);
    if (!config.prisma) {
      return res
        .status(503)
        .json(errorEnvelope("SERVICE_UNAVAILABLE", "Database not configured.", traceId));
    }
    const session = await requirePatronBearerSession(req, res, traceId);
    if (!session) return;
    const body = (req.body ?? {}) as Record<string, unknown>;
    const creatorId = typeof body.creator_id === "string" ? body.creator_id.trim() : "";
    if (!creatorId) {
      return res
        .status(400)
        .json(errorEnvelope("VALIDATION_ERROR", "creator_id is required.", traceId));
    }
    if (!(await requireAccountMatchesCreator(req, res, traceId, creatorId))) return;
    if (!(await assertCreatorRelayMutationAllowed(req, res, traceId, config.prisma, creatorId))) {
      return;
    }
    if (!(await guardStudioSyncWritable(res, traceId, creatorId))) return;
    try {
      const tierDefault = await upsertCreatorTierPromotionDefault(config.prisma, {
        creatorId,
        gateRelayTierId: body.gate_relay_tier_id,
        segment: body.segment,
        discountCodeId: body.discount_code_id,
        headline: body.headline,
        ctaText: body.cta_text,
        patreonDestinationUrl: body.patreon_destination_url,
        active: body.active
      });
      res.setHeader("Cache-Control", "private, no-store");
      return res.status(200).json(successEnvelope({ default: tierDefault }, traceId));
    } catch (e) {
      if (e instanceof TierPromotionDefaultValidationError) {
        const notFound = e.details.some((d) => d.issue === "not_found");
        return res
          .status(notFound ? 404 : 400)
          .json(
            errorEnvelope(notFound ? "NOT_FOUND" : "VALIDATION_ERROR", e.message, traceId, e.details)
          );
      }
      throw e;
    }
  });

  app.delete(
    "/api/v1/creator/tier-promotion-defaults/:default_id",
    async (req: Request, res: Response) => {
      const traceId = traceIdFrom(req);
      if (!config.prisma) {
        return res
          .status(503)
          .json(errorEnvelope("SERVICE_UNAVAILABLE", "Database not configured.", traceId));
      }
      const session = await requirePatronBearerSession(req, res, traceId);
      if (!session) return;
      const defaultId = String(req.params.default_id ?? "").trim();
      const creatorId =
        typeof req.query.creator_id === "string"
          ? req.query.creator_id.trim()
          : typeof (req.body as { creator_id?: unknown } | undefined)?.creator_id === "string"
            ? String((req.body as { creator_id: string }).creator_id).trim()
            : "";
      if (!defaultId || !creatorId) {
        return res.status(400).json(
          errorEnvelope("VALIDATION_ERROR", "default_id and creator_id are required.", traceId)
        );
      }
      if (!(await requireAccountMatchesCreator(req, res, traceId, creatorId))) return;
      if (!(await assertCreatorRelayMutationAllowed(req, res, traceId, config.prisma, creatorId))) {
        return;
      }
      if (!(await guardStudioSyncWritable(res, traceId, creatorId))) return;
      const deleted = await deleteCreatorTierPromotionDefault(config.prisma, {
        creatorId,
        defaultId
      });
      if (!deleted) {
        return res.status(404).json(errorEnvelope("NOT_FOUND", "Tier default not found.", traceId));
      }
      res.setHeader("Cache-Control", "private, no-store");
      return res.status(200).json(successEnvelope({ deleted: true }, traceId));
    }
  );

  app.post(
    "/api/v1/creator/tier-promotion-defaults/:default_id/tracked-link",
    async (req: Request, res: Response) => {
      const traceId = traceIdFrom(req);
      if (!config.prisma) {
        return res
          .status(503)
          .json(errorEnvelope("SERVICE_UNAVAILABLE", "Database not configured.", traceId));
      }
      const session = await requirePatronBearerSession(req, res, traceId);
      if (!session) return;
      const defaultId = String(req.params.default_id ?? "").trim();
      const body = (req.body ?? {}) as Record<string, unknown>;
      const creatorId = typeof body.creator_id === "string" ? body.creator_id.trim() : "";
      if (!defaultId || !creatorId) {
        return res.status(400).json(
          errorEnvelope("VALIDATION_ERROR", "default_id and creator_id are required.", traceId)
        );
      }
      if (!(await requireAccountMatchesCreator(req, res, traceId, creatorId))) return;
      if (!(await assertCreatorRelayMutationAllowed(req, res, traceId, config.prisma, creatorId))) {
        return;
      }
      if (!(await guardStudioSyncWritable(res, traceId, creatorId))) return;
      try {
        const minted = await ensureTierDefaultRedirectSlug(config.prisma, {
          creatorId,
          defaultId
        });
        res.setHeader("Cache-Control", "private, no-store");
        return res.status(200).json(
          successEnvelope(
            {
              redirect_slug: minted.redirect_slug,
              public_path: minted.public_path
            },
            traceId
          )
        );
      } catch (e) {
        if (e instanceof TierPromotionDefaultValidationError) {
          const notFound = e.details.some((d) => d.issue === "not_found");
          return res
            .status(notFound ? 404 : 400)
            .json(
              errorEnvelope(
                notFound ? "NOT_FOUND" : "VALIDATION_ERROR",
                e.message,
                traceId,
                e.details
              )
            );
        }
        throw e;
      }
    }
  );

  app.get("/api/v1/gallery/posts/:post_id/marketing-offers", async (req: Request, res: Response) => {
    const traceId = traceIdFrom(req);
    if (!config.prisma) {
      return res
        .status(503)
        .json(errorEnvelope("SERVICE_UNAVAILABLE", "Database not configured.", traceId));
    }
    const session = await requirePatronBearerSession(req, res, traceId);
    if (!session) return;
    const postId = String(req.params.post_id ?? "").trim();
    const creatorId =
      typeof req.query.creator_id === "string" ? req.query.creator_id.trim() : "";
    if (!postId || !creatorId) {
      return res
        .status(400)
        .json(errorEnvelope("VALIDATION_ERROR", "post_id and creator_id are required.", traceId));
    }
    if (!(await requireAccountMatchesCreator(req, res, traceId, creatorId))) return;
    if (!(await assertCreatorRelayMutationAllowed(req, res, traceId, config.prisma, creatorId))) {
      return;
    }
    const offers = await listPostMarketingOffers(config.prisma, creatorId, postId);
    res.setHeader("Cache-Control", "private, no-store");
    return res.status(200).json(successEnvelope({ offers }, traceId));
  });

  app.put("/api/v1/gallery/posts/:post_id/marketing-offers", async (req: Request, res: Response) => {
    const traceId = traceIdFrom(req);
    if (!config.prisma) {
      return res
        .status(503)
        .json(errorEnvelope("SERVICE_UNAVAILABLE", "Database not configured.", traceId));
    }
    const session = await requirePatronBearerSession(req, res, traceId);
    if (!session) return;
    const postId = String(req.params.post_id ?? "").trim();
    const body = (req.body ?? {}) as Record<string, unknown>;
    const creatorId = typeof body.creator_id === "string" ? body.creator_id.trim() : "";
    if (!postId || !creatorId) {
      return res
        .status(400)
        .json(errorEnvelope("VALIDATION_ERROR", "post_id and creator_id are required.", traceId));
    }
    if (!(await requireAccountMatchesCreator(req, res, traceId, creatorId))) return;
    if (!(await assertCreatorRelayMutationAllowed(req, res, traceId, config.prisma, creatorId))) {
      return;
    }
    if (!(await guardStudioSyncWritable(res, traceId, creatorId))) return;
    try {
      const offer = await upsertPostMarketingOffer(config.prisma, {
        creatorId,
        postId,
        audienceKey: body.audience_key,
        discountCodeId: body.discount_code_id,
        headline: body.headline,
        ctaText: body.cta_text,
        patreonDestinationUrl: body.patreon_destination_url,
        active: body.active
      });
      res.setHeader("Cache-Control", "private, no-store");
      return res.status(200).json(successEnvelope({ offer }, traceId));
    } catch (e) {
      if (e instanceof PostOfferValidationError) {
        const notFound = e.details.some((d) => d.issue === "not_found");
        return res
          .status(notFound ? 404 : 400)
          .json(
            errorEnvelope(notFound ? "NOT_FOUND" : "VALIDATION_ERROR", e.message, traceId, e.details)
          );
      }
      throw e;
    }
  });

  /** Mint / return immutable tracked-link slug for an offer (does not change destination). */
  app.post(
    "/api/v1/gallery/posts/:post_id/marketing-offers/:offer_id/tracked-link",
    async (req: Request, res: Response) => {
      const traceId = traceIdFrom(req);
      if (!config.prisma) {
        return res
          .status(503)
          .json(errorEnvelope("SERVICE_UNAVAILABLE", "Database not configured.", traceId));
      }
      const session = await requirePatronBearerSession(req, res, traceId);
      if (!session) return;
      const postId = String(req.params.post_id ?? "").trim();
      const offerId = String(req.params.offer_id ?? "").trim();
      const body = (req.body ?? {}) as Record<string, unknown>;
      const creatorId = typeof body.creator_id === "string" ? body.creator_id.trim() : "";
      if (!postId || !offerId || !creatorId) {
        return res.status(400).json(
          errorEnvelope("VALIDATION_ERROR", "post_id, offer_id, and creator_id are required.", traceId)
        );
      }
      if (!(await requireAccountMatchesCreator(req, res, traceId, creatorId))) return;
      if (!(await assertCreatorRelayMutationAllowed(req, res, traceId, config.prisma, creatorId))) {
        return;
      }
      if (!(await guardStudioSyncWritable(res, traceId, creatorId))) return;
      try {
        const minted = await ensureOfferRedirectSlug(config.prisma, {
          creatorId,
          postId,
          offerId
        });
        res.setHeader("Cache-Control", "private, no-store");
        return res.status(200).json(
          successEnvelope(
            {
              redirect_slug: minted.redirect_slug,
              public_path: minted.public_path
            },
            traceId
          )
        );
      } catch (e) {
        if (e instanceof PostOfferValidationError) {
          const notFound = e.details.some((d) => d.issue === "not_found");
          return res
            .status(notFound ? 404 : 400)
            .json(
              errorEnvelope(
                notFound ? "NOT_FOUND" : "VALIDATION_ERROR",
                e.message,
                traceId,
                e.details
              )
            );
        }
        throw e;
      }
    }
  );

  /**
   * Public tracked offer redirect — destination from DB only (Slice 7).
   * @see docs/studio/TRACKED_OFFER_LINKS.md
   */
  app.get("/go/:slug", async (req: Request, res: Response) => {
    const traceId = traceIdFrom(req);
    if (!config.prisma) {
      return res
        .status(503)
        .json(errorEnvelope("SERVICE_UNAVAILABLE", "Database not configured.", traceId));
    }
    const slug = String(req.params.slug ?? "").trim();
    const resolved = await resolveOfferRedirect(config.prisma, slug);
    if (resolved.status === "not_found") {
      return res.status(404).json(errorEnvelope("NOT_FOUND", "Tracked link not found.", traceId));
    }
    if (resolved.status === "gone") {
      return res
        .status(410)
        .json(errorEnvelope("GONE", "Tracked link is unavailable.", traceId, [
          { field: "slug", issue: resolved.reason }
        ]));
    }
    try {
      const referrerHost = referrerHostFromHeader(
        typeof req.headers.referer === "string" ? req.headers.referer : null
      );
      if (resolved.kind === "offer") {
        await recordOfferLinkClick(config.prisma, {
          offerId: resolved.offerId,
          creatorId: resolved.creatorId,
          postId: resolved.postId,
          referrerHost
        });
      } else {
        await recordTierDefaultLinkClick(config.prisma, {
          tierDefaultId: resolved.tierDefaultId,
          creatorId: resolved.creatorId,
          referrerHost
        });
      }
    } catch {
      /* click write must not block redirect */
    }
    res.setHeader("Cache-Control", "no-store");
    return res.redirect(302, resolved.location);
  });

  /**
   * BO-RPB-04 — Relay `PostPresentation` upsert (titles, descriptions, media order, tier preview JSON).
   * Does not touch canonical ingest; auth parity with `gallery/media/bulk-tags` (+ MT-010 secret / tenant guard).
   */
  app.patch("/api/v1/gallery/posts/:post_id/presentation", async (req: Request, res: Response) => {
    const traceId = traceIdFrom(req);
    if (!config.prisma) {
      return res
        .status(503)
        .json(errorEnvelope("SERVICE_UNAVAILABLE", "Database not configured.", traceId));
    }
    const prisma = config.prisma;
    const session = await requirePatronBearerSession(req, res, traceId);
    if (!session) return;
    const postId = String(req.params.post_id ?? "").trim();
    const body = (req.body ?? {}) as Record<string, unknown>;
    const creatorId = typeof body.creator_id === "string" ? body.creator_id.trim() : "";
    if (!postId || !creatorId) {
      return res.status(400).json(
        errorEnvelope("VALIDATION_ERROR", "post_id and creator_id are required.", traceId, [
          { field: "post_id", issue: postId ? "ok" : "missing" },
          { field: "creator_id", issue: creatorId ? "ok" : "missing" }
        ])
      );
    }
    if (!(await requireAccountMatchesCreator(req, res, traceId, creatorId))) {
      return;
    }
    if (
      !(await assertCreatorRelayMutationAllowed(req, res, traceId, prisma, creatorId))
    ) {
      return;
    }
    if (!(await guardStudioSyncWritable(res, traceId, creatorId))) {
      return;
    }
    const touched = presentationPatchTouches(body);
    if (touched.size === 0) {
      return res.status(400).json(
        errorEnvelope(
          "VALIDATION_ERROR",
          "Provide at least one of relay_title, relay_description, media_order, tier_preview_settings, promo_preview_media_id.",
          traceId,
          [{ field: "body", issue: "empty_patch" }]
        )
      );
    }
    let fragments: ReturnType<typeof derivePresentationUpsertFragments>;
    try {
      fragments = derivePresentationUpsertFragments(body, touched);
    } catch (err) {
      const label =
        err instanceof Error && typeof err.message === "string" && err.message.startsWith("VALIDATION:")
          ? err.message.slice("VALIDATION:".length)
          : "unknown";
      const detail =
        label === "media_order_dupes"
          ? "media_order must not contain duplicate ids."
          : "Invalid patch field types.";
      return res.status(400).json(
        errorEnvelope("VALIDATION_ERROR", detail, traceId, [{ field: label || "body", issue: "invalid" }])
      );
    }
    if (fragments.mediaOrder !== undefined) {
      const mediaOk = await validateMediaIdsBelongToPost(
        prisma,
        creatorId,
        postId,
        fragments.mediaOrder
      );
      if (!mediaOk.ok) {
        return res
          .status(400)
          .json(errorEnvelope("VALIDATION_ERROR", mediaOk.message, traceId, [{ field: "media_order", issue: "invalid" }]));
      }
    }
    if (fragments.promoPreviewMediaId) {
      const promoOk = await validatePromoPreviewMediaForCreator(
        prisma,
        creatorId,
        fragments.promoPreviewMediaId
      );
      if (!promoOk.ok) {
        return res.status(400).json(
          errorEnvelope("VALIDATION_ERROR", promoOk.message, traceId, [
            { field: "promo_preview_media_id", issue: "invalid" }
          ])
        );
      }
    }
    const owned = await prisma.post.findFirst({
      where: { id: postId, creatorId },
      select: { id: true }
    });
    if (!owned) {
      return res.status(404).json(errorEnvelope("NOT_FOUND", "Post not found.", traceId));
    }
    const createPayload: Prisma.PostPresentationUncheckedCreateInput = {
      creatorId,
      postId,
      relayTitle: fragments.relayTitle ?? null,
      relayDescription: fragments.relayDescription ?? null,
      mediaOrder: fragments.mediaOrder ?? [],
      ...(fragments.tierPreviewSettings !== undefined
        ? {
            tierPreviewSettings:
              fragments.tierPreviewSettings === null
                ? Prisma.DbNull
                : fragments.tierPreviewSettings
          }
        : {}),
      ...(fragments.promoPreviewMediaId !== undefined
        ? { promoPreviewMediaId: fragments.promoPreviewMediaId }
        : {})
    };
    const updatePayload: Prisma.PostPresentationUncheckedUpdateInput = {};
    if (fragments.relayTitle !== undefined) updatePayload.relayTitle = fragments.relayTitle;
    if (fragments.relayDescription !== undefined)
      updatePayload.relayDescription = fragments.relayDescription;
    if (fragments.mediaOrder !== undefined) updatePayload.mediaOrder = fragments.mediaOrder;
    if (fragments.tierPreviewSettings !== undefined) {
      updatePayload.tierPreviewSettings =
        fragments.tierPreviewSettings === null ? Prisma.DbNull : fragments.tierPreviewSettings;
    }
    if (fragments.promoPreviewMediaId !== undefined) {
      updatePayload.promoPreviewMediaId = fragments.promoPreviewMediaId;
    }
    const row = await prisma.postPresentation.upsert({
      where: { postId },
      create: createPayload,
      update: updatePayload
    });
    res.setHeader("Cache-Control", "private, no-store");
    return res.status(200).json(
      successEnvelope(
        {
          presentation: {
            post_id: row.postId,
            relay_title: row.relayTitle,
            relay_description: row.relayDescription,
            media_order: row.mediaOrder,
            tier_preview_settings: row.tierPreviewSettings ?? null,
            promo_preview_media_id: row.promoPreviewMediaId ?? null,
            updated_at: row.updatedAt.toISOString()
          }
        },
        traceId
      )
    );
  });

  /**
   * Creator-owned audience tier gate on canonical post/version rows (not `PostPresentation`).
   * Accepts Prisma `Tier.id` or `relayTierId` in `tier_ids`; persists canonical relay keys on the version.
   */
  app.patch("/api/v1/gallery/posts/:post_id/audience-access", async (req: Request, res: Response) => {
    const traceId = traceIdFrom(req);
    if (!config.prisma) {
      return res
        .status(503)
        .json(errorEnvelope("SERVICE_UNAVAILABLE", "Database not configured.", traceId));
    }
    const prisma = config.prisma;
    const session = await requirePatronBearerSession(req, res, traceId);
    if (!session) return;
    const postId = String(req.params.post_id ?? "").trim();
    const body = (req.body ?? {}) as Record<string, unknown>;
    const creatorId = typeof body.creator_id === "string" ? body.creator_id.trim() : "";
    if (!postId || !creatorId) {
      return res.status(400).json(
        errorEnvelope("VALIDATION_ERROR", "post_id and creator_id are required.", traceId, [
          { field: "post_id", issue: postId ? "ok" : "missing" },
          { field: "creator_id", issue: creatorId ? "ok" : "missing" }
        ])
      );
    }
    if (!(await requireAccountMatchesCreator(req, res, traceId, creatorId))) {
      return;
    }
    if (
      !(await assertCreatorRelayMutationAllowed(req, res, traceId, prisma, creatorId))
    ) {
      return;
    }
    if (!(await guardStudioSyncWritable(res, traceId, creatorId))) {
      return;
    }
    const isPublic = body.is_public === true;
    const isPublicFalse = body.is_public === false;
    const tierIdsRaw = Array.isArray(body.tier_ids) ? (body.tier_ids as unknown[]) : [];
    const tierKeys = tierIdsRaw
      .filter((x): x is string => typeof x === "string" && x.trim().length > 0)
      .map((x) => x.trim());
    if (!isPublic && !isPublicFalse && tierKeys.length === 0) {
      return res.status(400).json(
        errorEnvelope(
          "VALIDATION_ERROR",
          "Provide is_public and/or tier_ids.",
          traceId,
          [{ field: "body", issue: "empty_patch" }]
        )
      );
    }
    const gated = isPublicFalse || (!isPublic && tierKeys.length > 0);
    if (gated && tierKeys.length === 0) {
      return res.status(400).json(
        errorEnvelope(
          "VALIDATION_ERROR",
          "tier_ids is required when is_public is false.",
          traceId,
          [{ field: "tier_ids", issue: "missing" }]
        )
      );
    }
    const owned = await prisma.post.findFirst({
      where: { id: postId, creatorId },
      select: { id: true, campaignId: true, source: true }
    });
    if (!owned) {
      return res.status(404).json(errorEnvelope("NOT_FOUND", "Post not found.", traceId));
    }
    const versionTierRelayIds: string[] = [];
    if (!isPublic && tierKeys.length > 0) {
      try {
        for (const key of tierKeys) {
          const resolved = await resolveRelayPostTier(
            prisma,
            creatorId,
            key,
            owned.campaignId
          );
          versionTierRelayIds.push(resolved.relayTierId);
        }
      } catch (e) {
        if (e instanceof RelayCreatePostError) {
          return res
            .status(e.statusCode)
            .json(errorEnvelope(e.code, e.message, traceId, [{ field: "tier_ids", issue: "invalid" }]));
        }
        throw e;
      }
    }
    const uniqueRelayTierIds = [...new Set(versionTierRelayIds)];
    const out = await updatePostAudienceTierGate(prisma, {
      creatorId,
      postId,
      tierIds: uniqueRelayTierIds,
      isPublic: isPublic || uniqueRelayTierIds.length === 0
    });
    res.setHeader("Cache-Control", "private, no-store");
    return res.status(200).json(
      successEnvelope(
        {
          post_id: out.postId,
          is_public: out.isPublic,
          tier_ids: out.tierIds,
          source: owned.source
        },
        traceId
      )
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
    if (!(await guardStudioSyncWritable(res, traceId, cid))) {
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
    if (!(await guardStudioSyncWritable(res, traceId, creatorId))) {
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
    if (!(await guardStudioSyncWritable(res, traceId, triageCid))) {
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
    if (!(await guardStudioSyncWritable(res, traceId, autoCid))) {
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
    if (!(await guardStudioSyncWritable(res, traceId, creatorId))) {
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
    if (!(await guardStudioSyncWritable(res, traceId, collCid))) {
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
    if (!(await guardStudioSyncWritable(res, traceId, existingCol.creator_id))) {
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
    if (!(await guardStudioSyncWritable(res, traceId, colDel.creator_id))) {
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
    if (!(await guardStudioSyncWritable(res, traceId, col.creator_id))) {
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
    if (!(await guardStudioSyncWritable(res, traceId, colRm.creator_id))) {
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
    if (!(await guardStudioSyncWritable(res, traceId, reorderCid))) {
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
    if (!(await guardStudioSyncWritable(res, traceId, layoutCid))) {
      return;
    }
    await layoutStore.save(layoutCid, body as never);
    const layout = await layoutStore.load(layoutCid);
    return res.status(200).json(successEnvelope(layout, traceId));
  });

  app.post("/api/v1/gallery/layout/publish", async (req: Request, res: Response) => {
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
    if (!(await guardStudioSyncWritable(res, traceId, layoutCid))) {
      return;
    }
    if (config.prisma) {
      const block = await getLayoutPublishBlock(config.prisma, layoutCid);
      if (block) {
        const msg =
          block.code === "ONBOARDING_INCOMPLETE"
            ? `Complete onboarding before publishing (current step: ${block.current_step}).`
            : block.code === "SYNC_DEGRADED"
              ? block.sync_health_status === "failed"
                ? "Patreon sync failed — fix sync health before publishing."
                : "Patreon sync is degraded — resolve sync warnings before publishing."
              : `Patreon post sync failed — fix sync health before publishing.${
                  block.message ? ` (${block.message})` : ""
                }`;
        const details =
          block.code === "ONBOARDING_INCOMPLETE"
            ? [{ field: "onboarding_step", issue: block.current_step }]
            : block.code === "SYNC_DEGRADED"
              ? [
                  { field: "sync_health.status", issue: block.sync_health_status },
                  { field: "sync_health.message_key", issue: block.message_key }
                ]
              : [{ field: "sync", issue: "last_post_scrape_failed" }];
        const status = block.code === "SYNC_DEGRADED" ? 409 : 400;
        return res.status(status).json(errorEnvelope(block.code, msg, traceId, details));
      }
    }
    const layout = await layoutStore.publish(layoutCid);
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
    if (!(await guardStudioSyncWritable(res, traceId, secCid))) {
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
    if (!(await guardStudioSyncWritable(res, traceId, creatorId))) {
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
    if (!(await guardStudioSyncWritable(res, traceId, creatorId))) {
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
    if (!(await guardStudioSyncWritable(res, traceId, layoutReorderCid))) {
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
    if (!(await guardStudioSyncWritable(res, traceId, creatorId.trim()))) {
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
    if (!(await guardStudioSyncWritable(res, traceId, cloneCreatorId))) {
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
  // [R-SEC-05 HIGH @security-review 2026-06] Creates/links accounts from an unverified patreon_user_id;
  // disabled in production (see legacyInsecureRouteDisabled). Use real Patreon OAuth. See docs/security-review-2026-06.md.
  app.post("/api/v1/identity/register-patreon", async (req: Request, res: Response) => {
    const traceId = traceIdFrom(req);
    if (legacyInsecureRouteDisabled()) {
      return res
        .status(404)
        .json(errorEnvelope("NOT_FOUND", "This endpoint is disabled. Sign in via Patreon OAuth.", traceId));
    }
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

  // PUBLIC: Deprecated email/password login entry (credentials are the auth; alias of /api/v1/auth/login).
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
    // [R-SEC-05 HIGH @security-review 2026-06] Mints a full session from creator_id + patreon_user_id
    // with NO secret/OAuth proof (patreon_user_id is not secret) — account-takeover path. Disabled in
    // production (see legacyInsecureRouteDisabled); use the real Patreon OAuth exchange instead.
    // See docs/security-review-2026-06.md.
    const traceId = traceIdFrom(req);
    if (legacyInsecureRouteDisabled()) {
      return res
        .status(404)
        .json(errorEnvelope("NOT_FOUND", "This endpoint is disabled. Sign in via Patreon OAuth.", traceId));
    }
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

  registerGoalCycleRoutes(app, {
    prisma: config.prisma,
    identityService,
    buildIdem
  });

  registerGoalCyclePlannerRoutes(app, {
    prisma: config.prisma,
    identityService,
    buildIdem
  });

  registerGoalCycleMaterializationRoutes(app, {
    prisma: config.prisma,
    identityService,
    buildIdem
  });

  registerGoalCycleOutcomeRoutes(app, {
    prisma: config.prisma,
    identityService,
    buildIdem
  });

  registerCoachPlanCreditRoutes(app, {
    prisma: config.prisma,
    identityService
  });

  // EH-041 — Relay-managed Patreon verification (in-memory preview; productionSafe false).
  // EH-042 — billing entitlement gate + product/entitlement routes (webhook mounted earlier with raw body).
  {
    const managedVerifyIssuer =
      process.env.ESCAPE_HATCH_RELAY_ASSERTION_ISSUER?.trim() ||
      "https://relay.local/eh-managed-verify";
    registerManagedVerifyBillingRoutes(app, {
      service: managedVerifyBillingService,
      registerWebhook: false
    });
    const managedVerifyService = createManagedVerifyService({
      issuer: managedVerifyIssuer,
      billingGate: managedVerifyBillingService
    });
    registerManagedVerifyRoutes(app, { service: managedVerifyService });
  }

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

  attachRelaySentryExpressErrorHandler(app);

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
    patreonCampaignCreatorIndex,
    encryption,
    patreonClient,
    subscribeStarCreatorAuthService,
    subscribeStarCreatorOAuthClient,
    subscribeStarGraphqlIngestUrl,
    subscribeStarPatronOAuthClient,
    subscribeStarPatronGraphqlUrl
  };
}
