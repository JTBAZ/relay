"use client";

/**
 * Stateless evidence summary for Coach / Goal Cycle (VS6-T02).
 * Shows kind, confidence, freshness, and summary — discloses weak evidence.
 */

import type { GoalCycleEvidenceRef } from "@/lib/goal-cycle-types";

export type CoachEvidenceSummaryProps = {
  evidence: GoalCycleEvidenceRef[];
  /** Optional plan-level narrative string from the frozen plan shape. */
  planEvidenceSummary?: string | null;
  emptyLabel?: string;
};

function confidenceTone(
  confidence: GoalCycleEvidenceRef["confidence"]
): string {
  if (confidence === "high") return "text-[#9bf0c4]";
  if (confidence === "medium") return "text-[#e5e7eb]";
  if (confidence === "low") return "text-[#fbbf24]";
  return "text-[#9ca3af]";
}

function formatFreshness(seconds: number | null): string | null {
  if (seconds == null) return null;
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

export function CoachEvidenceSummary({
  evidence,
  planEvidenceSummary = null,
  emptyLabel = "No evidence yet — Coach will use your history when available."
}: CoachEvidenceSummaryProps) {
  const hasWeak = evidence.some(
    (e) => e.confidence === "low" || e.confidence === "unknown"
  );

  return (
    <div className="flex flex-col gap-3" data-testid="coach-evidence-summary">
      {planEvidenceSummary ? (
        <p className="text-[13px] leading-snug text-[#e5e7eb]">
          {planEvidenceSummary}
        </p>
      ) : null}

      {evidence.length === 0 ? (
        <p className="text-[12px] leading-relaxed text-[#6b7280]">{emptyLabel}</p>
      ) : (
        <ul className="space-y-2.5">
          {evidence.map((ref) => {
            const freshness = formatFreshness(ref.freshness_seconds);
            return (
              <li key={ref.ref_id} className="flex flex-col gap-0.5">
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-[#6b7280]">
                    {ref.kind}
                  </span>
                  <span
                    className={`text-[11px] font-medium ${confidenceTone(ref.confidence)}`}
                  >
                    {ref.confidence}
                  </span>
                  {freshness ? (
                    <span className="text-[11px] text-[#4b5563]">{freshness}</span>
                  ) : null}
                </div>
                <p className="text-[13px] leading-snug text-[#d1d5db]">
                  {ref.summary}
                </p>
              </li>
            );
          })}
        </ul>
      )}

      {hasWeak ? (
        <p
          className="text-[10px] leading-snug text-[#4b5563]"
          data-testid="coach-evidence-weak-note"
        >
          Some signals are weak or unknown — Plan continues from your creator
          history.
        </p>
      ) : null}
    </div>
  );
}
