import { describe, expect, it, vi } from "vitest";
import {
  normalizePreviewTemplateDestination,
  parsePreviewTemplateConfig,
  PreviewTemplateConfigError,
  PREVIEW_TEMPLATE_SCHEMA_VERSION
} from "../src/distribution/preview-template-config.js";
import {
  createPreviewTemplate,
  deletePreviewTemplate,
  MAX_CUSTOM_PREVIEW_TEMPLATES,
  PreviewTemplateNotFoundError,
  PreviewTemplateValidationError,
  updatePreviewTemplate
} from "../src/distribution/preview-template-service.js";

function validConfig(over: Record<string, unknown> = {}) {
  return {
    schemaVersion: PREVIEW_TEMPLATE_SCHEMA_VERSION,
    preset: "tight_crop",
    aspectKey: "1:1",
    compositionId: "blur_plug",
    compositionProps: { handle: "@me", label: "Follow" },
    compositionVariantIndex: null,
    overlayDoc: { textLayers: [], graphicLayers: [], logoLayers: [] },
    templateOptions: { platformId: "patreon", backgroundMode: "crop", relayBranding: false },
    destination: { selectedDestinationId: "patreon", customDestinationUrl: "https://evil.example" },
    ...over
  };
}

function prismaStub(over: Record<string, unknown>) {
  return over as any;
}

describe("preview-template-config", () => {
  it("parses v1 and strips custom URL for known platforms", () => {
    const cfg = parsePreviewTemplateConfig(validConfig());
    expect(cfg.destination).toEqual({
      selectedDestinationId: "patreon",
      customDestinationUrl: null
    });
    expect(cfg.compositionProps).toEqual({ handle: "@me", label: "Follow" });
  });

  it("keeps customDestinationUrl when destination is custom", () => {
    const cfg = parsePreviewTemplateConfig(
      validConfig({
        destination: {
          selectedDestinationId: "custom",
          customDestinationUrl: " https://shop.example/join "
        }
      })
    );
    expect(cfg.destination).toEqual({
      selectedDestinationId: "custom",
      customDestinationUrl: "https://shop.example/join"
    });
  });

  it("rejects unknown schemaVersion", () => {
    expect(() => parsePreviewTemplateConfig(validConfig({ schemaVersion: 99 }))).toThrow(
      PreviewTemplateConfigError
    );
  });

  it("ignores selection if present", () => {
    const cfg = parsePreviewTemplateConfig(
      validConfig({ selection: { x: 0.1, y: 0.1, w: 0.5, h: 0.5 } })
    );
    expect(cfg).not.toHaveProperty("selection");
  });

  it("normalizePreviewTemplateDestination clears URL for bluesky", () => {
    expect(
      normalizePreviewTemplateDestination({
        selectedDestinationId: "bluesky",
        customDestinationUrl: "https://bsky.app/profile/x"
      })
    ).toEqual({ selectedDestinationId: "bluesky", customDestinationUrl: null });
  });
});

describe("preview-template-service", () => {
  it("rejects create when name is missing", async () => {
    const prisma = prismaStub({ creatorPreviewTemplate: { count: vi.fn(), create: vi.fn() } });
    await expect(
      createPreviewTemplate(prisma, "cr1", { name: " ", config: validConfig() })
    ).rejects.toBeInstanceOf(PreviewTemplateValidationError);
    expect(prisma.creatorPreviewTemplate.create).not.toHaveBeenCalled();
  });

  it("rejects create when at max without replace", async () => {
    const prisma = prismaStub({
      creatorPreviewTemplate: {
        count: vi.fn().mockResolvedValue(MAX_CUSTOM_PREVIEW_TEMPLATES),
        create: vi.fn()
      }
    });
    await expect(
      createPreviewTemplate(prisma, "cr1", { name: "My look", config: validConfig() })
    ).rejects.toMatchObject({
      details: [{ field: "templates", issue: "max_count" }]
    });
    expect(prisma.creatorPreviewTemplate.create).not.toHaveBeenCalled();
  });

  it("replace overwrites an owned template without counting as create", async () => {
    const now = new Date("2026-07-19T12:00:00.000Z");
    const prisma = prismaStub({
      creatorPreviewTemplate: {
        findFirst: vi.fn().mockResolvedValue({
          id: "tpl1",
          creatorId: "cr1",
          name: "Old",
          config: validConfig(),
          createdAt: now,
          updatedAt: now
        }),
        update: vi.fn().mockResolvedValue({
          id: "tpl1",
          creatorId: "cr1",
          name: "New",
          config: validConfig({ compositionProps: { handle: "fresh" } }),
          createdAt: now,
          updatedAt: now
        }),
        count: vi.fn(),
        create: vi.fn()
      }
    });

    const result = await createPreviewTemplate(prisma, "cr1", {
      name: "New",
      config: validConfig({ compositionProps: { handle: "fresh" } }),
      replaceTemplateId: "tpl1"
    });
    expect(result.name).toBe("New");
    expect(prisma.creatorPreviewTemplate.count).not.toHaveBeenCalled();
    expect(prisma.creatorPreviewTemplate.create).not.toHaveBeenCalled();
    expect(prisma.creatorPreviewTemplate.update).toHaveBeenCalled();
  });

  it("throws when replace targets another creator", async () => {
    const prisma = prismaStub({
      creatorPreviewTemplate: { findFirst: vi.fn().mockResolvedValue(null) }
    });
    await expect(
      createPreviewTemplate(prisma, "cr1", {
        name: "New",
        config: validConfig(),
        replaceTemplateId: "other"
      })
    ).rejects.toBeInstanceOf(PreviewTemplateNotFoundError);
  });

  it("updates an owned template", async () => {
    const now = new Date("2026-07-19T12:00:00.000Z");
    const prisma = prismaStub({
      creatorPreviewTemplate: {
        findFirst: vi.fn().mockResolvedValue({
          id: "tpl1",
          creatorId: "cr1",
          name: "Old",
          config: validConfig(),
          createdAt: now,
          updatedAt: now
        }),
        update: vi.fn().mockResolvedValue({
          id: "tpl1",
          creatorId: "cr1",
          name: "Renamed",
          config: validConfig(),
          createdAt: now,
          updatedAt: now
        })
      }
    });
    const result = await updatePreviewTemplate(prisma, "cr1", "tpl1", { name: "Renamed" });
    expect(result.name).toBe("Renamed");
  });

  it("throws when updating a template owned by another creator", async () => {
    const prisma = prismaStub({
      creatorPreviewTemplate: { findFirst: vi.fn().mockResolvedValue(null) }
    });
    await expect(
      updatePreviewTemplate(prisma, "cr1", "tpl1", { name: "X" })
    ).rejects.toBeInstanceOf(PreviewTemplateNotFoundError);
  });

  it("deletes an owned template", async () => {
    const prisma = prismaStub({
      creatorPreviewTemplate: {
        findFirst: vi.fn().mockResolvedValue({ id: "tpl1" }),
        delete: vi.fn().mockResolvedValue({ id: "tpl1" })
      }
    });
    await expect(deletePreviewTemplate(prisma, "cr1", "tpl1")).resolves.toEqual({
      template_id: "tpl1"
    });
  });
});
