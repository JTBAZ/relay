import { describe, expect, it } from "vitest";
import {
  buildMediaRoutingPlanPayload,
  defaultMediaRouting,
  defaultMediaRoutingForPreviewNeed,
  destinationsUsingPreviewRouting,
  hydratePreviewPlanState,
  isMediaRoutingStale,
  mediaVersionFromPlatformFields,
  resolveEffectiveMediaVersion,
  resolveSendCardImageUrl,
} from "./distribution-media-routing";

describe("distribution-media-routing", () => {
  it("hydrates preview state from assistant_plan", () => {
    expect(
      hydratePreviewPlanState({
        needs_preview: true,
        preview_media_id: "rel_preview",
        media_routing_by_destination: { x: "preview", patreon: "full" },
      })
    ).toEqual({
      needsPreview: true,
      previewMediaId: "rel_preview",
      mediaRouting: { x: "preview", patreon: "full" },
    });
  });

  it("builds plan create payload with preview media id when needed", () => {
    expect(
      buildMediaRoutingPlanPayload({
        needsPreview: true,
        previewMediaId: "rel_preview",
        mediaRouting: { x: "preview", patreon: "full" },
        destinations: ["patreon", "x"],
      })
    ).toEqual({
      needs_preview: true,
      preview_media_id: "rel_preview",
      media_routing_by_destination: { patreon: "full", x: "preview" },
    });
  });

  it("omits preview_media_id when no preview routes", () => {
    expect(
      buildMediaRoutingPlanPayload({
        needsPreview: true,
        previewMediaId: "rel_preview",
        mediaRouting: defaultMediaRouting(["patreon", "x"]),
        destinations: ["patreon", "x"],
      })
    ).toEqual({
      needs_preview: true,
      media_routing_by_destination: { patreon: "full", x: "full" },
    });
  });

  it("detects preview destinations", () => {
    expect(
      destinationsUsingPreviewRouting(["patreon", "x"], { x: "preview", patreon: "full" })
    ).toEqual(["x"]);
  });

  it("smart-defaults teaser platforms to preview when needs-preview is yes", () => {
    expect(
      defaultMediaRoutingForPreviewNeed(["patreon", "x", "deviantart", "bluesky"])
    ).toEqual({
      patreon: "full",
      x: "preview",
      deviantart: "preview",
      bluesky: "preview",
    });
    // All-full helper remains available for non-preview contexts
    expect(defaultMediaRouting(["patreon", "x"])).toEqual({
      patreon: "full",
      x: "full",
    });
  });

  it("reads media version from variant platform_fields", () => {
    expect(mediaVersionFromPlatformFields({ media_version: "preview" })).toBe("preview");
    expect(mediaVersionFromPlatformFields({})).toBe("full");
  });

  it("resolves send card image url for preview routing", () => {
    expect(
      resolveSendCardImageUrl({
        mediaVersion: "preview",
        mainPreviewUrl: "https://main.example/img.png",
        creatorId: "cr_1",
        previewMediaId: "rel_preview",
        planAssistantPlan: {},
      })
    ).toBe("/api/v1/export/media/cr_1/rel_preview/content");
  });

  it("resolveEffectiveMediaVersion prefers explicit variant fields", () => {
    expect(
      resolveEffectiveMediaVersion("x", {
        variantPlatformFields: { media_version: "preview" },
        assistantPlan: { media_routing_by_destination: { x: "full" } },
        mediaRouting: { x: "full" },
      })
    ).toBe("preview");
  });

  it("resolveEffectiveMediaVersion falls back to assistant_plan then UI", () => {
    expect(
      resolveEffectiveMediaVersion("x", {
        variantPlatformFields: {},
        assistantPlan: { media_routing_by_destination: { x: "preview" } },
        mediaRouting: { x: "full" },
      })
    ).toBe("preview");

    expect(
      resolveEffectiveMediaVersion("x", {
        variantPlatformFields: {},
        assistantPlan: {},
        mediaRouting: { x: "preview" },
      })
    ).toBe("preview");
  });

  it("detects stale routing when variants lack preview fields", () => {
    expect(
      isMediaRoutingStale(["x", "patreon"], {
        variants: [
          { destination: "x", platform_fields: {} },
          { destination: "patreon", platform_fields: { media_version: "full" } },
        ],
        needsPreview: true,
        previewMediaId: "rel_preview",
        mediaRouting: { x: "preview", patreon: "full" },
        assistantPlan: {},
      })
    ).toBe(true);

    expect(
      isMediaRoutingStale(["x"], {
        variants: [{ destination: "x", platform_fields: { media_version: "preview" } }],
        needsPreview: true,
        previewMediaId: "rel_preview",
        mediaRouting: { x: "preview" },
        assistantPlan: { preview_media_id: "rel_preview" },
      })
    ).toBe(false);
  });

  it("detects stale routing when preview media id changes after plan", () => {
    expect(
      isMediaRoutingStale(["x"], {
        variants: [{ destination: "x", platform_fields: { media_version: "preview" } }],
        needsPreview: true,
        previewMediaId: "rel_preview_new",
        mediaRouting: { x: "preview" },
        assistantPlan: { preview_media_id: "rel_preview_old" },
      })
    ).toBe(true);
  });
});

/**
 * Wiring matrix — plan payloads for the three Autopost preview paths.
 * UI orchestration is covered by the manual checklist in
 * docs/qa/PREVIEWIZER_AUTOPOST_WIRING.md.
 */
describe("previewizer autopost wiring matrix (plan payloads)", () => {
  const destinations = ["patreon", "x", "bluesky"] as const;

  it("path A — Previewizer/picker teaser: smart defaults + preview_media_id", () => {
    const mediaRouting = defaultMediaRoutingForPreviewNeed([...destinations]);
    expect(destinationsUsingPreviewRouting([...destinations], mediaRouting)).toEqual([
      "x",
      "bluesky",
    ]);

    // After Use as preview / picker select — caller owns routing; result is mediaId only.
    const previewMediaId = "rel_from_previewizer_or_picker";
    expect(
      buildMediaRoutingPlanPayload({
        needsPreview: true,
        previewMediaId,
        mediaRouting,
        destinations: [...destinations],
      })
    ).toEqual({
      needs_preview: true,
      preview_media_id: previewMediaId,
      media_routing_by_destination: {
        patreon: "full",
        x: "preview",
        bluesky: "preview",
      },
    });
  });

  it("path B — picker-only (Previewizer flagged off): same payload contract", () => {
    // Feature flag only hides Open Previewizer UI; plan contract is identical.
    const mediaRouting = defaultMediaRoutingForPreviewNeed(["x"]);
    expect(
      buildMediaRoutingPlanPayload({
        needsPreview: true,
        previewMediaId: "rel_existing_staging",
        mediaRouting,
        destinations: ["x"],
      }).preview_media_id
    ).toBe("rel_existing_staging");
  });

  it("path C — no preview: needsPreview false omits preview_media_id", () => {
    expect(
      buildMediaRoutingPlanPayload({
        needsPreview: false,
        previewMediaId: "",
        mediaRouting: defaultMediaRouting([...destinations]),
        destinations: [...destinations],
      })
    ).toEqual({
      needs_preview: false,
      media_routing_by_destination: {
        patreon: "full",
        x: "full",
        bluesky: "full",
      },
    });
  });

  it("path C variant — Yes to preview but all Full: omits preview_media_id", () => {
    expect(
      buildMediaRoutingPlanPayload({
        needsPreview: true,
        previewMediaId: "rel_unused",
        mediaRouting: defaultMediaRouting(["patreon", "x"]),
        destinations: ["patreon", "x"],
      })
    ).toEqual({
      needs_preview: true,
      media_routing_by_destination: { patreon: "full", x: "full" },
    });
  });
});
