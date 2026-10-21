import { describe, expect, it } from "vitest";
import { applyStorageKeyToCanonicalSnapshot } from "../src/ingest/media-storage-key.js";
import type { CanonicalSnapshot } from "../src/ingest/canonical-store.js";

function snapshotWithMedia(): CanonicalSnapshot {
  return {
    ingest_idempotency: {},
    campaigns: {},
    tiers: {},
    posts: {},
    media: {
      cr1: {
        m1: {
          media_id: "m1",
          creator_id: "cr1",
          post_ids: ["p1"],
          upstream_status: "active",
          current: {
            version_seq: 2,
            upstream_revision: "r2",
            mime_type: "image/png",
            ingested_at: "2025-01-01T00:00:00.000Z"
          },
          versions: [
            {
              version_seq: 1,
              upstream_revision: "r1",
              mime_type: "image/png",
              ingested_at: "2024-12-01T00:00:00.000Z"
            },
            {
              version_seq: 2,
              upstream_revision: "r2",
              mime_type: "image/png",
              ingested_at: "2025-01-01T00:00:00.000Z"
            }
          ]
        }
      }
    }
  };
}

describe("applyStorageKeyToCanonicalSnapshot", () => {
  it("sets storage_key on current and matching version row", () => {
    const s = snapshotWithMedia();
    const ok = applyStorageKeyToCanonicalSnapshot(s, "cr1", "m1", "export/cr1/media/m1/v2.bin");
    expect(ok).toBe(true);
    const row = s.media.cr1!.m1!;
    expect(row.current.storage_key).toBe("export/cr1/media/m1/v2.bin");
    expect(row.versions[1]!.storage_key).toBe("export/cr1/media/m1/v2.bin");
    expect(row.versions[0]!.storage_key).toBeUndefined();
  });

  it("returns false when media is missing", () => {
    const s = snapshotWithMedia();
    expect(applyStorageKeyToCanonicalSnapshot(s, "cr1", "missing", "k")).toBe(false);
    expect(applyStorageKeyToCanonicalSnapshot(s, "other", "m1", "k")).toBe(false);
  });
});
