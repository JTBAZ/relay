/**
 * Goal Cycle → Schedule Rail handoff helpers (VS7-T04 / T06).
 */

import type {
  GoalCycleMaterializationReceipt,
  GoalCyclePlan
} from "@/lib/goal-cycle-types";

/** Rail event ids from a persisted receipt (PostBot task ids today). */
export function collectRailEventIds(
  receipt: GoalCycleMaterializationReceipt
): string[] {
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const slot of receipt.slots) {
    for (const id of slot.rail_event_ids) {
      const trimmed = id.trim();
      if (!trimmed || seen.has(trimmed)) continue;
      seen.add(trimmed);
      ids.push(trimmed);
    }
  }
  return ids;
}

export type GoalCycleMissingMediaSlot = {
  slot_id: string;
  title: string;
  post_id: string | null;
  media_state: string;
};

/** Slots that still need media — exposed for VS8 execution. */
export function collectMissingMediaSlots(
  receipt: GoalCycleMaterializationReceipt,
  plan: GoalCyclePlan | null
): GoalCycleMissingMediaSlot[] {
  const byId = new Map((plan?.slots ?? []).map((s) => [s.id, s]));
  const out: GoalCycleMissingMediaSlot[] = [];
  for (const slot of receipt.slots) {
    if (slot.mode === "silence" || slot.mode === "upkeep_task") continue;
    if (!slot.post_id) continue;
    const planSlot = byId.get(slot.slot_id);
    const mediaState = planSlot?.media_state ?? "missing";
    if (mediaState === "ready" || mediaState === "not_required") continue;
    out.push({
      slot_id: slot.slot_id,
      title: planSlot?.title || slot.slot_id,
      post_id: slot.post_id,
      media_state: mediaState
    });
  }
  return out;
}

export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Bounded choreography timings — collapsed when reduced motion is on. */
export function railHighlightTimings(reduced = prefersReducedMotion()): {
  paintMs: number;
  openPopoverMs: number;
  clearMs: number;
  smoothScroll: boolean;
} {
  if (reduced) {
    return { paintMs: 0, openPopoverMs: 0, clearMs: 400, smoothScroll: false };
  }
  return { paintMs: 40, openPopoverMs: 280, clearMs: 1400, smoothScroll: true };
}
