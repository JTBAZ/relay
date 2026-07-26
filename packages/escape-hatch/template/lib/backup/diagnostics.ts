/**
 * Redacted diagnostic download bundle (EH-073).
 */

import { readManifestVersions } from "./compatibility";
import { loadBackupState } from "./state";
import type {
  DiagnosticBundle,
  RestoreRehearsalStatus
} from "./types";

const SECRET_FRAGMENT_RE =
  /(secret|password|token|api[_-]?key|private|credential|pepper|webhook|authorization|bearer)/i;

export function stripSecretsFromObject(
  input: unknown,
  depth = 0
): unknown {
  if (depth > 8) return "[truncated]";
  if (Array.isArray(input)) {
    return input.map((v) => stripSecretsFromObject(v, depth + 1));
  }
  if (input && typeof input === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
      if (SECRET_FRAGMENT_RE.test(k)) {
        out[k] = "[redacted]";
        continue;
      }
      if (typeof v === "string" && SECRET_FRAGMENT_RE.test(v)) {
        out[k] = "[redacted]";
        continue;
      }
      if (
        typeof v === "string" &&
        (v.includes("@") && k.toLowerCase().includes("email")
          ? true
          : /patron|member_email|to_address/i.test(k))
      ) {
        out[k] = "[redacted_pii]";
        continue;
      }
      out[k] = stripSecretsFromObject(v, depth + 1);
    }
    return out;
  }
  return input;
}

export type BuildDiagnosticsOpts = {
  siteId: string;
  kitDir?: string;
  healthStatuses?: Array<{ id: string; ok: boolean; detail: string }>;
  now?: Date;
};

/**
 * Build a downloadable diagnostics JSON (versions, statuses, codes — no secrets).
 */
export function buildDiagnosticBundle(
  opts: BuildDiagnosticsOpts
): DiagnosticBundle | null {
  const kitDir = opts.kitDir ?? process.cwd();
  const versions = readManifestVersions(kitDir);
  if (!versions) return null;

  const state = loadBackupState(opts.siteId, kitDir);
  const restoreStatus: RestoreRehearsalStatus = !state.last_rehearsal
    ? "never_run"
    : state.last_rehearsal.status === "passed"
      ? "passed"
      : "failed";

  const recent_error_codes: string[] = [];
  if (state.last_error) recent_error_codes.push(state.last_error);
  if (state.schedule.last_result === "failed") {
    recent_error_codes.push("backup_last_result_failed");
  }
  if (state.last_rehearsal?.error) {
    recent_error_codes.push(state.last_rehearsal.error);
  }

  const bundle: DiagnosticBundle = {
    contract_version: "escape-hatch-diagnostic-bundle/1.0.0",
    generated_at: (opts.now ?? new Date()).toISOString(),
    site_id: opts.siteId,
    production_safe: false,
    versions: {
      chassis_version: versions.chassis_version,
      schema_version: versions.schema_version,
      slice: versions.slice,
      adapters: versions.adapters
    },
    backup_schedule: { ...state.schedule },
    restore_rehearsal_status: restoreStatus,
    health_statuses: (opts.healthStatuses ?? []).map((h) => ({
      id: h.id,
      ok: h.ok,
      detail: String(h.detail).slice(0, 500)
    })),
    recent_error_codes: [...new Set(recent_error_codes)].slice(0, 20),
    redaction_note:
      "Diagnostic bundle excludes secrets, tokens, signed URLs, and patron PII. Not production evidence."
  };

  return stripSecretsFromObject(bundle) as DiagnosticBundle;
}

/** Assert helper for tests — fails if secret-like material remains. */
export function diagnosticContainsSecrets(bundle: DiagnosticBundle): boolean {
  const json = JSON.stringify(bundle);
  if (/sk_live_|whsec_|re_[A-Za-z0-9]{20,}/i.test(json)) return true;
  if (/"password"\s*:\s*"[^[]/i.test(json)) return true;
  if (/Bearer\s+[A-Za-z0-9._-]{20,}/i.test(json)) return true;
  return false;
}
