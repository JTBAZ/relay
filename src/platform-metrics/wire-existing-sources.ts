import { OAuthPurpose, PostSource, TenantRole, CredentialHealth, PlatformRevenueEventKind, PlatformRevenueSourceLabel, type PrismaClient } from "@prisma/client";
import { evaluateExportRetrievalHealth } from "../export/export-retrieval-metrics.js";
import { evaluatePlatformOperationsHealth } from "../health/platform-operations-metrics.js";
import { evaluateInsightJobHealth } from "../analytics/insight-job-metrics.js";
import { evaluateIngestHealthGates } from "../ingest/ingest-health-metrics.js";
import { getLatestPlatformMetricRollupGeneratedAt, getLatestSystemRollupMetricValue, sumSystemRollupMetricValues } from "./platform-metric-daily-rollup-service.js";
import { evaluateRollupFreshness } from "./platform-metric-trend-service.js";
import type { WiredMetricPatch } from "./metric-registry-types.js";

const USAGE_METRICS = [
  "export.media.content.bytes",
  "export.media.thumb.bytes",
  "export.library_zip.completed",
  "api.rate_limited"
] as const;

const SESSION_WINDOW_DAYS = 30;

function patch(
  map: Map<string, WiredMetricPatch>,
  key: string,
  update: WiredMetricPatch
): void {
  map.set(key, update);
}

function healthLabel(status: "ok" | "degraded" | "limited"): string {
  if (status === "ok") return "ok";
  if (status === "degraded") return "degraded";
  return "limited";
}

function ratioPercent(successes: number, failures: number): number | null {
  const denom = successes + failures;
  if (denom <= 0) return null;
  return Math.round((successes / denom) * 1000) / 10;
}

async function sumUsageMetric(
  prisma: PrismaClient,
  metric: string
): Promise<bigint> {
  const row = await prisma.usageEvent.aggregate({
    where: { metric },
    _sum: { quantity: true }
  });
  return row._sum.quantity ?? 0n;
}

/**
 * Phase 3 wiring — populate registry metrics from health endpoints and domain tables.
 */
export async function wireExistingPlatformMetricSources(args: {
  prisma: PrismaClient | undefined;
  pendingRetryJobs: number;
  dlqRecordCount: number;
}): Promise<Map<string, WiredMetricPatch>> {
  const wired = new Map<string, WiredMetricPatch>();
  const now = new Date().toISOString();

  const platformHealth = await evaluatePlatformOperationsHealth(args.prisma);
  const ingestHealth = await evaluateIngestHealthGates({
    pendingRetryJobs: args.pendingRetryJobs,
    dlqRecordCount: args.dlqRecordCount
  });
  const analyticsHealth = evaluateInsightJobHealth();
  const exportHealth = evaluateExportRetrievalHealth();

  patch(wired, "ops.db_connectivity", {
    value: platformHealth.database.connectivity_ok ? 1 : 0,
    status: "live",
    freshnessState: "fresh",
    lastUpdatedAt: now
  });

  if (
    platformHealth.database.backend_connections !== null &&
    platformHealth.database.max_connections !== null &&
    platformHealth.database.max_connections > 0
  ) {
    const ratio =
      platformHealth.database.backend_connections /
      platformHealth.database.max_connections;
    patch(wired, "ops.db_connection_pressure", {
      value: Math.round(ratio * 1000) / 10,
      status: "live",
      freshnessState: ratio >= 0.9 ? "stale" : "fresh",
      lastUpdatedAt: now
    });
  } else {
    patch(wired, "ops.db_connection_pressure", {
      value: null,
      status: "collecting",
      freshnessState: "unknown",
      lastUpdatedAt: now
    });
  }

  patch(wired, "ops.oauth_unhealthy", {
    value:
      platformHealth.patreon_oauth.creator_credentials_unhealthy +
      platformHealth.patreon_oauth.patron_credentials_unhealthy,
    status: "live",
    freshnessState: "fresh",
    lastUpdatedAt: now
  });

  patch(wired, "ops.stale_entitlements", {
    value: platformHealth.patron_entitlements.snapshots_past_stale_after,
    status: "live",
    freshnessState: "fresh",
    lastUpdatedAt: now
  });

  patch(wired, "ops.supabase_sync_errors", {
    value: platformHealth.auth_routes.supabase_sync_auth_error_total,
    status: "live",
    freshnessState: "fresh",
    lastUpdatedAt: now
  });

  patch(wired, "ops.ingest_health", {
    value: healthLabel(ingestHealth.alerts.length > 0 ? "degraded" : "ok"),
    status: "live",
    freshnessState: ingestHealth.alerts.length > 0 ? "stale" : "fresh",
    lastUpdatedAt: now
  });

  const queueDegraded =
    args.pendingRetryJobs > 0 ||
    ingestHealth.dlq_record_count > 0 ||
    ingestHealth.alerts.length > 0;
  patch(wired, "ops.job_queue_health", {
    value: queueDegraded ? "degraded" : "ok",
    status: "live",
    freshnessState: queueDegraded ? "stale" : "fresh",
    lastUpdatedAt: now
  });

  const analyticsRatio = ratioPercent(
    analyticsHealth.metrics.generate_successes,
    analyticsHealth.metrics.generate_failures
  );
  patch(wired, "ops.analytics_job_health", {
    value: analyticsRatio ?? "no samples",
    status: analyticsRatio === null ? "collecting" : "live",
    freshnessState: analyticsHealth.alerts.length > 0 ? "stale" : "fresh",
    lastUpdatedAt: now
  });

  const exportRatio = exportHealth.metrics.content_retrieval_ratio;
  patch(wired, "ops.export_health", {
    value:
      exportRatio === null
        ? "no samples"
        : Math.round(exportRatio * 1000) / 10,
    status: exportRatio === null ? "collecting" : "live",
    freshnessState: exportHealth.alerts.length > 0 ? "stale" : "fresh",
    lastUpdatedAt: now
  });

  if (!args.prisma) {
    return wired;
  }

  const prisma = args.prisma;
  const sessionWindowStart = new Date(Date.now() - SESSION_WINDOW_DAYS * 24 * 60 * 60 * 1000);

  for (const metric of USAGE_METRICS) {
    const total = await sumUsageMetric(prisma, metric);
    const key =
      metric === "export.media.content.bytes"
        ? "ops.export_content_bytes"
        : metric === "export.media.thumb.bytes"
          ? "ops.export_thumb_bytes"
          : metric === "export.library_zip.completed"
            ? "ops.library_zip_downloads"
            : "ops.api_rate_limited";

    patch(wired, key, {
      value: Number(total),
      status: total > 0n ? "live" : "collecting",
      freshnessState: "fresh",
      lastUpdatedAt: now
    });
  }

  const [
    accountCount,
    creatorCount,
    patronMembershipCount,
    creatorOAuthHealthy,
    creatorOAuthConnectedHealthy,
    patronOAuthCount,
    followCount,
    activeEntitlements,
    staleEntitlements,
    patronLinkedCount,
    importBatchCount,
    relayPostsPublished,
    analyticsViewEvents,
    actionCenterInteractionEvents,
    recommendationRecordCount,
    creatorOnboardingCount,
    sessionStartEvents,
    activeCreatorRows,
    activePatronRows,
    favoriteCount,
    commentCount,
    patreonInsightsAgg,
    patreonInsightsRows,
    patreonInsightsLinkageGaps
  ] = await Promise.all([
    prisma.account.count(),
    prisma.account.count({ where: { primaryRelayCreatorId: { not: null } } }),
    prisma.tenantMembership.count({ where: { role: TenantRole.patron } }),
    prisma.oAuthCredential.count({
      where: { purpose: OAuthPurpose.creator_ingest }
    }),
    prisma.oAuthCredential.count({
      where: {
        purpose: OAuthPurpose.creator_ingest,
        healthStatus: CredentialHealth.healthy
      }
    }),
    prisma.patronOAuthCredential.count(),
    prisma.patronFollow.count(),
    prisma.patronEntitlementSnapshot.count({ where: { active: true } }),
    prisma.patronEntitlementSnapshot.count({
      where: { staleAfter: { lt: new Date() } }
    }),
    prisma.patronOAuthCredential.count(),
    prisma.ingestIdempotencyKey.count(),
    prisma.post.count({ where: { source: PostSource.RELAY } }),
    prisma.platformTelemetryEvent.count({ where: { eventName: "analytics_viewed" } }),
    prisma.platformTelemetryEvent.count({ where: { eventName: "action_center_used" } }),
    prisma.recommendationRecord.count(),
    prisma.creatorOnboardingState.count(),
    prisma.platformTelemetryEvent.count({ where: { eventName: "session_start" } }),
    prisma.platformTelemetryEvent.findMany({
      where: {
        occurredAt: { gte: sessionWindowStart },
        creatorId: { not: null }
      },
      distinct: ["creatorId"],
      select: { creatorId: true }
    }),
    prisma.platformTelemetryEvent.findMany({
      where: {
        occurredAt: { gte: sessionWindowStart },
        actorKey: { not: null },
        eventName: { in: ["feed_open", "post_view", "favorite_created", "comment_created"] }
      },
      distinct: ["actorKey"],
      select: { actorKey: true }
    }),
    prisma.patronFavorite.count(),
    prisma.comment.count({ where: { deletedAt: null } }),
    prisma.patreonInsightsPostMetric.aggregate({
      _sum: { impressions: true, seen: true }
    }),
    prisma.patreonInsightsPostMetric.count(),
    prisma.patreonInsightsPostMetric.count({ where: { postId: null } })
  ]);

  patch(wired, "growth.new_accounts", {
    value: accountCount,
    status: "live",
    freshnessState: "fresh",
    lastUpdatedAt: now
  });
  patch(wired, "growth.new_creators", {
    value: creatorCount,
    status: "live",
    freshnessState: "fresh",
    lastUpdatedAt: now
  });
  patch(wired, "growth.new_patrons", {
    value: patronMembershipCount,
    status: "live",
    freshnessState: "fresh",
    lastUpdatedAt: now
  });
  patch(wired, "growth.patreon_creator_connections", {
    value: creatorOAuthHealthy,
    status: "live",
    freshnessState: "fresh",
    lastUpdatedAt: now
  });
  patch(wired, "growth.patreon_patron_links", {
    value: patronOAuthCount,
    status: "live",
    freshnessState: "fresh",
    lastUpdatedAt: now
  });
  patch(wired, "growth.new_follows", {
    value: followCount,
    status: "live",
    freshnessState: "fresh",
    lastUpdatedAt: now
  });

  patch(wired, "activity.active_creators", {
    value: activeCreatorRows.length,
    status: activeCreatorRows.length > 0 ? "live" : "collecting",
    freshnessState: "fresh",
    lastUpdatedAt: now
  });
  patch(wired, "activity.active_patrons", {
    value: activePatronRows.length,
    status: activePatronRows.length > 0 ? "live" : "collecting",
    freshnessState: "fresh",
    lastUpdatedAt: now
  });
  patch(wired, "activity.session_starts", {
    value: sessionStartEvents,
    status: sessionStartEvents > 0 ? "live" : "collecting",
    freshnessState: "fresh",
    lastUpdatedAt: now
  });

  patch(wired, "patron_health.patreon_linked", {
    value: patronLinkedCount,
    status: "live",
    freshnessState: "fresh",
    lastUpdatedAt: now
  });
  patch(wired, "patron_health.active_entitlements", {
    value: activeEntitlements,
    status: "live",
    freshnessState: "fresh",
    lastUpdatedAt: now
  });
  patch(wired, "patron_health.stale_entitlements", {
    value: staleEntitlements,
    status: "live",
    freshnessState: "fresh",
    lastUpdatedAt: now
  });
  patch(wired, "patron_health.total_follows", {
    value: followCount,
    status: "live",
    freshnessState: "fresh",
    lastUpdatedAt: now
  });
  patch(wired, "patron_health.favorites", {
    value: favoriteCount,
    status: favoriteCount > 0 ? "live" : "collecting",
    freshnessState: "fresh",
    lastUpdatedAt: now
  });
  patch(wired, "patron_health.comments", {
    value: commentCount,
    status: commentCount > 0 ? "live" : "collecting",
    freshnessState: "fresh",
    lastUpdatedAt: now
  });

  patch(wired, "creator_health.onboarded", {
    value: creatorOnboardingCount,
    status: creatorOnboardingCount > 0 ? "live" : "collecting",
    freshnessState: "fresh",
    lastUpdatedAt: now
  });
  patch(wired, "creator_health.patreon_connected", {
    value: creatorOAuthConnectedHealthy,
    status: "live",
    freshnessState: "fresh",
    lastUpdatedAt: now
  });
  patch(wired, "creator_health.imports_completed", {
    value: importBatchCount,
    status: importBatchCount > 0 ? "live" : "collecting",
    freshnessState: "fresh",
    lastUpdatedAt: now
  });
  patch(wired, "creator_health.posts_published", {
    value: relayPostsPublished,
    status: relayPostsPublished > 0 ? "live" : "collecting",
    freshnessState: "fresh",
    lastUpdatedAt: now
  });
  patch(wired, "creator_health.analytics_views", {
    value: analyticsViewEvents,
    status: analyticsViewEvents > 0 ? "live" : "collecting",
    freshnessState: "fresh",
    lastUpdatedAt: now
  });
  patch(wired, "creator_health.action_center_cards", {
    value: Math.max(recommendationRecordCount, actionCenterInteractionEvents),
    status:
      recommendationRecordCount > 0 || actionCenterInteractionEvents > 0 ? "live" : "collecting",
    freshnessState: "fresh",
    lastUpdatedAt: now
  });

  const relayNative = PlatformRevenueSourceLabel.relay_native;
  const [
    checkoutStartedCount,
    checkoutCompletedCount,
    checkoutFailedCount,
    subscriptionCreatedCount,
    subscriptionUpgradedCount,
    subscriptionDowngradedCount,
    subscriptionCanceledCount,
    refundIssuedCount,
    grossAgg,
    netAgg
  ] = await Promise.all([
    prisma.platformRevenueEvent.count({
      where: { sourceLabel: relayNative, eventKind: PlatformRevenueEventKind.checkout_started }
    }),
    prisma.platformRevenueEvent.count({
      where: { sourceLabel: relayNative, eventKind: PlatformRevenueEventKind.checkout_completed }
    }),
    prisma.platformRevenueEvent.count({
      where: { sourceLabel: relayNative, eventKind: PlatformRevenueEventKind.checkout_failed }
    }),
    prisma.platformRevenueEvent.count({
      where: { sourceLabel: relayNative, eventKind: PlatformRevenueEventKind.subscription_created }
    }),
    prisma.platformRevenueEvent.count({
      where: { sourceLabel: relayNative, eventKind: PlatformRevenueEventKind.subscription_upgraded }
    }),
    prisma.platformRevenueEvent.count({
      where: { sourceLabel: relayNative, eventKind: PlatformRevenueEventKind.subscription_downgraded }
    }),
    prisma.platformRevenueEvent.count({
      where: { sourceLabel: relayNative, eventKind: PlatformRevenueEventKind.subscription_canceled }
    }),
    prisma.platformRevenueEvent.count({
      where: { sourceLabel: relayNative, eventKind: PlatformRevenueEventKind.refund_issued }
    }),
    prisma.platformRevenueEvent.aggregate({
      where: {
        sourceLabel: relayNative,
        eventKind: {
          in: [
            PlatformRevenueEventKind.checkout_completed,
            PlatformRevenueEventKind.subscription_created
          ]
        }
      },
      _sum: { amountCents: true }
    }),
    prisma.platformRevenueEvent.aggregate({
      where: {
        sourceLabel: relayNative,
        netAmountCents: { not: null }
      },
      _sum: { netAmountCents: true }
    })
  ]);

  const grossCents = grossAgg._sum.amountCents ?? 0;
  const netCents = netAgg._sum.netAmountCents ?? grossCents;
  const hasCheckoutActivity = checkoutCompletedCount > 0 || checkoutStartedCount > 0;
  const revenueCollecting = hasCheckoutActivity ? "collecting" as const : "deferred" as const;

  patch(wired, "revenue.checkout_started", {
    value: checkoutStartedCount,
    status: checkoutStartedCount > 0 ? "collecting" : "deferred",
    freshnessState: "fresh",
    lastUpdatedAt: now
  });
  patch(wired, "revenue.checkout_completed", {
    value: checkoutCompletedCount,
    status: checkoutCompletedCount > 0 ? "collecting" : "deferred",
    freshnessState: "fresh",
    lastUpdatedAt: now
  });
  patch(wired, "revenue.checkout_failed", {
    value: checkoutFailedCount,
    status: checkoutFailedCount > 0 ? "collecting" : "deferred",
    freshnessState: "fresh",
    lastUpdatedAt: now
  });
  patch(wired, "revenue.gross", {
    value: grossCents / 100,
    status: checkoutCompletedCount > 0 ? "collecting" : "deferred",
    freshnessState: "fresh",
    lastUpdatedAt: now
  });
  patch(wired, "revenue.net", {
    value: netCents / 100,
    status: checkoutCompletedCount > 0 ? "collecting" : "deferred",
    freshnessState: "fresh",
    lastUpdatedAt: now
  });
  patch(wired, "revenue.mrr", {
    value: subscriptionCreatedCount,
    status: subscriptionCreatedCount > 0 ? "collecting" : revenueCollecting,
    freshnessState: "fresh",
    lastUpdatedAt: now
  });
  patch(wired, "revenue.arr", {
    value: subscriptionCreatedCount > 0 ? subscriptionCreatedCount * 12 : null,
    status: subscriptionCreatedCount > 0 ? "collecting" : revenueCollecting,
    freshnessState: "fresh",
    lastUpdatedAt: now
  });
  patch(wired, "revenue.upgrades", {
    value: subscriptionUpgradedCount,
    status: subscriptionUpgradedCount > 0 ? "collecting" : revenueCollecting,
    freshnessState: "fresh",
    lastUpdatedAt: now
  });
  patch(wired, "revenue.downgrades", {
    value: subscriptionDowngradedCount,
    status: subscriptionDowngradedCount > 0 ? "collecting" : revenueCollecting,
    freshnessState: "fresh",
    lastUpdatedAt: now
  });
  patch(wired, "revenue.refunds", {
    value: refundIssuedCount,
    status: refundIssuedCount > 0 ? "collecting" : revenueCollecting,
    freshnessState: "fresh",
    lastUpdatedAt: now
  });
  patch(wired, "revenue.churn_rate", {
    value:
      subscriptionCanceledCount > 0 && subscriptionCreatedCount > 0
        ? Math.round((subscriptionCanceledCount / subscriptionCreatedCount) * 1000) / 10
        : null,
    status: subscriptionCanceledCount > 0 ? "collecting" : revenueCollecting,
    freshnessState: "fresh",
    lastUpdatedAt: now
  });

  const revenueRollupKeys = [
    "revenue.gross",
    "revenue.net",
    "revenue.checkout_started",
    "revenue.checkout_completed",
    "revenue.checkout_failed",
    "revenue.upgrades",
    "revenue.downgrades",
    "revenue.refunds"
  ] as const;
  const revenueRollups = await Promise.all(
    revenueRollupKeys.map(async (metricKey) => ({
      metricKey,
      rollup: await sumSystemRollupMetricValues({ prisma, metricKey })
    }))
  );
  for (const { metricKey, rollup } of revenueRollups) {
    if (!rollup) continue;
    patch(wired, metricKey, {
      value: rollup.value,
      status: "live",
      freshnessState: evaluateRollupFreshness({
        generatedAt: rollup.latestGeneratedAt,
        sourceUpdatedAt: rollup.latestSourceUpdatedAt,
        now: new Date(now)
      }),
      lastUpdatedAt: rollup.latestGeneratedAt ?? now
    });
  }

  const activeSessions = await prisma.session.count({
    where: {
      revokedAt: null,
      OR: [
        { lastUsedAt: { gte: sessionWindowStart } },
        { createdAt: { gte: sessionWindowStart } }
      ]
    }
  });

  patch(wired, "activity.active_sessions_estimated", {
    value: activeSessions,
    status: "estimated",
    freshnessState: "fresh",
    lastUpdatedAt: now
  });

  patch(wired, "content.patreon_impressions", {
    value: patreonInsightsAgg._sum.impressions ?? 0,
    status: "manual_import",
    freshnessState: patreonInsightsRows > 0 ? "fresh" : "unknown",
    lastUpdatedAt: now
  });
  patch(wired, "content.patreon_seen", {
    value: patreonInsightsAgg._sum.seen ?? 0,
    status: "manual_import",
    freshnessState: patreonInsightsRows > 0 ? "fresh" : "unknown",
    lastUpdatedAt: now
  });
  patch(wired, "content.linkage_gaps", {
    value: patreonInsightsLinkageGaps,
    status: "manual_import",
    freshnessState: patreonInsightsRows > 0 ? "fresh" : "unknown",
    lastUpdatedAt: now
  });

  const [lastPlatformTelemetry, lastEngagement] = await Promise.all([
    prisma.platformTelemetryEvent.aggregate({ _max: { occurredAt: true } }),
    prisma.relayEngagementEvent.aggregate({ _max: { occurredAt: true } })
  ]);

  const ingestCandidates = [
    lastPlatformTelemetry._max.occurredAt,
    lastEngagement._max.occurredAt
  ].filter((value): value is Date => value instanceof Date);

  if (ingestCandidates.length > 0) {
    const lastIngestAt = ingestCandidates.reduce((latest, current) =>
      current.getTime() > latest.getTime() ? current : latest
    );
    patch(wired, "coverage.last_ingest_at", {
      value: lastIngestAt.toISOString(),
      status: "live",
      freshnessState: "fresh",
      lastUpdatedAt: now
    });
  } else {
    patch(wired, "coverage.last_ingest_at", {
      value: null,
      status: "collecting",
      freshnessState: "unknown",
      lastUpdatedAt: now
    });
  }

  const [profileViews, galleryViews, postReveals, postViews, feedOpens] = await Promise.all([
    prisma.relayEngagementEvent.count({ where: { eventType: "profile_view" } }),
    prisma.relayEngagementEvent.count({ where: { eventType: "gallery_view" } }),
    prisma.relayEngagementEvent.count({ where: { eventType: "reveal_interaction" } }),
    prisma.platformTelemetryEvent.count({ where: { eventName: "post_view" } }),
    prisma.platformTelemetryEvent.count({ where: { eventName: "feed_open" } })
  ]);

  const rollupTrafficKeys = [
    "traffic.profile_views",
    "traffic.gallery_views",
    "traffic.page_views",
    "traffic.unique_visitors"
  ] as const;
  const rollupActivityWindowKeys = ["activity.dau", "activity.wau", "activity.mau"] as const;

  const [rollupTrafficTotals, rollupActivityLatest] = await Promise.all([
    Promise.all(
      rollupTrafficKeys.map(async (metricKey) => ({
        metricKey,
        rollup: await sumSystemRollupMetricValues({ prisma, metricKey })
      }))
    ),
    Promise.all(
      rollupActivityWindowKeys.map(async (metricKey) => ({
        metricKey,
        rollup: await getLatestSystemRollupMetricValue({ prisma, metricKey })
      }))
    )
  ]);

  const trafficRollupByKey = new Map(
    rollupTrafficTotals.map(({ metricKey, rollup }) => [metricKey, rollup])
  );
  const activityRollupByKey = new Map(
    rollupActivityLatest.map(({ metricKey, rollup }) => [metricKey, rollup])
  );

  function patchFromRollupOrRaw(args: {
    key: string;
    rollupValue: number | null | undefined;
    rawValue: number;
    lastUpdatedAt: string;
    generatedAt?: string | null;
    sourceUpdatedAt?: string | null;
  }): void {
    if (args.rollupValue != null) {
      patch(wired, args.key, {
        value: args.rollupValue,
        status: "live",
        freshnessState: evaluateRollupFreshness({
          generatedAt: args.generatedAt ?? args.lastUpdatedAt,
          sourceUpdatedAt: args.sourceUpdatedAt,
          now: new Date(now)
        }),
        lastUpdatedAt: args.lastUpdatedAt
      });
      return;
    }
    patch(wired, args.key, {
      value: args.rawValue,
      status: args.rawValue > 0 ? "live" : "collecting",
      freshnessState: "unknown",
      lastUpdatedAt: args.lastUpdatedAt
    });
  }

  const profileRollup = trafficRollupByKey.get("traffic.profile_views");
  patchFromRollupOrRaw({
    key: "traffic.profile_views",
    rollupValue: profileRollup?.value,
    rawValue: profileViews,
    lastUpdatedAt: profileRollup?.latestGeneratedAt ?? now,
    generatedAt: profileRollup?.latestGeneratedAt,
    sourceUpdatedAt: profileRollup?.latestSourceUpdatedAt
  });
  const galleryRollup = trafficRollupByKey.get("traffic.gallery_views");
  patchFromRollupOrRaw({
    key: "traffic.gallery_views",
    rollupValue: galleryRollup?.value,
    rawValue: galleryViews,
    lastUpdatedAt: galleryRollup?.latestGeneratedAt ?? now,
    generatedAt: galleryRollup?.latestGeneratedAt,
    sourceUpdatedAt: galleryRollup?.latestSourceUpdatedAt
  });
  const pageRollup = trafficRollupByKey.get("traffic.page_views");
  patchFromRollupOrRaw({
    key: "traffic.page_views",
    rollupValue: pageRollup?.value,
    rawValue: 0,
    lastUpdatedAt: pageRollup?.latestGeneratedAt ?? now,
    generatedAt: pageRollup?.latestGeneratedAt,
    sourceUpdatedAt: pageRollup?.latestSourceUpdatedAt
  });
  const visitorsRollup = trafficRollupByKey.get("traffic.unique_visitors");
  patchFromRollupOrRaw({
    key: "traffic.unique_visitors",
    rollupValue: visitorsRollup?.value,
    rawValue: 0,
    lastUpdatedAt: visitorsRollup?.latestGeneratedAt ?? now,
    generatedAt: visitorsRollup?.latestGeneratedAt,
    sourceUpdatedAt: visitorsRollup?.latestSourceUpdatedAt
  });

  for (const metricKey of rollupActivityWindowKeys) {
    const rollup = activityRollupByKey.get(metricKey);
    if (rollup) {
      patch(wired, metricKey, {
        value: rollup.value,
        status: "live",
        freshnessState: evaluateRollupFreshness({
          generatedAt: rollup.generatedAt,
          sourceUpdatedAt: rollup.sourceUpdatedAt,
          now: new Date(now)
        }),
        lastUpdatedAt: rollup.generatedAt
      });
    } else {
      patch(wired, metricKey, {
        value: null,
        status: "collecting",
        freshnessState: "unknown",
        lastUpdatedAt: now
      });
    }
  }
  patch(wired, "content.post_reveals", {
    value: postReveals,
    status: postReveals > 0 ? "live" : "collecting",
    freshnessState: "fresh",
    lastUpdatedAt: now
  });
  patch(wired, "content.post_views", {
    value: postViews,
    status: postViews > 0 ? "live" : "collecting",
    freshnessState: "fresh",
    lastUpdatedAt: now
  });

  patch(wired, "activity.feed_opens", {
    value: feedOpens,
    status: feedOpens > 0 ? "live" : "collecting",
    freshnessState: "fresh",
    lastUpdatedAt: now
  });

  patch(wired, "activity.post_views", {
    value: postViews,
    status: postViews > 0 ? "live" : "collecting",
    freshnessState: "fresh",
    lastUpdatedAt: now
  });

  const lastRollupAt = await getLatestPlatformMetricRollupGeneratedAt(prisma);
  if (lastRollupAt) {
    patch(wired, "coverage.last_rollup_at", {
      value: lastRollupAt.toISOString(),
      status: "live",
      freshnessState: "fresh",
      lastUpdatedAt: now
    });
  } else {
    patch(wired, "coverage.last_rollup_at", {
      value: null,
      status: "collecting",
      freshnessState: "unknown",
      lastUpdatedAt: now
    });
  }

  return wired;
}
