"use client";

import {
  METRIC_STATUS_UI,
  resolveMetricDisplay,
  type PlatformMetricFreshnessState,
  type PlatformMetricStatus
} from "@/lib/platform-metric-status";
import {
  buildPlatformMetricDetailContext,
  PLATFORM_METRICS_AIRTABLE_BASE_ID,
  type PlatformMetricDetailMetric
} from "@/lib/platform-metric-detail";
import type { PlatformOperatingAlert } from "@/lib/platform-operating-alerts";
import type { PlatformOperatingReviewItem } from "@/lib/platform-operating-review";

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#6F6F6F]">{label}</dt>
      <dd className="mt-1 text-sm leading-relaxed text-[#D6D6D6]">{children}</dd>
    </div>
  );
}

export default function PlatformMetricDetailDrawer({
  metric,
  reviewItem,
  alerts,
  onClose
}: {
  metric: PlatformMetricDetailMetric;
  reviewItem?: PlatformOperatingReviewItem;
  alerts?: PlatformOperatingAlert[];
  onClose: () => void;
}) {
  const context = buildPlatformMetricDetailContext({ metric, reviewItem, alerts });
  const status = metric.status as PlatformMetricStatus;
  const freshnessState = metric.freshnessState as PlatformMetricFreshnessState;
  const statusSpec = METRIC_STATUS_UI[status];
  const display = resolveMetricDisplay({
    status,
    value: metric.value,
    freshnessState
  });

  return (
    <div className="fixed inset-0 z-[70] flex justify-end" aria-modal="true" role="dialog" aria-labelledby="metric-detail-title">
      <button
        type="button"
        className="absolute inset-0 cursor-default bg-black/70 backdrop-blur-sm"
        aria-label="Close metric detail drawer"
        onClick={onClose}
      />
      <div className="relative z-[71] flex h-full w-full max-w-lg flex-col overflow-hidden border-l border-[#1F1F1F] bg-[#0D0D0D] shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-[#1F1F1F] px-5 py-4">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#7bd6a2]">Metric detail</p>
            <h2
              id="metric-detail-title"
              className="mt-1 font-[family-name:var(--font-display)] text-xl font-semibold tracking-tight text-[#F5F5F5]"
            >
              {metric.label}
            </h2>
            <p className="mt-1 font-mono text-xs text-[#7A7A7A]">{metric.key}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[#2a2a2a] bg-[#121212] text-[#bdbdbd] hover:text-[#F5F5F5]"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div className="flex-1 space-y-6 overflow-y-auto px-5 py-5">
          <div className="rounded-2xl border border-[#1F1F1F] bg-[#080808] p-4">
            <p className="font-[family-name:var(--font-display)] text-3xl font-semibold tracking-tight text-[#F5F5F5]">
              {metric.displayValue ?? display.displayValue}
            </p>
            <p className="mt-2 text-xs leading-relaxed text-[#9A9A9A]">{display.helperText}</p>
            <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
              <span className="rounded-full border border-[#3a3a3a] bg-[#1a1a1a] px-2 py-0.5 text-[#d6d6d6]">
                {statusSpec.badgeLabel}
              </span>
              <span className="rounded-full border border-[#2a2a2a] bg-[#121212] px-2 py-0.5 text-[#bdbdbd]">
                Phase {metric.phase}
              </span>
              <span className="rounded-full border border-[#2a2a2a] bg-[#121212] px-2 py-0.5 text-[#bdbdbd]">
                {metric.priority}
              </span>
              <span className="rounded-full border border-[#2a2a2a] bg-[#121212] px-2 py-0.5 text-[#bdbdbd]">
                Scope {metric.scope}
              </span>
              {metric.freshnessState !== "unknown" ? (
                <span className="rounded-full border border-[#24506a] bg-[#081a22] px-2 py-0.5 text-[#8bc9e8]">
                  Freshness {metric.freshnessState}
                </span>
              ) : null}
            </div>
            {metric.lastUpdatedAt ? (
              <p className="mt-3 text-xs text-[#777]">Last updated {metric.lastUpdatedAt}</p>
            ) : null}
          </div>

          <dl className="space-y-5">
            <DetailRow label="Definition">{metric.definition}</DetailRow>
            <DetailRow label="Formula">
              <code className="block rounded-lg border border-[#1F1F1F] bg-[#080808] px-3 py-2 font-mono text-xs text-[#BDBDBD]">
                {metric.formula}
              </code>
            </DetailRow>
            <DetailRow label="Source">{metric.source}</DetailRow>
            <DetailRow label="Status">{statusSpec.helperText}</DetailRow>
            <DetailRow label="Owner notes">{context.ownerNotes}</DetailRow>
            <DetailRow label="Wiring dependency">{context.wiringDependency}</DetailRow>
          </dl>

          {context.alerts.length > 0 ? (
            <div>
              <h3 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#f0a8a8]">
                Related alerts
              </h3>
              <ul className="mt-3 space-y-2">
                {context.alerts.map((alert) => (
                  <li
                    key={alert.key}
                    className="rounded-xl border border-[#5c2a2a] bg-[#1a1010] px-3 py-2 text-sm text-[#f0a8a8]"
                  >
                    <p className="font-semibold">{alert.title}</p>
                    <p className="mt-1 text-xs">{alert.message}</p>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {context.workItemIds.length > 0 ? (
            <div>
              <h3 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#7bd6a2]">
                Airtable work items
              </h3>
              <ul className="mt-3 space-y-2">
                {context.workItemIds.map((workItemId) => (
                  <li
                    key={workItemId}
                    className="rounded-xl border border-[#1F1F1F] bg-[#080808] px-3 py-2 text-sm text-[#D6D6D6]"
                  >
                    <p className="font-mono text-xs text-[#7bd6a2]">{workItemId}</p>
                    <p className="mt-1 text-xs text-[#9A9A9A]">
                      Search in the Platform Metrics Dashboard table (
                      <span className="font-mono">{PLATFORM_METRICS_AIRTABLE_BASE_ID}</span>).
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <div>
            <h3 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#7bd6a2]">
              Source docs
            </h3>
            <ul className="mt-3 space-y-2">
              {context.sourceDocs.map((doc) => (
                <li
                  key={`${doc.workItemId}-${doc.path}`}
                  className="rounded-xl border border-[#1F1F1F] bg-[#080808] px-3 py-2"
                >
                  <p className="text-sm text-[#D6D6D6]">{doc.label}</p>
                  <p className="mt-1 font-mono text-xs text-[#8bc9e8]">{doc.path}</p>
                  {doc.workItemId ? (
                    <p className="mt-1 text-xs text-[#777]">Linked from {doc.workItemId}</p>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
