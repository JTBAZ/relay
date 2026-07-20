"use client";

/**
 * Stateless Coach / Goal Cycle progress list (VS6-T02).
 * Renders safe message-code labels only — no chain-of-thought.
 */

import type { GoalCycleProgressEvent } from "@/lib/goal-cycle-types";
import { labelCoachProgressCode } from "./coach-progress-labels";

export type CoachProgressListProps = {
  events: GoalCycleProgressEvent[];
  /** Optional live status line shown under the list. */
  liveMessage?: string | null;
};

export function CoachProgressList({
  events,
  liveMessage = null
}: CoachProgressListProps) {
  const ordered = [...events].sort((a, b) => a.sequence - b.sequence);

  return (
    <div className="flex flex-col gap-3" data-testid="coach-progress-list">
      {ordered.length === 0 && !liveMessage ? (
        <p className="text-[12px] text-[#6b7280]">Waiting to start…</p>
      ) : (
        <ol className="space-y-2">
          {ordered.map((event) => (
            <li
              key={`${event.sequence}-${event.message_code}`}
              className="flex gap-3"
            >
              <span
                className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#00aa6f]"
                aria-hidden
              />
              <span className="min-w-0 text-[13px] leading-snug text-[#d1d5db]">
                {labelCoachProgressCode(event.message_code)}
              </span>
            </li>
          ))}
        </ol>
      )}
      {liveMessage ? (
        <p className="text-[12px] text-[#9ca3af]" data-testid="coach-progress-live">
          {liveMessage}
        </p>
      ) : null}
    </div>
  );
}
