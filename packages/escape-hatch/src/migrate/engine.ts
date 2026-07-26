/**
 * EH-012 media migration engine: stream copy, checksums, resumable ledger,
 * private-read verification. Never treats public/media as private delivery.
 */

import { createReadStream, existsSync, statSync } from "node:fs";
import { basename } from "node:path";
import type { SiteBundle } from "../contracts.js";
import { resolveBlobPathUnderRoot } from "../import/path-safety.js";
import type { ImportProvenance } from "../import/types.js";
import {
  checksumMatchesExpected,
  hashFile,
  isSha256Hex,
  normalizeSha256
} from "./checksum.js";
import { buildEscapeHatchMediaObjectKey } from "./keys.js";
import type { ObjectStoragePort } from "./storage-port.js";
import {
  MEDIA_MIGRATION_LEDGER_CONTRACT_VERSION,
  MEDIA_MIGRATION_REPORT_CONTRACT_VERSION,
  type MediaMigrationLedger,
  type MediaMigrationObjectEntry,
  type MediaMigrationReport,
  type MigrationAccessClass
} from "./types.js";
import {
  assertNoSecretsInMigrationJson,
  assertPrivateObjectKey,
  isPublicMediaPath,
  serializeMigrationDocument
} from "./validate.js";

export type MediaMigrationCandidate = {
  media_id: string;
  /** Absolute path to local export blob (already containment-checked). */
  source_abs_path: string;
  source_relative_path?: string;
  expected_sha256?: string;
  expected_byte_length?: number;
  mime_type?: string;
  original_filename?: string;
  access_class: MigrationAccessClass;
};

export type MigrateMediaOptions = {
  creatorId: string;
  siteId: string;
  batchId: string;
  storage: ObjectStoragePort;
  candidates: MediaMigrationCandidate[];
  /** Prior ledger for idempotent resume (optional). */
  existingLedger?: MediaMigrationLedger;
  /** Fixed clock for tests. */
  now?: () => Date;
};

export type MigrateMediaResult = {
  ledger: MediaMigrationLedger;
  report: MediaMigrationReport;
  /** Non-zero when any object remains failed/unaccounted. */
  exitCode: number;
};

const LEDGER_NOTES = [
  "productionSafe remains false — private object copy is not visitor signed-URL delivery (EH-033).",
  "public/media prototype copies are never accepted as private-read verification.",
  "Premium (member_only / tier_gated) objects are recorded as private object keys only.",
  "Resume re-checks live assertPrivateRead; ledger status verified alone is never success.",
  "R2 private_read_verified requires anonymous probe (publicBaseUrl + allowPublicProbe); authenticated GET alone is insufficient."
];

function accessClassFromLevel(
  level: string | undefined
): MigrationAccessClass {
  if (level === "public") return "public";
  if (level === "member_only") return "member_only";
  if (level === "tier_gated") return "tier_gated";
  return "unknown";
}

function privateRequired(access: MigrationAccessClass): boolean {
  return access === "member_only" || access === "tier_gated";
}

function isoNow(now: () => Date): string {
  return now().toISOString();
}

function emptyLedger(
  opts: Pick<MigrateMediaOptions, "creatorId" | "siteId" | "batchId">,
  now: () => Date
): MediaMigrationLedger {
  return {
    contract_version: MEDIA_MIGRATION_LEDGER_CONTRACT_VERSION,
    site_id: opts.siteId,
    creator_id: opts.creatorId,
    batch_id: opts.batchId,
    updated_at: isoNow(now),
    production_safe: false,
    notes: [...LEDGER_NOTES],
    objects: Object.create(null)
  };
}

function buildReport(
  ledger: MediaMigrationLedger,
  now: () => Date
): MediaMigrationReport {
  let expected = 0;
  let copied = 0;
  let verified = 0;
  let failed = 0;
  let skipped = 0;
  let bytes_verified = 0;

  for (const entry of Object.values(ledger.objects)) {
    expected += 1;
    if (entry.status === "verified") {
      verified += 1;
      copied += 1;
      bytes_verified += entry.actual_byte_length ?? 0;
    } else if (entry.status === "failed") {
      failed += 1;
    } else if (entry.status === "skipped") {
      skipped += 1;
    } else if (entry.status === "copying") {
      // Interrupted mid-copy counts as failed for exit accounting.
      failed += 1;
    }
  }

  return {
    contract_version: MEDIA_MIGRATION_REPORT_CONTRACT_VERSION,
    site_id: ledger.site_id,
    creator_id: ledger.creator_id,
    batch_id: ledger.batch_id,
    generated_at: isoNow(now),
    production_safe: false,
    expected,
    copied,
    verified,
    failed,
    skipped,
    bytes_verified,
    notes: [
      ...LEDGER_NOTES,
      "fillTemplate may still copy bytes into public/media for soft preview; that path is prototype leakage until EH-033."
    ]
  };
}

/**
 * Explicit fail-closed check: public/media is never private verification.
 */
export function rejectPublicMediaAsPrivateVerification(pathOrKey: string): void {
  if (isPublicMediaPath(pathOrKey)) {
    throw new Error(
      "public/media path is not private-read verification (prototype leakage only)"
    );
  }
  assertPrivateObjectKey(pathOrKey);
}

function seedEntry(
  candidate: MediaMigrationCandidate,
  prior: MediaMigrationObjectEntry | undefined,
  creatorId: string,
  siteId: string
): MediaMigrationObjectEntry {
  const object_key = buildEscapeHatchMediaObjectKey(
    creatorId,
    siteId,
    candidate.media_id
  );
  if (prior?.status === "verified" && prior.object_key === object_key) {
    return { ...prior };
  }
  return {
    media_id: candidate.media_id,
    status: prior?.status === "failed" ? "pending" : (prior?.status ?? "pending"),
    attempt_count: prior?.attempt_count ?? 0,
    object_key,
    source_relative_path: candidate.source_relative_path,
    expected_sha256: isSha256Hex(candidate.expected_sha256)
      ? normalizeSha256(candidate.expected_sha256)
      : undefined,
    expected_byte_length: candidate.expected_byte_length,
    mime_type: candidate.mime_type,
    original_filename:
      candidate.original_filename ?? basename(candidate.source_abs_path),
    access_class: candidate.access_class,
    private_required: privateRequired(candidate.access_class),
    private_read_verified: false,
    next_action: "retry",
    failure_reason: prior?.status === "failed" ? prior.failure_reason : undefined
  };
}

/**
 * Live private-read confirmation before treating a ledger "verified" entry as done.
 * Fail closed on missing object / checksum mismatch — never trust ledger alone.
 */
async function confirmLiveVerified(
  entry: MediaMigrationObjectEntry,
  storage: ObjectStoragePort,
  now: () => Date
): Promise<
  | { ok: true; entry: MediaMigrationObjectEntry }
  | { ok: false; entry: MediaMigrationObjectEntry }
> {
  if (!entry.object_key) {
    return {
      ok: false,
      entry: downgradeVerifiedEntry(
        entry,
        "live private-read re-verification failed: missing object_key",
        now
      )
    };
  }

  try {
    rejectPublicMediaAsPrivateVerification(entry.object_key);
    const priv = await storage.assertPrivateRead(entry.object_key);
    if (!priv.anonymous_denied) {
      return {
        ok: false,
        entry: downgradeVerifiedEntry(
          entry,
          "live private-read re-verification failed: anonymous denial not proven",
          now
        )
      };
    }
    if (
      entry.actual_sha256 !== undefined &&
      priv.sha256 !== entry.actual_sha256
    ) {
      return {
        ok: false,
        entry: downgradeVerifiedEntry(
          entry,
          "live private-read sha256 mismatch with ledger actual_sha256",
          now
        )
      };
    }
    if (
      entry.actual_byte_length !== undefined &&
      priv.byteLength !== entry.actual_byte_length
    ) {
      return {
        ok: false,
        entry: downgradeVerifiedEntry(
          entry,
          "live private-read byte length mismatch with ledger actual_byte_length",
          now
        )
      };
    }
    return {
      ok: true,
      entry: {
        ...entry,
        status: "verified",
        private_read_verified: true,
        failure_reason: undefined,
        next_action: "none"
      }
    };
  } catch (err) {
    return {
      ok: false,
      entry: downgradeVerifiedEntry(
        entry,
        `live private-read re-verification failed: ${(err as Error).message}`,
        now
      )
    };
  }
}

function downgradeVerifiedEntry(
  entry: MediaMigrationObjectEntry,
  reason: string,
  now: () => Date
): MediaMigrationObjectEntry {
  return {
    ...entry,
    status: "failed",
    private_read_verified: false,
    attempt_count: entry.attempt_count + 1,
    last_attempt_at: isoNow(now),
    failure_reason: reason,
    next_action: "retry"
  };
}

async function migrateOne(
  candidate: MediaMigrationCandidate,
  entry: MediaMigrationObjectEntry,
  storage: ObjectStoragePort,
  now: () => Date
): Promise<MediaMigrationObjectEntry> {
  // Idempotent only after live private-read confirms the object still matches.
  if (
    entry.status === "verified" &&
    entry.private_read_verified &&
    entry.object_key
  ) {
    const live = await confirmLiveVerified(entry, storage, now);
    return live.entry;
  }

  const next: MediaMigrationObjectEntry = {
    ...entry,
    status: "copying",
    attempt_count: entry.attempt_count + 1,
    last_attempt_at: isoNow(now),
    private_read_verified: false,
    next_action: "retry"
  };

  const objectKey = next.object_key!;
  rejectPublicMediaAsPrivateVerification(objectKey);

  if (!existsSync(candidate.source_abs_path)) {
    return {
      ...next,
      status: "failed",
      failure_reason: "source blob missing on disk",
      next_action: "retry"
    };
  }
  if (!statSync(candidate.source_abs_path).isFile()) {
    return {
      ...next,
      status: "failed",
      failure_reason: "source path is not a file",
      next_action: "skip"
    };
  }

  let checksum;
  try {
    checksum = await hashFile(candidate.source_abs_path);
  } catch (err) {
    return {
      ...next,
      status: "failed",
      failure_reason: `source hash failed: ${(err as Error).message}`,
      next_action: "retry"
    };
  }

  const match = checksumMatchesExpected(
    checksum,
    candidate.expected_sha256,
    candidate.expected_byte_length
  );
  if (!match.ok) {
    return {
      ...next,
      status: "failed",
      actual_sha256: checksum.sha256,
      actual_byte_length: checksum.byteLength,
      failure_reason: match.reason,
      next_action: "skip"
    };
  }

  next.actual_sha256 = checksum.sha256;
  next.actual_byte_length = checksum.byteLength;

  try {
    const stream = createReadStream(candidate.source_abs_path);
    await storage.putObjectStream(objectKey, stream, {
      contentType: candidate.mime_type,
      contentLength: checksum.byteLength
    });
  } catch (err) {
    return {
      ...next,
      status: "failed",
      failure_reason: `put failed: ${(err as Error).message}`,
      next_action: "retry"
    };
  }

  next.next_action = "verify_private_read";

  try {
    rejectPublicMediaAsPrivateVerification(objectKey);
    const priv = await storage.assertPrivateRead(objectKey);
    if (!priv.anonymous_denied) {
      return {
        ...next,
        status: "failed",
        failure_reason:
          "private-read verification failed: anonymous denial not proven",
        next_action: "retry"
      };
    }
    if (priv.sha256 !== checksum.sha256 || priv.byteLength !== checksum.byteLength) {
      return {
        ...next,
        status: "failed",
        failure_reason: "private-read checksum or byte length mismatch",
        next_action: "retry"
      };
    }
  } catch (err) {
    return {
      ...next,
      status: "failed",
      failure_reason: `private-read verification failed: ${(err as Error).message}`,
      next_action: "retry"
    };
  }

  return {
    ...next,
    status: "verified",
    private_read_verified: true,
    failure_reason: undefined,
    next_action: "none"
  };
}

/**
 * Run (or resume) media migration into injected storage.
 * Replay-safe: verified objects skip re-copy only after live private-read confirms
 * the object still exists and matches ledger digests; failed objects retry.
 */
export async function migrateMedia(
  opts: MigrateMediaOptions
): Promise<MigrateMediaResult> {
  const now = opts.now ?? (() => new Date());
  const ledger =
    opts.existingLedger &&
    opts.existingLedger.creator_id === opts.creatorId &&
    opts.existingLedger.site_id === opts.siteId
      ? {
          ...opts.existingLedger,
          batch_id: opts.batchId,
          notes: [...LEDGER_NOTES],
          objects: { ...opts.existingLedger.objects }
        }
      : emptyLedger(opts, now);

  const seen = new Set<string>();
  for (const candidate of opts.candidates) {
    if (seen.has(candidate.media_id)) continue;
    seen.add(candidate.media_id);

    const prior = ledger.objects[candidate.media_id];
    let entry = seedEntry(candidate, prior, opts.creatorId, opts.siteId);

    if (entry.status === "verified" && entry.private_read_verified) {
      const live = await confirmLiveVerified(entry, opts.storage, now);
      ledger.objects[candidate.media_id] = live.entry;
      // Fail closed on wipe/tamper — do not count as verified; next run retries.
      continue;
    }

    entry = await migrateOne(candidate, entry, opts.storage, now);
    ledger.objects[candidate.media_id] = entry;
  }

  ledger.updated_at = isoNow(now);
  const report = buildReport(ledger, now);

  const ledgerJson = serializeMigrationDocument(ledger);
  const reportJson = serializeMigrationDocument(report);
  assertNoSecretsInMigrationJson(ledgerJson);
  assertNoSecretsInMigrationJson(reportJson);

  const exitCode = report.failed > 0 ? 1 : 0;
  return { ledger, report, exitCode };
}

export type BuildCandidatesOptions = {
  creatorId: string;
  siteId: string;
  bundle: SiteBundle;
  /** Creator export root (contains export_index relative paths). */
  exportCreatorRoot?: string;
  provenance?: ImportProvenance;
  /**
   * Map media_id → absolute source path (already validated).
   * Used when paths come from staging rather than export index.
   */
  stagedSources?: Record<string, string>;
};

/**
 * Build migration candidates from SiteBundle + export/staging sources.
 * Path containment enforced via resolveBlobPathUnderRoot when using export root.
 */
export function buildMigrationCandidates(
  opts: BuildCandidatesOptions
): MediaMigrationCandidate[] {
  const accessByMedia = new Map<string, MigrationAccessClass>();
  for (const post of opts.bundle.posts) {
    const access = accessClassFromLevel(post.access?.level);
    for (const m of post.media) {
      const prior = accessByMedia.get(m.media_id);
      // Prefer stricter class when media appears on multiple posts.
      if (
        !prior ||
        (prior === "public" && access !== "public") ||
        (prior === "unknown" && access !== "unknown")
      ) {
        accessByMedia.set(m.media_id, access);
      }
      if (access === "tier_gated") {
        accessByMedia.set(m.media_id, "tier_gated");
      } else if (access === "member_only" && prior !== "tier_gated") {
        accessByMedia.set(m.media_id, "member_only");
      }
    }
  }

  const candidates: MediaMigrationCandidate[] = [];
  const seen = new Set<string>();

  for (const post of opts.bundle.posts) {
    for (const m of post.media) {
      if (seen.has(m.media_id)) continue;
      seen.add(m.media_id);

      const prov = opts.provenance?.media[m.media_id];
      let source_abs_path: string | undefined;
      let source_relative_path: string | undefined;

      if (opts.stagedSources?.[m.media_id]) {
        source_abs_path = opts.stagedSources[m.media_id];
      } else if (opts.exportCreatorRoot && m.has_export !== false) {
        // Prefer provenance-linked relative path via content_path naming convention:
        // export blobs are discovered from stagedSources or explicit relative paths
        // in a companion map — when only export root is known, try blobs/{media_id}.*
        const fromStage = opts.stagedSources?.[m.media_id];
        if (fromStage) source_abs_path = fromStage;
      }

      // content_path like /media/foo.svg is a public preview path — not a storage key.
      // Resolve export blobs only under exportCreatorRoot with explicit relative paths
      // provided via stagedSources builder (see collectStagedSources).
      if (!source_abs_path) {
        continue;
      }

      const access = accessByMedia.get(m.media_id) ?? "unknown";
      const expected_sha256 =
        prov?.checksum && isSha256Hex(prov.checksum)
          ? normalizeSha256(prov.checksum)
          : undefined;
      const expected_byte_length =
        typeof prov?.byte_length === "number" ? prov.byte_length : undefined;

      candidates.push({
        media_id: m.media_id,
        source_abs_path,
        source_relative_path,
        expected_sha256,
        expected_byte_length,
        mime_type: m.mime_type ?? prov?.mime_type,
        original_filename: basename(source_abs_path),
        access_class: access
      });
    }
  }

  return candidates;
}

/**
 * Resolve export index relative paths under creator root (fail-closed containment).
 */
export function collectExportSources(
  exportCreatorRoot: string,
  mediaIndex: Record<
    string,
    {
      media_id: string;
      relative_blob_path: string;
      sha256?: string;
      byte_length?: number;
      mime_type?: string;
    }
  >
): {
  stagedSources: Record<string, string>;
  meta: Record<
    string,
    { expected_sha256?: string; expected_byte_length?: number; mime_type?: string; relative: string }
  >;
} {
  const stagedSources: Record<string, string> = Object.create(null);
  const meta: Record<
    string,
    { expected_sha256?: string; expected_byte_length?: number; mime_type?: string; relative: string }
  > = Object.create(null);

  for (const [mediaId, rec] of Object.entries(mediaIndex)) {
    let abs: string;
    try {
      abs = resolveBlobPathUnderRoot(exportCreatorRoot, rec.relative_blob_path);
    } catch {
      continue;
    }
    if (!existsSync(abs) || !statSync(abs).isFile()) continue;
    stagedSources[mediaId] = abs;
    meta[mediaId] = {
      relative: rec.relative_blob_path,
      expected_sha256: isSha256Hex(rec.sha256)
        ? normalizeSha256(rec.sha256)
        : undefined,
      expected_byte_length:
        typeof rec.byte_length === "number" ? rec.byte_length : undefined,
      mime_type: rec.mime_type
    };
  }

  return { stagedSources, meta };
}

/**
 * Build candidates preferring export index meta over provenance when present.
 */
export function buildMigrationCandidatesFromExport(opts: {
  creatorId: string;
  siteId: string;
  bundle: SiteBundle;
  exportCreatorRoot: string;
  mediaIndex: Record<
    string,
    {
      media_id: string;
      relative_blob_path: string;
      sha256?: string;
      byte_length?: number;
      mime_type?: string;
    }
  >;
  provenance?: ImportProvenance;
}): MediaMigrationCandidate[] {
  const { stagedSources, meta } = collectExportSources(
    opts.exportCreatorRoot,
    opts.mediaIndex
  );
  const base = buildMigrationCandidates({
    creatorId: opts.creatorId,
    siteId: opts.siteId,
    bundle: opts.bundle,
    exportCreatorRoot: opts.exportCreatorRoot,
    provenance: opts.provenance,
    stagedSources
  });

  return base.map((c) => {
    const m = meta[c.media_id];
    if (!m) return c;
    return {
      ...c,
      source_relative_path: m.relative,
      expected_sha256: m.expected_sha256 ?? c.expected_sha256,
      expected_byte_length: m.expected_byte_length ?? c.expected_byte_length,
      mime_type: m.mime_type ?? c.mime_type
    };
  });
}
