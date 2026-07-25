import { describe, expect, it } from "vitest";
import { buildPreviewizerSession, type PreviewizerResult } from "./previewizer-session";
import {
  buildMediaRoutingPlanPayload,
  exportMediaContentUrl
} from "./distribution-media-routing";
import { createDefaultOverlayDocument } from "@/app/components/previewizer/previewizer-overlay-layers";
import { DEFAULT_TEMPLATE_OPTIONS } from "@/app/components/previewizer/previewizer-design-templates";
import {
  PREVIEW_TEMPLATE_SCHEMA_VERSION,
  serializePreviewTemplateConfig,
  tryHydratePreviewTemplateConfig
} from "./previewizer-template-config";

describe("previewizer-session", () => {
  it("builds a neutral session from caller-supplied sourceImageUrl", () => {
    const sourceImageUrl = exportMediaContentUrl("cr_1", "rel_main");
    const session = buildPreviewizerSession({
      creatorId: "cr_1",
      postId: "post_1",
      sourceMediaId: "rel_main",
      sourceImageUrl
    });

    expect(session.sourceImageUrl).toBe(
      "/api/v1/export/media/cr_1/rel_main/content"
    );
    expect(session).not.toHaveProperty("destinations");
    expect(session).not.toHaveProperty("initialMediaRouting");
    expect(session).not.toHaveProperty("initialTemplateConfig");
  });

  it("optionally includes initialTemplateConfig without touching ordinary callers", () => {
    const config = serializePreviewTemplateConfig(
      {
        preset: "tight_crop",
        aspectKey: "1:1",
        compositionId: "blur_plug",
        compositionProps: null,
        compositionVariantIndex: 0,
        overlayDoc: createDefaultOverlayDocument(),
        templateOptions: { ...DEFAULT_TEMPLATE_OPTIONS }
      },
      { selectedDestinationId: "x", customDestinationUrl: null }
    );
    expect(config.schemaVersion).toBe(PREVIEW_TEMPLATE_SCHEMA_VERSION);
    expect(config).not.toHaveProperty("selection");

    const session = buildPreviewizerSession({
      creatorId: "cr_1",
      postId: "post_1",
      sourceMediaId: "rel_main",
      sourceImageUrl: "https://example.test/m.jpg",
      initialTemplateConfig: config
    });
    expect(session.initialTemplateConfig).toEqual(config);
    const hydrated = tryHydratePreviewTemplateConfig(session.initialTemplateConfig);
    expect(hydrated.ok).toBe(true);
    if (hydrated.ok) {
      expect(hydrated.patch).not.toHaveProperty("selection");
    }
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
        destinations: ["x"]
      })
    ).toEqual({
      needs_preview: true,
      preview_media_id: previewMediaId,
      media_routing_by_destination: { x: "preview" }
    });
  });
});
