/**
 * EH-011 canonical generated-app importer.
 */

export {
  importCanonical,
  type ImportCanonicalOptions,
  type ImportCanonicalResult
} from "./importer.js";
export {
  DEFAULT_RELAY_DUMP_CREATOR_ID,
  DEFAULT_RELAY_DUMP_ROOT,
  importRelayDump,
  resolveRelayDumpPaths,
  type ImportRelayDumpOptions
} from "./load-relay-dump.js";
export {
  ExistingImportLoadError,
  loadExistingImportArtifacts,
  type ExistingImportArtifacts
} from "./load-existing.js";
export {
  isSafeRelativeBlobPath,
  pathSegmentsFromRelativeBlob,
  resolveBlobPathUnderRoot
} from "./path-safety.js";
export { stageExportMediaSafe } from "./stage-media.js";
export {
  parseCanonicalForImport,
  parseExportIndexForImport,
  parseImportLocalState,
  parseImportProvenance,
  parseImportReport,
  serializeImportDocument
} from "./validate.js";
export {
  CONFLICT_KINDS,
  EXCLUSION_KINDS,
  IMPORT_LOCAL_STATE_CONTRACT_VERSION,
  IMPORT_ORIGINS,
  IMPORT_PROVENANCE_CONTRACT_VERSION,
  IMPORT_REPORT_CONTRACT_VERSION,
  type AccountedItem,
  type ConflictItem,
  type ConflictKind,
  type ExclusionKind,
  type ImportLocalState,
  type ImportOrigin,
  type ImportProvenance,
  type ImportReport,
  type LocalPostState,
  type ProvenanceMediaEntry,
  type ProvenancePostEntry
} from "./types.js";
