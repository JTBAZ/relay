/**
 * Phase 6 — pure join: performance work bundle + instances → hero inspect model.
 * Credibility: never paint post B’s stats under post A’s key.
 */

import type {
  CreatorUnifiedPerformanceMetricTotals,
  PerformanceVariantRoleBreakdownWire,
  PerformanceVariantRoleMetricsWire,
  PerformanceWorkBundleData,
  PerformanceWorkInstancesData
} from "@/lib/relay-api";
import { PRESENCE_DESTINATIONS } from "@/app/components/distribution/platform-presence-chips";

export type HeroInspectKey = {
  creative_work_id: string | null;
  post_id: string;
  range?: "7d" | "30d" | "90d";
};

export type HeroPlatformRow = {
  destination: string;
  present: boolean;
  external_url: string | null;
  stats: {
    reach?: number;
    impressions?: number;
    likes?: number;
    comments?: number;
  };
  refresh_eligible?: boolean;
  platform_instance_id?: string | null;
};

export type HeroRelayPanel = {
  label: string;
  total_reach: number;
  impressions: number;
  likes: number;
  comments: number;
  by_destination: Array<{ destination: string; reach: number }>;
};

export type HeroMediaThumb = {
  media_id: string;
  thumb_src: string;
  caption?: string | null;
};

export type HeroInspectModel = {
  key: HeroInspectKey;
  title: string;
  thumb_src: string | null;
  variant_role: string | null;
  member_label: string | null;
  empty_reason: "no_work" | "not_in_work" | "error" | null;
  rows: HeroPlatformRow[];
  gaps: string[];
  gap_source_post_id: string | null;
  instances_ok: boolean;
  relay: {
    merged: HeroRelayPanel;
    ads_teasers: HeroRelayPanel;
    canonical: HeroRelayPanel;
  } | null;
};

export type HeroPreviewHints = {
  title?: string | null;
  thumb_src?: string | null;
  member_label?: string | null;
  variant_role?: string | null;
};

export const HERO_DEFAULT_RANGE = "30d" as const;

export const HERO_EMPTY_COPY: Record<
  NonNullable<HeroInspectModel["empty_reason"]>,
  string
> = {
  no_work: "No packaging work yet",
  not_in_work: "This post isn’t in that package",
  error: "Couldn’t load packaging stats"
};

export function reachFromTotals(
  totals: Pick<
    CreatorUnifiedPerformanceMetricTotals,
    "impressions" | "seen" | "views"
  >
): number {
  return totals.impressions + totals.seen + totals.views;
}

export function heroKeyToken(key: HeroInspectKey): string {
  return `${key.creative_work_id ?? ""}::${key.post_id}::${key.range ?? HERO_DEFAULT_RANGE}`;
}

export function heroKeysEqual(a: HeroInspectKey, b: HeroInspectKey): boolean {
  return heroKeyToken(a) === heroKeyToken(b);
}

function emptyModel(
  key: HeroInspectKey,
  empty_reason: HeroInspectModel["empty_reason"],
  hints?: HeroPreviewHints
): HeroInspectModel {
  return {
    key,
    title: hints?.title?.trim() || "Post",
    thumb_src: hints?.thumb_src ?? null,
    variant_role: hints?.variant_role ?? null,
    member_label: hints?.member_label ?? null,
    empty_reason,
    rows: [],
    gaps: [],
    gap_source_post_id: null,
    instances_ok: false,
    relay: null
  };
}

function rolePanel(
  label: string,
  metrics: PerformanceVariantRoleMetricsWire | undefined,
  fallbackTotals?: CreatorUnifiedPerformanceMetricTotals,
  fallbackByDest?: Array<CreatorUnifiedPerformanceMetricTotals & { destination: string }>
): HeroRelayPanel {
  if (metrics) {
    return {
      label,
      total_reach: metrics.total_reach,
      impressions: metrics.totals.impressions,
      likes: metrics.totals.likes,
      comments: metrics.totals.comments,
      by_destination: metrics.by_destination.map((d) => ({
        destination: d.destination,
        reach: reachFromTotals(d)
      }))
    };
  }
  const by = fallbackByDest ?? [];
  const totals = fallbackTotals ?? {
    impressions: 0,
    seen: 0,
    likes: 0,
    comments: 0,
    views: 0
  };
  return {
    label,
    total_reach: reachFromTotals(totals),
    impressions: totals.impressions,
    likes: totals.likes,
    comments: totals.comments,
    by_destination: by.map((d) => ({
      destination: d.destination,
      reach: reachFromTotals(d)
    }))
  };
}

function sumRoleMetrics(
  parts: Array<PerformanceVariantRoleMetricsWire | undefined>
): PerformanceVariantRoleMetricsWire | undefined {
  const present = parts.filter(Boolean) as PerformanceVariantRoleMetricsWire[];
  if (present.length === 0) return undefined;
  const byDest = new Map<string, CreatorUnifiedPerformanceMetricTotals>();
  let impressions = 0;
  let seen = 0;
  let likes = 0;
  let comments = 0;
  let views = 0;
  const postIds = new Set<string>();
  let memberCount = 0;
  for (const p of present) {
    memberCount += p.member_count;
    for (const id of p.post_ids) postIds.add(id);
    impressions += p.totals.impressions;
    seen += p.totals.seen;
    likes += p.totals.likes;
    comments += p.totals.comments;
    views += p.totals.views;
    for (const d of p.by_destination) {
      const cur = byDest.get(d.destination) ?? {
        impressions: 0,
        seen: 0,
        likes: 0,
        comments: 0,
        views: 0
      };
      byDest.set(d.destination, {
        impressions: cur.impressions + d.impressions,
        seen: cur.seen + d.seen,
        likes: cur.likes + d.likes,
        comments: cur.comments + d.comments,
        views: cur.views + d.views
      });
    }
  }
  const totals = { impressions, seen, likes, comments, views };
  return {
    member_count: memberCount,
    post_ids: [...postIds],
    total_reach: reachFromTotals(totals),
    totals,
    by_destination: [...byDest.entries()].map(([destination, t]) => ({
      destination,
      ...t
    }))
  };
}

function buildRelay(
  bundle: PerformanceWorkBundleData,
  breakdown: PerformanceVariantRoleBreakdownWire | undefined
): HeroInspectModel["relay"] {
  if (!breakdown) return null;
  const ads = sumRoleMetrics([breakdown.teaser, breakdown.promo, breakdown.repost]);
  const canonical = sumRoleMetrics([breakdown.full, breakdown.standalone]);
  return {
    merged: rolePanel("All platforms", undefined, bundle.totals, bundle.by_destination),
    ads_teasers: rolePanel("Ads + teasers", ads),
    canonical: rolePanel("Canonical", canonical)
  };
}

/**
 * Join bundle + instances into a hero model for `key`.
 * Pass `instancesOk: true` only after a successful instances fetch (Relay View gate).
 */
export function buildHeroInspectModel(args: {
  key: HeroInspectKey;
  bundle: PerformanceWorkBundleData | null;
  instances: PerformanceWorkInstancesData | null;
  instancesOk: boolean;
  hints?: HeroPreviewHints;
  error?: boolean;
}): HeroInspectModel {
  const { key, hints } = args;

  if (args.error) {
    return emptyModel(key, "error", hints);
  }

  if (!key.creative_work_id?.trim()) {
    return emptyModel(key, "no_work", hints);
  }

  if (!args.bundle) {
    return emptyModel(key, "error", hints);
  }

  const variant = args.bundle.variants.find((v) => v.post_id === key.post_id);
  if (!variant) {
    return {
      ...emptyModel(key, "not_in_work", {
        ...hints,
        title: hints?.title ?? args.bundle.title
      }),
      title: hints?.title?.trim() || args.bundle.title || "Post"
    };
  }

  const instancePost =
    args.instances?.posts.find((p) => p.post_id === key.post_id) ?? null;
  const instanceByDest = new Map(
    (instancePost?.platform_instances ?? []).map((row) => [row.destination, row])
  );

  const presentDests = new Set<string>();
  const rows: HeroPlatformRow[] = [];

  for (const destRow of variant.by_destination) {
    // Relay rollup belongs in Relay View, not the per-platform column (v0 grammar).
    if (destRow.destination === "relay") continue;
    presentDests.add(destRow.destination);
    const inst = instanceByDest.get(destRow.destination);
    const fromVariant = variant.platform_instances.find(
      (pi) => pi.destination === destRow.destination
    );
    rows.push({
      destination: destRow.destination,
      present: true,
      external_url: inst?.external_url ?? fromVariant?.external_url ?? null,
      stats: {
        reach: reachFromTotals(destRow),
        impressions: destRow.impressions,
        likes: destRow.likes,
        comments: destRow.comments
      },
      refresh_eligible: inst?.refresh_eligible,
      platform_instance_id: inst?.platform_instance_id ?? fromVariant?.platform_instance_id ?? null
    });
  }

  // Instances present on this post but missing from by_destination metrics.
  for (const inst of instancePost?.platform_instances ?? []) {
    if (inst.destination === "relay") continue;
    if (presentDests.has(inst.destination)) continue;
    presentDests.add(inst.destination);
    rows.push({
      destination: inst.destination,
      present: true,
      external_url: inst.external_url,
      stats: {
        reach: 0,
        impressions: 0,
        likes: 0,
        comments: 0
      },
      refresh_eligible: inst.refresh_eligible,
      platform_instance_id: inst.platform_instance_id
    });
  }

  const presenceSet = new Set<string>(PRESENCE_DESTINATIONS);
  const gaps = (args.bundle.crosspost_gaps.missing_destinations ?? []).filter(
    (d) => presenceSet.has(d) || !presentDests.has(d)
  );

  const suggested = args.bundle.crosspost_gaps.suggested_source_post_id?.trim() || null;
  const gap_source_post_id =
    suggested === key.post_id || !suggested ? key.post_id : suggested;

  const relay =
    args.instancesOk && args.bundle.role_breakdown
      ? buildRelay(args.bundle, args.bundle.role_breakdown)
      : null;

  return {
    key,
    title: hints?.title?.trim() || variant.title || args.bundle.title || "Post",
    thumb_src: hints?.thumb_src ?? null,
    variant_role: hints?.variant_role ?? variant.variant_role ?? null,
    member_label: hints?.member_label ?? null,
    empty_reason: null,
    rows,
    gaps: gaps.filter((d) => !presentDests.has(d)),
    gap_source_post_id,
    instances_ok: args.instancesOk,
    relay
  };
}
