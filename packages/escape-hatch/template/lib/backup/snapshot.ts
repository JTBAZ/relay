/**
 * Redacted config snapshot + schedule run (EH-073).
 * No live pg_dump / R2 versioning.
 */

import {
  createHash,
  randomUUID
} from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync
} from "node:fs";
import { join } from "node:path";
import {
  currentPointerFromManifest,
  readManifestVersions
} from "./compatibility";
import { loadBackupState, saveBackupState } from "./state";
import type { BackupArtifact, BackupStateDocument } from "./types";
import { BACKUP_RPO_HOURS } from "./types";

const SECRET_KEY_RE =
  /(secret|password|token|api[_-]?key|private[_-]?key|credential|pepper|webhook)/i;

export type SnapshotPayload = {
  contract_version: "escape-hatch-backup-artifact/1.0.0";
  backup_id: string;
  created_at: string;
  site_id: string;
  production_safe: false;
  versions: {
    chassis_version: string;
    schema_version: string;
    slice: string;
    adapters: Array<{ id: string; version: string; state: string }>;
  };
  /** Hashes of non-secret kit data files (names + sha256 of redacted JSON). */
  data_file_hashes: Array<{ name: string; sha256: string }>;
  redaction_note: string;
};

function nextRunAt(from: Date): string {
  const next = new Date(from.getTime() + BACKUP_RPO_HOURS * 60 * 60 * 1000);
  return next.toISOString();
}

function redactValue(key: string, value: unknown): unknown {
  if (SECRET_KEY_RE.test(key)) return "[redacted]";
  if (typeof value === "string") {
    if (
      /^(sk_|rk_|whsec_|re_|pat_|eyJ)/i.test(value) ||
      (value.length > 40 && /[A-Za-z0-9+/=_-]{40,}/.test(value))
    ) {
      return "[redacted]";
    }
  }
  if (Array.isArray(value)) {
    return value.map((v, i) => redactValue(String(i), v));
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = redactValue(k, v);
    }
    return out;
  }
  return value;
}

export function redactForBackup(input: unknown): unknown {
  return redactValue("root", input);
}

function hashRedactedFile(absPath: string): string | null {
  try {
    const raw = readFileSync(absPath, "utf8").replace(/^\uFEFF/, "");
    let parsed: unknown = raw;
    try {
      parsed = JSON.parse(raw);
    } catch {
      /* keep raw string */
    }
    const redacted = redactForBackup(parsed);
    return createHash("sha256")
      .update(JSON.stringify(redacted))
      .digest("hex");
  } catch {
    return null;
  }
}

function collectDataHashes(kitDir: string): Array<{ name: string; sha256: string }> {
  const dataDir = join(kitDir, "data");
  if (!existsSync(dataDir)) return [];
  const out: Array<{ name: string; sha256: string }> = [];
  for (const name of readdirSync(dataDir)) {
    if (!name.endsWith(".json")) continue;
    if (name === "backup-state.json") continue;
    const hash = hashRedactedFile(join(dataDir, name));
    if (hash) out.push({ name, sha256: hash });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

export type RunBackupOpts = {
  siteId: string;
  kitDir?: string;
  now?: Date;
  /** Force failure for tests. */
  forceFail?: boolean;
};

export type RunBackupResult = {
  ok: boolean;
  artifact: BackupArtifact | null;
  state: BackupStateDocument;
  error: string | null;
  production_safe: false;
};

/**
 * Create a redacted kit config snapshot under data/backups/<id>/.
 */
export function runScheduledBackup(opts: RunBackupOpts): RunBackupResult {
  const kitDir = opts.kitDir ?? process.cwd();
  const now = opts.now ?? new Date();
  let state = loadBackupState(opts.siteId, kitDir);

  if (opts.forceFail) {
    state = {
      ...state,
      schedule: {
        ...state.schedule,
        last_run_at: now.toISOString(),
        next_run_at: nextRunAt(now),
        last_result: "failed"
      },
      last_error: "forced_fixture_failure"
    };
    saveBackupState(state, kitDir);
    return {
      ok: false,
      artifact: null,
      state,
      error: "forced_fixture_failure",
      production_safe: false
    };
  }

  const versions = readManifestVersions(kitDir);
  if (!versions) {
    state = {
      ...state,
      schedule: {
        ...state.schedule,
        last_run_at: now.toISOString(),
        next_run_at: nextRunAt(now),
        last_result: "failed"
      },
      last_error: "manifest_unreadable"
    };
    saveBackupState(state, kitDir);
    return {
      ok: false,
      artifact: null,
      state,
      error: "manifest_unreadable",
      production_safe: false
    };
  }

  const backupId = `bak_${now.getTime().toString(36)}_${randomUUID().slice(0, 8)}`;
  const relPath = join("data", "backups", backupId, "snapshot.json");
  const absDir = join(kitDir, "data", "backups", backupId);
  mkdirSync(absDir, { recursive: true });

  const payload: SnapshotPayload = {
    contract_version: "escape-hatch-backup-artifact/1.0.0",
    backup_id: backupId,
    created_at: now.toISOString(),
    site_id: opts.siteId,
    production_safe: false,
    versions: {
      chassis_version: versions.chassis_version,
      schema_version: versions.schema_version,
      slice: versions.slice,
      adapters: versions.adapters
    },
    data_file_hashes: collectDataHashes(kitDir),
    redaction_note:
      "Secrets, tokens, and patron PII stripped. Not a live Postgres/R2 backup."
  };

  writeFileSync(
    join(absDir, "snapshot.json"),
    `${JSON.stringify(payload, null, 2)}\n`,
    "utf8"
  );

  const artifact: BackupArtifact = {
    backup_id: backupId,
    created_at: now.toISOString(),
    status: "ok",
    artifact_path: relPath.replace(/\\/g, "/"),
    chassis_version: versions.chassis_version,
    schema_version: versions.schema_version,
    slice: versions.slice,
    error: null
  };

  const pointer = currentPointerFromManifest(versions, now);
  state = {
    ...state,
    schedule: {
      ...state.schedule,
      last_run_at: now.toISOString(),
      next_run_at: nextRunAt(now),
      last_result: "ok"
    },
    backups: [artifact, ...state.backups].slice(0, 20),
    previous_stable: state.previous_stable ?? pointer,
    last_error: null
  };
  saveBackupState(state, kitDir);

  return {
    ok: true,
    artifact,
    state,
    error: null,
    production_safe: false
  };
}

/** Freshness within documented RPO. */
export function isBackupFresh(
  state: BackupStateDocument,
  now = new Date()
): boolean {
  if (!state.schedule.last_run_at || state.schedule.last_result !== "ok") {
    return false;
  }
  const last = Date.parse(state.schedule.last_run_at);
  if (Number.isNaN(last)) return false;
  const ageMs = now.getTime() - last;
  return ageMs <= BACKUP_RPO_HOURS * 60 * 60 * 1000;
}
