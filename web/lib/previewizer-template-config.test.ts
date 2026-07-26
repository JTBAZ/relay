import { describe, expect, it } from "vitest";
import { createDefaultOverlayDocument } from "@/app/components/previewizer/previewizer-overlay-layers";
import { DEFAULT_TEMPLATE_OPTIONS } from "@/app/components/previewizer/previewizer-design-templates";
import { DEFAULT_COMPOSITION_PROPS } from "@/app/components/previewizer/previewizer-template-compositions";
import {
  hydratePreviewTemplateConfig,
  PreviewTemplateConfigParseError,
  PREVIEW_TEMPLATE_SCHEMA_VERSION,
  serializePreviewTemplateConfig,
  tryHydratePreviewTemplateConfig
} from "./previewizer-template-config";

describe("previewizer-template-config", () => {
  it("serialize omits selection and clears custom URL for patreon", () => {
    const config = serializePreviewTemplateConfig(
      {
        preset: "blur_outside",
        aspectKey: "9:16",
        compositionId: "blur_plug",
        compositionProps: {
          ...DEFAULT_COMPOSITION_PROPS.blur_plug,
          handle: "patreon.com/me",
          label: "Join"
        },
        compositionVariantIndex: 0,
        overlayDoc: createDefaultOverlayDocument(),
        templateOptions: { ...DEFAULT_TEMPLATE_OPTIONS }
      },
      {
        selectedDestinationId: "patreon",
        customDestinationUrl: "https://should-not-persist.example"
      }
    );

    expect(config.schemaVersion).toBe(PREVIEW_TEMPLATE_SCHEMA_VERSION);
    expect(config).not.toHaveProperty("selection");
    expect(config.destination).toEqual({
      selectedDestinationId: "patreon",
      customDestinationUrl: null
    });
    expect(config.compositionProps).toMatchObject({ handle: "patreon.com/me", label: "Join" });
  });

  it("serialize keeps custom URL for custom destination", () => {
    const config = serializePreviewTemplateConfig(
      {
        preset: "tight_crop",
        aspectKey: "1:1",
        compositionId: null,
        compositionProps: null,
        compositionVariantIndex: null,
        overlayDoc: createDefaultOverlayDocument(),
        templateOptions: { ...DEFAULT_TEMPLATE_OPTIONS }
      },
      {
        selectedDestinationId: "custom",
        customDestinationUrl: " https://shop.example/x "
      }
    );
    expect(config.destination).toEqual({
      selectedDestinationId: "custom",
      customDestinationUrl: "https://shop.example/x"
    });
  });

  it("hydrate merges composition defaults and leaves sticky handle text", () => {
    const patch = hydratePreviewTemplateConfig({
      schemaVersion: 1,
      preset: "tight_crop",
      aspectKey: "4:5",
      compositionId: "blur_plug",
      compositionProps: { handle: "saved-handle", label: "Saved label" },
      compositionVariantIndex: null,
      overlayDoc: { textLayers: [], graphicLayers: [], logoLayers: [] },
      templateOptions: { platformId: "bluesky" },
      destination: {
        selectedDestinationId: "bluesky",
        customDestinationUrl: "https://ignored.example"
      }
    });

    expect(patch.compositionProps).toMatchObject({
      handle: "saved-handle",
      label: "Saved label",
      // defaults still present
      blurType: DEFAULT_COMPOSITION_PROPS.blur_plug.blurType
    });
    expect(patch.destination.customDestinationUrl).toBeNull();
    expect(patch.templateOptions.platformId).toBe("bluesky");
    expect(patch).not.toHaveProperty("selection");
  });

  it("rejects unknown schemaVersion on hydrate", () => {
    expect(() =>
      hydratePreviewTemplateConfig({
        schemaVersion: 2,
        preset: "tight_crop",
        aspectKey: "1:1",
        compositionId: null,
        compositionProps: null,
        compositionVariantIndex: null,
        overlayDoc: {},
        templateOptions: {},
        destination: { selectedDestinationId: null, customDestinationUrl: null }
      })
    ).toThrow(PreviewTemplateConfigParseError);
  });

  it("round-trips serialize → hydrate", () => {
    const serialized = serializePreviewTemplateConfig(
      {
        preset: "pixelate",
        aspectKey: "1:1",
        compositionId: "blur_plug",
        compositionProps: {
          ...DEFAULT_COMPOSITION_PROPS.blur_plug,
          handle: "round-trip"
        },
        compositionVariantIndex: 1,
        overlayDoc: createDefaultOverlayDocument(),
        templateOptions: { ...DEFAULT_TEMPLATE_OPTIONS, relayBranding: true }
      },
      { selectedDestinationId: "custom", customDestinationUrl: "https://ok.example" }
    );
    const patch = hydratePreviewTemplateConfig(serialized);
    expect(patch.preset).toBe("pixelate");
    expect(patch.compositionVariantIndex).toBe(1);
    expect(patch.compositionProps).toMatchObject({ handle: "round-trip" });
    expect(patch.destination).toEqual({
      selectedDestinationId: "custom",
      customDestinationUrl: "https://ok.example"
    });
    expect(patch.templateOptions.relayBranding).toBe(true);
  });

  it("tryHydrate soft-fails invalid config and never returns selection", () => {
    const bad = tryHydratePreviewTemplateConfig({ schemaVersion: 99 });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.message).toMatch(/Invalid preview template config/i);

    const serialized = serializePreviewTemplateConfig(
      {
        preset: "tight_crop",
        aspectKey: "1:1",
        compositionId: null,
        compositionProps: null,
        compositionVariantIndex: null,
        overlayDoc: createDefaultOverlayDocument(),
        templateOptions: { ...DEFAULT_TEMPLATE_OPTIONS }
      },
      { selectedDestinationId: null, customDestinationUrl: null }
    );
    const good = tryHydratePreviewTemplateConfig(serialized);
    expect(good.ok).toBe(true);
    if (good.ok) {
      expect(good.patch).not.toHaveProperty("selection");
      expect(good.patch.preset).toBe("tight_crop");
    }
  });
});
