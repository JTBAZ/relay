import { describe, expect, it } from "vitest";
import { mergePreviewMediaPickerOptions } from "./preview-media-picker-options";

describe("mergePreviewMediaPickerOptions", () => {
  it("dedupes by media_id with post first, then staging, then library", () => {
    const options = mergePreviewMediaPickerOptions({
      postMedia: [
        {
          media_id: "rel_main",
          post_id: "post_1",
          title: "Orb",
          published_at: "2026-07-01T00:00:00.000Z",
          tag_ids: [],
          tier_ids: [],
          mime_type: "image/png",
          has_export: true,
          processing_status: "READY",
          export_status: "ready",
          content_url_path: "/export/main/content",
          preview_url_path: "",
          thumb_url_path: "/export/main/thumb",
          visibility: "public",
          collection_ids: [],
          collection_theme_tag_ids: []
        }
      ],
      stagingItems: [
        {
          media_id: "rel_preview",
          mime_type: "image/png",
          ingested_at: "2026-07-02T00:00:00.000Z",
          content_url_path: "/export/preview/content",
          thumb_url_path: "/export/preview/thumb",
          ingest_origin: "RELAY_UPLOAD",
          discord_capture: null
        },
        {
          media_id: "rel_main",
          mime_type: "image/png",
          ingested_at: "2026-07-02T00:00:00.000Z",
          ingest_origin: "RELAY_UPLOAD",
          discord_capture: null
        }
      ],
      libraryItems: [
        {
          media_id: "rel_library",
          post_id: "post_2",
          title: "Teaser",
          published_at: "2026-07-03T00:00:00.000Z",
          tag_ids: [],
          tier_ids: [],
          mime_type: "image/png",
          has_export: true,
          processing_status: "READY",
          export_status: "ready",
          content_url_path: "/export/library/content",
          preview_url_path: "",
          thumb_url_path: "/export/library/thumb",
          visibility: "public",
          collection_ids: [],
          collection_theme_tag_ids: []
        }
      ]
    });

    expect(options.map((o) => o.mediaId)).toEqual(["rel_main", "rel_preview", "rel_library"]);
    expect(options[0]?.source).toBe("post");
    expect(options[1]?.source).toBe("staging");
    expect(options[2]?.source).toBe("library");
  });

  it("skips non-image mime types", () => {
    const options = mergePreviewMediaPickerOptions({
      stagingItems: [
        {
          media_id: "rel_video",
          mime_type: "video/mp4",
          ingested_at: "2026-07-02T00:00:00.000Z",
          ingest_origin: "RELAY_UPLOAD",
          discord_capture: null
        }
      ],
      libraryItems: []
    });
    expect(options).toEqual([]);
  });
});
