"use client";

import Link from "next/link";
import { Target } from "lucide-react";
import type {
  CreatorUnifiedPerformanceRange,
  PerformanceGoalSuggestionWire,
  PerformanceGoalWire
} from "@/lib/relay-api";

type PerformanceGoalsPanelProps = {
  goals: PerformanceGoalWire[];
  suggestedGoals: PerformanceGoalSuggestionWire[];
  performanceRange: CreatorUnifiedPerformanceRange;
  busySuggestionId: string | null;
  onAdoptSuggestion: (suggestion: PerformanceGoalSuggestionWire) => void;
  onRemoveGoal: (goalId: string) => void;
};

function formatNumber(value: number): string {
  return Math.round(value).toLocaleString();
}

function paceLabel(status: PerformanceGoalWire["pace_status"]): string {
  if (status === "complete") return "Complete";
  if (status === "behind") return "Behind";
  return "On track";
}

function progressWidth(ratio: number): string {
  return `${Math.min(Math.max(ratio, 0), 1) * 100}%`;
}

export function PerformanceGoalsPanel({
  goals,
  suggestedGoals,
  performanceRange,
  busySuggestionId,
  onAdoptSuggestion,
  onRemoveGoal
}: PerformanceGoalsPanelProps) {
  return (
    <section
      className="rounded-2xl border border-[#1F1F1F] bg-[#101010] p-4"
      aria-labelledby="analytics-performance-goals-heading"
      data-testid="analytics-performance-goals"
    >
      <div className="mb-3 flex items-center gap-2">
        <Target className="h-4 w-4 text-[#9bf0c4]" aria-hidden />
        <div>
          <h2
            id="analytics-performance-goals-heading"
            className="text-xs font-semibold uppercase tracking-[0.18em] text-[#888]"
          >
            Targeted goals · {performanceRange}
          </h2>
          <p className="mt-1 text-[11px] text-[#666]">
            Reach, likes, and comments scoped to a work, campaign, platform, or creator-wide.
          </p>
        </div>
      </div>

      {goals.length ? (
        <div className="space-y-2" data-testid="analytics-performance-goals-active">
          {goals.map((goal) => (
            <article
              key={goal.id}
              className="rounded-xl border border-[#2a2a2a] bg-[#0A0A0A] px-3 py-2.5"
              data-testid={`analytics-performance-goal-${goal.id}`}
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-[#E8E8E8]">
                    {goal.label?.trim() || `${goal.scope_label} ${goal.metric}`}
                  </p>
                  <p className="text-[10px] text-[#777]">
                    {goal.scope} · {formatNumber(goal.current_value)} / {formatNumber(goal.target_value)}{" "}
                    {goal.metric}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="rounded-full border border-[#333] px-2 py-0.5 text-[9px] uppercase tracking-wide text-[#9bf0c4]">
                    {paceLabel(goal.pace_status)}
                  </span>
                  {goal.scope === "work" && goal.scope_ref ? (
                    <Link
                      href={`/studio/analytics/works/${encodeURIComponent(goal.scope_ref)}?range=${goal.range}`}
                      className="text-[10px] font-semibold text-[#9bf0c4] hover:underline"
                    >
                      Drilldown
                    </Link>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => onRemoveGoal(goal.id)}
                    className="text-[10px] text-[#888] hover:text-[#ccc]"
                  >
                    Remove
                  </button>
                </div>
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#1a1a1a]">
                <div
                  className="h-full rounded-full bg-[#9bf0c4]"
                  style={{ width: progressWidth(goal.progress_ratio) }}
                />
              </div>
            </article>
          ))}
        </div>
      ) : (
        <p className="text-[11px] text-[#666]">No active performance goals yet.</p>
      )}

      {suggestedGoals.length ? (
        <div className="mt-4 space-y-2" data-testid="analytics-performance-goals-suggested">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#777]">
            Suggested goals
          </p>
          {suggestedGoals.map((suggestion) => (
            <div
              key={suggestion.suggestion_id}
              className="rounded-xl border border-[#3a3520] bg-[#121008] px-3 py-2.5"
            >
              <p className="text-xs font-medium text-[#e8dcb0]">{suggestion.label}</p>
              <p className="mt-1 text-[11px] text-[#aaa]">{suggestion.reason}</p>
              <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                <span className="font-mono text-[10px] text-[#888]">
                  {formatNumber(suggestion.current_value)} → {formatNumber(suggestion.target_value)} {suggestion.metric}
                </span>
                <button
                  type="button"
                  disabled={busySuggestionId === suggestion.suggestion_id}
                  onClick={() => onAdoptSuggestion(suggestion)}
                  className="rounded-full border border-[#6a5a2a]/70 px-2.5 py-1 text-[10px] font-semibold text-[#e8d9a8] hover:bg-[#1a1808] disabled:opacity-50"
                >
                  Set goal
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}
