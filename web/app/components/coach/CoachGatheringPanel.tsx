"use client";

/**
 * Shared Coach gathering / loading presentation (VS6-T02).
 * Extracted from Transformer single-post flow — keep visuals stable.
 */

import { Loader2 } from "lucide-react";

export type CoachGatheringPanelProps = {
  message: string;
};

export function CoachGatheringPanel({ message }: CoachGatheringPanelProps) {
  return (
    <div
      className="flex flex-col items-center justify-center gap-3 py-12 text-center"
      data-testid="coach-gathering-panel"
    >
      <Loader2 className="h-7 w-7 animate-spin text-[#00aa6f]" aria-hidden />
      <p className="text-[13px] text-[#9ca3af]">{message}</p>
    </div>
  );
}
