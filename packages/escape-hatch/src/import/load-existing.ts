/**
 * Load previously written EH-011 import artifacts from a generated kit data/ dir.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parseSiteBundle, type SiteBundle } from "../contracts.js";
import type { ImportLocalState, ImportProvenance } from "./types.js";
import { parseImportLocalState, parseImportProvenance } from "./validate.js";

export type ExistingImportArtifacts = {
  provenance: ImportProvenance;
  localState: ImportLocalState;
  bundle: SiteBundle;
};

export class ExistingImportLoadError extends Error {
  readonly fieldPath: string;

  constructor(fieldPath: string, message: string) {
    super(`${fieldPath}: ${message}`);
    this.name = "ExistingImportLoadError";
    this.fieldPath = fieldPath;
  }
}

function readJsonIfExists(path: string): unknown | undefined {
  if (!existsSync(path)) return undefined;
  return JSON.parse(readFileSync(path, "utf8")) as unknown;
}

/**
 * Load provenance + local state + site bundle from `dataDir` when present.
 *
 * - If none of the three files exist → returns null (fresh import).
 * - If any exist → all three are required; creator_id must match `expectedCreatorId`;
 *   site_id must agree across documents. Fail closed otherwise.
 */
export function loadExistingImportArtifacts(
  dataDir: string,
  expectedCreatorId: string
): ExistingImportArtifacts | null {
  const provenancePath = join(dataDir, "provenance.json");
  const localStatePath = join(dataDir, "import-state.json");
  const bundlePath = join(dataDir, "site.bundle.json");

  const hasProv = existsSync(provenancePath);
  const hasLocal = existsSync(localStatePath);
  const hasBundle = existsSync(bundlePath);

  if (!hasProv && !hasLocal && !hasBundle) {
    return null;
  }

  if (!hasProv || !hasLocal || !hasBundle) {
    throw new ExistingImportLoadError(
      "data/",
      "partial import artifacts found; require provenance.json, import-state.json, and site.bundle.json together (or use --fresh)"
    );
  }

  const provenance = parseImportProvenance(readJsonIfExists(provenancePath));
  const localState = parseImportLocalState(readJsonIfExists(localStatePath));
  const bundle = parseSiteBundle(readJsonIfExists(bundlePath));

  if (provenance.creator_id !== expectedCreatorId) {
    throw new ExistingImportLoadError(
      "provenance.creator_id",
      `mismatch: expected ${expectedCreatorId}`
    );
  }
  if (localState.creator_id !== expectedCreatorId) {
    throw new ExistingImportLoadError(
      "import-state.creator_id",
      `mismatch: expected ${expectedCreatorId}`
    );
  }
  if (bundle.creator_id !== expectedCreatorId) {
    throw new ExistingImportLoadError(
      "site.bundle.creator_id",
      `mismatch: expected ${expectedCreatorId}`
    );
  }

  if (
    provenance.site_id !== localState.site_id ||
    provenance.site_id !== bundle.site_id
  ) {
    throw new ExistingImportLoadError(
      "site_id",
      "provenance, import-state, and site.bundle site_id must match"
    );
  }

  return { provenance, localState, bundle };
}
