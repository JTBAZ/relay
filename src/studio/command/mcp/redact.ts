/**
 * Compact MCP I/O and safety filters (RC-P3-T03).
 * Never return media bytes, encrypted payloads, patron emails, or zip paths.
 */
import { CommandContractError, type CommandCapabilityName } from "../contracts.js";

const STRIP_KEY_RE =
  /^(encrypted_?payload|email|patron_?email|zip_?path|export_?zip|content_url_path|preview_url_path|thumb_url_path|external_url|signed_url|media_bytes|bytes|oauth|refresh_token|access_token|authorization)$/i;

const URLISH_KEY_RE = /(^url$|_url$|href|signed|download)/i;

const CURATION_KEYS = new Set([
  "similar_to",
  "cluster",
  "auto_curate",
  "related_works",
  "guess_related",
  "visual_similarity"
]);

const GATED_INTENT_KEYS = new Set([
  "expose_gated_originals",
  "use_gated_original",
  "gated_original",
  "original_bytes",
  "reveal_gated"
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function looksLikeHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value.trim()) || value.includes("/api/v1/media/");
}

/**
 * Recursively strip forbidden keys and URL-ish values. Media is ids-only.
 */
export function redactCommandMcpValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => redactCommandMcpValue(item));
  }
  if (!isRecord(value)) {
    if (typeof value === "string" && looksLikeHttpUrl(value)) return null;
    return value;
  }
  const out: Record<string, unknown> = {};
  for (const [key, nested] of Object.entries(value)) {
    if (STRIP_KEY_RE.test(key) || URLISH_KEY_RE.test(key)) continue;
    out[key] = redactCommandMcpValue(nested);
  }
  return out;
}

function walkKeys(value: unknown, visit: (key: string, nested: unknown) => void): void {
  if (Array.isArray(value)) {
    for (const item of value) walkKeys(item, visit);
    return;
  }
  if (!isRecord(value)) return;
  for (const [key, nested] of Object.entries(value)) {
    visit(key, nested);
    walkKeys(nested, visit);
  }
}

export function assertCommandMcpInputSafety(
  tool: CommandCapabilityName | string,
  args: unknown
): void {
  walkKeys(args, (key, nested) => {
    const lower = key.toLowerCase();
    if (CURATION_KEYS.has(lower)) {
      throw new CommandContractError(
        "COMMAND_FORBIDDEN",
        "Unsolicited curation keys are not allowed.",
        [{ field: key, issue: "unsolicited_curation" }]
      );
    }
    if (STRIP_KEY_RE.test(key)) {
      throw new CommandContractError(
        "COMMAND_FORBIDDEN",
        "Tool arguments must not include secrets, PII, or media bytes.",
        [{ field: key, issue: "stripped_input" }]
      );
    }
    if (GATED_INTENT_KEYS.has(lower) && nested !== false && nested !== null && nested !== undefined) {
      throw new CommandContractError(
        "COMMAND_GATED_MEDIA",
        "Gated originals cannot be exposed through Command Layer.",
        [{ field: key, issue: "gated_original" }]
      );
    }
  });

  if (!isRecord(args)) return;

  if (args.media_role === "original" || args.media_role === "gated_original") {
    throw new CommandContractError(
      "COMMAND_GATED_MEDIA",
      "Gated originals cannot be used as destination or revise media.",
      [{ field: "media_role", issue: String(args.media_role) }]
    );
  }

  if (
    (tool === "revise_post" || tool === "prepare_destination_drafts") &&
    args.use_public_cover === false &&
    args.is_public === false
  ) {
    throw new CommandContractError(
      "COMMAND_GATED_MEDIA",
      "Gated originals cannot be used as destination draft media.",
      [{ field: "use_public_cover", issue: "false_on_gated" }]
    );
  }
}
