/**
 * Client helpers for Audience Simulator personas + tier_preview_settings v1.
 * Personas come only from Public + synced catalog tiers (never fallback labels).
 */

import type {
  AudiencePersonaKey,
  PreviewTreatment,
  TierPreviewSettingsV1
} from "@/lib/audience-promotion-contracts";
import {
  parseAudiencePersonaKey,
  tierPersonaKey
} from "@/lib/audience-promotion-contracts";
import type { AudienceSimulationEnvelope } from "@/lib/relay-api";

export type SimulatorPersonaOption = {
  persona_key: AudiencePersonaKey;
  label: string;
  outcome: AudienceSimulationEnvelope["simulation"]["personas"][number]["outcome"];
  reason?: string;
  effective_promo?: AudienceSimulationEnvelope["simulation"]["personas"][number]["effective_promo"];
};

export function personasFromSimulationEnvelope(
  envelope: AudienceSimulationEnvelope
): SimulatorPersonaOption[] {
  const out: SimulatorPersonaOption[] = [];
  for (const p of envelope.simulation.personas) {
    const key = parseAudiencePersonaKey(p.persona_key);
    if (!key) continue;
    out.push({
      persona_key: key,
      label: p.label,
      outcome: p.outcome,
      reason: p.reason,
      effective_promo: p.effective_promo ?? null
    });
  }
  return out;
}

/** Public + synced tiers only (client-side catalog → persona keys). */
export function personasFromCatalogTiers(
  catalog: Array<{ relay_tier_id: string; title: string }>
): Array<{ persona_key: AudiencePersonaKey; label: string }> {
  return [
    { persona_key: "anonymous", label: "Public (logged out)" },
    ...catalog.map((t) => ({
      persona_key: tierPersonaKey(t.relay_tier_id),
      label: t.title.trim() || t.relay_tier_id
    }))
  ];
}

export function parseTierPreviewSettingsClient(raw: unknown): TierPreviewSettingsV1 | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw !== "object" || Array.isArray(raw)) return null;
  const obj = raw as Record<string, unknown>;
  if (obj.schema_version !== 1) return null;
  const personasRaw = obj.personas;
  if (personasRaw === undefined || personasRaw === null) {
    return { schema_version: 1, personas: {} };
  }
  if (typeof personasRaw !== "object" || Array.isArray(personasRaw)) return null;
  const personas: TierPreviewSettingsV1["personas"] = {};
  for (const [k, v] of Object.entries(personasRaw as Record<string, unknown>)) {
    const key = parseAudiencePersonaKey(k);
    if (!key || !v || typeof v !== "object" || Array.isArray(v)) continue;
    const entry = v as Record<string, unknown>;
    const style = entry.preview_style;
    const cta = entry.cta_text;
    if (
      style !== "default" &&
      style !== "partial-unblur" &&
      style !== "free-cta" &&
      style !== "partial-unlock"
    ) {
      continue;
    }
    if (typeof cta !== "string") continue;
    personas[key] = { preview_style: style as PreviewTreatment, cta_text: cta };
  }
  return { schema_version: 1, personas };
}

export function outcomeLabel(
  outcome: SimulatorPersonaOption["outcome"]
): string {
  switch (outcome) {
    case "allow":
      return "Unlocked";
    case "locked_preview":
      return "Locked preview";
    case "deny":
      return "Denied";
    default:
      return "Unavailable";
  }
}
