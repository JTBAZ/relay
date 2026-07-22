/**
 * EH-011 canonical generated-app importer: provenance, idempotency, conflicts.
 */

import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ContractValidationError } from "../src/contracts.js";
import {
  ExistingImportLoadError,
  importCanonical,
  importRelayDump,
  isSafeRelativeBlobPath,
  loadExistingImportArtifacts,
  parseCanonicalForImport,
  parseExportIndexForImport,
  parseImportLocalState,
  parseImportProvenance,
  resolveBlobPathUnderRoot,
  serializeImportDocument,
  stageExportMediaSafe,
  type ImportLocalState,
  type ImportProvenance
} from "../src/import/index.js";
import { scanFixtureTree, formatFixtureScanFindings } from "../src/fixture-scan.js";

const PACKAGE_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const REPO_ROOT = join(PACKAGE_ROOT, "..", "..");
const FIXTURE_ROOT = join(PACKAGE_ROOT, "fixtures");
const RELAY_DUMP = join(FIXTURE_ROOT, "relay-dump");
const DIST_CLONE = join(
  REPO_ROOT,
  "dist",
  "src",
  "clone",
  "clone-generator.js"
);

function requireDist(): void {
  if (!existsSync(DIST_CLONE)) {
    throw new Error(
      `Relay dist missing at ${DIST_CLONE}; run \`npm run build\` at repository root before EH-011 import tests`
    );
  }
}

function loadDump(): { canonical: unknown; exportIndex: unknown } {
  return {
    canonical: JSON.parse(
      readFileSync(join(RELAY_DUMP, "canonical.json"), "utf8")
    ),
    exportIndex: JSON.parse(
      readFileSync(
        join(RELAY_DUMP, "exports", "cr_eh_relay", "export_index.json"),
        "utf8"
      )
    )
  };
}

describe("EH-011 relay-dump import", () => {
  it("imports SiteBundle + provenance + local state from relay-dump", () => {
    requireDist();
    const result = importRelayDump({ batchId: "batch_test_1" });
    expect(result.bundle.creator_id).toBe("cr_eh_relay");
    expect(result.bundle.site_id).toBe("site_eh_cr_eh_relay");
    expect(result.bundle.posts.map((p) => p.post_id).sort()).toEqual([
      "p1",
      "p2",
      "p_missing_blob"
    ]);
    expect(result.bundle.posts.some((p) => p.post_id === "p_tombstone")).toBe(
      false
    );

    expect(result.provenance.contract_version).toBe("import-provenance/1.0.0");
    expect(result.provenance.batch_id).toBe("batch_test_1");
    expect(result.provenance.posts.p1.upstream_revision).toBe("r1");
    expect(result.provenance.media.m_relay.checksum).toBe(
      "47ee847f578d5cc56737bf838c48d4801d51508b3103086c6f908c069392e7b7"
    );
    expect(result.provenance.media.m_relay.byte_length).toBe(205);

    expect(result.localState.contract_version).toBe("import-local-state/1.0.0");
    expect(result.localState.posts.p1.origin).toBe("imported");
    expect(result.localState.posts.p1.locally_edited).toBe(false);
    expect(result.localState.replay_ledger.imported_post_ids).toContain("p1");

    expect(result.report.posts.imported).toBeGreaterThanOrEqual(3);
    expect(result.report.exclusions.some((e) => e.kind === "tombstone")).toBe(
      true
    );
    expect(result.report.notes.join(" ")).toMatch(/migrate-media|public\/media|EH-033/i);
  });

  it("records missing export blob without fake success", () => {
    requireDist();
    const result = importRelayDump({ batchId: "batch_missing_blob" });
    const fail = result.report.failures.find(
      (f) => f.media_id === "m_missing_blob"
    );
    expect(fail).toBeTruthy();
    expect(fail?.reason.toLowerCase()).toMatch(/missing/);
    expect(result.provenance.media.m_missing_blob?.blob_missing).toBe(true);
    const post = result.bundle.posts.find((p) => p.post_id === "p_missing_blob");
    expect(post?.media[0]?.has_export).toBe(false);
    expect(JSON.stringify(result.report).toLowerCase()).not.toMatch(
      /successfully copied|r2 copy succeeded|private delivery ok/
    );
  });
});

describe("EH-011 idempotent replay", () => {
  it("second import does not duplicate posts/media and keeps stable ids", () => {
    requireDist();
    const first = importRelayDump({ batchId: "batch_a" });
    const second = importRelayDump({
      batchId: "batch_b",
      existing: {
        provenance: first.provenance,
        localState: first.localState,
        bundle: first.bundle
      }
    });

    expect(second.bundle.site_id).toBe(first.bundle.site_id);
    expect(second.bundle.posts.map((p) => p.post_id).sort()).toEqual(
      first.bundle.posts.map((p) => p.post_id).sort()
    );
    expect(second.bundle.posts).toHaveLength(first.bundle.posts.length);
    expect(second.localState.replay_ledger.imported_post_ids).toEqual(
      first.localState.replay_ledger.imported_post_ids
    );
    // Unchanged revisions keep prior slugs.
    expect(second.localState.posts.p1.slug).toBe(first.localState.posts.p1.slug);
    expect(second.provenance.posts.p1.upstream_revision).toBe(
      first.provenance.posts.p1.upstream_revision
    );
  });
});

describe("EH-011 conflict queue", () => {
  it("enqueues local-edit conflict instead of silent overwrite", () => {
    requireDist();
    const { canonical, exportIndex } = loadDump();
    const first = importCanonical({
      creatorId: "cr_eh_relay",
      canonical,
      exportIndex,
      exportCreatorRoot: join(RELAY_DUMP, "exports", "cr_eh_relay"),
      batchId: "batch_edit_1"
    });

    const editedLocal: ImportLocalState = {
      ...first.localState,
      posts: {
        ...first.localState.posts,
        p1: {
          ...first.localState.posts.p1,
          locally_edited: true,
          edit_markers: ["title"],
          local_title: "Creator Local Title"
        }
      }
    };
    const editedBundle = {
      ...first.bundle,
      posts: first.bundle.posts.map((p) =>
        p.post_id === "p1" ? { ...p, title: "Creator Local Title" } : p
      )
    };

    // Mutate upstream revision for p1.
    const mutated = JSON.parse(JSON.stringify(canonical)) as {
      posts: Record<string, Record<string, { current: { upstream_revision: string; title: string } }>>;
    };
    mutated.posts.cr_eh_relay.p1.current.upstream_revision = "r1_changed";
    mutated.posts.cr_eh_relay.p1.current.title = "Upstream Changed Title";

    const second = importCanonical({
      creatorId: "cr_eh_relay",
      canonical: mutated,
      exportIndex,
      exportCreatorRoot: join(RELAY_DUMP, "exports", "cr_eh_relay"),
      batchId: "batch_edit_2",
      existing: {
        provenance: first.provenance,
        localState: editedLocal,
        bundle: editedBundle
      }
    });

    expect(second.report.conflicts.some((c) => c.kind === "local_edit")).toBe(
      true
    );
    const p1 = second.bundle.posts.find((p) => p.post_id === "p1");
    expect(p1?.title).toBe("Creator Local Title");
    expect(p1?.title).not.toBe("Upstream Changed Title");
  });

  it("accounts tombstone exclusion and conflicts for protected local posts", () => {
    requireDist();
    const { canonical, exportIndex } = loadDump();
    const baseline = importCanonical({
      creatorId: "cr_eh_relay",
      canonical,
      exportIndex,
      exportCreatorRoot: join(RELAY_DUMP, "exports", "cr_eh_relay"),
      batchId: "batch_tomb_1"
    });
    expect(
      baseline.report.exclusions.some(
        (e) => e.kind === "tombstone" && e.post_id === "p_tombstone"
      )
    ).toBe(true);

    // Simulate a protected local copy of a post that becomes tombstoned.
    const localWithTomb: ImportLocalState = parseImportLocalState({
      ...baseline.localState,
      posts: {
        ...baseline.localState.posts,
        p_tombstone: {
          slug: "kept-local-tombstone",
          origin: "imported",
          locally_edited: true,
          edit_markers: ["title"],
          local_title: "Keep Me"
        }
      }
    });
    const bundleWithTomb = {
      ...baseline.bundle,
      posts: [
        ...baseline.bundle.posts,
        {
          post_id: "p_tombstone",
          slug: "kept-local-tombstone",
          title: "Keep Me",
          published_at: "2026-06-15T12:00:00.000Z",
          tag_ids: [],
          access: { level: "public" as const, tier_ids: [] },
          media: []
        }
      ],
      total_media: baseline.bundle.total_media
    };
    const provWithTomb: ImportProvenance = parseImportProvenance({
      ...baseline.provenance,
      posts: {
        ...baseline.provenance.posts,
        p_tombstone: {
          provider: "relay_canonical",
          provider_object_id: "p_tombstone",
          published_at: "2026-06-15T12:00:00.000Z",
          upstream_revision: "r_tombstone_2",
          source_tier_ids: ["relay_tier_public"],
          access_snapshot: { level: "public", tier_ids: [] },
          media: [],
          upstream_status: "deleted"
        }
      }
    });

    const second = importCanonical({
      creatorId: "cr_eh_relay",
      canonical,
      exportIndex,
      exportCreatorRoot: join(RELAY_DUMP, "exports", "cr_eh_relay"),
      batchId: "batch_tomb_2",
      existing: {
        provenance: provWithTomb,
        localState: localWithTomb,
        bundle: bundleWithTomb
      }
    });

    expect(second.report.conflicts.some((c) => c.kind === "tombstone")).toBe(
      true
    );
    expect(second.bundle.posts.some((p) => p.post_id === "p_tombstone")).toBe(
      true
    );
  });

  it("emits tier_remap conflict for legacy tier mappings", () => {
    requireDist();
    const first = importRelayDump({ batchId: "batch_tier_1" });
    const withMapping: ImportLocalState = {
      ...first.localState,
      tier_mappings: {
        t_gold_legacy: "t_gold"
      }
    };
    const second = importRelayDump({
      batchId: "batch_tier_2",
      existing: {
        provenance: first.provenance,
        localState: withMapping,
        bundle: first.bundle
      }
    });
    expect(second.report.conflicts.some((c) => c.kind === "tier_remap")).toBe(
      true
    );
    expect(
      second.report.conflicts.find((c) => c.kind === "tier_remap")?.field_paths
        .length
    ).toBeGreaterThan(0);
  });
});

describe("EH-011 fail-closed validation", () => {
  it("rejects malformed canonical fields with field paths", () => {
    expect(() =>
      parseCanonicalForImport(
        {
          posts: { cr_eh_relay: { p_bad: { post_id: "p_bad" } } },
          media: { cr_eh_relay: {} },
          tiers: { cr_eh_relay: {} }
        },
        "cr_eh_relay"
      )
    ).toThrow(ContractValidationError);

    try {
      parseCanonicalForImport(
        {
          posts: {
            cr_eh_relay: {
              p_bad: {
                post_id: "p_bad",
                creator_id: "cr_eh_relay",
                upstream_status: "active",
                current: null,
                versions: []
              }
            }
          },
          media: { cr_eh_relay: {} },
          tiers: { cr_eh_relay: {} }
        },
        "cr_eh_relay"
      );
      expect.unreachable("should throw");
    } catch (err) {
      expect(err).toBeInstanceOf(ContractValidationError);
      const cv = err as ContractValidationError;
      expect(cv.fieldPath).toMatch(/posts\.cr_eh_relay\.p_bad/);
      expect(String(cv.message)).not.toMatch(/sk_live|Bearer |BEGIN PRIVATE/);
    }
  });

  it("rejects adversarial relative_blob_path values (absolute, .., backslash)", () => {
    const cases = [
      "/etc/passwd",
      "C:\\Windows\\System32\\config\\sam",
      "C:/Windows/System32/config/sam",
      "..\\..\\secret.svg",
      "../secret.svg",
      "blobs/../../outside.svg",
      "blobs\\..\\..\\outside.svg",
      "\\\\server\\share\\blob.svg",
      "//server/share/blob.svg",
      "blobs/./evil.svg"
    ];
    for (const bad of cases) {
      expect(isSafeRelativeBlobPath(bad), bad).toBe(false);
      expect(() =>
        parseExportIndexForImport(
          {
            creator_id: "cr_eh_relay",
            media: {
              m_evil: {
                media_id: "m_evil",
                relative_blob_path: bad
              }
            }
          },
          "cr_eh_relay"
        )
      ).toThrow(ContractValidationError);
    }
    expect(isSafeRelativeBlobPath("blobs/m_relay.svg")).toBe(true);
  });

  it("resolveBlobPathUnderRoot and stageExportMediaSafe never copy outside root", () => {
    const root = mkdtempSync(join(tmpdir(), "eh-011-stage-"));
    const outside = mkdtempSync(join(tmpdir(), "eh-011-outside-"));
    try {
      writeFileSync(join(outside, "secret.svg"), "<svg/>", "utf8");
      mkdirSync(join(root, "blobs"), { recursive: true });
      writeFileSync(join(root, "blobs", "ok.svg"), "<svg id='ok'/>", "utf8");

      expect(() => resolveBlobPathUnderRoot(root, "../../secret.svg")).toThrow();
      expect(() => resolveBlobPathUnderRoot(root, "/etc/passwd")).toThrow();
      expect(() =>
        resolveBlobPathUnderRoot(root, "blobs\\..\\..\\secret.svg")
      ).toThrow();
      expect(() =>
        resolveBlobPathUnderRoot(root, "C:\\Windows\\System32\\x.svg")
      ).toThrow();

      // Index with only a safe path stages; an adversarial raw join is impossible via API.
      writeFileSync(
        join(root, "export_index.json"),
        JSON.stringify({
          creator_id: "cr_eh_relay",
          media: {
            m_ok: {
              media_id: "m_ok",
              relative_blob_path: "blobs/ok.svg",
              mime_type: "image/svg+xml"
            }
          }
        }),
        "utf8"
      );
      const staging = join(root, "staging");
      stageExportMediaSafe(root, staging, {
        contract_version: "site-bundle/1.0.0",
        site_id: "site_eh_cr_eh_relay",
        creator_id: "cr_eh_relay",
        generated_at: "2026-07-01T00:00:00.000Z",
        base_url: "/",
        creator: { display_name: "t", handle: "t" },
        theme: {
          color_scheme: "dark",
          paywall_style: "blur",
          hero: { title: "t" }
        },
        demo_personas: [],
        tiers: [],
        posts: [
          {
            post_id: "p1",
            slug: "p1",
            title: "t",
            published_at: "2026-07-01T00:00:00.000Z",
            tag_ids: [],
            access: { level: "public", tier_ids: [] },
            media: [
              {
                media_id: "m_ok",
                has_export: true,
                content_path: "/media/m_ok.svg"
              }
            ]
          }
        ],
        total_media: 1
      } as never);

      expect(readdirSync(staging)).toEqual(["m_ok.svg"]);
      // Outside secret must not appear in staging.
      expect(readdirSync(staging).some((n) => n.includes("secret"))).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
      rmSync(outside, { recursive: true, force: true });
    }
  });
});

describe("EH-011 loadExistingImportArtifacts", () => {
  it("returns null when no artifacts; merges when all three match creator", () => {
    requireDist();
    const first = importRelayDump({ batchId: "batch_existing_1" });
    const empty = mkdtempSync(join(tmpdir(), "eh-011-empty-"));
    expect(loadExistingImportArtifacts(empty, "cr_eh_relay")).toBeNull();

    const dataDir = mkdtempSync(join(tmpdir(), "eh-011-data-"));
    try {
      writeFileSync(
        join(dataDir, "provenance.json"),
        serializeImportDocument(first.provenance)
      );
      writeFileSync(
        join(dataDir, "import-state.json"),
        serializeImportDocument(first.localState)
      );
      writeFileSync(
        join(dataDir, "site.bundle.json"),
        JSON.stringify(first.bundle, null, 2)
      );

      const loaded = loadExistingImportArtifacts(dataDir, "cr_eh_relay");
      expect(loaded?.provenance.batch_id).toBe("batch_existing_1");
      expect(loaded?.bundle.site_id).toBe(first.bundle.site_id);

      expect(() =>
        loadExistingImportArtifacts(dataDir, "cr_other")
      ).toThrow(ExistingImportLoadError);

      // Partial artifacts fail closed.
      rmSync(join(dataDir, "import-state.json"));
      expect(() =>
        loadExistingImportArtifacts(dataDir, "cr_eh_relay")
      ).toThrow(/partial import artifacts/i);

      // Re-import with loaded existing keeps stable site id (CLI merge helper path).
      writeFileSync(
        join(dataDir, "import-state.json"),
        serializeImportDocument(first.localState)
      );
      const again = loadExistingImportArtifacts(dataDir, "cr_eh_relay")!;
      const second = importRelayDump({
        batchId: "batch_existing_2",
        existing: again
      });
      expect(second.bundle.site_id).toBe(first.bundle.site_id);
      expect(second.bundle.posts).toHaveLength(first.bundle.posts.length);
    } finally {
      rmSync(empty, { recursive: true, force: true });
      rmSync(dataDir, { recursive: true, force: true });
    }
  });
});

describe("EH-011 mature-metadata exclusion", () => {
  it("excludes mature-flagged posts from bundle and increments posts.excluded", () => {
    requireDist();
    const { canonical, exportIndex } = loadDump();
    const mutated = JSON.parse(JSON.stringify(canonical)) as {
      posts: Record<
        string,
        Record<
          string,
          {
            current: {
              is_mature?: boolean;
              title: string;
              upstream_revision: string;
            };
          }
        >
      >;
    };
    mutated.posts.cr_eh_relay.p1.current.is_mature = true;
    mutated.posts.cr_eh_relay.p1.current.title = "Mature Flagged Post";

    const result = importCanonical({
      creatorId: "cr_eh_relay",
      canonical: mutated,
      exportIndex,
      exportCreatorRoot: join(RELAY_DUMP, "exports", "cr_eh_relay"),
      batchId: "batch_mature_1"
    });

    expect(result.bundle.posts.some((p) => p.post_id === "p1")).toBe(false);
    expect(result.report.posts.excluded).toBeGreaterThanOrEqual(2); // tombstone + mature
    expect(
      result.report.exclusions.some(
        (e) => e.kind === "mature_metadata" && e.post_id === "p1"
      )
    ).toBe(true);
    expect(result.localState.posts.p1).toBeUndefined();
    expect(result.report.notes.join(" ")).toMatch(/EH-033|public\/media|migrate-media/i);
  });
});

describe("EH-011 fixture scan still clean", () => {
  it("scans fixtures including relay-dump extensions", () => {
    const result = scanFixtureTree(FIXTURE_ROOT);
    expect(result.findings, formatFixtureScanFindings(result)).toEqual([]);
  });
});

describe("EH-011 matrix deferred promotions", () => {
  it("promotes tombstone/legacy-tier/AV and defers mature to EH-033", () => {
    const matrix = JSON.parse(
      readFileSync(join(FIXTURE_ROOT, "MATRIX.json"), "utf8")
    ) as {
      slice: string;
      productionSafe: boolean;
      families: Array<{ id: string; status: string; reason?: string; notes?: string }>;
    };
    expect(matrix.slice).toBe("EH-020");
    expect(matrix.productionSafe).toBe(false);
    const byId = new Map(matrix.families.map((f) => [f.id, f]));
    expect(byId.get("deleted-tombstoned")?.status).toBe("present");
    expect(byId.get("legacy-tier-rename")?.status).toBe("present");
    expect(byId.get("video-audio-embed")?.status).toBe("present");
    expect(byId.get("mature-metadata")?.status).toBe("deferred-to-EH-033");
    expect(byId.get("video-audio-embed")?.notes).toMatch(/migrat|EH-033/i);
    expect(byId.get("mature-metadata")?.reason).toMatch(/EH-033/);
    expect(byId.get("mature-metadata")?.reason).toMatch(/exclud/i);
  });
});

describe("EH-011 round-trip documents", () => {
  it("re-parses written provenance and local state", () => {
    requireDist();
    const result = importRelayDump({ batchId: "batch_roundtrip" });
    const dir = mkdtempSync(join(tmpdir(), "eh-011-"));
    try {
      const provPath = join(dir, "provenance.json");
      const localPath = join(dir, "import-state.json");
      writeFileSync(provPath, JSON.stringify(result.provenance, null, 2));
      writeFileSync(localPath, JSON.stringify(result.localState, null, 2));
      const prov = parseImportProvenance(
        JSON.parse(readFileSync(provPath, "utf8"))
      );
      const local = parseImportLocalState(
        JSON.parse(readFileSync(localPath, "utf8"))
      );
      expect(prov.site_id).toBe(result.bundle.site_id);
      expect(local.replay_ledger.last_batch_id).toBe("batch_roundtrip");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
