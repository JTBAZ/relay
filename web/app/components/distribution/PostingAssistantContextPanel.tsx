"use client";

/**
 * Relay Coach — path picker modal + context value types.
 *
 * Paths batch 1–2 synergistic goals (not free multi-select) so prompts stay coherent.
 * Studio performance goals are shown for context only.
 */

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import type { PerformanceGoalWire } from "@/lib/relay-api";

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

export type CoachPathId = "engage" | "reach" | "localize" | "trend";

export type CoachPath = {
  id: CoachPathId;
  label: string;
  description: string;
  goals: AssistantGoal[];
  needsLocale?: boolean;
  needsTrend?: boolean;
};

/** One path = one coherent Coach run (max two synergistic goals). */
export const COACH_PATHS: CoachPath[] = [
  {
    id: "engage",
    label: "Boost engagement",
    description: "Hooks + platform-native format for the feeds you already have.",
    goals: ["engagement_optimization", "format_optimization"]
  },
  {
    id: "reach",
    label: "Reach new audiences",
    description: "Broader framing so cold viewers understand the piece fast.",
    goals: ["new_audience_testing", "engagement_optimization"]
  },
  {
    id: "localize",
    label: "Localize",
    description: "Translate or localise for one target language.",
    goals: ["language_outreach"],
    needsLocale: true
  },
  {
    id: "trend",
    label: "Ride a moment",
    description: "Frame the post around a trend you name, with a sharper hook.",
    goals: ["trend_riding", "engagement_optimization"],
    needsTrend: true
  }
];

export function coachPathFromGoals(goals: AssistantGoal[]): CoachPathId | null {
  const key = [...goals].sort().join(",");
  for (const path of COACH_PATHS) {
    if ([...path.goals].sort().join(",") === key) return path.id;
  }
  return null;
}

function formatMetric(metric: string): string {
  return metric.replace(/_/g, " ");
}

type ModalProps = {
  open: boolean;
  value: PostingAssistantContextValue;
  onChange: (next: PostingAssistantContextValue) => void;
  studioGoals: PerformanceGoalWire[];
  onConfirm: () => void;
  onCancel: () => void;
};

export function RelayCoachModal({
  open,
  value,
  onChange,
  studioGoals,
  onConfirm,
  onCancel
}: ModalProps) {
  const [mounted, setMounted] = useState(false);
  const [draft, setDraft] = useState(value);
  const [notesOpen, setNotesOpen] = useState(Boolean(value.user_notes.trim()));
  const selectedPathId = coachPathFromGoals(draft.goals);
  const selectedPath = COACH_PATHS.find((p) => p.id === selectedPathId) ?? null;

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    setDraft(value);
    setNotesOpen(Boolean(value.user_notes.trim()));
  }, [open, value]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onCancel]);

  if (!open || !mounted) return null;

  function selectPath(path: CoachPath) {
    setDraft({
      ...draft,
      goals: [...path.goals],
      locale: path.needsLocale ? draft.locale : "",
      trend_note: path.needsTrend ? draft.trend_note : ""
    });
  }

  const canConfirm =
    selectedPath != null &&
    (!selectedPath.needsLocale || draft.locale.trim().length > 0) &&
    (!selectedPath.needsTrend || draft.trend_note.trim().length > 0);

  const enabledStudioGoals = studioGoals.filter((g) => g.enabled);

  return createPortal(
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center bg-[rgba(0,0,0,0.82)] p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Relay Coach"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border shadow-2xl"
        style={{ borderColor: "#2a2a2a", background: "#0a0a0a" }}
      >
        <div
          className="flex items-start justify-between gap-3 border-b px-5 py-4"
          style={{ borderColor: "#1a1a1a" }}
        >
          <div>
            <p className="text-sm font-bold text-[#f9fafb]">Coach this post</p>
            <p className="mt-0.5 text-[11px] text-[#6b7280]">
              Pick one path — Coach batches matching optimizations together.
            </p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg p-1.5 text-[#6b7280] hover:text-[#f9fafb]"
            aria-label="Close"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
          <div
            className="rounded-xl border px-3 py-3"
            style={{ borderColor: "#2a2a2a", background: "#0c0c0c" }}
          >
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#6b7280]">
              Your Studio goals
            </p>
            {enabledStudioGoals.length > 0 ? (
              <ul className="mt-2 space-y-1.5">
                {enabledStudioGoals.slice(0, 4).map((g) => (
                  <li
                    key={g.id}
                    className="flex items-center justify-between gap-2 text-xs text-[#d1d5db]"
                  >
                    <span className="min-w-0 truncate">
                      {g.label?.trim() || `${formatMetric(g.metric)} · ${g.scope_label}`}
                    </span>
                    <span className="shrink-0 text-[10px] text-[#9bf0c4]">
                      {Math.round(Math.min(1, Math.max(0, g.progress_ratio)) * 100)}%
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-[11px] leading-snug text-[#6b7280]">
                No active Studio goals yet. Coach still works — set goals in Insights anytime.
              </p>
            )}
          </div>

          <div className="space-y-2">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#6b7280]">
              Optimization path
            </p>
            {COACH_PATHS.map((path) => {
              const active = selectedPathId === path.id;
              return (
                <button
                  key={path.id}
                  type="button"
                  onClick={() => selectPath(path)}
                  className="flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left transition-colors"
                  style={{
                    background: active ? "rgba(0,170,111,0.08)" : "#111",
                    border: `1px solid ${active ? "rgba(0,170,111,0.4)" : "#222"}`
                  }}
                >
                  <span
                    className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full"
                    style={{
                      border: `1.5px solid ${active ? "#00aa6f" : "#444"}`,
                      background: active ? "#00aa6f" : "transparent"
                    }}
                    aria-hidden
                  >
                    {active ? (
                      <span className="h-1.5 w-1.5 rounded-full bg-black" />
                    ) : null}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-xs font-semibold text-[#f9fafb]">
                      {path.label}
                    </span>
                    <span className="mt-0.5 block text-[11px] leading-snug text-[#6b7280]">
                      {path.description}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>

          {selectedPath?.needsLocale ? (
            <label className="block text-xs text-[#9ca3af]">
              Target language / locale
              <input
                value={draft.locale}
                onChange={(e) => setDraft({ ...draft, locale: e.target.value })}
                className="mt-1 w-full rounded-lg border bg-transparent px-3 py-2 text-sm text-[#f9fafb]"
                style={{ borderColor: "#2a2a2a" }}
                placeholder="e.g. es, pt-BR, ja"
              />
            </label>
          ) : null}

          {selectedPath?.needsTrend ? (
            <label className="block text-xs text-[#9ca3af]">
              Trend or moment
              <input
                value={draft.trend_note}
                onChange={(e) => setDraft({ ...draft, trend_note: e.target.value })}
                className="mt-1 w-full rounded-lg border bg-transparent px-3 py-2 text-sm text-[#f9fafb]"
                style={{ borderColor: "#2a2a2a" }}
                placeholder="e.g. summer art challenge"
              />
            </label>
          ) : null}

          <div className="border-t pt-2" style={{ borderColor: "#1e1e1e" }}>
            <button
              type="button"
              onClick={() => setNotesOpen((v) => !v)}
              className="flex w-full items-center justify-between py-1.5 text-xs text-[#6b7280]"
            >
              <span>Additional notes for Coach</span>
              <span className="font-mono">{notesOpen ? "−" : "+"}</span>
            </button>
            {notesOpen ? (
              <textarea
                value={draft.user_notes}
                onChange={(e) => setDraft({ ...draft, user_notes: e.target.value })}
                rows={2}
                className="mt-1 w-full rounded-lg border bg-transparent px-3 py-2 text-sm text-[#f9fafb]"
                style={{ borderColor: "#2a2a2a" }}
                placeholder="Optional context for this post only."
              />
            ) : null}
          </div>
        </div>

        <div
          className="flex items-center justify-end gap-2 border-t px-5 py-3"
          style={{ borderColor: "#1a1a1a" }}
        >
          <button
            type="button"
            onClick={onCancel}
            className="rounded-xl px-3 py-2 text-xs font-semibold text-[#9ca3af]"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!canConfirm}
            onClick={() => {
              onChange(draft);
              onConfirm();
            }}
            className="rounded-xl px-4 py-2 text-xs font-bold disabled:opacity-40"
            style={{ background: "#00aa6f", color: "#000" }}
          >
            Apply Coach
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

/** @deprecated Prefer RelayCoachModal — kept for type re-exports. */
export function PostingAssistantContextPanel(props: {
  value: PostingAssistantContextValue;
  onChange: (next: PostingAssistantContextValue) => void;
}) {
  void props;
  return null;
}
