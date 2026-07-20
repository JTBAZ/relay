/**
 * Trend provider registry (VS3-T01). Live adapters require approved registry rows (VS10).
 */

import { getGoalCycleFeatureFlags, type GoalCycleTrendMode } from "../contracts.js";
import { FixtureInterestSeriesProvider } from "./fixture-interest-provider.js";
import { FixtureWebDiscoveryProvider } from "./fixture-web-provider.js";
import type { InterestSeriesProvider, WebDiscoveryProvider } from "./provider-types.js";

export type ProviderRegistryEntry = {
  provider_id: string;
  kind: "interest_series" | "web_discovery";
  approval_state: "fixture" | "approved" | "unapproved" | "disabled";
  enabled: boolean;
};

export type ResolvedTrendProviders = {
  mode: GoalCycleTrendMode;
  interest: InterestSeriesProvider | null;
  web: WebDiscoveryProvider | null;
  registry: ProviderRegistryEntry[];
};

const fixtureInterest = new FixtureInterestSeriesProvider();
const fixtureWeb = new FixtureWebDiscoveryProvider();

/**
 * Resolve providers for the current runtime mode.
 * `live` without approved entries falls closed (callers use history).
 */
export function resolveTrendProviders(
  env: NodeJS.ProcessEnv = process.env
): ResolvedTrendProviders {
  const mode = getGoalCycleFeatureFlags(env).trend_mode;
  const registry: ProviderRegistryEntry[] = [
    {
      provider_id: fixtureInterest.provider_id,
      kind: "interest_series",
      approval_state: "fixture",
      enabled: mode === "fixture"
    },
    {
      provider_id: fixtureWeb.provider_id,
      kind: "web_discovery",
      approval_state: "fixture",
      enabled: mode === "fixture"
    }
  ];

  if (mode === "disabled" || mode === "history_only") {
    return { mode, interest: null, web: null, registry };
  }

  if (mode === "fixture") {
    return {
      mode,
      interest: fixtureInterest,
      web: fixtureWeb,
      registry
    };
  }

  // live: no approved live adapters registered in VS3 — fail closed.
  return {
    mode,
    interest: null,
    web: null,
    registry: registry.map((r) => ({ ...r, enabled: false, approval_state: "unapproved" as const }))
  };
}
