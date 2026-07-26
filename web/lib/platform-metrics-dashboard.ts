import type { PlatformMetricStatus } from "./platform-metric-status";

export type PlatformMetricSectionKey =
  | "data_coverage"
  | "traffic"
  | "activity"
  | "growth"
  | "revenue"
  | "creator_health"
  | "patron_health"
  | "content_performance"
  | "platform_ops";

export type PlatformMetricSection = {
  key: PlatformMetricSectionKey;
  title: string;
  description: string;
};

export type PlatformMetricCard = {
  key: string;
  label: string;
  section: PlatformMetricSectionKey;
  definition: string;
  formula: string;
  source: string;
  status: PlatformMetricStatus;
  phase: string;
  priority: "P0" | "P1";
  value: number | string | null;
};

export const platformMetricSections: PlatformMetricSection[] = [
  {
    key: "data_coverage",
    title: "Data Coverage",
    description: "Shows whether the analytics program itself is healthy."
  },
  {
    key: "traffic",
    title: "Traffic",
    description: "Shows whether Relay surfaces are being visited."
  },
  {
    key: "activity",
    title: "Activity",
    description: "Shows whether people are returning and using the product."
  },
  {
    key: "growth",
    title: "Growth",
    description: "Shows whether the network is expanding."
  },
  {
    key: "revenue",
    title: "Revenue",
    description: "Shows whether Relay-native monetization is working."
  },
  {
    key: "creator_health",
    title: "Creator Health",
    description: "Shows whether creators reach value."
  },
  {
    key: "patron_health",
    title: "Patron Health",
    description: "Shows whether patrons have a useful return loop."
  },
  {
    key: "content_performance",
    title: "Content Performance",
    description: "Shows which content drives attention and engagement."
  },
  {
    key: "platform_ops",
    title: "Platform Ops",
    description: "Shows whether the system is healthy enough to trust analytics."
  }
];

export const platformMetricCards: PlatformMetricCard[] = [
  {
    key: "coverage.total_metrics",
    label: "Total metrics",
    section: "data_coverage",
    definition: "Count of registered dashboard metrics",
    formula: "COUNT(registry)",
    source: "Metric registry",
    status: "not_wired",
    phase: "2",
    priority: "P0",
    value: null
  },
  {
    key: "coverage.live_metrics",
    label: "Metrics live",
    section: "data_coverage",
    definition: "Metrics with status live",
    formula: "COUNT WHERE status=live",
    source: "Metric registry",
    status: "not_wired",
    phase: "2",
    priority: "P0",
    value: null
  },
  {
    key: "coverage.collecting_metrics",
    label: "Metrics collecting",
    section: "data_coverage",
    definition: "Metrics with status collecting",
    formula: "COUNT WHERE status=collecting",
    source: "Metric registry",
    status: "not_wired",
    phase: "2",
    priority: "P0",
    value: null
  },
  {
    key: "coverage.not_wired_metrics",
    label: "Metrics not wired",
    section: "data_coverage",
    definition: "Metrics still not_wired or pending_instrumentation",
    formula: "COUNT WHERE status IN (not_wired, pending_instrumentation)",
    source: "Metric registry",
    status: "not_wired",
    phase: "2",
    priority: "P0",
    value: null
  },
  {
    key: "coverage.stale_metrics",
    label: "Stale metrics",
    section: "data_coverage",
    definition: "Metrics past freshness threshold",
    formula: "COUNT WHERE freshness=stale",
    source: "Rollup freshness",
    status: "not_wired",
    phase: "5",
    priority: "P0",
    value: null
  },
  {
    key: "coverage.manual_import_metrics",
    label: "Manual import metrics",
    section: "data_coverage",
    definition: "Metrics depending on CSV/manual upload",
    formula: "COUNT WHERE status=manual_import",
    source: "Metric registry",
    status: "not_wired",
    phase: "2",
    priority: "P0",
    value: null
  },
  {
    key: "coverage.last_rollup_at",
    label: "Last rollup",
    section: "data_coverage",
    definition: "Most recent successful daily rollup",
    formula: "MAX(generated_at)",
    source: "Rollup job",
    status: "not_wired",
    phase: "5",
    priority: "P0",
    value: null
  },
  {
    key: "coverage.last_ingest_at",
    label: "Last telemetry ingest",
    section: "data_coverage",
    definition: "Most recent first-party event received",
    formula: "MAX(occurred_at)",
    source: "Event store",
    status: "not_wired",
    phase: "4",
    priority: "P0",
    value: null
  },
  {
    key: "traffic.page_views",
    label: "Page views",
    section: "traffic",
    definition: "Total page view events in window",
    formula: "COUNT(page_view)",
    source: "First-party events",
    status: "not_wired",
    phase: "4-5",
    priority: "P0",
    value: null
  },
  {
    key: "traffic.unique_visitors",
    label: "Unique visitors",
    section: "traffic",
    definition: "Distinct session or visitor keys in window",
    formula: "COUNT(DISTINCT session_key)",
    source: "First-party events",
    status: "not_wired",
    phase: "4-5",
    priority: "P0",
    value: null
  },
  {
    key: "traffic.profile_views",
    label: "Profile views",
    section: "traffic",
    definition: "Public profile page views",
    formula: "COUNT(profile_view)",
    source: "relay_engagement_events / events",
    status: "not_wired",
    phase: "3-4",
    priority: "P0",
    value: null
  },
  {
    key: "traffic.gallery_views",
    label: "Gallery views",
    section: "traffic",
    definition: "Public gallery page views",
    formula: "COUNT(gallery_view)",
    source: "relay_engagement_events / events",
    status: "not_wired",
    phase: "3-4",
    priority: "P0",
    value: null
  },
  {
    key: "traffic.referral_breakdown",
    label: "Referral breakdown",
    section: "traffic",
    definition: "Visits grouped by referrer/source",
    formula: "GROUP BY referrer",
    source: "First-party events",
    status: "deferred",
    phase: "5+",
    priority: "P0",
    value: null
  },
  {
    key: "traffic.anonymous_vs_auth",
    label: "Anonymous vs signed-in",
    section: "traffic",
    definition: "Split of traffic by auth state",
    formula: "GROUP BY auth_state",
    source: "First-party events",
    status: "deferred",
    phase: "5+",
    priority: "P0",
    value: null
  },
  {
    key: "activity.dau",
    label: "DAU",
    section: "activity",
    definition: "Unique active users/sessions in UTC day",
    formula: "COUNT(DISTINCT actor) per day",
    source: "Daily rollup",
    status: "not_wired",
    phase: "5",
    priority: "P0",
    value: null
  },
  {
    key: "activity.wau",
    label: "WAU",
    section: "activity",
    definition: "Unique active users/sessions in 7-day window",
    formula: "Rolling 7d distinct",
    source: "Daily rollup",
    status: "not_wired",
    phase: "5",
    priority: "P0",
    value: null
  },
  {
    key: "activity.mau",
    label: "MAU",
    section: "activity",
    definition: "Unique active users/sessions in 30-day window",
    formula: "Rolling 30d distinct",
    source: "Daily rollup",
    status: "not_wired",
    phase: "5",
    priority: "P0",
    value: null
  },
  {
    key: "activity.active_creators",
    label: "Active creators",
    section: "activity",
    definition: "Creators with qualifying activity in window",
    formula: "COUNT(DISTINCT creator_id)",
    source: "Events + domain tables",
    status: "not_wired",
    phase: "5",
    priority: "P0",
    value: null
  },
  {
    key: "activity.active_patrons",
    label: "Active patrons",
    section: "activity",
    definition: "Patrons with qualifying activity in window",
    formula: "COUNT(DISTINCT patron_id)",
    source: "Events + domain tables",
    status: "not_wired",
    phase: "5",
    priority: "P0",
    value: null
  },
  {
    key: "activity.feed_opens",
    label: "Feed opens",
    section: "activity",
    definition: "Patron feed surface opens",
    formula: "COUNT(feed_open)",
    source: "First-party events",
    status: "not_wired",
    phase: "4",
    priority: "P0",
    value: null
  },
  {
    key: "activity.post_views",
    label: "Post views",
    section: "activity",
    definition: "Post detail or card views",
    formula: "COUNT(post_view)",
    source: "First-party events",
    status: "not_wired",
    phase: "4",
    priority: "P0",
    value: null
  },
  {
    key: "activity.session_starts",
    label: "Session starts",
    section: "activity",
    definition: "New session start events",
    formula: "COUNT(session_start)",
    source: "First-party events",
    status: "not_wired",
    phase: "4",
    priority: "P0",
    value: null
  },
  {
    key: "activity.active_sessions_estimated",
    label: "Active sessions (est.)",
    section: "activity",
    definition: "Recent sessions from DB - proxy only",
    formula: "COUNT(sessions WHERE last_used_at in window)",
    source: "sessions",
    status: "estimated",
    phase: "3",
    priority: "P0",
    value: null
  },
  {
    key: "growth.new_accounts",
    label: "New accounts",
    section: "growth",
    definition: "Accounts created in window",
    formula: "COUNT(accounts WHERE created_at in window)",
    source: "accounts",
    status: "not_wired",
    phase: "3",
    priority: "P0",
    value: null
  },
  {
    key: "growth.new_creators",
    label: "New creators",
    section: "growth",
    definition: "Creator tenants onboarded in window",
    formula: "COUNT(creator_profiles)",
    source: "Domain tables",
    status: "not_wired",
    phase: "3",
    priority: "P0",
    value: null
  },
  {
    key: "growth.new_patrons",
    label: "New patrons",
    section: "growth",
    definition: "Patron memberships created in window",
    formula: "COUNT(tenant_memberships WHERE role=patron)",
    source: "Domain tables",
    status: "not_wired",
    phase: "3",
    priority: "P0",
    value: null
  },
  {
    key: "growth.patreon_creator_connections",
    label: "Patreon creator links",
    section: "growth",
    definition: "Creators with healthy creator OAuth",
    formula: "COUNT(oauth_credentials creator)",
    source: "OAuth tables",
    status: "not_wired",
    phase: "3",
    priority: "P0",
    value: null
  },
  {
    key: "growth.patreon_patron_links",
    label: "Patreon patron links",
    section: "growth",
    definition: "Patrons with patron OAuth linked",
    formula: "COUNT(patron oauth)",
    source: "OAuth tables",
    status: "not_wired",
    phase: "3",
    priority: "P0",
    value: null
  },
  {
    key: "growth.new_follows",
    label: "New follows",
    section: "growth",
    definition: "Follow relationships created in window",
    formula: "COUNT(patron_follows WHERE created_at in window)",
    source: "patron_follows",
    status: "not_wired",
    phase: "3",
    priority: "P0",
    value: null
  },
  {
    key: "growth.activation_rate",
    label: "Activation rate",
    section: "growth",
    definition: "% new creators reaching publish/import milestone",
    formula: "activated / onboarded",
    source: "Onboarding + posts",
    status: "deferred",
    phase: "5+",
    priority: "P1",
    value: null
  },
  {
    key: "growth.repeat_visitor_rate",
    label: "Repeat visitor rate",
    section: "growth",
    definition: "% visitors with 2+ sessions in window",
    formula: "repeat / unique",
    source: "Rollups",
    status: "deferred",
    phase: "5+",
    priority: "P1",
    value: null
  },
  {
    key: "revenue.gross",
    label: "Gross revenue",
    section: "revenue",
    definition: "Relay-native gross before fees/refunds",
    formula: "SUM(amount) WHERE type=gross",
    source: "Checkout/subscription events",
    status: "deferred",
    phase: "6",
    priority: "P0",
    value: null
  },
  {
    key: "revenue.net",
    label: "Net revenue",
    section: "revenue",
    definition: "Relay-native net after fees/refunds",
    formula: "SUM(amount) WHERE type=net",
    source: "Checkout/subscription events",
    status: "deferred",
    phase: "6",
    priority: "P0",
    value: null
  },
  {
    key: "revenue.mrr",
    label: "MRR",
    section: "revenue",
    definition: "Monthly recurring revenue (Relay-native)",
    formula: "Standard MRR rollup",
    source: "Subscription rollups",
    status: "deferred",
    phase: "6",
    priority: "P0",
    value: null
  },
  {
    key: "revenue.arr",
    label: "ARR",
    section: "revenue",
    definition: "ARR",
    formula: "mrr * 12",
    source: "Derived",
    status: "deferred",
    phase: "6",
    priority: "P0",
    value: null
  },
  {
    key: "revenue.arpu",
    label: "ARPU",
    section: "revenue",
    definition: "Revenue per active paying user",
    formula: "revenue / paying_users",
    source: "Derived",
    status: "deferred",
    phase: "6",
    priority: "P0",
    value: null
  },
  {
    key: "revenue.checkout_started",
    label: "Checkout starts",
    section: "revenue",
    definition: "Checkout sessions initiated",
    formula: "COUNT(checkout_started)",
    source: "Payment events",
    status: "deferred",
    phase: "6",
    priority: "P0",
    value: null
  },
  {
    key: "revenue.checkout_completed",
    label: "Checkout completions",
    section: "revenue",
    definition: "Successful checkouts",
    formula: "COUNT(checkout_completed)",
    source: "Payment events",
    status: "deferred",
    phase: "6",
    priority: "P0",
    value: null
  },
  {
    key: "revenue.churn_rate",
    label: "Churn rate",
    section: "revenue",
    definition: "Canceled subs / active subs in period",
    formula: "cancels / active_start",
    source: "Subscription rollups",
    status: "deferred",
    phase: "6",
    priority: "P0",
    value: null
  },
  {
    key: "creator_health.onboarded",
    label: "Creators onboarded",
    section: "creator_health",
    definition: "Creators past connect step",
    formula: "COUNT(onboarding_states)",
    source: "creator_onboarding_states",
    status: "not_wired",
    phase: "3-4",
    priority: "P1",
    value: null
  },
  {
    key: "creator_health.patreon_connected",
    label: "Patreon connected",
    section: "creator_health",
    definition: "Creators with ingest OAuth healthy",
    formula: "Health + OAuth",
    source: "OAuth tables",
    status: "not_wired",
    phase: "3",
    priority: "P1",
    value: null
  },
  {
    key: "creator_health.imports_completed",
    label: "Imports completed",
    section: "creator_health",
    definition: "Completed Patreon import runs",
    formula: "Domain/import jobs",
    source: "Ingest tables",
    status: "not_wired",
    phase: "4",
    priority: "P1",
    value: null
  },
  {
    key: "creator_health.posts_published",
    label: "Relay posts published",
    section: "creator_health",
    definition: "Relay-native posts published",
    formula: "COUNT(posts WHERE source=RELAY)",
    source: "posts",
    status: "not_wired",
    phase: "4",
    priority: "P1",
    value: null
  },
  {
    key: "creator_health.analytics_views",
    label: "Analytics page views",
    section: "creator_health",
    definition: "Creator studio analytics page loads",
    formula: "COUNT(analytics_viewed)",
    source: "Events",
    status: "not_wired",
    phase: "4",
    priority: "P1",
    value: null
  },
  {
    key: "creator_health.action_center_cards",
    label: "Action Center cards",
    section: "creator_health",
    definition: "Recommendation cards shown",
    formula: "COUNT(recommendation_records)",
    source: "Action Center",
    status: "not_wired",
    phase: "3",
    priority: "P1",
    value: null
  },
  {
    key: "patron_health.patreon_linked",
    label: "Patrons linked",
    section: "patron_health",
    definition: "Patrons with Patreon OAuth",
    formula: "OAuth tables",
    source: "Patron OAuth",
    status: "not_wired",
    phase: "3",
    priority: "P1",
    value: null
  },
  {
    key: "patron_health.active_entitlements",
    label: "Active entitlements",
    section: "patron_health",
    definition: "Snapshots with active=true",
    formula: "COUNT WHERE active",
    source: "patron_entitlement_snapshots",
    status: "not_wired",
    phase: "3",
    priority: "P1",
    value: null
  },
  {
    key: "patron_health.stale_entitlements",
    label: "Stale entitlements",
    section: "patron_health",
    definition: "Snapshots past stale_after",
    formula: "COUNT WHERE stale_after < now()",
    source: "patron_entitlement_snapshots",
    status: "not_wired",
    phase: "3",
    priority: "P1",
    value: null
  },
  {
    key: "patron_health.total_follows",
    label: "Total follows",
    section: "patron_health",
    definition: "All patron follow rows",
    formula: "COUNT(patron_follows)",
    source: "patron_follows",
    status: "not_wired",
    phase: "3",
    priority: "P1",
    value: null
  },
  {
    key: "patron_health.favorites",
    label: "Favorites",
    section: "patron_health",
    definition: "Patron favorites created",
    formula: "COUNT(patron_favorites)",
    source: "patron_favorites",
    status: "not_wired",
    phase: "4",
    priority: "P1",
    value: null
  },
  {
    key: "patron_health.comments",
    label: "Comments",
    section: "patron_health",
    definition: "Relay comments created",
    formula: "COUNT(relay_comments)",
    source: "relay_comments",
    status: "not_wired",
    phase: "4",
    priority: "P1",
    value: null
  },
  {
    key: "content.post_views",
    label: "Post views",
    section: "content_performance",
    definition: "Views per post (platform aggregate)",
    formula: "COUNT(post_view) GROUP BY post",
    source: "Events",
    status: "not_wired",
    phase: "4-5",
    priority: "P1",
    value: null
  },
  {
    key: "content.post_reveals",
    label: "Reveal interactions",
    section: "content_performance",
    definition: "Tier reveal interactions",
    formula: "COUNT(reveal_interaction)",
    source: "relay_engagement_events",
    status: "not_wired",
    phase: "4",
    priority: "P1",
    value: null
  },
  {
    key: "content.patreon_impressions",
    label: "Patreon impressions",
    section: "content_performance",
    definition: "Post impressions from Insights CSV",
    formula: "CSV column",
    source: "patreon_insights_post_metrics",
    status: "manual_import",
    phase: "3",
    priority: "P1",
    value: null
  },
  {
    key: "content.patreon_seen",
    label: "Patreon seen",
    section: "content_performance",
    definition: "Post seen from Insights CSV",
    formula: "CSV column",
    source: "patreon_insights_post_metrics",
    status: "manual_import",
    phase: "3",
    priority: "P1",
    value: null
  },
  {
    key: "content.linkage_gaps",
    label: "CSV linkage gaps",
    section: "content_performance",
    definition: "Insights rows without Relay post match",
    formula: "COUNT WHERE post_id IS NULL",
    source: "Insights join",
    status: "manual_import",
    phase: "3",
    priority: "P1",
    value: null
  },
  {
    key: "ops.db_connectivity",
    label: "DB connectivity",
    section: "platform_ops",
    definition: "Prisma can query Postgres",
    formula: "Health check pass/fail",
    source: "/api/v1/health/platform",
    status: "not_wired",
    phase: "3",
    priority: "P0",
    value: null
  },
  {
    key: "ops.db_connection_pressure",
    label: "DB connection pressure",
    section: "platform_ops",
    definition: "Active connections / max_connections",
    formula: "Ratio from pg_stat_activity",
    source: "Platform health",
    status: "not_wired",
    phase: "3",
    priority: "P0",
    value: null
  },
  {
    key: "ops.oauth_unhealthy",
    label: "Unhealthy OAuth",
    section: "platform_ops",
    definition: "Creator + patron credentials not healthy",
    formula: "COUNT WHERE health != healthy",
    source: "OAuth tables",
    status: "not_wired",
    phase: "3",
    priority: "P0",
    value: null
  },
  {
    key: "ops.stale_entitlements",
    label: "Stale entitlements (ops)",
    section: "platform_ops",
    definition: "Patron snapshots past stale_after",
    formula: "Same as patron_health stale",
    source: "Platform health",
    status: "not_wired",
    phase: "3",
    priority: "P0",
    value: null
  },
  {
    key: "ops.analytics_job_health",
    label: "Analytics job health",
    section: "platform_ops",
    definition: "Insight generate success ratio",
    formula: "success / attempts",
    source: "/api/v1/health/studio/analytics",
    status: "not_wired",
    phase: "3",
    priority: "P0",
    value: null
  },
  {
    key: "ops.ingest_health",
    label: "Ingest health",
    section: "platform_ops",
    definition: "Ingest pipeline + DLQ status",
    formula: "Health envelope",
    source: "/api/v1/health/ingest",
    status: "not_wired",
    phase: "3",
    priority: "P0",
    value: null
  },
  {
    key: "ops.export_health",
    label: "Export health",
    section: "platform_ops",
    definition: "Export retrieval metrics",
    formula: "Health envelope",
    source: "/api/v1/health/export",
    status: "not_wired",
    phase: "3",
    priority: "P0",
    value: null
  },
  {
    key: "ops.job_queue_health",
    label: "Job queue health",
    section: "platform_ops",
    definition: "BullMQ queue status",
    formula: "Health envelope",
    source: "/api/v1/health/jobs",
    status: "not_wired",
    phase: "3",
    priority: "P0",
    value: null
  },
  {
    key: "ops.export_content_bytes",
    label: "Export content bytes",
    section: "platform_ops",
    definition: "Full media bytes served",
    formula: "SUM(usage_events WHERE metric=export.media.content.bytes)",
    source: "usage_events",
    status: "collecting",
    phase: "3",
    priority: "P0",
    value: null
  },
  {
    key: "ops.export_thumb_bytes",
    label: "Export thumb bytes",
    section: "platform_ops",
    definition: "Thumbnail bytes served",
    formula: "SUM(usage_events WHERE metric=export.media.thumb.bytes)",
    source: "usage_events",
    status: "collecting",
    phase: "3",
    priority: "P0",
    value: null
  },
  {
    key: "ops.library_zip_downloads",
    label: "Library ZIP downloads",
    section: "platform_ops",
    definition: "Completed library ZIP exports",
    formula: "SUM WHERE metric=export.library_zip.completed",
    source: "usage_events",
    status: "not_wired",
    phase: "3",
    priority: "P0",
    value: null
  },
  {
    key: "ops.api_rate_limited",
    label: "API rate limits",
    section: "platform_ops",
    definition: "429 rate-limit events",
    formula: "COUNT WHERE metric=api.rate_limited",
    source: "usage_events",
    status: "not_wired",
    phase: "3",
    priority: "P0",
    value: null
  },
  {
    key: "ops.supabase_sync_errors",
    label: "Supabase sync errors",
    section: "platform_ops",
    definition: "Auth sync failures since boot",
    formula: "Counter",
    source: "Platform health",
    status: "not_wired",
    phase: "3",
    priority: "P0",
    value: null
  }
];

export function metricsForSection(section: PlatformMetricSectionKey): PlatformMetricCard[] {
  return platformMetricCards.filter((metric) => metric.section === section);
}
