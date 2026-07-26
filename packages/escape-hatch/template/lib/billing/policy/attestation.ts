/**
 * Creator content/use attestation (EH-052).
 * Routing declaration only — never a copy of the private catalog.
 * Non-secret JSON under data/; fail closed on corrupt files.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  CONTENT_ATTESTATION_CONTRACT,
  isContentUseCategory,
  type ContentUseAttestation,
  type ContentUseCategory
} from "./matrix";

export {
  CONTENT_ATTESTATION_CONTRACT,
  type ContentUseAttestation
} from "./matrix";

export const CONTENT_ATTESTATION_FILENAME = "content-use-attestation.json";

const ATTESTATION_NOTE =
  "Non-secret routing declaration only — not a catalog export. Never store secrets. productionSafe remains false.";

function dataPath(kitDir = process.cwd()): string {
  return join(kitDir, "data", CONTENT_ATTESTATION_FILENAME);
}

export function emptyContentUseAttestation(
  siteId: string
): ContentUseAttestation {
  return {
    contract_version: CONTENT_ATTESTATION_CONTRACT,
    site_id: siteId,
    category: "undeclared",
    acceptedProviderTerms: false,
    affirmedAccurate: false,
    attestedAt: null,
    attestedByHint: null,
    production_safe: false,
    note: ATTESTATION_NOTE
  };
}

function looksLikeSecretKey(key: string): boolean {
  const lower = key.toLowerCase();
  const forbidden = [
    "token",
    "secret",
    "password",
    "client_secret",
    "refresh",
    "access_token",
    "private_key",
    "stripe_secret",
    "sk_live",
    "sk_test"
  ];
  return forbidden.some((f) => lower.includes(f));
}

/**
 * Load attestation. Corrupt / wrong version / secret-looking keys → empty (fail closed).
 */
export function loadContentUseAttestation(
  siteId: string,
  kitDir = process.cwd()
): ContentUseAttestation {
  const path = dataPath(kitDir);
  if (!existsSync(path)) {
    return emptyContentUseAttestation(siteId);
  }
  try {
    const raw = JSON.parse(
      readFileSync(path, "utf8").replace(/^\uFEFF/, "")
    ) as unknown;
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      return emptyContentUseAttestation(siteId);
    }
    const rec = raw as Record<string, unknown>;
    if (rec.contract_version !== CONTENT_ATTESTATION_CONTRACT) {
      return emptyContentUseAttestation(siteId);
    }
    for (const key of Object.keys(rec)) {
      if (looksLikeSecretKey(key)) {
        return emptyContentUseAttestation(siteId);
      }
    }
    const category = isContentUseCategory(rec.category)
      ? rec.category
      : "undeclared";
    return {
      contract_version: CONTENT_ATTESTATION_CONTRACT,
      site_id: typeof rec.site_id === "string" ? rec.site_id : siteId,
      category,
      acceptedProviderTerms: rec.acceptedProviderTerms === true,
      affirmedAccurate: rec.affirmedAccurate === true,
      attestedAt: typeof rec.attestedAt === "string" ? rec.attestedAt : null,
      attestedByHint:
        typeof rec.attestedByHint === "string" ? rec.attestedByHint : null,
      production_safe: false,
      note: ATTESTATION_NOTE
    };
  } catch {
    return emptyContentUseAttestation(siteId);
  }
}

export type SaveContentUseAttestationInput = {
  siteId: string;
  category: ContentUseCategory;
  acceptedProviderTerms: boolean;
  affirmedAccurate: boolean;
  attestedByHint?: string | null;
  kitDir?: string;
  nowIso?: string;
};

/**
 * Persist attestation. Requires category !== undeclared and both affirmations.
 */
export function saveContentUseAttestation(
  input: SaveContentUseAttestationInput
):
  | { ok: true; attestation: ContentUseAttestation }
  | { ok: false; reason: string } {
  if (!isContentUseCategory(input.category) || input.category === "undeclared") {
    return { ok: false, reason: "category_required" };
  }
  if (!input.acceptedProviderTerms) {
    return { ok: false, reason: "provider_terms_not_accepted" };
  }
  if (!input.affirmedAccurate) {
    return { ok: false, reason: "accuracy_not_affirmed" };
  }

  const kitDir = input.kitDir ?? process.cwd();
  const nowIso = input.nowIso ?? new Date().toISOString();
  const dir = join(kitDir, "data");
  mkdirSync(dir, { recursive: true });

  const attestation: ContentUseAttestation = {
    contract_version: CONTENT_ATTESTATION_CONTRACT,
    site_id: input.siteId,
    category: input.category,
    acceptedProviderTerms: true,
    affirmedAccurate: true,
    attestedAt: nowIso,
    attestedByHint: input.attestedByHint?.trim() || null,
    production_safe: false,
    note: ATTESTATION_NOTE
  };

  writeFileSync(
    dataPath(kitDir),
    `${JSON.stringify(attestation, null, 2)}\n`,
    "utf8"
  );
  return { ok: true, attestation };
}

export function isAttestationComplete(
  attestation: ContentUseAttestation
): boolean {
  return (
    attestation.category !== "undeclared" &&
    attestation.acceptedProviderTerms === true &&
    attestation.affirmedAccurate === true &&
    typeof attestation.attestedAt === "string" &&
    attestation.attestedAt.length > 0
  );
}
