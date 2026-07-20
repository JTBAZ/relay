/**
 * Slice 3 Batch 1 — tier_preview_settings v1 normalization.
 */
import { describe, expect, it } from "vitest";
import {
  TIER_PREVIEW_CTA_MAX_CHARS,
  TIER_PREVIEW_SETTINGS_MAX_JSON_CHARS,
  mergeTierPreviewSettings,
  normalizeTierPreviewSettings
} from "../src/gallery/tier-preview-settings.js";
import { derivePresentationUpsertFragments } from "../src/gallery/post-presentation-mutate.js";

describe("normalizeTierPreviewSettings", () => {
  it("accepts null clear and valid v1", () => {
    expect(normalizeTierPreviewSettings(null)).toEqual({ ok: true, value: null });
    const ok = normalizeTierPreviewSettings({
      schema_version: 1,
      personas: {
        anonymous: { preview_style: "free-cta", cta_text: "Join" },
        "tier:patreon_tier_low": { preview_style: "default", cta_text: "" }
      }
    });
    expect(ok.ok).toBe(true);
    if (ok.ok) {
      expect(ok.value?.personas.anonymous?.preview_style).toBe("free-cta");
    }
  });

  it("rejects unknown style, bad persona, pollution keys, long CTA, oversized JSON", () => {
    expect(
      normalizeTierPreviewSettings({
        schema_version: 1,
        personas: { anonymous: { preview_style: "magic", cta_text: "" } }
      }).ok
    ).toBe(false);

    expect(
      normalizeTierPreviewSettings({
        schema_version: 1,
        personas: { "Basic": { preview_style: "default", cta_text: "" } }
      }).ok
    ).toBe(false);

    expect(
      normalizeTierPreviewSettings({
        schema_version: 1,
        personas: JSON.parse(
          '{"__proto__":{"preview_style":"default","cta_text":""}}'
        ) as Record<string, unknown>
      }).ok
    ).toBe(false);

    expect(
      normalizeTierPreviewSettings({
        schema_version: 1,
        personas: {
          anonymous: {
            preview_style: "default",
            cta_text: "x".repeat(TIER_PREVIEW_CTA_MAX_CHARS + 1)
          }
        }
      }).ok
    ).toBe(false);

    const fat = {
      schema_version: 1,
      personas: {
        anonymous: {
          preview_style: "default",
          cta_text: "y".repeat(TIER_PREVIEW_SETTINGS_MAX_JSON_CHARS)
        }
      }
    };
    expect(normalizeTierPreviewSettings(fat).ok).toBe(false);
  });
});

describe("mergeTierPreviewSettings", () => {
  it("merges persona patches and can remove with null", () => {
    const merged = mergeTierPreviewSettings(
      {
        schema_version: 1,
        personas: {
          anonymous: { preview_style: "default", cta_text: "A" },
          "tier:t1": { preview_style: "free-cta", cta_text: "B" }
        }
      },
      {
        anonymous: { preview_style: "partial-unblur", cta_text: "C" },
        "tier:t1": null
      }
    );
    expect(merged.ok).toBe(true);
    if (merged.ok && merged.value) {
      expect(merged.value.personas.anonymous?.cta_text).toBe("C");
      expect(merged.value.personas["tier:t1"]).toBeUndefined();
    }
  });
});

describe("derivePresentationUpsertFragments + tier_preview_settings", () => {
  it("wires strict normalization into presentation mutate", () => {
    const touched = new Set(["tier_preview_settings"]);
    const ok = derivePresentationUpsertFragments(
      {
        tier_preview_settings: {
          schema_version: 1,
          personas: { anonymous: { preview_style: "default", cta_text: "Hi" } }
        }
      },
      touched
    );
    expect(ok.tierPreviewSettings).toMatchObject({ schema_version: 1 });

    expect(() =>
      derivePresentationUpsertFragments(
        {
          tier_preview_settings: {
            schema_version: 1,
            personas: { Goku: { preview_style: "default", cta_text: "" } }
          }
        },
        touched
      )
    ).toThrow(/VALIDATION:tier_preview_settings/);
  });
});
