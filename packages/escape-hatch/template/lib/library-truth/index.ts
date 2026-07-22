/**
 * Library truth kit surface (EH-013).
 *
 * Always rebuilds parity from site.bundle + import + migration artifacts via
 * shared package modules (byte-copied by fill-template). Never trusts a
 * tampered on-disk library-parity-report.json alone.
 *
 * production_safe is always false. Soft audit — not EH-033 private delivery.
 * Mutations are local-prototype operator only (see local-operator.ts).
 */

import { join } from "node:path";
import {
  excludeAnomalyFromBuild,
  findAnomaly,
  runLibraryTruthForKit,
  writeLibraryTruthArtifacts
} from "./kit-io";
import type {
  ContinueGateResult,
  LibraryAnomaly,
  LibraryAnomalySubject,
  LibraryParityReport,
  LibraryTruthExclusion,
  LibraryTruthState
} from "./types";
import {
  LIBRARY_PARITY_REPORT_CONTRACT_VERSION,
  LIBRARY_TRUTH_STATE_CONTRACT_VERSION
} from "./types";

export type {
  ContinueGateResult,
  LibraryAnomaly,
  LibraryAnomalySubject,
  LibraryParityReport,
  LibraryTruthExclusion,
  LibraryTruthState
};

export {
  LIBRARY_PARITY_REPORT_CONTRACT_VERSION,
  LIBRARY_TRUTH_STATE_CONTRACT_VERSION
};

export {
  assertLocalLibraryTruthMutation,
  evaluateLocalLibraryTruthMutationAccess,
  LOCAL_OPERATOR_ALLOW_ENV,
  LOCAL_OPERATOR_HEADER,
  LOCAL_OPERATOR_HEADER_VALUE,
  type LocalOperatorDecision
} from "./local-operator";

export type LibraryTruthLoadResult =
  | {
      status: "ready";
      report: LibraryParityReport;
      state: LibraryTruthState;
      gate: ContinueGateResult;
    }
  | {
      status: "missing_report";
      message: string;
    }
  | {
      status: "invalid";
      message: string;
    };

function kitDir(): string {
  return process.cwd();
}

/** Plain-object clone for RSC → client props (parsers use null-prototype records). */
function toPlain<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function toReady(result: {
  report: LibraryParityReport;
  state: LibraryTruthState;
  gate: ContinueGateResult;
}): LibraryTruthLoadResult {
  return {
    status: "ready",
    report: toPlain(result.report),
    state: toPlain(result.state),
    gate: toPlain(result.gate)
  };
}

/**
 * Rebuild parity from kit data/ artifacts, write refreshed report, evaluate gate.
 * Fail-closed on parse/rebuild errors.
 */
export function loadLibraryTruth(): LibraryTruthLoadResult {
  try {
    const result = runLibraryTruthForKit({ kitDir: kitDir() });
    return toReady(result);
  } catch (err) {
    return {
      status: "invalid",
      message:
        err instanceof Error
          ? err.message
          : "Library truth rebuild failed (fail-closed)."
    };
  }
}

/**
 * Recompute parity, then apply exclude-from-build. Never mutates from a stale report.
 */
export function excludeAnomalyInKit(
  anomalyId: string,
  reason: string
): LibraryTruthLoadResult {
  try {
    let result = runLibraryTruthForKit({ kitDir: kitDir() });
    const anomaly = findAnomaly(result.report, anomalyId);
    if (!anomaly) {
      return { status: "invalid", message: `Unknown anomaly id: ${anomalyId}` };
    }
    const nowIso = new Date().toISOString().replace(/\.\d{3}Z$/, ".000Z");
    const nextState = excludeAnomalyFromBuild(
      result.report,
      result.state,
      anomalyId,
      reason,
      nowIso
    );
    writeLibraryTruthArtifacts(
      join(kitDir(), "data"),
      result.report,
      nextState
    );
    result = runLibraryTruthForKit({ kitDir: kitDir() });
    return toReady(result);
  } catch (err) {
    return {
      status: "invalid",
      message:
        err instanceof Error
          ? err.message
          : "Library truth exclude failed (fail-closed)."
    };
  }
}

/**
 * Recompute parity, then mark complete only if the shared gate passes.
 */
export function markLibraryTruthCompleteInKit(): LibraryTruthLoadResult {
  try {
    const result = runLibraryTruthForKit({
      kitDir: kitDir(),
      markComplete: true
    });
    return toReady(result);
  } catch (err) {
    return {
      status: "invalid",
      message:
        err instanceof Error
          ? err.message
          : "Library truth complete failed (fail-closed)."
    };
  }
}
