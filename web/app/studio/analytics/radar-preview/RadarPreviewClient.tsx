"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AnalyticsRadarPreview } from "../AnalyticsRadarPreview";
import {
  fetchCreatorPostPerformance,
  RelayApiError,
  type CreatorPostPerformanceData
} from "@/lib/relay-api";

export default function RadarPreviewClient() {
  const [performance, setPerformance] = useState<CreatorPostPerformanceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const data = await fetchCreatorPostPerformance();
        if (!cancelled) {
          setPerformance(data);
        }
      } catch (err) {
        if (!cancelled) {
          const message =
            err instanceof RelayApiError
              ? err.message
              : err instanceof Error
                ? err.message
                : "Unable to load post performance.";
          setError(message);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="mx-auto flex min-h-[calc(100vh-72px)] w-full max-w-[1680px] flex-col gap-4 px-4 py-6 sm:px-6 xl:px-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-[#888]">Studio analytics</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-[#F0F0F0]">Radar preview</h1>
        </div>
        <Link
          href="/studio/analytics"
          className="rounded-xl border border-[#2a2a2a] px-3 py-2 text-xs font-medium text-[#9bf0c4] hover:bg-[#101010]"
        >
          Back to production analytics
        </Link>
      </div>

      {loading ? (
        <div className="rounded-3xl border border-[#1F1F1F] bg-[#080a09] p-8 text-sm text-[#888]">Loading preview data…</div>
      ) : null}

      {error ? (
        <div className="rounded-2xl border border-[#6a3a3a]/60 bg-[#1a0f0f] p-4 text-sm text-[#e8b4a8]">
          {error} Mock preview data will still render where available.
        </div>
      ) : null}

      {!loading ? <AnalyticsRadarPreview performance={performance} /> : null}
    </div>
  );
}
