"use client";

/**
 * Relay Coach — “Here’s what I found”
 * Concise research summary inside CoachReviewModal. No chat.
 */

import { ArrowLeft, ArrowRight } from "lucide-react";
import type { CoachFindingChipWire, CoachFindingSourceWire } from "@/lib/relay-api";
import { COACH_PATHS } from "@/app/components/distribution/PostingAssistantContextPanel";

const SIGNAL_PRIORITY: CoachFindingSourceWire[] = [
  "coverage",
  "performance",
  "goals",
  "history",
  "moment",
  "locale"
];

const MAX_SIGNALS = 5;

function pathLabel(pathId: string | null | undefined): string | null {
  if (!pathId) return null;
  const path = COACH_PATHS.find((p) => p.id === pathId);
  return path?.label ?? pathId;
}

/** Strip noisy prefixes for modal display. */
function cleanSignalLabel(chip: CoachFindingChipWire): string {
  let label = chip.label.trim();
  label = label.replace(/^Post:\s*/i, "");
  label = label.replace(/^Tag:\s*/i, "");
  label = label.replace(/^Studio:\s*/i, "");
  label = label.replace(/^Moment:\s*/i, "");
  label = label.replace(/^Locale:\s*/i, "");
  label = label.replace(/^Monthly Relay posts\s*/i, "Pace ");
  label = label.replace(/^Monthly posts\s*/i, "Pace ");
  label = label.replace(/^Usual send hour\s*/i, "Usually sends ");
  label = label.replace(/^Usual post hour\s*/i, "Usually posts ");
  label = label.replace(/^This post:\s*/i, "");
  label = label.replace(/^30d reach mix:\s*/i, "Reach mix ");
  label = label.replace(/^Top work in window:\s*/i, "Top work · ");
  label = label.replace(/^Not yet on\s*/i, "Not on ");
  label = label.replace(/^Metrics on .+ — no data yet for\s*/i, "No metrics yet · ");
  label = label.replace(/^Metrics available:\s*/i, "Metrics · ");
  label = label.replace(/^Performance rollups look stale.+$/i, "Rollups may be stale");
  return label;
}

function buildPostContext(chips: CoachFindingChipWire[]): string | null {
  const titleChip = chips.find((c) => c.id === "post_title");
  const tagChips = chips.filter((c) => c.source === "post" && c.id.startsWith("tag_"));
  const title = titleChip ? cleanSignalLabel(titleChip) : null;
  const tags = tagChips.map(cleanSignalLabel).filter(Boolean);
  if (!title && tags.length === 0) return null;
  if (title && tags.length) return `${title} · ${tags.slice(0, 3).join(", ")}`;
  return title ?? tags.join(", ");
}

function pickSignals(chips: CoachFindingChipWire[]): CoachFindingChipWire[] {
  const signals: CoachFindingChipWire[] = [];
  for (const source of SIGNAL_PRIORITY) {
    for (const chip of chips.filter((c) => c.source === source)) {
      if (signals.length >= MAX_SIGNALS) return signals;
      signals.push(chip);
    }
  }
  return signals;
}

export type CoachFindingsPanelProps = {
  pathId?: string | null;
  chips: CoachFindingChipWire[];
  showNoLiveTrendsNote?: boolean;
  continueLabel?: string;
  onContinue: () => void;
  onBack: () => void;
};

export function CoachFindingsPanel({
  pathId,
  chips,
  showNoLiveTrendsNote = true,
  continueLabel = "Review copy",
  onContinue,
  onBack
}: CoachFindingsPanelProps) {
  const resolvedPath = pathLabel(pathId);
  const isTrendPath = pathId === "trend";
  const postContext = buildPostContext(chips);
  const signals = pickSignals(chips);

  return (
    <div className="flex flex-col gap-5" data-testid="coach-findings-panel">
      {resolvedPath || postContext ? (
        <div className="space-y-1.5">
          {resolvedPath ? (
            <p className="text-[11px] text-[#6b7280]">
              Path{" "}
              <span className="font-semibold text-[#9bf0c4]">{resolvedPath}</span>
            </p>
          ) : null}
          {postContext ? (
            <p className="text-[13px] font-medium leading-snug text-[#e5e7eb]">{postContext}</p>
          ) : null}
        </div>
      ) : null}

      {signals.length === 0 ? (
        <p className="text-[12px] leading-relaxed text-[#6b7280]">
          Not enough history yet — Coach will use your path defaults.
        </p>
      ) : (
        <ul className="space-y-2.5">
          {signals.map((chip, index) => {
            const emphasis = chip.source === "performance" || chip.source === "goals";
            return (
              <li
                key={chip.id}
                className="flex gap-3"
                style={{
                  opacity: 1 - Math.min(index, 3) * 0.04
                }}
              >
                <span
                  className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full"
                  style={{
                    background: emphasis ? "#00aa6f" : "#4b5563"
                  }}
                  aria-hidden
                />
                <span
                  className={`min-w-0 text-[13px] leading-snug ${
                    emphasis ? "font-medium text-[#f3f4f6]" : "text-[#d1d5db]"
                  }`}
                >
                  {cleanSignalLabel(chip)}
                </span>
              </li>
            );
          })}
        </ul>
      )}

      {showNoLiveTrendsNote ? (
        <p className="text-[10px] leading-snug text-[#4b5563]">
          {isTrendPath
            ? "Uses only the moment you named — no live trend feed."
            : "Won’t invent what’s trending on other platforms."}
        </p>
      ) : null}

      <div
        className="flex flex-col gap-2 border-t pt-4 sm:flex-row sm:items-center sm:justify-between"
        style={{ borderColor: "rgba(255,255,255,0.06)" }}
      >
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center justify-center gap-1.5 rounded-xl px-3 py-2.5 text-xs font-semibold text-[#9ca3af] transition-colors hover:text-[#f9fafb]"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
          Back
        </button>
        <button
          type="button"
          onClick={onContinue}
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-bold sm:w-auto"
          style={{ background: "#00aa6f", color: "#000" }}
        >
          {continueLabel}
          <ArrowRight className="h-4 w-4" aria-hidden />
        </button>
      </div>
    </div>
  );
}
