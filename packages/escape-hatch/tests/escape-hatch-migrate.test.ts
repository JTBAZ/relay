/**
 * EH-012 media migration engine: checksums, resume, private-read, fail-closed paths.
 */

import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { ContractValidationError } from "../src/contracts.js";
import { importRelayDump } from "../src/import/index.js";
import {
  assertNoSecretsInMigrationJson,
  assertPrivateObjectKey,
  buildEscapeHatchMediaObjectKey,
  buildMigrationCandidatesFromExport,
  checksumMatchesExpected,
  collectExportSources,
  hashFile,
  isPublicMediaPath,
  loadExportMediaIndex,
  assertR2PrivateReadProbeConfigured,
  buildR2PublicObjectUrl,
  createR2StorageConfig,
  MemoryObjectStorage,
  migrateKitMedia,
  migrateMedia,
  parseMediaMigrationLedger,
  parseMediaMigrationReport,
  R2ObjectStorage,
  rejectPublicMediaAsPrivateVerification,
  serializeMigrationDocument,
  type MediaMigrationCandidate,
  type MediaMigrationLedger
} from "../src/migrate/index.js";

const PACKAGE_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const FIXTURE_ROOT = join(PACKAGE_ROOT, "fixtures");
const RELAY_DUMP = join(FIXTURE_ROOT, "relay-dump");
const EXPORT_ROOT = join(RELAY_DUMP, "exports", "cr_eh_relay");
const BLOB_RELAY = join(EXPORT_ROOT, "blobs", "m_relay.svg");
const BLOB_GOLD = join(EXPORT_ROOT, "blobs", "m_relay_gold.svg");
const BLOB_VIDEO = join(EXPORT_ROOT, "blobs", "m_video_stub.txt");
const BLOB_AUDIO = join(EXPORT_ROOT, "blobs", "m_audio_stub.txt");

const FIXED_NOW = () => new Date("2026-07-22T18:00:00.000Z");

const dirs: string[] = [];
afterEach(() => {
  while (dirs.length > 0) {
    const d = dirs.pop();
    if (d) rmSync(d, { recursive: true, force: true });
  }
});

function tempDir(prefix: string): string {
  const d = mkdtempSync(join(tmpdir(), prefix));
  dirs.push(d);
  return d;
}

function candidate(
  mediaId: string,
  source: string,
  overrides: Partial<MediaMigrationCandidate> = {}
): MediaMigrationCandidate {
  return {
    media_id: mediaId,
    source_abs_path: source,
    access_class: "public",
    ...overrides
  };
}

describe("EH-012 object keys and public-media rejection", () => {
  it("builds opaque creator/site media keys", () => {
    const key = buildEscapeHatchMediaObjectKey(
      "cr_eh_relay",
      "site_eh_cr_eh_relay",
      "m_relay"
    );
    expect(key).toBe(
      "eh/cr_eh_relay/site_eh_cr_eh_relay/media/m_relay/object"
    );
    expect(key).not.toMatch(/relay\/tenants/);
  });

  it("rejects public/media and guessable paths as private verification", () => {
    expect(isPublicMediaPath("public/media/m_relay.svg")).toBe(true);
    expect(isPublicMediaPath("/media/m_relay.svg")).toBe(true);
    expect(() =>
      rejectPublicMediaAsPrivateVerification("public/media/secret.svg")
    ).toThrow(/public\/media/);
    expect(() => assertPrivateObjectKey("media/1")).toThrow(/guessable/i);
    expect(() => assertPrivateObjectKey("public/media/x")).toThrow(
      /public\/media/
    );
  });
});

describe("EH-012 checksum match / mismatch", () => {
  it("matches sha256 and byte length", async () => {
    const actual = await hashFile(BLOB_RELAY);
    expect(actual.byteLength).toBe(205);
    expect(
      checksumMatchesExpected(
        actual,
        "47ee847f578d5cc56737bf838c48d4801d51508b3103086c6f908c069392e7b7",
        205
      )
    ).toEqual({ ok: true });
  });

  it("fails closed on sha256 mismatch", async () => {
    const actual = await hashFile(BLOB_RELAY);
    const result = checksumMatchesExpected(
      actual,
      "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
      205
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/sha256/i);
  });

  it("fails closed on byte_length mismatch", async () => {
    const actual = await hashFile(BLOB_RELAY);
    const result = checksumMatchesExpected(
      actual,
      "47ee847f578d5cc56737bf838c48d4801d51508b3103086c6f908c069392e7b7",
      1
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/byte_length/i);
  });
});

describe("EH-012 migrateMedia core", () => {
  it("verifies private-read and records premium private keys", async () => {
    const storage = new MemoryObjectStorage();
    const result = await migrateMedia({
      creatorId: "cr_eh_relay",
      siteId: "site_eh_cr_eh_relay",
      batchId: "batch_priv",
      storage,
      now: FIXED_NOW,
      candidates: [
        candidate("m_relay", BLOB_RELAY, {
          access_class: "public",
          expected_sha256:
            "47ee847f578d5cc56737bf838c48d4801d51508b3103086c6f908c069392e7b7",
          expected_byte_length: 205,
          mime_type: "image/svg+xml"
        }),
        candidate("m_relay_gold", BLOB_GOLD, {
          access_class: "tier_gated",
          expected_sha256:
            "d448020918a01cab55885ae08e3be7ac3dc358303bcad0bbcbef5780b606818e",
          expected_byte_length: 203,
          mime_type: "image/svg+xml"
        })
      ]
    });

    expect(result.exitCode).toBe(0);
    expect(result.report.verified).toBe(2);
    expect(result.report.production_safe).toBe(false);
    expect(result.ledger.production_safe).toBe(false);

    const gold = result.ledger.objects.m_relay_gold;
    expect(gold.status).toBe("verified");
    expect(gold.private_required).toBe(true);
    expect(gold.private_read_verified).toBe(true);
    expect(gold.object_key).toBe(
      "eh/cr_eh_relay/site_eh_cr_eh_relay/media/m_relay_gold/object"
    );
    expect(gold.object_key).not.toMatch(/public\/media/);
    expect(storage.has(gold.object_key!)).toBe(true);
  });

  it("is idempotent on replay (no duplicate logical assets)", async () => {
    const storage = new MemoryObjectStorage();
    const opts = {
      creatorId: "cr_eh_relay",
      siteId: "site_eh_cr_eh_relay",
      batchId: "batch_idem_1",
      storage,
      now: FIXED_NOW,
      candidates: [
        candidate("m_relay", BLOB_RELAY, {
          expected_sha256:
            "47ee847f578d5cc56737bf838c48d4801d51508b3103086c6f908c069392e7b7",
          expected_byte_length: 205
        })
      ]
    };
    const first = await migrateMedia(opts);
    expect(first.report.verified).toBe(1);
    expect(first.ledger.objects.m_relay.attempt_count).toBe(1);

    const second = await migrateMedia({
      ...opts,
      batchId: "batch_idem_2",
      existingLedger: first.ledger
    });
    expect(second.report.verified).toBe(1);
    expect(second.ledger.objects.m_relay.attempt_count).toBe(1);
    expect(second.ledger.objects.m_relay.private_read_verified).toBe(true);
    expect(storage.keys()).toHaveLength(1);
  });

  it("fails closed when ledger is verified but storage is empty", async () => {
    const storage = new MemoryObjectStorage();
    const first = await migrateMedia({
      creatorId: "cr_eh_relay",
      siteId: "site_eh_cr_eh_relay",
      batchId: "batch_wipe_1",
      storage,
      now: FIXED_NOW,
      candidates: [
        candidate("m_relay", BLOB_RELAY, {
          expected_sha256:
            "47ee847f578d5cc56737bf838c48d4801d51508b3103086c6f908c069392e7b7",
          expected_byte_length: 205
        })
      ]
    });
    expect(first.exitCode).toBe(0);
    expect(first.ledger.objects.m_relay.status).toBe("verified");

    storage.clear();

    const wiped = await migrateMedia({
      creatorId: "cr_eh_relay",
      siteId: "site_eh_cr_eh_relay",
      batchId: "batch_wipe_2",
      storage,
      now: FIXED_NOW,
      candidates: [
        candidate("m_relay", BLOB_RELAY, {
          expected_sha256:
            "47ee847f578d5cc56737bf838c48d4801d51508b3103086c6f908c069392e7b7",
          expected_byte_length: 205
        })
      ],
      existingLedger: first.ledger
    });
    expect(wiped.exitCode).toBe(1);
    expect(wiped.report.verified).toBe(0);
    expect(wiped.ledger.objects.m_relay.status).toBe("failed");
    expect(wiped.ledger.objects.m_relay.private_read_verified).toBe(false);
    expect(wiped.ledger.objects.m_relay.failure_reason).toMatch(
      /live private-read|not privately stored|not found/i
    );
    expect(wiped.ledger.objects.m_relay.attempt_count).toBeGreaterThan(
      first.ledger.objects.m_relay.attempt_count
    );

    // Next run retries from failed → pending and re-copies against live storage.
    const recovered = await migrateMedia({
      creatorId: "cr_eh_relay",
      siteId: "site_eh_cr_eh_relay",
      batchId: "batch_wipe_3",
      storage,
      now: FIXED_NOW,
      candidates: [
        candidate("m_relay", BLOB_RELAY, {
          expected_sha256:
            "47ee847f578d5cc56737bf838c48d4801d51508b3103086c6f908c069392e7b7",
          expected_byte_length: 205
        })
      ],
      existingLedger: wiped.ledger
    });
    expect(recovered.exitCode).toBe(0);
    expect(recovered.ledger.objects.m_relay.status).toBe("verified");
    expect(recovered.ledger.objects.m_relay.private_read_verified).toBe(true);
    expect(storage.has(recovered.ledger.objects.m_relay.object_key!)).toBe(true);
  });

  it("still live-verifies on resume when objects remain present", async () => {
    const storage = new MemoryObjectStorage();
    const candidates = [
      candidate("m_relay", BLOB_RELAY, {
        expected_sha256:
          "47ee847f578d5cc56737bf838c48d4801d51508b3103086c6f908c069392e7b7",
        expected_byte_length: 205
      })
    ];
    const first = await migrateMedia({
      creatorId: "cr_eh_relay",
      siteId: "site_eh_cr_eh_relay",
      batchId: "batch_live_1",
      storage,
      candidates,
      now: FIXED_NOW
    });
    const key = first.ledger.objects.m_relay.object_key!;
    expect(storage.has(key)).toBe(true);

    const second = await migrateMedia({
      creatorId: "cr_eh_relay",
      siteId: "site_eh_cr_eh_relay",
      batchId: "batch_live_2",
      storage,
      candidates,
      existingLedger: first.ledger,
      now: FIXED_NOW
    });
    expect(second.exitCode).toBe(0);
    expect(second.ledger.objects.m_relay.status).toBe("verified");
    expect(second.ledger.objects.m_relay.private_read_verified).toBe(true);
    // Live confirm does not re-copy when object still matches.
    expect(second.ledger.objects.m_relay.attempt_count).toBe(
      first.ledger.objects.m_relay.attempt_count
    );
    expect(storage.keys()).toHaveLength(1);
  });

  it("fails closed when ledger digests disagree with live storage", async () => {
    const storage = new MemoryObjectStorage();
    const first = await migrateMedia({
      creatorId: "cr_eh_relay",
      siteId: "site_eh_cr_eh_relay",
      batchId: "batch_tamper_1",
      storage,
      now: FIXED_NOW,
      candidates: [candidate("m_relay", BLOB_RELAY)]
    });
    const tampered: MediaMigrationLedger = {
      ...first.ledger,
      objects: {
        m_relay: {
          ...first.ledger.objects.m_relay,
          actual_sha256:
            "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"
        }
      }
    };
    const second = await migrateMedia({
      creatorId: "cr_eh_relay",
      siteId: "site_eh_cr_eh_relay",
      batchId: "batch_tamper_2",
      storage,
      now: FIXED_NOW,
      candidates: [candidate("m_relay", BLOB_RELAY)],
      existingLedger: tampered
    });
    expect(second.exitCode).toBe(1);
    expect(second.ledger.objects.m_relay.status).toBe("failed");
    expect(second.ledger.objects.m_relay.private_read_verified).toBe(false);
    expect(second.ledger.objects.m_relay.failure_reason).toMatch(/sha256/i);
  });

  it("resumes after mid-batch put failure", async () => {
    const storage = new MemoryObjectStorage({ failNextPuts: 1 });
    const candidates = [
      candidate("m_relay", BLOB_RELAY, {
        expected_sha256:
          "47ee847f578d5cc56737bf838c48d4801d51508b3103086c6f908c069392e7b7",
        expected_byte_length: 205
      }),
      candidate("m_relay_gold", BLOB_GOLD, {
        expected_sha256:
          "d448020918a01cab55885ae08e3be7ac3dc358303bcad0bbcbef5780b606818e",
        expected_byte_length: 203
      })
    ];

    const first = await migrateMedia({
      creatorId: "cr_eh_relay",
      siteId: "site_eh_cr_eh_relay",
      batchId: "batch_resume_1",
      storage,
      candidates,
      now: FIXED_NOW
    });
    expect(first.exitCode).toBe(1);
    expect(first.report.failed).toBeGreaterThanOrEqual(1);
    expect(first.report.verified).toBeGreaterThanOrEqual(1);

    const second = await migrateMedia({
      creatorId: "cr_eh_relay",
      siteId: "site_eh_cr_eh_relay",
      batchId: "batch_resume_2",
      storage,
      candidates,
      existingLedger: first.ledger,
      now: FIXED_NOW
    });
    expect(second.exitCode).toBe(0);
    expect(second.report.verified).toBe(2);
    expect(second.report.failed).toBe(0);
    expect(second.ledger.objects.m_relay.attempt_count).toBeGreaterThanOrEqual(1);
    expect(
      second.ledger.objects.m_relay_gold.attempt_count
    ).toBeGreaterThanOrEqual(1);
  });

  it("fails closed when expected checksum mismatches source bytes", async () => {
    const storage = new MemoryObjectStorage();
    const result = await migrateMedia({
      creatorId: "cr_eh_relay",
      siteId: "site_eh_cr_eh_relay",
      batchId: "batch_bad_hash",
      storage,
      now: FIXED_NOW,
      candidates: [
        candidate("m_relay", BLOB_RELAY, {
          expected_sha256:
            "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
          expected_byte_length: 205
        })
      ]
    });
    expect(result.exitCode).toBe(1);
    expect(result.ledger.objects.m_relay.status).toBe("failed");
    expect(result.ledger.objects.m_relay.failure_reason).toMatch(/sha256/i);
    expect(storage.keys()).toHaveLength(0);
  });

  it("rejects path traversal sources via collectExportSources", () => {
    const { stagedSources } = collectExportSources(EXPORT_ROOT, {
      evil: {
        media_id: "evil",
        relative_blob_path: "../outside.svg"
      }
    });
    expect(stagedSources.evil).toBeUndefined();
  });

  it("accounts AV mime placeholders without claiming visitor players", async () => {
    const storage = new MemoryObjectStorage();
    const result = await migrateMedia({
      creatorId: "cr_eh_relay",
      siteId: "site_eh_cr_eh_relay",
      batchId: "batch_av",
      storage,
      now: FIXED_NOW,
      candidates: [
        candidate("m_video_stub", BLOB_VIDEO, {
          access_class: "member_only",
          mime_type: "video/mp4",
          expected_sha256:
            "68e37f057723fb30683f0b63d676783d337fad9d2ce641df19eba1b165f1e99b",
          expected_byte_length: 63
        }),
        candidate("m_audio_stub", BLOB_AUDIO, {
          access_class: "member_only",
          mime_type: "audio/mpeg",
          expected_sha256:
            "81221f1f5f5232160c80902c6acada730b6a6032cfa0990b955855422eb0eab2",
          expected_byte_length: 63
        })
      ]
    });
    expect(result.exitCode).toBe(0);
    expect(result.ledger.objects.m_video_stub.mime_type).toBe("video/mp4");
    expect(result.ledger.objects.m_video_stub.private_required).toBe(true);
    expect(result.ledger.objects.m_video_stub.status).toBe("verified");
    expect(JSON.stringify(result.ledger)).not.toMatch(/visitor player|streaming player/i);
  });
});

describe("EH-012 ledger contracts and secrets", () => {
  it("round-trips ledger and report parsers", async () => {
    const storage = new MemoryObjectStorage();
    const result = await migrateMedia({
      creatorId: "cr_eh_relay",
      siteId: "site_eh_cr_eh_relay",
      batchId: "batch_rt",
      storage,
      now: FIXED_NOW,
      candidates: [candidate("m_relay", BLOB_RELAY)]
    });
    const ledgerJson = serializeMigrationDocument(result.ledger);
    const reportJson = serializeMigrationDocument(result.report);
    assertNoSecretsInMigrationJson(ledgerJson);
    assertNoSecretsInMigrationJson(reportJson);
    expect(ledgerJson).not.toMatch(/secretaccesskey|accesskeyid|sk_live|Bearer /i);
    expect(reportJson).not.toMatch(/x-amz-signature/i);

    const ledger = parseMediaMigrationLedger(JSON.parse(ledgerJson));
    const report = parseMediaMigrationReport(JSON.parse(reportJson));
    expect(ledger.contract_version).toBe("media-migration-ledger/1.0.0");
    expect(report.contract_version).toBe("media-migration-report/1.0.0");
    expect(ledger.production_safe).toBe(false);
    expect(report.production_safe).toBe(false);
  });

  it("fails closed when ledger claims production_safe true", () => {
    expect(() =>
      parseMediaMigrationLedger({
        contract_version: "media-migration-ledger/1.0.0",
        site_id: "site_x",
        creator_id: "cr_x",
        batch_id: "b1",
        updated_at: "2026-07-22T18:00:00.000Z",
        production_safe: true,
        notes: [],
        objects: {}
      })
    ).toThrow(ContractValidationError);
  });

  it("fails closed when ledger object_key is public/media", () => {
    expect(() =>
      parseMediaMigrationLedger({
        contract_version: "media-migration-ledger/1.0.0",
        site_id: "site_x",
        creator_id: "cr_x",
        batch_id: "b1",
        updated_at: "2026-07-22T18:00:00.000Z",
        production_safe: false,
        notes: [],
        objects: {
          m1: {
            media_id: "m1",
            status: "verified",
            attempt_count: 1,
            object_key: "public/media/m1.svg",
            access_class: "member_only",
            private_required: true,
            private_read_verified: true,
            next_action: "none"
          }
        }
      })
    ).toThrow(/public\/media/);
  });
});

describe("EH-012 path traversal rejection", () => {
  it("does not resolve traversal relative_blob_path", () => {
    const mediaIndex = loadExportMediaIndex(EXPORT_ROOT, "cr_eh_relay");
    expect(mediaIndex.m_relay).toBeTruthy();

    const evilRoot = tempDir("eh-012-trav-");
    mkdirSync(join(evilRoot, "blobs"), { recursive: true });
    writeFileSync(
      join(evilRoot, "export_index.json"),
      JSON.stringify({
        creator_id: "cr_eh_relay",
        media: {
          m_evil: {
            media_id: "m_evil",
            relative_blob_path: "../../secret.bin",
            sha256:
              "1111111111111111111111111111111111111111111111111111111111111111",
            byte_length: 1
          }
        }
      })
    );

    expect(() =>
      loadExportMediaIndex(evilRoot, "cr_eh_relay")
    ).toThrow(/relative|path|safe/i);
  });
});

describe("EH-012 kit migrate writes ledger under data/", () => {
  it("imports relay-dump kit and writes migration ledger/report", async () => {
    const kitDir = tempDir("eh-012-kit-");
    const dataDir = join(kitDir, "data");
    mkdirSync(dataDir, { recursive: true });

    const imported = importRelayDump({ batchId: "batch_kit_import" });
    writeFileSync(
      join(dataDir, "site.bundle.json"),
      JSON.stringify(imported.bundle, null, 2)
    );
    writeFileSync(
      join(dataDir, "provenance.json"),
      JSON.stringify(imported.provenance, null, 2)
    );

    const storage = new MemoryObjectStorage();
    const migrated = await migrateKitMedia({
      kitDir,
      storage,
      exportCreatorRoot: EXPORT_ROOT,
      batchId: "batch_kit_migrate",
      now: FIXED_NOW
    });

    expect(existsSync(join(dataDir, "media-migration-ledger.json"))).toBe(true);
    expect(existsSync(join(dataDir, "media-migration-report.json"))).toBe(true);
    expect(migrated.report.verified).toBeGreaterThanOrEqual(2);
    expect(migrated.ledger.objects.m_relay.status).toBe("verified");
    expect(migrated.ledger.objects.m_relay_gold.private_required).toBe(true);

    // Premium entries are private keys, not public/media success.
    for (const entry of Object.values(migrated.ledger.objects)) {
      if (entry.private_required) {
        expect(entry.object_key).toMatch(/^eh\//);
        expect(entry.object_key).not.toMatch(/public\/media/);
      }
    }

    const mediaIndex = loadExportMediaIndex(EXPORT_ROOT, "cr_eh_relay");
    const candidates = buildMigrationCandidatesFromExport({
      creatorId: imported.bundle.creator_id,
      siteId: imported.bundle.site_id,
      bundle: imported.bundle,
      exportCreatorRoot: EXPORT_ROOT,
      mediaIndex,
      provenance: imported.provenance
    });
    expect(candidates.some((c) => c.media_id === "m_missing_blob")).toBe(false);
  });
});

describe("EH-012 memory storage private-read", () => {
  it("assertPrivateRead fails for missing keys and public paths", async () => {
    const storage = new MemoryObjectStorage();
    await expect(storage.assertPrivateRead("eh/c/s/media/m/object")).rejects.toThrow(
      /private read failed|not found|not privately/i
    );
    await expect(
      storage.putObjectBuffer("public/media/x", Buffer.from("x"))
    ).rejects.toThrow(/public\/media/);
  });

  it("proves anonymous/public path cannot read private objects", async () => {
    const storage = new MemoryObjectStorage();
    const key = "eh/c/s/media/m/object";
    await storage.putObjectBuffer(key, Buffer.from("secret-bytes"));
    await expect(storage.anonymousGet(key)).rejects.toThrow(/anonymous|denied/i);
    expect(storage.isAnonymouslyReadable(key)).toBe(false);
    const priv = await storage.assertPrivateRead(key);
    expect(priv.anonymous_denied).toBe(true);
    expect(priv.byteLength).toBe(12);
  });
});

describe("EH-012 R2 private-read honesty", () => {
  it("refuses private_read_verified without anonymous probe config", async () => {
    expect(() =>
      assertR2PrivateReadProbeConfigured({ allowPublicProbe: false })
    ).toThrow(/allowPublicProbe|authenticated GET alone/i);
    expect(() =>
      assertR2PrivateReadProbeConfigured({
        allowPublicProbe: true,
        publicBaseUrl: ""
      })
    ).toThrow(/publicBaseUrl/i);

    const storage = new R2ObjectStorage(
      createR2StorageConfig({
        endpoint: "https://example.r2.cloudflarestorage.com",
        bucket: "test-bucket",
        accessKeyId: "test-key",
        secretAccessKey: "test-secret"
      })
    );
    // Fail closed before any live R2 call when probe is not configured.
    await expect(
      storage.assertPrivateRead("eh/c/s/media/m/object")
    ).rejects.toThrow(/allowPublicProbe|authenticated GET alone|publicBaseUrl/i);
  });

  it("builds public probe URLs only under the configured https origin", () => {
    const url = buildR2PublicObjectUrl(
      "https://pub-abc.r2.dev",
      "eh/cr/site/media/m1/object"
    );
    expect(url).toBe("https://pub-abc.r2.dev/eh/cr/site/media/m1/object");
    expect(() =>
      buildR2PublicObjectUrl("http://pub-abc.r2.dev", "eh/x")
    ).toThrow(/https/i);
    expect(() =>
      buildR2PublicObjectUrl("https://user:pass@pub-abc.r2.dev", "eh/x")
    ).toThrow(/credentials/i);
  });

  it("fails closed when anonymous probe returns 200 (world-readable)", async () => {
    const key = "eh/c/s/media/m/object";
    const storage = new R2ObjectStorage(
      createR2StorageConfig({
        endpoint: "https://example.r2.cloudflarestorage.com",
        bucket: "test-bucket",
        accessKeyId: "test-key",
        secretAccessKey: "test-secret",
        publicBaseUrl: "https://pub-test.r2.dev",
        allowPublicProbe: true
      }),
      {
        fetchImpl: async () =>
          new Response("leaked", { status: 200 }) as unknown as Response
      }
    );
    // Stub authenticated get by replacing method — avoid live R2.
    storage.getObjectBuffer = async () => Buffer.from("private-bytes");
    await expect(storage.assertPrivateRead(key)).rejects.toThrow(
      /anonymously reachable|world-readable/i
    );
  });

  it("accepts anonymous 403 after authenticated read when probe configured", async () => {
    const key = "eh/c/s/media/m/object";
    const body = Buffer.from("private-bytes");
    const storage = new R2ObjectStorage(
      createR2StorageConfig({
        endpoint: "https://example.r2.cloudflarestorage.com",
        bucket: "test-bucket",
        accessKeyId: "test-key",
        secretAccessKey: "test-secret",
        publicBaseUrl: "https://pub-test.r2.dev",
        allowPublicProbe: true
      }),
      {
        fetchImpl: async (input) => {
          expect(String(input)).toBe(
            "https://pub-test.r2.dev/eh/c/s/media/m/object"
          );
          return new Response(null, { status: 403 }) as unknown as Response;
        }
      }
    );
    storage.getObjectBuffer = async () => body;
    const priv = await storage.assertPrivateRead(key);
    expect(priv.anonymous_denied).toBe(true);
    expect(priv.byteLength).toBe(body.length);
  });
});
