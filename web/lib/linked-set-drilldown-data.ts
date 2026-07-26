/**
 * Phase 6.2 — pure join: gallery Linked Set members + work bundle + instances
 * → data-tree member/leaf views. Credibility: never attach post B’s stats to post A.
 */

import { reachFromTotals } from "@/lib/hero-inspect-data";
import type {
  PerformanceWorkBundleData,
  PerformanceWorkInstancesData,
  PerformanceWorkInstanceRowWire
} from "@/lib/relay-api";

export const DRILLDOWN_PLATFORM_SHORT: Record<string, string> = {
  patreon: "PA",
  x: "X",
  deviantart: "DA",
  bluesky: "BS"
};

export type DrilldownMemberInput = {
  post_id: string;
  member_label: string | null;
  variant_role: string;
  sort_order: number;
  title_fallback?: string | null;
  thumb_src: string | null;
  present: Array<{ destination: string; external_url?: string | null }>;
  missing: string[];
};

export type DrilldownLeafPresent = {
  kind: "present";
  destination: string;
  platform_instance_id: string;
  external_url: string | null;
  stale: boolean;
  refresh_eligible: boolean;
  stats: {
    impressions?: number;
    likes?: number;
    comments?: number;
    reach?: number;
  };
};

export type DrilldownLeafGap = {
  kind: "gap";
  destination: string;
};

export type DrilldownLeaf = DrilldownLeafPresent | DrilldownLeafGap;

export type DrilldownMemberView = {
  post_id: string;
  member_label: string;
  variant_role: string;
  is_cover: boolean;
  thumb_src: string | null;
  total_reach: number;
  present_short: string[];
  platform_instances: PerformanceWorkInstanceRowWire[];
  missing_destinations: string[];
  leaves: DrilldownLeaf[];
  platform_slot_count: number;
};

export type DrilldownAggregate = {
  member_count: number;
  total_reach: number;
  impressions: number;
  likes: number;
  comments: number;
  teaser_rows: Array<{ post_id: string; label: string; total_reach: number }>;
};

function memberLabel(input: DrilldownMemberInput): string {
  const labeled = input.member_label?.trim();
  if (labeled) return labeled;
  const title = input.title_fallback?.trim();
  if (title) return title;
  return input.post_id;
}

function shortFor(destination: string): string {
  return DRILLDOWN_PLATFORM_SHORT[destination] ?? destination.slice(0, 2).toUpperCase();
}

function leavesForMember(args: {
  post_id: string;
  present: DrilldownMemberInput["present"];
  missing: string[];
  bundle: PerformanceWorkBundleData | null;
  instances: PerformanceWorkInstancesData | null;
}): DrilldownLeaf[] {
  const variant = args.bundle?.variants.find((v) => v.post_id === args.post_id);
  const destTotals = new Map(
    (variant?.by_destination ?? []).map((d) => [d.destination, d] as const)
  );
  const instancePost = args.instances?.posts.find((p) => p.post_id === args.post_id);
  const instanceByDest = new Map(
    (instancePost?.platform_instances ?? []).map((row) => [row.destination, row] as const)
  );

  const presentLeaves: DrilldownLeafPresent[] = [];
  const seen = new Set<string>();

  // Prefer live instances when available; fall back to gallery present chips.
  const presentDests =
    instanceByDest.size > 0
      ? [...instanceByDest.keys()]
      : args.present.map((p) => p.destination);

  for (const destination of presentDests) {
    if (seen.has(destination)) continue;
    seen.add(destination);
    const inst = instanceByDest.get(destination);
    const totals = destTotals.get(destination);
    const galleryUrl =
      args.present.find((p) => p.destination === destination)?.external_url ?? null;
    presentLeaves.push({
      kind: "present",
      destination,
      platform_instance_id: inst?.platform_instance_id ?? `${args.post_id}__${destination}`,
      external_url: (inst?.external_url ?? galleryUrl)?.trim() || null,
      stale: Boolean(inst?.stale),
      refresh_eligible: Boolean(inst?.refresh_eligible),
      stats: totals
        ? {
            impressions: totals.impressions,
            likes: totals.likes,
            comments: totals.comments,
            reach: reachFromTotals(totals)
          }
        : {
            impressions: 0,
            likes: 0,
            comments: 0,
            reach: 0
          }
    });
  }

  const missing = args.missing.filter((d) => !seen.has(d));
  const gapLeaves: DrilldownLeafGap[] = missing.map((destination) => ({
    kind: "gap" as const,
    destination
  }));

  return [...presentLeaves, ...gapLeaves];
}

/** Join gallery members with live bundle/instances. Order follows input (already sorted). */
export function buildDrilldownMembers(args: {
  members: DrilldownMemberInput[];
  coverPostId: string;
  bundle: PerformanceWorkBundleData | null;
  instances: PerformanceWorkInstancesData | null;
}): DrilldownMemberView[] {
  const reachByPost = new Map(
    (args.bundle?.variants ?? []).map((v) => [v.post_id, v.total_reach] as const)
  );

  return args.members.map((m) => {
    const instancePost = args.instances?.posts.find((p) => p.post_id === m.post_id);
    const platform_instances = instancePost?.platform_instances ?? [];
    const leaves = leavesForMember({
      post_id: m.post_id,
      present: m.present,
      missing: m.missing,
      bundle: args.bundle,
      instances: args.instances
    });
    const present_short = m.present.map((p) => shortFor(p.destination));
    return {
      post_id: m.post_id,
      member_label: memberLabel(m),
      variant_role: m.variant_role,
      is_cover: m.post_id === args.coverPostId,
      thumb_src: m.thumb_src,
      total_reach: reachByPost.get(m.post_id) ?? 0,
      present_short,
      platform_instances,
      missing_destinations: m.missing,
      leaves,
      platform_slot_count: leaves.length
    };
  });
}

/** Set-level totals from live bundle; teaser rows from role_breakdown / member roles. */
export function buildDrilldownAggregate(args: {
  members: DrilldownMemberView[];
  bundle: PerformanceWorkBundleData | null;
}): DrilldownAggregate {
  const { bundle, members } = args;
  const teaserRoles = new Set(["teaser", "promo", "repost"]);
  const teaser_rows = members
    .filter((m) => teaserRoles.has(m.variant_role))
    .map((m) => ({
      post_id: m.post_id,
      label: m.member_label,
      total_reach: m.total_reach
    }));

  if (!bundle) {
    const total_reach = members.reduce((s, m) => s + m.total_reach, 0);
    return {
      member_count: members.length,
      total_reach,
      impressions: 0,
      likes: 0,
      comments: 0,
      teaser_rows
    };
  }

  return {
    member_count: members.length,
    total_reach: bundle.total_reach,
    impressions: bundle.totals.impressions,
    likes: bundle.totals.likes,
    comments: bundle.totals.comments,
    teaser_rows
  };
}

export function fmtCompact(n: number | undefined): string {
  const v = n ?? 0;
  if (Number.isNaN(v)) return "0";
  if (v >= 1000) return `${(v / 1000).toFixed(1).replace(/\.0$/, "")}k`;
  return v.toLocaleString();
}
