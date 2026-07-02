"use client";

/**
 * Posting Assistant context panel.
 *
 * Goals are structured multiple-choice chips — each will eventually inject a
 * distinct instruction block into the LLM prompt. Free-text input is reserved
 * for locale (language_outreach) and trend context (trend_riding) where the
 * assistant genuinely needs user-supplied specifics.
 */

import { useState } from "react";

export type AssistantGoal =
  | "engagement_optimization"
  | "new_audience_testing"
  | "language_outreach"
  | "trend_riding"
  | "format_optimization";

export type PostingAssistantContextValue = {
  goals: AssistantGoal[];
  /** Free notes surfaced only to the LLM — kept minimal by design. */
  user_notes: string;
  /** BCP-47 tag; only meaningful when language_outreach is selected. */
  locale: string;
  /** Trend description; only meaningful when trend_riding is selected. */
  trend_note: string;
};

export const EMPTY_ASSISTANT_CONTEXT: PostingAssistantContextValue = {
  goals: [],
  user_notes: "",
  locale: "",
  trend_note: ""
};

type GoalMeta = {
  id: AssistantGoal;
  label: string;
  description: string;
  /** When true this goal reveals a follow-up input. */
  hasDetail?: boolean;
};

const GOAL_OPTIONS: GoalMeta[] = [
  {
    id: "engagement_optimization",
    label: "Engagement optimization",
    description: "Rewrite copy for each platform's native engagement patterns (hooks, CTAs, length)."
  },
  {
    id: "new_audience_testing",
    label: "New audience testing",
    description: "Broaden framing to attract new followers, not just your existing fan base."
  },
  {
    id: "language_outreach",
    label: "Language / locale outreach",
    description: "Translate or localise content for a target language.",
    hasDetail: true
  },
  {
    id: "trend_riding",
    label: "Trend riding",
    description: "Align the post angle with a current trend or cultural moment.",
    hasDetail: true
  },
  {
    id: "format_optimization",
    label: "Format optimization",
    description: "Restructure for the platform format — thread, short-form caption, long-form, etc."
  }
];

type Props = {
  value: PostingAssistantContextValue;
  onChange: (next: PostingAssistantContextValue) => void;
};

export function PostingAssistantContextPanel({ value, onChange }: Props) {
  const [expanded, setExpanded] = useState(false);

  function toggleGoal(goal: AssistantGoal) {
    const next = value.goals.includes(goal)
      ? value.goals.filter((g) => g !== goal)
      : [...value.goals, goal];
    onChange({ ...value, goals: next });
  }

  function set(field: keyof PostingAssistantContextValue, v: string) {
    onChange({ ...value, [field]: v });
  }

  const languageActive = value.goals.includes("language_outreach");
  const trendActive = value.goals.includes("trend_riding");
  const anyGoal = value.goals.length > 0;

  return (
    <div
      className="rounded-xl border space-y-0 overflow-hidden"
      style={{ borderColor: "#2a2a2a", background: "#0a0a0a" }}
    >
      {/* Header */}
      <div className="px-4 pt-4 pb-3">
        <p className="text-xs text-[#9ca3af] leading-relaxed">
          Select what you want the assistant to optimise. Each goal injects targeted instructions into the prompt. Relay uses your analytics as facts — it will not invent metrics.
        </p>
      </div>

      {/* Goal chips */}
      <div className="px-4 pb-3 flex flex-col gap-2">
        {GOAL_OPTIONS.map((goal) => {
          const active = value.goals.includes(goal.id);
          return (
            <div key={goal.id} className="group relative">
              <button
                type="button"
                onClick={() => toggleGoal(goal.id)}
                className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors"
                style={{
                  background: active ? "rgba(0,170,111,0.08)" : "#111",
                  border: `1px solid ${active ? "rgba(0,170,111,0.35)" : "#222"}`,
                  color: active ? "#f9fafb" : "#9ca3af"
                }}
              >
                {/* Checkbox indicator */}
                <span
                  className="flex h-4 w-4 flex-shrink-0 items-center justify-center rounded"
                  style={{
                    background: active ? "#00aa6f" : "transparent",
                    border: `1.5px solid ${active ? "#00aa6f" : "#444"}`
                  }}
                >
                  {active && (
                    <svg width="9" height="7" viewBox="0 0 9 7" fill="none">
                      <path d="M1 3.5L3.5 6L8 1" stroke="#000" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </span>

                <span className="flex-1 text-xs font-semibold leading-snug">{goal.label}</span>

                {/* Info indicator */}
                <span
                  className="flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full text-[9px] font-bold leading-none"
                  style={{ background: "#1e1e1e", color: "#6b7280", border: "1px solid #2e2e2e" }}
                  aria-hidden
                >
                  i
                </span>
              </button>

              {/* Tooltip — appears above the chip on hover */}
              <div
                className="pointer-events-none absolute bottom-full left-0 z-50 mb-1.5 w-64 rounded-lg px-3 py-2 text-[11px] leading-snug opacity-0 shadow-lg transition-opacity duration-150 group-hover:opacity-100"
                style={{ background: "#1a1a1a", border: "1px solid #303030", color: "#d1d5db" }}
              >
                {goal.description}
                {/* Arrow */}
                <span
                  className="absolute left-4 top-full h-0 w-0"
                  style={{
                    borderLeft: "5px solid transparent",
                    borderRight: "5px solid transparent",
                    borderTop: "5px solid #303030"
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* Conditional detail inputs — only shown when relevant goal is active */}
      {(languageActive || trendActive) && (
        <div
          className="px-4 pb-4 pt-1 space-y-3 border-t"
          style={{ borderColor: "#1e1e1e" }}
        >
          {languageActive && (
            <label className="block text-xs text-[#9ca3af]">
              Target language / locale
              <input
                value={value.locale}
                onChange={(e) => set("locale", e.target.value)}
                className="mt-1 w-full rounded-lg border bg-transparent px-3 py-2 text-sm text-[#f9fafb]"
                style={{ borderColor: "#2a2a2a" }}
                placeholder="e.g. es, pt-BR, ja"
              />
            </label>
          )}
          {trendActive && (
            <label className="block text-xs text-[#9ca3af]">
              Trend or moment
              <input
                value={value.trend_note}
                onChange={(e) => set("trend_note", e.target.value)}
                className="mt-1 w-full rounded-lg border bg-transparent px-3 py-2 text-sm text-[#f9fafb]"
                style={{ borderColor: "#2a2a2a" }}
                placeholder="e.g. summer art challenge, #PortraitDay"
              />
            </label>
          )}
        </div>
      )}

      {/* Optional free-text notes — collapsed by default */}
      {anyGoal && (
        <div className="border-t" style={{ borderColor: "#1e1e1e" }}>
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="flex w-full items-center justify-between px-4 py-2.5 text-xs"
            style={{ color: "#6b7280", background: "transparent" }}
          >
            <span>Additional notes for the assistant</span>
            <span style={{ fontFamily: "monospace" }}>{expanded ? "−" : "+"}</span>
          </button>
          {expanded && (
            <div className="px-4 pb-4">
              <textarea
                value={value.user_notes}
                onChange={(e) => set("user_notes", e.target.value)}
                rows={2}
                className="w-full rounded-lg border bg-transparent px-3 py-2 text-sm text-[#f9fafb]"
                style={{ borderColor: "#2a2a2a" }}
                placeholder="Any extra context — will be passed directly to the assistant."
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
