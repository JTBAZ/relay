import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { CanonicalSnapshot } from "../src/ingest/canonical-store.js";
import { FileCanonicalStore } from "../src/ingest/canonical-store.js";
import { ExportService } from "../src/export/export-service.js";
import { FileExportIndex } from "../src/export/export-index.js";
import {
  fetchUpstreamWithRetries,
  isRetryableFetchError,
  shouldRetryHttpStatus
} from "../src/export/fetch-retry.js";
import type { CreatorExportIndex } from "../src/export/types.js";
import { buildGalleryItems } from "../src/gallery/query.js";
import type { GalleryOverridesRoot } from "../src/gallery/types.js";

describe("export fetch retry helpers", () => {
  it("shouldRetryHttpStatus", () => {
    expect(shouldRetryHttpStatus(503)).toBe(true);
    expect(shouldRetryHttpStatus(429)).toBe(true);
    expect(shouldRetryHttpStatus(408)).toBe(true);
    expect(shouldRetryHttpStatus(403)).toBe(false);
    expect(shouldRetryHttpStatus(404)).toBe(false);
  });

  it("isRetryableFetchError", () => {
    expect(isRetryableFetchError(new TypeError("fetch failed"))).toBe(true);
    expect(isRetryableFetchError(new Error("aborted"))).toBe(false);
    const abort = new Error("The operation was aborted");
    abort.name = "AbortError";
    expect(isRetryableFetchError(abort)).toBe(true);
  });

  it("fetchUpstreamWithRetries succeeds after transient failures", async () => {
    let n = 0;
    const fetchImpl = async () => {
      n += 1;
      if (n < 3) {
        return new Response(null, { status: 503 });
      }
      return new Response(new Uint8Array([1, 2, 3]), { status: 200 });
    };
    const sleeps: number[] = [];
    const res = await fetchUpstreamWithRetries(
      "https://example.com/x",
      fetchImpl as unknown as typeof fetch,
      { max_attempts: 4, base_delay_ms: 1, timeout_ms: 5000 },
      async (ms) => {
        sleeps.push(ms);
      }
    );
    expect(res.ok).toBe(true);
    expect(n).toBe(3);
    expect(sleeps).toEqual([1, 2]);
  });
});

function minimalSnapshot(): CanonicalSnapshot {
  return {
    ingest_idempotency: {},
    campaigns: {},
    tiers: {},
    posts: {
      c1: {
        p1: {
          post_id: "p1",
          creator_id: "c1",
          upstream_status: "active",
          current: {
            version_seq: 1,
            upstream_revision: "pr",
            title: "T",
            published_at: "2026-01-01T00:00:00.000Z",
            tag_ids: [],
            tier_ids: [],
            media_ids: ["m1"],
            ingested_at: "2026-01-01T00:00:00.000Z"
          },
          versions: []
        }
      }
    },
    media: {
      c1: {
        m1: {
          media_id: "m1",
          creator_id: "c1",
          post_ids: ["p1"],
          upstream_status: "active",
          current: {
            version_seq: 1,
            upstream_revision: "mr",
            mime_type: "image/png",
            upstream_url: "https://example.com/file.png",
            ingested_at: "2026-01-01T00:00:00.000Z"
          },
          versions: []
        }
      }
    }
  };
}

describe("ExportService.exportMedia", () => {
  it("records export_failures and throws on non-retryable HTTP error", async () => {
    const root = await mkdtemp(join(tmpdir(), "relay-export-test-"));
    try {
      const canonPath = join(root, "canonical.json");
      await writeFile(canonPath, JSON.stringify(minimalSnapshot()), "utf8");
      const canonicalStore = new FileCanonicalStore(canonPath);
      const exportRoot = join(root, "exports");
      const exportIndex = new FileExportIndex(exportRoot);
      const fetchImpl = async () => new Response(null, { status: 403 });
      const svc = new ExportService(canonicalStore, exportIndex, exportRoot, fetchImpl, {
        max_attempts: 3,
        base_delay_ms: 1,
        timeout_ms: 5000
      });
      await expect(svc.exportMedia("c1", "m1")).rejects.toThrow(/403/);
      const raw = await readFile(join(exportRoot, "c1", "export_index.json"), "utf8");
      const idx = JSON.parse(raw) as CreatorExportIndex;
      expect(idx.export_failures?.m1?.message).toMatch(/403/);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("clears export_failures on successful export after prior failure file exists", async () => {
    const root = await mkdtemp(join(tmpdir(), "relay-export-test-"));
    try {
      const canonPath = join(root, "canonical.json");
      await writeFile(canonPath, JSON.stringify(minimalSnapshot()), "utf8");
      const canonicalStore = new FileCanonicalStore(canonPath);
      const exportRoot = join(root, "exports");
      const exportIndex = new FileExportIndex(exportRoot);
      await mkdir(join(exportRoot, "c1"), { recursive: true });
      await writeFile(
        join(exportRoot, "c1", "export_index.json"),
        JSON.stringify({
          creator_id: "c1",
          media: {},
          export_failures: { m1: { message: "old", failed_at: "2026-01-01T00:00:00.000Z" } }
        }),
        "utf8"
      );
      let calls = 0;
      const fetchImpl = async () => {
        calls += 1;
        return new Response(new Uint8Array([9]), { status: 200 });
      };
      const svc = new ExportService(canonicalStore, exportIndex, exportRoot, fetchImpl, {
        max_attempts: 2,
        base_delay_ms: 1,
        timeout_ms: 5000
      });
      await svc.exportMedia("c1", "m1");
      expect(calls).toBe(1);
      const raw = await readFile(join(exportRoot, "c1", "export_index.json"), "utf8");
      const idx = JSON.parse(raw) as CreatorExportIndex;
      expect(idx.media.m1).toBeDefined();
      expect(idx.export_failures?.m1).toBeUndefined();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

describe("buildGalleryItems export_error", () => {
  it("includes export_error when export_failures has an entry", () => {
    const snapshot = minimalSnapshot();
    const exportIndex: CreatorExportIndex = {
      creator_id: "c1",
      media: {},
      export_failures: {
        m1: { message: "Download failed with status 403", failed_at: "2026-01-02T00:00:00.000Z" }
      }
    };
    const overrides: GalleryOverridesRoot = { creators: {} };
    const items = buildGalleryItems("c1", snapshot, exportIndex, overrides, []);
    const row = items.find((i) => i.media_id === "m1");
    expect(row?.has_export).toBe(false);
    expect(row?.export_status).toBe("missing");
    expect(row?.export_error).toBe("Download failed with status 403");
  });

  it("omits export_error when missing export but no failure record", () => {
    const snapshot = minimalSnapshot();
    const exportIndex: CreatorExportIndex = { creator_id: "c1", media: {} };
    const overrides: GalleryOverridesRoot = { creators: {} };
    const items = buildGalleryItems("c1", snapshot, exportIndex, overrides, []);
    const row = items.find((i) => i.media_id === "m1");
    expect(row?.export_error).toBeUndefined();
    expect(row?.export_status).toBe("missing");
  });
});
