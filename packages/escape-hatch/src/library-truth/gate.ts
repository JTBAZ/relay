/**
 * Continue / library-truth-complete gate (EH-013).
 * Fail-closed: blockers must be resolved or explicitly excluded.
 */

import type {
  ContinueGateResult,
  LibraryAnomaly,
  LibraryParityReport,
  LibraryTruthState
} from "./types.js";

export function blockingAnomalies(
  anomalies: readonly LibraryAnomaly[]
): LibraryAnomaly[] {
  return anomalies.filter((a) => a.blocking);
}

export function evaluateContinueGate(
  report: LibraryParityReport,
  state: LibraryTruthState | null | undefined
): ContinueGateResult {
  const exclusions = state?.exclusions ?? Object.create(null);
  const blocking = blockingAnomalies(report.anomalies);
  const blocking_anomaly_ids = blocking.map((a) => a.id);
  const unresolved_blocking_ids = blocking
    .filter((a) => !exclusions[a.id])
    .map((a) => a.id);
  const excluded_blocking_ids = blocking
    .filter((a) => Boolean(exclusions[a.id]))
    .map((a) => a.id);

  const fully_accounted =
    report.posts.fully_accounted && report.media.fully_accounted;

  const reasons: string[] = [];
  if (!fully_accounted) {
    reasons.push(
      "Not every post or media item is accounted for (imported, excluded with a reason, or failed with a reason)."
    );
  }
  if (unresolved_blocking_ids.length > 0) {
    reasons.push(
      `${unresolved_blocking_ids.length} blocking issue(s) still need a resolution or “Exclude from this build”.`
    );
  }

  const can_continue =
    fully_accounted && unresolved_blocking_ids.length === 0;

  const library_truth_complete = Boolean(
    state?.library_truth_complete && can_continue
  );

  return {
    can_continue,
    fully_accounted,
    blocking_anomaly_ids,
    unresolved_blocking_ids,
    excluded_blocking_ids,
    library_truth_complete,
    production_safe: false,
    reasons
  };
}

/** Mark complete only when gate currently passes. */
export function applyLibraryTruthComplete(
  state: LibraryTruthState,
  report: LibraryParityReport,
  nowIso: string
): LibraryTruthState {
  const gate = evaluateContinueGate(report, state);
  if (!gate.can_continue) {
    return {
      ...state,
      library_truth_complete: false,
      completed_at: undefined,
      updated_at: nowIso,
      production_safe: false
    };
  }
  return {
    ...state,
    library_truth_complete: true,
    completed_at: nowIso,
    updated_at: nowIso,
    production_safe: false
  };
}
