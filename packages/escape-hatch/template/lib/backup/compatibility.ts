/**
 * Manifest version read + compatibility (EH-073).
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type {
  CompatibilityPointer,
  CompatibilityReport,
  CompatibilityVerdict,
  ManifestVersions
} from "./types";

export function readManifestVersions(
  kitDir = process.cwd()
): ManifestVersions | null {
  const path = join(kitDir, "escape-hatch.manifest.json");
  if (!existsSync(path)) return null;
  try {
    const raw = JSON.parse(
      readFileSync(path, "utf8").replace(/^\uFEFF/, "")
    ) as {
      chassis_version?: string;
      schema_version?: string;
      slice?: string;
      adapters?: Record<string, { version?: string; state?: string }>;
    };
    const adapters: ManifestVersions["adapters"] = [];
    if (raw.adapters && typeof raw.adapters === "object") {
      for (const [id, row] of Object.entries(raw.adapters)) {
        adapters.push({
          id,
          version: String(row?.version ?? "unknown"),
          state: String(row?.state ?? "unknown")
        });
      }
    }
    return {
      chassis_version: String(raw.chassis_version ?? "unknown"),
      schema_version: String(raw.schema_version ?? "unknown"),
      slice: String(raw.slice ?? "unknown"),
      adapters
    };
  } catch {
    return null;
  }
}

export function currentPointerFromManifest(
  versions: ManifestVersions,
  now = new Date()
): CompatibilityPointer {
  return {
    chassis_version: versions.chassis_version,
    schema_version: versions.schema_version,
    slice: versions.slice,
    recorded_at: now.toISOString()
  };
}

/**
 * Honest forward-compat note for current±1 chassis/schema — not a live migrate.
 */
export function assessCompatibility(opts: {
  current: CompatibilityPointer;
  previous_stable: CompatibilityPointer | null;
}): CompatibilityReport {
  const { current, previous_stable } = opts;
  if (!previous_stable) {
    return {
      verdict: "unknown",
      detail:
        "No previous_stable pointer recorded — run a fixture backup to capture a baseline. Not a live migrate proof.",
      current,
      previous_stable: null,
      production_safe: false
    };
  }

  let verdict: CompatibilityVerdict = "compatible";
  const notes: string[] = [];

  if (current.chassis_version !== previous_stable.chassis_version) {
    notes.push(
      `chassis ${previous_stable.chassis_version} → ${current.chassis_version}`
    );
    verdict = "compatible_with_notes";
  }
  if (current.schema_version !== previous_stable.schema_version) {
    notes.push(
      `schema ${previous_stable.schema_version} → ${current.schema_version}`
    );
    verdict = "compatible_with_notes";
  }
  if (current.slice !== previous_stable.slice) {
    notes.push(`slice ${previous_stable.slice} → ${current.slice}`);
    if (verdict === "compatible") verdict = "compatible_with_notes";
  }

  // Hard incompatibility only when schema major prefix diverges wildly (fixture heuristic).
  const prevSchemaMajor = previous_stable.schema_version.split("/")[0] ?? "";
  const curSchemaMajor = current.schema_version.split("/")[0] ?? "";
  if (
    prevSchemaMajor &&
    curSchemaMajor &&
    prevSchemaMajor !== curSchemaMajor
  ) {
    verdict = "incompatible";
    notes.push("schema family mismatch — restore may require manual review");
  }

  return {
    verdict,
    detail:
      notes.length === 0
        ? "Current matches previous_stable chassis/schema/slice (fixture check only)."
        : `Fixture compatibility: ${notes.join("; ")}. Not a live migrate.`,
    current,
    previous_stable,
    production_safe: false
  };
}
