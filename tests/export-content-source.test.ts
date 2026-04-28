import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FileCanonicalStore } from "../src/ingest/canonical-store.js";
import { FileExportIndex } from "../src/export/export-index.js";
import { ExportService } from "../src/export/export-service.js";

const hoistedR2 = vi.hoisted(() => ({ getR2ObjectBuffer: vi.fn() }));
const hoistedCfg = vi.hoisted(() => ({
  r2: {
    bucket: "t",
    endpoint: "https://r2.test",
    region: "auto",
    credentials: { accessKeyId: "a", secretAccessKey: "b" }
  }
}));

vi.mock("../src/storage/r2-config.js", () => ({
  getR2ClientConfigFromEnv: () => hoistedCfg.r2
}));
vi.mock("../src/storage/relay-upload-r2.js", async (importOriginal) => {
  const m = await importOriginal<typeof import("../src/storage/relay-upload-r2.js")>();
  return { ...m, getR2ObjectBuffer: hoistedR2.getR2ObjectBuffer };
});

function minimalSnapshot() {
  return {
    ingest_idempotency: {},
    campaigns: {},
    tiers: {},
    posts: {},
    media: {
      c1: {
        m1: {
          media_id: "m1",
          creator_id: "c1",
          post_ids: ["p1"],
          upstream_status: "active" as const,
          current: {
            version_seq: 1,
            upstream_revision: "r1",
            mime_type: "image/png",
            upstream_url: "https://patreon.example/x"
          },
          versions: [
            {
              version_seq: 1,
              upstream_revision: "r1",
              mime_type: "image/png",
              upstream_url: "https://patreon.example/x",
              ingested_at: "2026-01-01T00:00:00.000Z"
            }
          ]
        }
      }
    }
  };
}

describe("ExportService getExportContent (storage key + index + upstream)", () => {
  beforeEach(() => {
    hoistedR2.getR2ObjectBuffer.mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("serves from export index on disk when prisma is absent (legacy file mode)", async () => {
    const { mkdtemp } = await import("node:fs/promises");
    const { tmpdir } = await import("node:os");
    const root = await mkdtemp(join(tmpdir(), "relay-export-content-"));
    try {
      const canonPath = join(root, "canonical.json");
      await writeFile(canonPath, JSON.stringify(minimalSnapshot()), "utf8");
      const exportRoot = join(root, "exports");
      await mkdir(join(exportRoot, "c1", "media", "m1"), { recursive: true });
      const relative = "media/m1/asset";
      await writeFile(join(exportRoot, "c1", ...relative.split("/")), Buffer.from("idx-bytes"), "utf8");
      await writeFile(
        join(exportRoot, "c1", "export_index.json"),
        JSON.stringify({
          creator_id: "c1",
          media: {
            m1: {
              media_id: "m1",
              creator_id: "c1",
              sha256: "abc",
              byte_length: 8,
              relative_blob_path: relative,
              upstream_revision: "r1",
              exported_at: "2026-01-01T00:00:00.000Z"
            }
          }
        }),
        "utf8"
      );
      const canonicalStore = new FileCanonicalStore(canonPath);
      const exportIndex = new FileExportIndex(exportRoot);
      const svc = new ExportService(canonicalStore, exportIndex, exportRoot);
      const c = await svc.getExportContent("c1", "m1");
      expect(c).not.toBeNull();
      expect(c!.buffer.toString()).toBe("idx-bytes");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("prefers Prisma currentStorageKey (R2) over stale export index when keys differ", async () => {
    const { mkdtemp } = await import("node:fs/promises");
    const { tmpdir } = await import("node:os");
    const root = await mkdtemp(join(tmpdir(), "relay-export-content-"));
    try {
      const canonPath = join(root, "canonical.json");
      await writeFile(canonPath, JSON.stringify(minimalSnapshot()), "utf8");
      const exportRoot = join(root, "exports");
      await mkdir(join(exportRoot, "c1", "media", "m1"), { recursive: true });
      await writeFile(join(exportRoot, "c1", "media", "m1", "asset"), Buffer.from("old-local"), "utf8");
      await writeFile(
        join(exportRoot, "c1", "export_index.json"),
        JSON.stringify({
          creator_id: "c1",
          media: {
            m1: {
              media_id: "m1",
              creator_id: "c1",
              sha256: "x",
              byte_length: 9,
              relative_blob_path: "media/m1/asset",
              upstream_revision: "r1",
              exported_at: "2026-01-01T00:00:00.000Z"
            }
          }
        }),
        "utf8"
      );
      const r2Key = "relay/tenants/c1/media/m1/asset";
      hoistedR2.getR2ObjectBuffer.mockResolvedValue(Buffer.from("r2-payload"));

      const prisma = {
        mediaAsset: {
          findFirst: vi.fn().mockResolvedValue({
            id: "m1",
            creatorId: "c1",
            currentStorageKey: r2Key,
            currentMimeType: "video/mp4",
            currentUpstreamUrl: null,
            currentUpstreamRevision: "relay:upload:committed"
          })
        }
      } as any;

      const canonicalStore = new FileCanonicalStore(canonPath);
      const exportIndex = new FileExportIndex(exportRoot);
      const svc = new ExportService(canonicalStore, exportIndex, exportRoot, undefined, undefined, undefined, undefined, prisma);
      const c = await svc.getExportContent("c1", "m1");
      expect(c).not.toBeNull();
      expect(c!.buffer.toString()).toBe("r2-payload");
      expect(hoistedR2.getR2ObjectBuffer).toHaveBeenCalledWith(
        expect.objectContaining({ bucket: "t" }),
        r2Key
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("serves from currentUpstreamUrl when there is no index and no storage key in DB", async () => {
    const { mkdtemp } = await import("node:fs/promises");
    const { tmpdir } = await import("node:os");
    const root = await mkdtemp(join(tmpdir(), "relay-export-content-"));
    try {
      const canonPath = join(root, "canonical.json");
      await writeFile(canonPath, JSON.stringify(minimalSnapshot()), "utf8");
      const exportRoot = join(root, "exports");
      await mkdir(join(exportRoot, "c1"), { recursive: true });
      await writeFile(join(exportRoot, "c1", "export_index.json"), JSON.stringify({ creator_id: "c1", media: {} }), "utf8");
      const prisma = {
        mediaAsset: {
          findFirst: vi.fn().mockResolvedValue({
            id: "m1",
            creatorId: "c1",
            currentStorageKey: null,
            currentMimeType: "image/png",
            currentUpstreamUrl: "https://cdn.example/blob",
            currentUpstreamRevision: "v2"
          })
        }
      } as any;
      const fetchImpl = async () => new Response(Uint8Array.from([1, 2, 3]), { status: 200 });
      const canonicalStore = new FileCanonicalStore(canonPath);
      const exportIndex = new FileExportIndex(exportRoot);
      const svc = new ExportService(
        canonicalStore,
        exportIndex,
        exportRoot,
        fetchImpl as unknown as typeof fetch,
        { max_attempts: 2, base_delay_ms: 1, timeout_ms: 5000 },
        undefined,
        undefined,
        prisma
      );
      const c = await svc.getExportContent("c1", "m1");
      expect(c).not.toBeNull();
      expect([...c!.buffer]).toEqual([1, 2, 3]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
