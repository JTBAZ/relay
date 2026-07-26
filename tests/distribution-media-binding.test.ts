import { describe, expect, it } from "vitest";
import {
  buildPlanMediaAssistantFields,
  buildVariantMediaPlatformFields,
  contentVariantRoleFromPlatformFields,
  destinationsUsingPreviewRouting,
  mergeVariantPlatformFieldsWithMedia,
  normalizeMediaRoutingByDestination,
  parsePlanPreviewMediaId,
  parseVariantMediaBinding,
  resolveMediaVersionForDestination,
  resolveVariantMediaIds,
  VariantMediaBindingError
} from "../src/distribution/media-binding.js";
import {
  DISTRIBUTION_MEDIA_MAIN_MOCK_ID,
  DISTRIBUTION_MEDIA_PREVIEW_MOCK_ID
} from "./helpers/distribution-media-pair.js";

describe("parseVariantMediaBinding", () => {
  it("defaults to full with no analytics role", () => {
    expect(parseVariantMediaBinding({}, "patreon")).toEqual({
      mediaVersion: "full",
      analyticsContentRole: null
    });
  });

  it("marks social preview destinations as promo", () => {
    expect(parseVariantMediaBinding({ media_version: "preview" }, "x")).toEqual({
      mediaVersion: "preview",
      analyticsContentRole: "promo"
    });
    expect(parseVariantMediaBinding({ media_version: "preview" }, "deviantart")).toEqual({
      mediaVersion: "preview",
      analyticsContentRole: "promo"
    });
  });

  it("does not mark Patreon preview as promo", () => {
    expect(parseVariantMediaBinding({ media_version: "preview" }, "patreon")).toEqual({
      mediaVersion: "preview",
      analyticsContentRole: null
    });
  });
});

describe("resolveVariantMediaIds", () => {
  it("returns canonical ids for full routing", () => {
    const binding = parseVariantMediaBinding({ media_version: "full" }, "patreon");
    expect(
      resolveVariantMediaIds({
        canonicalMediaIds: ["rel_main", "rel_extra"],
        binding,
        planPreviewMediaId: "rel_preview"
      })
    ).toEqual(["rel_main", "rel_extra"]);
  });

  it("returns preview id only for preview routing", () => {
    const binding = parseVariantMediaBinding({ media_version: "preview" }, "x");
    expect(
      resolveVariantMediaIds({
        canonicalMediaIds: ["rel_main"],
        binding,
        planPreviewMediaId: "rel_preview"
      })
    ).toEqual(["rel_preview"]);
  });

  it("throws when preview routing lacks preview_media_id", () => {
    const binding = parseVariantMediaBinding({ media_version: "preview" }, "x");
    expect(() =>
      resolveVariantMediaIds({
        canonicalMediaIds: ["rel_main"],
        binding,
        planPreviewMediaId: null
      })
    ).toThrow(VariantMediaBindingError);
  });
});

describe("parsePlanPreviewMediaId", () => {
  it("reads preview_media_id from assistant_plan", () => {
    expect(parsePlanPreviewMediaId({ preview_media_id: " rel_preview " })).toBe("rel_preview");
    expect(parsePlanPreviewMediaId({})).toBeNull();
  });
});

describe("normalizeMediaRoutingByDestination", () => {
  it("keeps only selected destinations and valid versions", () => {
    expect(
      normalizeMediaRoutingByDestination(
        { x: "preview", patreon: "full", bluesky: "nope" },
        ["patreon", "x", "deviantart"]
      )
    ).toEqual({ x: "preview", patreon: "full" });
  });
});

describe("mergeVariantPlatformFieldsWithMedia", () => {
  it("preserves destination-specific fields while adding media binding", () => {
    expect(
      mergeVariantPlatformFieldsWithMedia(
        { mature: false, no_ai: true },
        "deviantart",
        "preview"
      )
    ).toEqual({
      mature: false,
      no_ai: true,
      media_version: "preview",
      analytics_content_role: "promo"
    });
  });
});

describe("buildPlanMediaAssistantFields", () => {
  it("stores preview plan metadata", () => {
    expect(
      buildPlanMediaAssistantFields({
        needsPreview: true,
        previewMediaId: "rel_preview",
        mediaRoutingByDestination: { x: "preview", patreon: "full" }
      })
    ).toEqual({
      needs_preview: true,
      preview_media_id: "rel_preview",
      media_routing_by_destination: { x: "preview", patreon: "full" }
    });
  });
});

describe("destinationsUsingPreviewRouting", () => {
  it("lists destinations routed to preview", () => {
    expect(
      destinationsUsingPreviewRouting(["patreon", "x"], { x: "preview", patreon: "full" })
    ).toEqual(["x"]);
  });
});

describe("contentVariantRoleFromPlatformFields", () => {
  it("returns promo when analytics_content_role is promo", () => {
    expect(contentVariantRoleFromPlatformFields({ analytics_content_role: "promo" })).toBe("promo");
    expect(contentVariantRoleFromPlatformFields({ media_version: "full" })).toBeNull();
  });
});

describe("buildVariantMediaPlatformFields", () => {
  it("writes analytics_content_role for social preview", () => {
    expect(
      buildVariantMediaPlatformFields({ mediaVersion: "preview", destination: "x" })
    ).toEqual({
      media_version: "preview",
      analytics_content_role: "promo"
    });
  });
});

describe("mock media pair ids", () => {
  it("uses stable fixture ids for main and preview", () => {
    expect(DISTRIBUTION_MEDIA_MAIN_MOCK_ID).toBe("rel_media_dist_main_mock");
    expect(DISTRIBUTION_MEDIA_PREVIEW_MOCK_ID).toBe("rel_media_dist_preview_mock");
    expect(DISTRIBUTION_MEDIA_MAIN_MOCK_ID).not.toBe(DISTRIBUTION_MEDIA_PREVIEW_MOCK_ID);
  });
});
