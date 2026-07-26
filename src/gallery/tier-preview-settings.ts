/**
 * @fileoverview Validate / normalize `PostPresentation.tierPreviewSettings` v1.
 * @see docs/studio/AUDIENCE_PROMOTION_CONVERSION.md Slice 3
 */

export const TIER_PREVIEW_SETTINGS_SCHEMA_VERSION = 1 as const;
export const TIER_PREVIEW_CTA_MAX_CHARS = 120;
/** Hard cap on serialized JSON to reject oversized blobs. */
export const TIER_PREVIEW_SETTINGS_MAX_JSON_CHARS = 16_384;

export const PREVIEW_TREATMENTS = [
  "default",
  "partial-unblur",
  "free-cta",
  "partial-unlock"
] as const;

export type PreviewTreatmentServer = (typeof PREVIEW_TREATMENTS)[number];

export type AudiencePersonaKeyServer = "anonymous" | `tier:${string}`;

export type TierPreviewPersonaSettingsV1 = {
  preview_style: PreviewTreatmentServer;
  cta_text: string;
};

export type TierPreviewSettingsV1 = {
  schema_version: 1;
  personas: Partial<Record<AudiencePersonaKeyServer, TierPreviewPersonaSettingsV1>>;
};

const DANGEROUS_KEYS = new Set(["__proto__", "constructor", "prototype"]);

export function isAudiencePersonaKey(raw: string): raw is AudiencePersonaKeyServer {
  const t = raw.trim();
  if (t === "anonymous") return true;
  if (t.startsWith("tier:") && t.length > "tier:".length) {
    const id = t.slice("tier:".length).trim();
    return id.length > 0 && !DANGEROUS_KEYS.has(id);
  }
  return false;
}

function isPreviewTreatment(raw: unknown): raw is PreviewTreatmentServer {
  return typeof raw === "string" && (PREVIEW_TREATMENTS as readonly string[]).includes(raw);
}

export type TierPreviewSettingsNormalizeResult =
  | { ok: true; value: TierPreviewSettingsV1 | null }
  | { ok: false; message: string };

/**
 * Normalize client JSON into TierPreviewSettingsV1, or null to clear.
 * Rejects unknown styles, malformed persona keys, prototype-pollution keys, and oversized JSON.
 */
export function normalizeTierPreviewSettings(raw: unknown): TierPreviewSettingsNormalizeResult {
  if (raw === null) {
    return { ok: true, value: null };
  }
  if (raw === undefined || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, message: "tier_preview_settings must be an object or null." };
  }

  let serialized: string;
  try {
    serialized = JSON.stringify(raw);
  } catch {
    return { ok: false, message: "tier_preview_settings is not JSON-serializable." };
  }
  if (serialized.length > TIER_PREVIEW_SETTINGS_MAX_JSON_CHARS) {
    return {
      ok: false,
      message: `tier_preview_settings exceeds ${TIER_PREVIEW_SETTINGS_MAX_JSON_CHARS} characters.`
    };
  }

  const obj = raw as Record<string, unknown>;
  for (const k of Object.keys(obj)) {
    if (DANGEROUS_KEYS.has(k)) {
      return { ok: false, message: "tier_preview_settings contains a forbidden key." };
    }
  }

  if (obj.schema_version !== TIER_PREVIEW_SETTINGS_SCHEMA_VERSION) {
    return { ok: false, message: "tier_preview_settings.schema_version must be 1." };
  }

  const personasRaw = obj.personas;
  if (personasRaw === undefined || personasRaw === null) {
    return { ok: true, value: { schema_version: 1, personas: {} } };
  }
  if (typeof personasRaw !== "object" || Array.isArray(personasRaw)) {
    return { ok: false, message: "tier_preview_settings.personas must be an object." };
  }

  const personasIn = personasRaw as Record<string, unknown>;
  for (const k of Object.keys(personasIn)) {
    if (DANGEROUS_KEYS.has(k)) {
      return { ok: false, message: "tier_preview_settings.personas contains a forbidden key." };
    }
  }

  const personas: TierPreviewSettingsV1["personas"] = {};
  for (const [key, entry] of Object.entries(personasIn)) {
    if (!isAudiencePersonaKey(key)) {
      return { ok: false, message: `Invalid persona key: ${key}` };
    }
    if (entry === undefined || entry === null) continue;
    if (typeof entry !== "object" || Array.isArray(entry)) {
      return { ok: false, message: `Invalid persona entry for ${key}.` };
    }
    const e = entry as Record<string, unknown>;
    for (const ek of Object.keys(e)) {
      if (DANGEROUS_KEYS.has(ek)) {
        return { ok: false, message: `Forbidden key in persona ${key}.` };
      }
    }
    if (!isPreviewTreatment(e.preview_style)) {
      return { ok: false, message: `Unknown preview_style for ${key}.` };
    }
    if (typeof e.cta_text !== "string") {
      return { ok: false, message: `cta_text must be a string for ${key}.` };
    }
    if (e.cta_text.length > TIER_PREVIEW_CTA_MAX_CHARS) {
      return {
        ok: false,
        message: `cta_text exceeds ${TIER_PREVIEW_CTA_MAX_CHARS} characters for ${key}.`
      };
    }
    personas[key] = {
      preview_style: e.preview_style,
      cta_text: e.cta_text
    };
  }

  return { ok: true, value: { schema_version: 1, personas } };
}

/**
 * Merge a patch of personas into existing settings (replace-per-key; null entry removes).
 */
export function mergeTierPreviewSettings(
  existing: unknown,
  patchPersonas: Partial<
    Record<AudiencePersonaKeyServer, TierPreviewPersonaSettingsV1 | null>
  >
): TierPreviewSettingsNormalizeResult {
  const baseNorm = normalizeTierPreviewSettings(
    existing ?? { schema_version: 1, personas: {} }
  );
  if (!baseNorm.ok) return baseNorm;
  const base = baseNorm.value ?? { schema_version: 1 as const, personas: {} };
  const next: TierPreviewSettingsV1 = {
    schema_version: 1,
    personas: { ...base.personas }
  };
  for (const [key, value] of Object.entries(patchPersonas)) {
    if (!isAudiencePersonaKey(key)) {
      return { ok: false, message: `Invalid persona key in merge: ${key}` };
    }
    if (value === null) {
      delete next.personas[key];
    } else if (value) {
      next.personas[key] = value;
    }
  }
  return normalizeTierPreviewSettings(next);
}
