/**
 * EH-013 Library truth / parity audit.
 */

export {
  buildLibraryParityReport,
  type BuildLibraryParityReportInput
} from "./build-report.js";
export {
  applyLibraryTruthComplete,
  blockingAnomalies,
  evaluateContinueGate
} from "./gate.js";
export {
  LIBRARY_TRUTH_STATE_FILENAME,
  PARITY_REPORT_FILENAME,
  emptyLibraryTruthState,
  excludeAnomalyFromBuild,
  findAnomaly,
  loadKitLibraryTruthInputs,
  loadLibraryTruthStateFromKit,
  loadParityReportFromKit,
  runLibraryTruthForKit,
  writeLibraryTruthArtifacts,
  type KitLibraryTruthInputs
} from "./kit-io.js";
export {
  assertLocalLibraryTruthMutation,
  evaluateLocalLibraryTruthMutationAccess,
  LOCAL_OPERATOR_ALLOW_ENV,
  LOCAL_OPERATOR_HEADER,
  LOCAL_OPERATOR_HEADER_VALUE,
  type LocalOperatorDecision
} from "./local-operator.js";
export {
  ANOMALY_KINDS,
  LIBRARY_PARITY_REPORT_CONTRACT_VERSION,
  LIBRARY_TRUTH_STATE_CONTRACT_VERSION,
  type AccessBucketInspect,
  type AccessSimulationRow,
  type AccountedCounts,
  type AccountedItemNote,
  type AnomalyKind,
  type ContinueGateResult,
  type LibraryAnomaly,
  type LibraryAnomalySubject,
  type LibraryParityReport,
  type LibraryTruthArtifactPresence,
  type LibraryTruthExclusion,
  type LibraryTruthIdentity,
  type LibraryTruthState,
  type MediaAccountedCounts,
  type TierAccountedCounts
} from "./types.js";
export {
  assertNoSecretsInLibraryTruthJson,
  parseLibraryParityReport,
  parseLibraryTruthState,
  serializeLibraryTruthDocument
} from "./validate.js";
