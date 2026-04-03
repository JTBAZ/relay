import { describe, expect, it } from "vitest";
import { finalizePatreonPostMedia } from "../src/patreon/merge-ingest-media.js";
import type { IngestMediaItem } from "../src/ingest/types.js";

describe("finalizePatreonPostMedia (ingest duplicate cover)", () => {
  it("keeps cover and attachment rows (gallery marks shadow_cover; ingest does not drop)", () => {
    const attachment =
      "https://c10.patreonusercontent.com/4/patreon-media/p/post/154428469/8df316d8ed50446e8fcb14e907b363e1/eyJhIjoxLCJwIjoxfQ%3D%3D/1.jpg?token-hash=a";
    const cover =
      "https://c10.patreonusercontent.com/4/patreon-media/p/post/154428469/8df316d8ed50446e8fcb14e907b363e1/eyJ3IjoxMDgwfQ%3D%3D/1.jpg?token-hash=b";
    const media: IngestMediaItem[] = [
      {
        media_id: "patreon_media_638472852",
        mime_type: "image/jpeg",
        upstream_url: attachment,
        upstream_revision: "r1"
      },
      {
        media_id: "patreon_154428469_cover",
        mime_type: "image/jpeg",
        upstream_url: cover,
        upstream_revision: "r2",
        role: "cover"
      }
    ];
    const out = finalizePatreonPostMedia(media);
    expect(out).toHaveLength(2);
    expect(out.map((m) => m.media_id).sort()).toEqual([
      "patreon_154428469_cover",
      "patreon_media_638472852"
    ]);
  });

  it("keeps standalone cover when no other row shares the asset key", () => {
    const cover =
      "https://c10.patreonusercontent.com/4/patreon-media/p/post/999/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/eyJ3IjoxMDgwfQ%3D%3D/1.jpg";
    const out = finalizePatreonPostMedia([
      {
        media_id: "patreon_999_cover",
        mime_type: "image/jpeg",
        upstream_url: cover,
        upstream_revision: "r",
        role: "cover"
      }
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]!.media_id).toBe("patreon_999_cover");
  });
});
