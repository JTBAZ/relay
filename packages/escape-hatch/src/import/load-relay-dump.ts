/**
 * Load sanitized relay-dump fixture trees for EH-011 import.
 */

import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { importCanonical, type ImportCanonicalResult } from "./importer.js";

const HERE = dirname(fileURLToPath(import.meta.url));
export const DEFAULT_RELAY_DUMP_ROOT = resolve(
  HERE,
  "../../fixtures/relay-dump"
);

export const DEFAULT_RELAY_DUMP_CREATOR_ID = "cr_eh_relay";

export type ImportRelayDumpOptions = {
  /** Absolute or package-relative path to fixtures/relay-dump (or compatible tree). */
  dumpRoot?: string;
  creatorId?: string;
  displayName?: string;
  handle?: string;
  baseUrl?: string;
  batchId?: string;
  existing?: {
    provenance?: unknown;
    localState?: unknown;
    bundle?: unknown;
  };
};

export function resolveRelayDumpPaths(dumpRoot: string, creatorId: string): {
  canonicalPath: string;
  exportIndexPath: string;
  exportCreatorRoot: string;
} {
  const root = resolve(dumpRoot);
  return {
    canonicalPath: join(root, "canonical.json"),
    exportIndexPath: join(root, "exports", creatorId, "export_index.json"),
    exportCreatorRoot: join(root, "exports", creatorId)
  };
}

/**
 * Import from a relay-dump directory (fixture-friendly; no live .relay-data required).
 */
export function importRelayDump(
  opts: ImportRelayDumpOptions = {}
): ImportCanonicalResult {
  const creatorId = opts.creatorId ?? DEFAULT_RELAY_DUMP_CREATOR_ID;
  const dumpRoot = opts.dumpRoot ?? DEFAULT_RELAY_DUMP_ROOT;
  const paths = resolveRelayDumpPaths(dumpRoot, creatorId);

  if (!existsSync(paths.canonicalPath)) {
    throw new Error(`Relay dump canonical not found: ${paths.canonicalPath}`);
  }

  const canonical = JSON.parse(readFileSync(paths.canonicalPath, "utf8")) as unknown;
  let exportIndex: unknown = { creator_id: creatorId, media: {} };
  if (existsSync(paths.exportIndexPath)) {
    exportIndex = JSON.parse(readFileSync(paths.exportIndexPath, "utf8")) as unknown;
  }

  return importCanonical({
    creatorId,
    canonical,
    exportIndex,
    exportCreatorRoot: existsSync(paths.exportCreatorRoot)
      ? paths.exportCreatorRoot
      : null,
    displayName: opts.displayName ?? "Escape Hatch Relay Dump",
    handle: opts.handle ?? "eh-relay",
    baseUrl: opts.baseUrl,
    batchId: opts.batchId,
    existing: opts.existing
  });
}
