"use client";

/**
 * Lightweight Plan / proposal preview shared by Coach surfaces (VS6-T02).
 * Presentation only — does not call APIs or invent slots.
 */

import type { GoalCyclePlan } from "@/lib/goal-cycle-types";

export type CoachProposalPreviewProps = {
  plan: GoalCyclePlan;
  /** Show revision counter when AI revisions have been used. */
  showRevisionCount?: boolean;
};

export function CoachProposalPreview({
  plan,
  showRevisionCount = true
}: CoachProposalPreviewProps) {
  const slotCount = Math.min(plan.slots.length, 8);

  return (
    <div className="flex flex-col gap-3" data-testid="coach-proposal-preview">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-[13px] font-medium text-[#f3f4f6]">
          {slotCount === 0
            ? "No posts in this Plan"
            : `${slotCount} planned post${slotCount === 1 ? "" : "s"}`}
        </p>
        {showRevisionCount ? (
          <p className="text-[11px] text-[#6b7280]">
            Revisions {Math.min(plan.ai_revision_count, 2)} / 2
          </p>
        ) : null}
      </div>

      {plan.rationale ? (
        <p className="text-[12px] leading-relaxed text-[#9ca3af]">{plan.rationale}</p>
      ) : null}

      {slotCount > 0 ? (
        <ol className="space-y-2">
          {plan.slots.slice(0, 8).map((slot, index) => (
            <li
              key={slot.id}
              className="rounded-xl border px-3 py-2"
              style={{ borderColor: "rgba(255,255,255,0.06)" }}
            >
              <p className="text-[11px] text-[#6b7280]">
                Slot {index + 1}
                {slot.format ? ` · ${slot.format}` : ""}
              </p>
              <p className="text-[13px] font-medium text-[#e5e7eb]">
                {slot.title || slot.intent || "Untitled"}
              </p>
            </li>
          ))}
        </ol>
      ) : null}

      {plan.warnings.length > 0 ? (
        <ul className="space-y-1" data-testid="coach-proposal-warnings">
          {plan.warnings.map((warning) => (
            <li key={warning} className="text-[11px] text-[#fbbf24]">
              {warning}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
