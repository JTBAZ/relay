"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  fetchPerformanceWorkBundle,
  RelayApiError,
  requestPlatformInstanceRefresh,
  type CreatorUnifiedPerformanceRange,
  type PerformanceWorkBundleData
} from "@/lib/relay-api";
import {
  sendRelayExternalMetricsRefreshToExtension,
  type CrossPostDestination
} from "@/lib/relay-extension-messaging";
import { deriveWorkDrilldownActions } from "@/lib/work-drilldown-actions";
import { WorkDrilldownView } from "../../WorkDrilldownView";

function parseRange(raw: string | null): CreatorUnifiedPerformanceRange {
  if (raw === "7d" || raw === "90d") return raw;
  return "30d";
}

function asCrossPostDestination(destination: string): CrossPostDestination | null {
  if (destination === "patreon" || destination === "x" || destination === "deviantart") {
    return destination;
  }
  return null;
}

export default function WorkDrilldownClient({ creativeWorkId }: { creativeWorkId: string }) {
  const searchParams = useSearchParams();
  const [performanceRange, setPerformanceRange] = useState<CreatorUnifiedPerformanceRange>(() =>
    parseRange(searchParams.get("range"))
  );
  const [bundle, setBundle] = useState<PerformanceWorkBundleData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshBusyId, setRefreshBusyId] = useState<string | null>(null);
  const [refreshMessage, setRefreshMessage] = useState<string | null>(null);

  const loadBundle = useCallback(async (range: CreatorUnifiedPerformanceRange) => {
    setLoading(true);
    setError(null);
    try {
      const report = await fetchPerformanceWorkBundle(creativeWorkId, { range });
      setBundle(report);
    } catch (err) {
      const message =
        err instanceof RelayApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Unable to load work performance.";
      setBundle(null);
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [creativeWorkId]);

  useEffect(() => {
    void loadBundle(performanceRange);
  }, [loadBundle, performanceRange]);

  const suggestedActions = useMemo(
    () => (bundle ? deriveWorkDrilldownActions(bundle) : []),
    [bundle]
  );

  const handlePerformanceRangeChange = useCallback((range: CreatorUnifiedPerformanceRange) => {
    setPerformanceRange(range);
  }, []);

  const handleRefreshInstance = useCallback(
    async (platformInstanceId: string) => {
      setRefreshBusyId(platformInstanceId);
      setRefreshMessage(null);
      try {
        const result = await requestPlatformInstanceRefresh(platformInstanceId);
        if (result.status === "completed") {
          setRefreshMessage(result.message ?? "Refresh completed.");
          await loadBundle(performanceRange);
          return;
        }
        if (result.status === "cooldown") {
          const seconds = result.cooldown?.retry_after_seconds ?? 0;
          setRefreshMessage(`Refresh on cooldown — try again in ${seconds}s.`);
          return;
        }
        if (result.status === "handoff_required" && result.handoff) {
          const destination = asCrossPostDestination(result.handoff.destination);
          if (!destination) {
            setRefreshMessage("Extension handoff is not available for this destination yet.");
            return;
          }
          const handoff = await sendRelayExternalMetricsRefreshToExtension({
            postId: result.handoff.post_id,
            attemptId: result.handoff.attempt_id,
            destination,
            externalUrl: result.handoff.external_url
          });
          if (handoff.ok) {
            setRefreshMessage("Extension refresh started — reload shortly to see updated stats.");
            await loadBundle(performanceRange);
          } else {
            setRefreshMessage(handoff.detail ?? "Extension refresh could not start.");
          }
          return;
        }
        setRefreshMessage(result.message ?? `Refresh status: ${result.status}.`);
      } catch (err) {
        setRefreshMessage(err instanceof Error ? err.message : String(err));
      } finally {
        setRefreshBusyId(null);
      }
    },
    [loadBundle, performanceRange]
  );

  if (loading && !bundle) {
    return (
      <div className="mx-auto w-full max-w-[980px] px-4 py-8 text-sm text-[#888] sm:px-6">
        Loading work performance…
      </div>
    );
  }

  if (error && !bundle) {
    return (
      <div className="mx-auto w-full max-w-[980px] px-4 py-8 sm:px-6">
        <div className="rounded-2xl border border-[#6a3a3a]/60 bg-[#1a0f0f] p-4 text-sm text-[#e8b4a8]">
          {error}
        </div>
      </div>
    );
  }

  if (!bundle) {
    return null;
  }

  return (
    <WorkDrilldownView
      bundle={bundle}
      performanceRange={performanceRange}
      onPerformanceRangeChange={handlePerformanceRangeChange}
      suggestedActions={suggestedActions}
      refreshBusyId={refreshBusyId}
      refreshMessage={refreshMessage}
      onRefreshInstance={handleRefreshInstance}
    />
  );
}
