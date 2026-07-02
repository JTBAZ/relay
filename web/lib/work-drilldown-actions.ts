import type {
  CreatorUnifiedPerformanceMetricTotals,
  PerformanceWorkBundleData
} from "@/lib/relay-api";

export type WorkDrilldownActionTone = "refresh" | "growth" | "guidance";

export type WorkDrilldownAction = {
  id: string;
  title: string;
  body: string;
  tone: WorkDrilldownActionTone;
  href?: string;
};

function reachFromTotals(totals: CreatorUnifiedPerformanceMetricTotals): number {
  return totals.impressions + totals.seen + totals.views;
}

function formatDestinationLabel(destination: string): string {
  if (destination === "patreon") return "Patreon";
  if (destination === "x") return "X";
  if (destination === "deviantart") return "DeviantArt";
  if (destination === "relay") return "Relay";
  return destination;
}

export function deriveWorkDrilldownActions(bundle: PerformanceWorkBundleData): WorkDrilldownAction[] {
  const refreshActions: WorkDrilldownAction[] = [];
  const growthActions: WorkDrilldownAction[] = [];
  const guidanceActions: WorkDrilldownAction[] = [];

  if (bundle.freshness.stale) {
    refreshActions.push({
      id: "refresh-stale-rollups",
      title: "Refresh stale rollups",
      body: "Work performance may be outdated. Refresh linked platform stats or wait for the daily rollup job.",
      tone: "refresh"
    });
  }

  const staleInstances = bundle.variants.flatMap((variant) =>
    variant.platform_instances.filter((instance) => instance.status === "stale")
  );
  if (staleInstances.length > 0) {
    refreshActions.push({
      id: "refresh-stale-instances",
      title: "Refresh stale platform links",
      body: `${staleInstances.length} linked instance${staleInstances.length === 1 ? "" : "s"} marked stale — use refresh on the instance rows below.`,
      tone: "refresh"
    });
  }

  const sortedVariants = [...bundle.variants].sort((a, b) => b.total_reach - a.total_reach);
  const topVariant = sortedVariants[0];
  const secondVariant = sortedVariants[1];

  if (
    topVariant &&
    secondVariant &&
    bundle.total_reach > 0 &&
    topVariant.total_reach >= secondVariant.total_reach * 1.5
  ) {
    const share = Math.round((topVariant.total_reach / bundle.total_reach) * 100);
    growthActions.push({
      id: "double-down-top-variant",
      title: `Double down on ${topVariant.title?.trim() || topVariant.variant_role.replace(/_/g, " ")}`,
      body: `This variant drove about ${share}% of work reach in the selected window.`,
      tone: "growth",
      href: `/studio/preview?post_id=${encodeURIComponent(topVariant.post_id)}`
    });
  }

  const teaserVariant = sortedVariants.find((variant) =>
    variant.variant_role.toLowerCase().includes("teaser")
  );
  const fullVariant = sortedVariants.find(
    (variant) =>
      variant.variant_role.toLowerCase().includes("full") ||
      variant.variant_role.toLowerCase() === "primary"
  );

  if (
    teaserVariant &&
    fullVariant &&
    teaserVariant.total_reach > fullVariant.total_reach * 1.2 &&
    fullVariant.total_reach > 0
  ) {
    guidanceActions.push({
      id: "promote-full-from-teaser",
      title: "Turn teaser momentum into full-piece conversions",
      body: "The teaser reached more people than the full piece — tighten the CTA or repost timing.",
      tone: "guidance",
      href: `/studio/preview?post_id=${encodeURIComponent(fullVariant.post_id)}`
    });
  }

  const activeDestinations = bundle.by_destination.filter((entry) => reachFromTotals(entry) > 0);
  if (activeDestinations.length === 1 && bundle.total_reach > 0) {
    guidanceActions.push({
      id: "expand-platform-mix",
      title: "Test another platform",
      body: `Reach is concentrated on ${formatDestinationLabel(activeDestinations[0]!.destination)} — cross-post variants to compare.`,
      tone: "guidance"
    });
  }

  return [...refreshActions, ...growthActions, ...guidanceActions].slice(0, 5);
}
