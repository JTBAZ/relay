"use client";

import { useEffect, useMemo, useState } from "react";
import DataCoverageSection from "@/components/platform-metrics/DataCoverageSection";
import PlatformOperatingAlertsPanel from "@/components/platform-metrics/PlatformOperatingAlertsPanel";
import PlatformOperatingReviewPanel from "@/components/platform-metrics/PlatformOperatingReviewPanel";
import PlatformMetricCardView, {
  type PlatformMetricCardModel
} from "@/components/platform-metrics/PlatformMetricCard";
import PlatformMetricDetailDrawer from "@/components/platform-metrics/PlatformMetricDetailDrawer";
import {
  platformMetricCards,
  platformMetricSections,
  type PlatformMetricCard,
  type PlatformMetricSectionKey
} from "@/lib/platform-metrics-dashboard";
import {
  fetchPlatformMetricRegistry,
  RelayApiError,
  type PlatformMetricRegistryData
} from "@/lib/relay-api";
import type { PlatformMetricFreshnessState, PlatformMetricStatus } from "@/lib/platform-metric-status";
import { resolveMetricDisplay } from "@/lib/platform-metric-status";
import type { PlatformMetricTrends } from "@/lib/platform-metric-trends";
import type { PlatformMetricDetailMetric } from "@/lib/platform-metric-detail";
import type { PlatformOperatingReviewItem } from "@/lib/platform-operating-review";

function registryToCards(
  metrics: PlatformMetricRegistryData["metrics"]
): PlatformMetricCard[] {
  return metrics.map((metric) => ({
    key: metric.key,
    label: metric.label,
    section: metric.section as PlatformMetricSectionKey,
    definition: metric.definition,
    formula: metric.formula,
    source: metric.source,
    status: metric.status as PlatformMetricStatus,
    phase: metric.phase,
    priority: metric.priority,
    value: metric.value
  }));
}

function toCardModel(metric: PlatformMetricCard, apiMetric?: PlatformMetricRegistryData["metrics"][number]): PlatformMetricCardModel {
  return {
    key: metric.key,
    label: metric.label,
    definition: metric.definition,
    formula: metric.formula,
    source: metric.source,
    status: metric.status,
    phase: metric.phase,
    value: metric.value,
    displayValue: apiMetric?.displayValue,
    freshnessState: (apiMetric?.freshnessState ?? "unknown") as PlatformMetricFreshnessState,
    trends: apiMetric?.trends as PlatformMetricTrends | undefined
  };
}

function toDetailMetric(
  metric: PlatformMetricCard,
  apiMetric?: PlatformMetricRegistryData["metrics"][number]
): PlatformMetricDetailMetric {
  if (apiMetric) return apiMetric;

  const display = resolveMetricDisplay({
    status: metric.status,
    value: metric.value,
    freshnessState: "unknown"
  });

  return {
    key: metric.key,
    label: metric.label,
    section: metric.section,
    phase: metric.phase,
    status: metric.status,
    scope: "platform",
    definition: metric.definition,
    formula: metric.formula,
    source: metric.source,
    value: metric.value,
    displayValue: display.displayValue,
    freshnessState: "unknown",
    lastUpdatedAt: null,
    priority: metric.priority
  };
}

export default function PlatformMetricsDashboard() {
  const [metrics, setMetrics] = useState<PlatformMetricCard[]>(platformMetricCards);
  const [registry, setRegistry] = useState<PlatformMetricRegistryData | null>(null);
  const [sourceLabel, setSourceLabel] = useState("Static scaffold fallback");
  const [loadState, setLoadState] = useState<"loading" | "live" | "fallback">("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [selectedMetricKey, setSelectedMetricKey] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const nextRegistry = await fetchPlatformMetricRegistry();
        if (cancelled) return;
        setRegistry(nextRegistry);
        setMetrics(registryToCards(nextRegistry.metrics));
        setSourceLabel(
          nextRegistry.prismaConfigured
            ? "GET /api/v1/platform-metrics/registry (DB wired)"
            : "GET /api/v1/platform-metrics/registry (health-only wiring)"
        );
        setLoadState("live");
        setErrorMessage(null);
      } catch (error) {
        if (cancelled) return;
        setRegistry(null);
        setMetrics(platformMetricCards);
        setLoadState("fallback");
        if (error instanceof RelayApiError && error.status === 403) {
          setErrorMessage(
            "Platform operator access required. Ask an owner to add your account to RELAY_PLATFORM_OPERATOR_ACCOUNT_IDS or RELAY_PLATFORM_OPERATOR_EMAILS."
          );
          return;
        }
        setErrorMessage(
          error instanceof RelayApiError
            ? error.message
            : error instanceof Error
              ? error.message
              : "Could not load registry"
        );
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const sections = useMemo(() => platformMetricSections, []);
  const apiMetricByKey = useMemo(() => {
    const map = new Map<string, PlatformMetricRegistryData["metrics"][number]>();
    for (const metric of registry?.metrics ?? []) {
      map.set(metric.key, metric);
    }
    return map;
  }, [registry]);

  const reviewItemByKey = useMemo(() => {
    const map = new Map<string, PlatformOperatingReviewItem>();
    for (const item of registry?.operatingReview?.items ?? []) {
      map.set(item.metricKey, item);
    }
    return map;
  }, [registry]);

  const metricByKey = useMemo(() => {
    const map = new Map<string, PlatformMetricCard>();
    for (const metric of metrics) {
      map.set(metric.key, metric);
    }
    return map;
  }, [metrics]);

  const selectedMetric = selectedMetricKey ? metricByKey.get(selectedMetricKey) : undefined;
  const selectedDetailMetric = selectedMetric
    ? toDetailMetric(selectedMetric, apiMetricByKey.get(selectedMetric.key))
    : null;

  function openMetricDetail(metricKey: string) {
    setSelectedMetricKey(metricKey);
    window.history.replaceState(null, "", `#metric-${metricKey}`);
  }

  function closeMetricDetail() {
    setSelectedMetricKey(null);
    const url = `${window.location.pathname}${window.location.search}`;
    window.history.replaceState(null, "", url);
  }

  const coverage = registry?.coverage ?? {
    total: metrics.length,
    live: 0,
    collecting: 0,
    not_wired: metrics.length,
    estimated: 0,
    manual_import: 0,
    deferred: 0
  };

  return (
    <main className="min-h-dvh bg-[#080808] text-[#F5F5F5]">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-4 py-8 sm:px-6 lg:px-8">
        <header className="rounded-3xl border border-[#1F1F1F] bg-[#0D0D0D] p-6 shadow-sm sm:p-8">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[#7bd6a2]">
            Operator dashboard
          </p>
          <div className="mt-4 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h1 className="font-[family-name:var(--font-display)] text-3xl font-semibold tracking-tight sm:text-5xl">
                Platform Metrics Dashboard
              </h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-[#A8A8A8]">
                Registry-backed dashboard: cards start empty, then come alive as backend wiring
                lands.
              </p>
            </div>
            <div className="rounded-2xl border border-[#264c38] bg-[#07180f] px-4 py-3 text-sm text-[#b7e4ca]">
              Source: {sourceLabel}
            </div>
          </div>
          {loadState === "loading" ? (
            <p className="mt-4 text-sm text-[#888]">Loading registry from Relay API…</p>
          ) : null}
          {errorMessage ? (
            <p className="mt-4 rounded-xl border border-[#5c2a2a] bg-[#1a1010] px-4 py-3 text-sm text-[#f0a8a8]">
              {errorMessage}
            </p>
          ) : null}
        </header>

        <DataCoverageSection coverage={coverage} generatedAt={registry?.generatedAt} />

        <PlatformOperatingAlertsPanel alerts={registry?.alerts ?? []} />

        <PlatformOperatingReviewPanel review={registry?.operatingReview} />

        <div className="space-y-8">
          {sections.map((section) => {
            const sectionMetrics = metrics.filter((metric) => metric.section === section.key);
            return (
              <section key={section.key} aria-labelledby={`${section.key}-heading`}>
                <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <h2
                      id={`${section.key}-heading`}
                      className="font-[family-name:var(--font-display)] text-2xl font-semibold tracking-tight"
                    >
                      {section.title}
                    </h2>
                    <p className="mt-1 text-sm text-[#8F8F8F]">{section.description}</p>
                  </div>
                  <p className="text-xs uppercase tracking-[0.2em] text-[#777]">
                    {sectionMetrics.length} cards
                  </p>
                </div>
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {sectionMetrics.map((metric) => (
                    <PlatformMetricCardView
                      key={metric.key}
                      metric={toCardModel(metric, apiMetricByKey.get(metric.key))}
                      onSelect={openMetricDetail}
                    />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      </div>

      {selectedDetailMetric ? (
        <PlatformMetricDetailDrawer
          metric={selectedDetailMetric}
          reviewItem={reviewItemByKey.get(selectedDetailMetric.key)}
          alerts={registry?.alerts ?? []}
          onClose={closeMetricDetail}
        />
      ) : null}
    </main>
  );
}
