import { describe, expect, it } from "vitest";
import {
  parseTierPreviewSettingsClient,
  personasFromCatalogTiers,
  personasFromSimulationEnvelope
} from "../../web/lib/audience-simulation-client";
import type { AudienceSimulationEnvelope } from "../../web/lib/relay-api";

describe("audience-simulation-client", () => {
  it("maps envelope personas and drops malformed keys", () => {
    const envelope = {
      post_id: "p1",
      creator_id: "c1",
      gate: { is_public: false, tier_ids: ["patreon_tier_low"] },
      relay_visibility: "visible",
      is_mature: false,
      catalog_tiers: [],
      simulation: {
        personas: [
          { persona_key: "anonymous", label: "Public (logged out)", outcome: "deny" },
          { persona_key: "tier:patreon_tier_low", label: "Low", outcome: "allow" },
          { persona_key: "Basic", label: "Bad", outcome: "allow" }
        ],
        gate_tier_ids: ["patreon_tier_low"],
        relay_visibility: "visible"
      },
      tier_preview_settings: null
    } as AudienceSimulationEnvelope;

    const personas = personasFromSimulationEnvelope(envelope);
    expect(personas.map((p) => p.persona_key)).toEqual([
      "anonymous",
      "tier:patreon_tier_low"
    ]);
  });

  it("builds catalog personas without fallback labels", () => {
    const personas = personasFromCatalogTiers([
      { relay_tier_id: "patreon_tier_pro", title: "Pro" }
    ]);
    expect(personas.map((p) => p.label)).toEqual(["Public (logged out)", "Pro"]);
    expect(personas.some((p) => /goku|advanced/i.test(p.label))).toBe(false);
  });

  it("parses tier_preview_settings v1 loosely on the client", () => {
    const parsed = parseTierPreviewSettingsClient({
      schema_version: 1,
      personas: {
        anonymous: { preview_style: "free-cta", cta_text: "Join" },
        "tier:x": { preview_style: "nope", cta_text: "x" }
      }
    });
    expect(parsed?.personas.anonymous?.preview_style).toBe("free-cta");
    expect(parsed?.personas["tier:x"]).toBeUndefined();
  });
});
