import { describe, expect, it } from "vitest";
import { buildPreviewizerSession, type PreviewizerResult } from "./previewizer-session";
import {
  buildMediaRoutingPlanPayload,
  exportMediaContentUrl,
} from "./distribution-media-routing";

describe("previewizer-session", () => {
  it("builds a neutral session from caller-supplied sourceImageUrl", () => {
    const sourceImageUrl = exportMediaContentUrl("cr_1", "rel_main");
    const session = buildPreviewizerSession({
      creatorId: "cr_1",
      postId: "post_1",
      sourceMediaId: "rel_main",
      sourceImageUrl,
    });

    expect(session.sourceImageUrl).toBe(
      "http://127.0.0.1:8787/api/v1/export/media/cr_1/rel_main/content"
    );
    expect(session).not.toHaveProperty("destinations");
    expect(session).not.toHaveProperty("initialMediaRouting");
  });

  it("PreviewizerResult is mediaId-only", () => {
    const result: PreviewizerResult = { previewMediaId: "rel_preview_new" };
    expect(Object.keys(result)).toEqual(["previewMediaId"]);
  });

  it("previewizer result (mediaId only) feeds plan create with caller-owned routing", () => {
    const previewMediaId = "rel_preview_new";
    expect(
      buildMediaRoutingPlanPayload({
        needsPreview: true,
        previewMediaId,
        mediaRouting: { x: "preview" },
        destinations: ["x"],
      })
    ).toEqual({
      needs_preview: true,
      preview_media_id: previewMediaId,
      media_routing_by_destination: { x: "preview" },
    });
  });
});
