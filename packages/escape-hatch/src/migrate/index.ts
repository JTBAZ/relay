/**
 * EH-012 R2 / object-storage media migration engine.
 */

export {
  MEDIA_MIGRATION_LEDGER_CONTRACT_VERSION,
  MEDIA_MIGRATION_REPORT_CONTRACT_VERSION,
  MIGRATION_ACCESS_CLASSES,
  MIGRATION_NEXT_ACTIONS,
  MIGRATION_OBJECT_STATUSES,
  type MediaMigrationLedger,
  type MediaMigrationObjectEntry,
  type MediaMigrationReport,
  type MigrationAccessClass,
  type MigrationNextAction,
  type MigrationObjectStatus
} from "./types.js";

export {
  assertNoSecretsInMigrationJson,
  assertPrivateObjectKey,
  isPublicMediaPath,
  parseMediaMigrationLedger,
  parseMediaMigrationReport,
  serializeMigrationDocument
} from "./validate.js";

export {
  buildEscapeHatchMediaObjectKey,
  ESCAPE_HATCH_MEDIA_KEY_SEGMENT,
  isEscapeHatchMediaObjectKey
} from "./keys.js";

export type {
  HeadObjectResult,
  ObjectStoragePort,
  PrivateReadResult,
  PutObjectMeta
} from "./storage-port.js";
export { guardPrivateReadKey } from "./storage-port.js";

export { MemoryObjectStorage, type MemoryObjectStorageOptions } from "./memory-storage.js";

export {
  assertR2PrivateReadProbeConfigured,
  buildR2PublicObjectUrl,
  createR2StorageConfig,
  R2ObjectStorage,
  type R2ObjectStorageOptions,
  type R2StorageConfig
} from "./r2-storage.js";

export {
  checksumMatchesExpected,
  hashBuffer,
  hashFile,
  hashReadable,
  isSha256Hex,
  normalizeSha256,
  type StreamChecksumResult
} from "./checksum.js";

export {
  buildMigrationCandidates,
  buildMigrationCandidatesFromExport,
  collectExportSources,
  migrateMedia,
  rejectPublicMediaAsPrivateVerification,
  type BuildCandidatesOptions,
  type MediaMigrationCandidate,
  type MigrateMediaOptions,
  type MigrateMediaResult
} from "./engine.js";

export {
  LEDGER_FILENAME,
  REPORT_FILENAME,
  loadExportMediaIndex,
  loadKitMigrationInputs,
  migrateKitMedia,
  writeMigrationArtifacts,
  type KitMigrationInputs
} from "./kit-io.js";
