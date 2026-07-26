/**
 * Load/write migration artifacts for an Escape Hatch kit (data/ only).
 */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync
} from "node:fs";
import { join } from "node:path";
import { parseSiteBundle, type SiteBundle } from "../contracts.js";
import {
  parseImportProvenance,
  type ImportProvenance
} from "../import/index.js";
import { parseExportIndexForImport } from "../import/validate.js";
import {
  buildMigrationCandidatesFromExport,
  migrateMedia,
  type MediaMigrationCandidate,
  type MigrateMediaResult
} from "./engine.js";
import type { ObjectStoragePort } from "./storage-port.js";
import type { MediaMigrationLedger } from "./types.js";
import {
  parseMediaMigrationLedger,
  serializeMigrationDocument
} from "./validate.js";

export const LEDGER_FILENAME = "media-migration-ledger.json";
export const REPORT_FILENAME = "media-migration-report.json";

export type KitMigrationInputs = {
  kitDir: string;
  dataDir: string;
  bundle: SiteBundle;
  provenance?: ImportProvenance;
  existingLedger?: MediaMigrationLedger;
};

export function loadKitMigrationInputs(kitDir: string): KitMigrationInputs {
  const dataDir = join(kitDir, "data");
  const bundlePath = join(dataDir, "site.bundle.json");
  const sitePath = join(dataDir, "site.json");
  let bundleRaw: unknown;
  if (existsSync(bundlePath)) {
    bundleRaw = JSON.parse(readFileSync(bundlePath, "utf8"));
  } else if (existsSync(sitePath)) {
    bundleRaw = JSON.parse(readFileSync(sitePath, "utf8"));
  } else {
    throw new Error(
      `No site.bundle.json or site.json under ${dataDir}; run import-relay-dump or fixture first`
    );
  }
  const bundle = parseSiteBundle(bundleRaw);

  let provenance: ImportProvenance | undefined;
  const provPath = join(dataDir, "provenance.json");
  if (existsSync(provPath)) {
    provenance = parseImportProvenance(
      JSON.parse(readFileSync(provPath, "utf8"))
    );
  }

  let existingLedger: MediaMigrationLedger | undefined;
  const ledgerPath = join(dataDir, LEDGER_FILENAME);
  if (existsSync(ledgerPath)) {
    existingLedger = parseMediaMigrationLedger(
      JSON.parse(readFileSync(ledgerPath, "utf8"))
    );
  }

  return { kitDir, dataDir, bundle, provenance, existingLedger };
}

export function writeMigrationArtifacts(
  dataDir: string,
  result: MigrateMediaResult
): { ledgerPath: string; reportPath: string } {
  mkdirSync(dataDir, { recursive: true });
  const ledgerPath = join(dataDir, LEDGER_FILENAME);
  const reportPath = join(dataDir, REPORT_FILENAME);
  writeFileSync(ledgerPath, serializeMigrationDocument(result.ledger), "utf8");
  writeFileSync(reportPath, serializeMigrationDocument(result.report), "utf8");
  return { ledgerPath, reportPath };
}

export function loadExportMediaIndex(
  exportCreatorRoot: string,
  creatorId: string
): Record<
  string,
  {
    media_id: string;
    relative_blob_path: string;
    sha256?: string;
    byte_length?: number;
    mime_type?: string;
  }
> {
  const indexPath = join(exportCreatorRoot, "export_index.json");
  if (!existsSync(indexPath)) {
    return Object.create(null);
  }
  const parsed = parseExportIndexForImport(
    JSON.parse(readFileSync(indexPath, "utf8")),
    creatorId
  );
  return parsed.media;
}

export async function migrateKitMedia(opts: {
  kitDir: string;
  storage: ObjectStoragePort;
  exportCreatorRoot?: string;
  batchId?: string;
  candidates?: MediaMigrationCandidate[];
  now?: () => Date;
}): Promise<MigrateMediaResult & { ledgerPath: string; reportPath: string }> {
  const inputs = loadKitMigrationInputs(opts.kitDir);
  const creatorId = inputs.bundle.creator_id;
  const siteId = inputs.bundle.site_id;
  const batchId =
    opts.batchId ?? `migrate_${creatorId}_${Date.now().toString(36)}`;

  let candidates = opts.candidates;
  if (!candidates) {
    if (!opts.exportCreatorRoot) {
      throw new Error(
        "exportCreatorRoot is required when candidates are not provided"
      );
    }
    const mediaIndex = loadExportMediaIndex(opts.exportCreatorRoot, creatorId);
    candidates = buildMigrationCandidatesFromExport({
      creatorId,
      siteId,
      bundle: inputs.bundle,
      exportCreatorRoot: opts.exportCreatorRoot,
      mediaIndex,
      provenance: inputs.provenance
    });
  }

  const result = await migrateMedia({
    creatorId,
    siteId,
    batchId,
    storage: opts.storage,
    candidates,
    existingLedger: inputs.existingLedger,
    now: opts.now
  });

  const paths = writeMigrationArtifacts(inputs.dataDir, result);
  return { ...result, ...paths };
}
