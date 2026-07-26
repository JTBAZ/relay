/**
 * Load/write library-truth artifacts for an Escape Hatch kit (data/ only).
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
  parseImportLocalState,
  parseImportProvenance,
  parseImportReport,
  type ImportLocalState,
  type ImportProvenance,
  type ImportReport
} from "../import/index.js";
import {
  parseMediaMigrationLedger,
  parseMediaMigrationReport
} from "../migrate/validate.js";
import type {
  MediaMigrationLedger,
  MediaMigrationReport
} from "../migrate/types.js";
import { buildLibraryParityReport } from "./build-report.js";
import {
  applyLibraryTruthComplete,
  evaluateContinueGate
} from "./gate.js";
import {
  LIBRARY_TRUTH_STATE_CONTRACT_VERSION,
  type ContinueGateResult,
  type LibraryAnomaly,
  type LibraryParityReport,
  type LibraryTruthState
} from "./types.js";
import {
  assertNoSecretsInLibraryTruthJson,
  parseLibraryParityReport,
  parseLibraryTruthState,
  serializeLibraryTruthDocument
} from "./validate.js";

export const PARITY_REPORT_FILENAME = "library-parity-report.json";
export const LIBRARY_TRUTH_STATE_FILENAME = "library-truth-state.json";

export type KitLibraryTruthInputs = {
  kitDir: string;
  dataDir: string;
  bundle?: SiteBundle;
  importReport?: ImportReport;
  provenance?: ImportProvenance;
  importState?: ImportLocalState;
  migrationLedger?: MediaMigrationLedger;
  migrationReport?: MediaMigrationReport;
  state?: LibraryTruthState;
};

function readJsonIfPresent(path: string): unknown | undefined {
  if (!existsSync(path)) return undefined;
  return JSON.parse(readFileSync(path, "utf8"));
}

function tryParse<T>(label: string, fn: () => T): T | undefined {
  try {
    return fn();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`${label}: ${msg}`);
  }
}

export function loadKitLibraryTruthInputs(kitDir: string): KitLibraryTruthInputs {
  const dataDir = join(kitDir, "data");
  if (!existsSync(dataDir)) {
    return { kitDir, dataDir };
  }

  let bundle: SiteBundle | undefined;
  const bundlePath = join(dataDir, "site.bundle.json");
  const sitePath = join(dataDir, "site.json");
  const bundleRaw = readJsonIfPresent(
    existsSync(bundlePath) ? bundlePath : sitePath
  );
  if (bundleRaw !== undefined) {
    bundle = tryParse("site bundle", () => parseSiteBundle(bundleRaw));
  }

  let importReport: ImportReport | undefined;
  const importReportRaw = readJsonIfPresent(join(dataDir, "import-report.json"));
  if (importReportRaw !== undefined) {
    importReport = tryParse("import-report", () =>
      parseImportReport(importReportRaw)
    );
  }

  let provenance: ImportProvenance | undefined;
  const provenanceRaw = readJsonIfPresent(join(dataDir, "provenance.json"));
  if (provenanceRaw !== undefined) {
    provenance = tryParse("provenance", () =>
      parseImportProvenance(provenanceRaw)
    );
  }

  let importState: ImportLocalState | undefined;
  const importStateRaw = readJsonIfPresent(join(dataDir, "import-state.json"));
  if (importStateRaw !== undefined) {
    importState = tryParse("import-state", () =>
      parseImportLocalState(importStateRaw)
    );
  }

  let migrationLedger: MediaMigrationLedger | undefined;
  const ledgerRaw = readJsonIfPresent(
    join(dataDir, "media-migration-ledger.json")
  );
  if (ledgerRaw !== undefined) {
    migrationLedger = tryParse("media-migration-ledger", () =>
      parseMediaMigrationLedger(ledgerRaw)
    );
  }

  let migrationReport: MediaMigrationReport | undefined;
  const migReportRaw = readJsonIfPresent(
    join(dataDir, "media-migration-report.json")
  );
  if (migReportRaw !== undefined) {
    migrationReport = tryParse("media-migration-report", () =>
      parseMediaMigrationReport(migReportRaw)
    );
  }

  let state: LibraryTruthState | undefined;
  const stateRaw = readJsonIfPresent(join(dataDir, LIBRARY_TRUTH_STATE_FILENAME));
  if (stateRaw !== undefined) {
    state = tryParse("library-truth-state", () =>
      parseLibraryTruthState(stateRaw)
    );
  }

  return {
    kitDir,
    dataDir,
    bundle,
    importReport,
    provenance,
    importState,
    migrationLedger,
    migrationReport,
    state
  };
}

export function emptyLibraryTruthState(
  siteId: string,
  creatorId: string,
  nowIso: string
): LibraryTruthState {
  return {
    contract_version: LIBRARY_TRUTH_STATE_CONTRACT_VERSION,
    site_id: siteId,
    creator_id: creatorId,
    updated_at: nowIso,
    production_safe: false,
    exclusions: Object.create(null),
    library_truth_complete: false
  };
}

export function writeLibraryTruthArtifacts(
  dataDir: string,
  report: LibraryParityReport,
  state: LibraryTruthState
): { reportPath: string; statePath: string } {
  mkdirSync(dataDir, { recursive: true });
  const reportPath = join(dataDir, PARITY_REPORT_FILENAME);
  const statePath = join(dataDir, LIBRARY_TRUTH_STATE_FILENAME);
  const reportJson = serializeLibraryTruthDocument(report);
  const stateJson = serializeLibraryTruthDocument(state);
  assertNoSecretsInLibraryTruthJson(reportJson);
  assertNoSecretsInLibraryTruthJson(stateJson);
  // Re-parse fail-closed before write
  parseLibraryParityReport(JSON.parse(reportJson));
  parseLibraryTruthState(JSON.parse(stateJson));
  writeFileSync(reportPath, reportJson, "utf8");
  writeFileSync(statePath, stateJson, "utf8");
  return { reportPath, statePath };
}

export function excludeAnomalyFromBuild(
  report: LibraryParityReport,
  state: LibraryTruthState,
  anomalyId: string,
  reason: string,
  nowIso: string
): LibraryTruthState {
  const anomaly = report.anomalies.find((a) => a.id === anomalyId);
  if (!anomaly) {
    throw new Error(`Unknown anomaly id: ${anomalyId}`);
  }
  const exclusions = { ...state.exclusions };
  exclusions[anomalyId] = {
    anomaly_id: anomalyId,
    reason: reason.trim() || "Creator excluded from this build.",
    excluded_at: nowIso,
    subject: { ...anomaly.subject }
  };
  const next: LibraryTruthState = {
    ...state,
    exclusions,
    updated_at: nowIso,
    production_safe: false,
    library_truth_complete: false,
    completed_at: undefined
  };
  return next;
}

export function runLibraryTruthForKit(opts: {
  kitDir: string;
  now?: () => Date;
  markComplete?: boolean;
}): {
  report: LibraryParityReport;
  state: LibraryTruthState;
  gate: ContinueGateResult;
  reportPath: string;
  statePath: string;
} {
  const inputs = loadKitLibraryTruthInputs(opts.kitDir);
  const now = opts.now ?? (() => new Date());
  const nowIso = now().toISOString().replace(/\.\d{3}Z$/, ".000Z");

  const siteId = inputs.bundle?.site_id ?? inputs.state?.site_id ?? "unknown";
  const creatorId =
    inputs.bundle?.creator_id ?? inputs.state?.creator_id ?? "unknown";

  let state =
    inputs.state ?? emptyLibraryTruthState(siteId, creatorId, nowIso);

  const report = buildLibraryParityReport({
    bundle: inputs.bundle,
    importReport: inputs.importReport,
    provenance: inputs.provenance,
    importState: inputs.importState,
    migrationLedger: inputs.migrationLedger,
    migrationReport: inputs.migrationReport,
    state,
    now
  });

  // Align state identity with report
  state = {
    ...state,
    site_id: report.site_id,
    creator_id: report.creator_id,
    production_safe: false,
    updated_at: nowIso
  };

  if (opts.markComplete) {
    state = applyLibraryTruthComplete(state, report, nowIso);
  } else if (state.library_truth_complete) {
    // Drop complete flag if gate no longer passes
    const gate = evaluateContinueGate(report, state);
    if (!gate.can_continue) {
      state = {
        ...state,
        library_truth_complete: false,
        completed_at: undefined
      };
    }
  }

  const paths = writeLibraryTruthArtifacts(inputs.dataDir, report, state);
  const gate = evaluateContinueGate(report, state);
  return { report, state, gate, ...paths };
}

export function loadParityReportFromKit(
  kitDir: string
): LibraryParityReport | null {
  const path = join(kitDir, "data", PARITY_REPORT_FILENAME);
  if (!existsSync(path)) return null;
  return parseLibraryParityReport(JSON.parse(readFileSync(path, "utf8")));
}

export function loadLibraryTruthStateFromKit(
  kitDir: string
): LibraryTruthState | null {
  const path = join(kitDir, "data", LIBRARY_TRUTH_STATE_FILENAME);
  if (!existsSync(path)) return null;
  return parseLibraryTruthState(JSON.parse(readFileSync(path, "utf8")));
}

export function findAnomaly(
  report: LibraryParityReport,
  anomalyId: string
): LibraryAnomaly | undefined {
  return report.anomalies.find((a) => a.id === anomalyId);
}
