"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  fetchCreatorGalleryFacets,
  fetchCreatorOnboarding,
  fetchRelayComposeTiers,
  getCreatorPatronTierSummary,
  getCreatorProfile,
  RELAY_CREATOR_ID_STORAGE_KEY,
  type CreatorOnboardingData,
  type CreatorProfileIdentity,
  type RelayComposeTierRow,
} from "@/lib/relay-api";
import {
  probeRelayExtensionStatus,
  type RelayExtensionStatusProbeResult,
} from "@/lib/relay-extension-messaging";
import type { ImportSignalRowState } from "./ImportSignalRow";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ImportCtaState =
  | "install_extension"
  | "connect_extension"
  | "sync_session"
  | "import_media"
  | "importing"
  | "review_library";

export type ImportReadinessRow = {
  label: string;
  state: ImportSignalRowState;
  detail: string;
};

export type CreatorImportReadiness = {
  loading: boolean;
  profileError: boolean;
  creatorId: string;
  ctaState: ImportCtaState;
  rows: {
    tiers: ImportReadinessRow;
    patrons: ImportReadinessRow;
    revenue: ImportReadinessRow;
    media: ImportReadinessRow;
  };
  extensionProbe: RelayExtensionStatusProbeResult | null;
  /** Call during import to re-poll onboarding + facets. */
  refreshSyncData: () => Promise<void>;
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const EXTENSION_PROBE_INTERVAL_MS = 4000;

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

function formatOnboardingTierDetail(tiers: RelayComposeTierRow[]): string {
  if (tiers.length === 0) {
    return "Tier bins are waiting for import. Relay will use them to organize your media.";
  }
  const parts = tiers.map((tier) => {
    const title = tier.title.trim() || "Tier";
    const dollars = (tier.amount_cents ?? 0) / 100;
    const price =
      Number.isInteger(dollars) ? `$${dollars}` : `$${dollars.toFixed(2)}`;
    return `${title} (${price})`;
  });
  return `Tiers Detected: ${parts.join(", ")}`;
}

function describeExtensionMediaDetail(
  probe: RelayExtensionStatusProbeResult | null,
  exportMediaCount: number | null
): string {
  if (exportMediaCount != null && exportMediaCount > 0) {
    return `${exportMediaCount.toLocaleString()} piece${exportMediaCount === 1 ? "" : "s"} imported into Relay.`;
  }
  if (!probe || !probe.ok) {
    return "Not connected yet. Install the Relay extension to securely sync your Patreon session.";
  }
  if (!probe.hasGrant) {
    return "Connect the Relay extension from Settings or the extension popup.";
  }
  if (!probe.patreonCookiePresent) {
    return "Log into Patreon in this browser, then sync from the extension popup.";
  }
  return "Extension ready. Click Import Media to pull your posts into Relay.";
}

function deriveMediaState(
  onboarding: CreatorOnboardingData | null,
  exportMediaCount: number | null
): ImportSignalRowState {
  const progress = onboarding?.import_progress;
  const syncHealth = onboarding?.sync_health;

  if (syncHealth?.status === "failed" || progress?.last_post_scrape_ok === false) {
    return "failed";
  }
  if (
    syncHealth?.status === "healthy" &&
    exportMediaCount != null &&
    exportMediaCount > 0
  ) {
    return "complete";
  }
  if (
    progress &&
    progress.last_post_scrape_ok === null &&
    progress.last_post_scrape_finished_at === null
  ) {
    return "syncing";
  }
  return "pending";
}

export function deriveCtaState(
  probe: RelayExtensionStatusProbeResult | null,
  mediaState: ImportSignalRowState
): ImportCtaState {
  if (mediaState === "complete") return "review_library";
  if (mediaState === "syncing") return "importing";
  if (!probe || !probe.ok) return "install_extension";
  if (!probe.hasGrant) return "connect_extension";
  if (!probe.patreonCookiePresent) return "sync_session";
  return "import_media";
}

function buildReadiness(input: {
  loading: boolean;
  profileError: boolean;
  creatorId: string;
  hasPatreon: boolean;
  hasSubstar: boolean;
  tiers: RelayComposeTierRow[] | null;
  tiersLoaded: boolean;
  patronSummaryLoaded: boolean;
  patronLine: string | null;
  revenueLine: string | null;
  onboarding: CreatorOnboardingData | null;
  exportMediaCount: number | null;
  extensionProbe: RelayExtensionStatusProbeResult | null;
  refreshSyncData: () => Promise<void>;
}): CreatorImportReadiness {
  const {
    loading,
    profileError,
    creatorId,
    hasPatreon,
    hasSubstar,
    tiers,
    tiersLoaded,
    patronSummaryLoaded,
    patronLine,
    revenueLine,
    onboarding,
    exportMediaCount,
    extensionProbe,
    refreshSyncData,
  } = input;

  const platformConnected = hasPatreon || hasSubstar;
  const businessSnapshotReady = platformConnected || Boolean(tiersLoaded && tiers && tiers.length > 0);

  let tiersState: ImportSignalRowState = "pending";
  let tiersDetail =
    "Tier bins are waiting for import. Relay will use them to organize your media.";
  if (tiersLoaded && tiers && tiers.length > 0) {
    tiersState = "complete";
    tiersDetail = formatOnboardingTierDetail(tiers);
  } else if (tiersLoaded && platformConnected) {
    tiersState = "pending";
    tiersDetail = formatOnboardingTierDetail(tiers ?? []);
  }

  let patronsState: ImportSignalRowState = "pending";
  let patronsDetail = platformConnected
    ? "Membership platform connected; patron snapshot has not synced yet."
    : "No membership platform linked to this studio yet.";
  if (patronSummaryLoaded && patronLine) {
    patronsState = "complete";
    patronsDetail = patronLine;
  } else if (businessSnapshotReady) {
    patronsState = "complete";
    patronsDetail =
      "Membership snapshot connected. Relay will keep patron counts fresh in the background.";
  }

  let revenueState: ImportSignalRowState = "pending";
  let revenueDetail = "Revenue appears after tier and patron snapshots sync.";
  if (patronSummaryLoaded && revenueLine) {
    revenueState = "complete";
    revenueDetail = revenueLine;
  } else if (businessSnapshotReady) {
    revenueState = "complete";
    revenueDetail =
      "Revenue signal connected. Detailed monthly estimates update as patron data refreshes.";
  }

  const mediaState = deriveMediaState(onboarding, exportMediaCount);
  const mediaDetail = describeExtensionMediaDetail(extensionProbe, exportMediaCount);
  const ctaState = deriveCtaState(extensionProbe, mediaState);

  return {
    loading,
    profileError,
    creatorId,
    ctaState,
    extensionProbe,
    refreshSyncData,
    rows: {
      tiers: { label: "Tiers", state: tiersState, detail: tiersDetail },
      patrons: { label: "Patrons", state: patronsState, detail: patronsDetail },
      revenue: { label: "Revenue", state: revenueState, detail: revenueDetail },
      media: { label: "Media", state: mediaState, detail: mediaDetail },
    },
  };
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useCreatorImportReadiness(): CreatorImportReadiness {
  const [loading, setLoading] = useState(true);
  const [profileError, setProfileError] = useState(false);
  const [creatorId, setCreatorId] = useState("");
  const [hasPatreon, setHasPatreon] = useState(false);
  const [hasSubstar, setHasSubstar] = useState(false);
  const [tiers, setTiers] = useState<RelayComposeTierRow[] | null>(null);
  const [tiersLoaded, setTiersLoaded] = useState(false);
  const [patronSummaryLoaded, setPatronSummaryLoaded] = useState(false);
  const [patronLine, setPatronLine] = useState<string | null>(null);
  const [revenueLine, setRevenueLine] = useState<string | null>(null);
  const [onboarding, setOnboarding] = useState<CreatorOnboardingData | null>(null);
  const [exportMediaCount, setExportMediaCount] = useState<number | null>(null);
  const [extensionProbe, setExtensionProbe] =
    useState<RelayExtensionStatusProbeResult | null>(null);

  // Stable ref so refreshSyncData doesn't change identity on every render
  const creatorIdRef = useRef("");

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      setLoading(true);
      setProfileError(false);
      setTiersLoaded(false);
      setPatronSummaryLoaded(false);

      const cid =
        typeof window !== "undefined"
          ? window.localStorage.getItem(RELAY_CREATOR_ID_STORAGE_KEY)?.trim() ?? ""
          : "";

      creatorIdRef.current = cid;
      if (!cancelled) setCreatorId(cid);

      let profile: CreatorProfileIdentity | null = null;
      try {
        profile = await getCreatorProfile();
      } catch {
        if (!cancelled) setProfileError(true);
        profile = null;
      }
      if (cancelled) return;

      const patreonConnected = Boolean(profile?.patreon_campaign_id?.trim());
      const substarConnected = Boolean(profile?.subscribestar_profile_id?.trim());
      setHasPatreon(patreonConnected);
      setHasSubstar(substarConnected);

      if (cid) {
        try {
          const { tiers: tierRows } = await fetchRelayComposeTiers(cid);
          if (!cancelled) setTiers(tierRows);
        } catch {
          if (!cancelled) setTiers(null);
        } finally {
          if (!cancelled) setTiersLoaded(true);
        }
      } else if (!cancelled) {
        setTiers(null);
        setTiersLoaded(true);
      }

      if (patreonConnected) {
        try {
          const summary = await getCreatorPatronTierSummary();
          if (cancelled) return;
          setPatronLine(
            `${summary.total_patrons} patron${summary.total_patrons === 1 ? "" : "s"} in your synced membership snapshot`
          );
          const monthlyCents = summary.tiers.reduce(
            (sum, tier) => sum + (tier.amount_cents ?? 0) * tier.patron_count,
            0
          );
          setRevenueLine(
            monthlyCents > 0
              ? `$${(monthlyCents / 100).toLocaleString(undefined, {
                  maximumFractionDigits: 0,
                })}/mo detected`
              : "No active paid revenue detected yet"
          );
        } catch {
          if (!cancelled) {
            setPatronLine(null);
            setRevenueLine(null);
          }
        } finally {
          if (!cancelled) setPatronSummaryLoaded(true);
        }
      } else if (!cancelled) {
        setPatronLine(null);
        setRevenueLine(null);
        setPatronSummaryLoaded(true);
      }

      try {
        const onboardingData = await fetchCreatorOnboarding();
        if (!cancelled) setOnboarding(onboardingData);
      } catch {
        if (!cancelled) setOnboarding(null);
      }

      if (cid) {
        try {
          const facets = await fetchCreatorGalleryFacets(cid);
          if (!cancelled) {
            setExportMediaCount(
              typeof facets.export_media_count === "number" ? facets.export_media_count : 0
            );
          }
        } catch {
          if (!cancelled) setExportMediaCount(null);
        }
      } else if (!cancelled) {
        setExportMediaCount(null);
      }

      if (!cancelled) setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // Extension probe polling — continues until grant + cookie are both present
  useEffect(() => {
    let cancelled = false;
    let intervalId: ReturnType<typeof setInterval> | undefined;

    const scheduleNext = (result: RelayExtensionStatusProbeResult) => {
      const keepPolling =
        !result.ok || !result.hasGrant || !result.patreonCookiePresent;
      if (keepPolling && !intervalId) {
        intervalId = setInterval(() => {
          void probeOnce();
        }, EXTENSION_PROBE_INTERVAL_MS);
      }
      if (!keepPolling && intervalId) {
        clearInterval(intervalId);
        intervalId = undefined;
      }
    };

    const probeOnce = async () => {
      const result = await probeRelayExtensionStatus();
      if (cancelled) return;
      setExtensionProbe(result);
      scheduleNext(result);
    };

    void probeOnce();

    return () => {
      cancelled = true;
      if (intervalId) clearInterval(intervalId);
    };
  }, []);

  // Stable callback for the panel to call while import is in flight
  const refreshSyncData = useCallback(async () => {
    const cid = creatorIdRef.current;
    try {
      const onboardingData = await fetchCreatorOnboarding();
      setOnboarding(onboardingData);
    } catch {
      // non-fatal
    }
    if (cid) {
      try {
        const facets = await fetchCreatorGalleryFacets(cid);
        setExportMediaCount(
          typeof facets.export_media_count === "number" ? facets.export_media_count : 0
        );
      } catch {
        // non-fatal
      }
    }
  }, []);

  return useMemo(
    () =>
      buildReadiness({
        loading,
        profileError,
        creatorId,
        hasPatreon,
        hasSubstar,
        tiers,
        tiersLoaded,
        patronSummaryLoaded,
        patronLine,
        revenueLine,
        onboarding,
        exportMediaCount,
        extensionProbe,
        refreshSyncData,
      }),
    [
      loading,
      profileError,
      creatorId,
      hasPatreon,
      hasSubstar,
      tiers,
      tiersLoaded,
      patronSummaryLoaded,
      patronLine,
      revenueLine,
      onboarding,
      exportMediaCount,
      extensionProbe,
      refreshSyncData,
    ]
  );
}
