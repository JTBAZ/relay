/**
 * Non-secret Patreon mode preference (EH-043).
 * Runtime authority remains ESCAPE_HATCH_PATREON_MODE.
 * Fail closed on corrupt files. Never store tokens or secrets here.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  isValidOAuthChoiceOption,
  type OAuthChoiceOptionId
} from "./oauth-choice";

export const PATREON_MODE_PREFERENCE_CONTRACT =
  "eh-patreon-mode-preference/1.0.0" as const;

export const PATREON_MODE_PREFERENCE_FILENAME = "patreon-mode-preference.json";

export type PatreonModePreference = {
  contract_version: typeof PATREON_MODE_PREFERENCE_CONTRACT;
  site_id: string;
  /** Explicit operator choice — null means no selection yet (managed not defaulted). */
  preferred_mode: OAuthChoiceOptionId | null;
  selected_at: string | null;
  switch_off_at: string | null;
  production_safe: false;
  note: string;
};

const PREFERENCE_NOTE =
  "Non-secret operator preference only. Runtime mode is ESCAPE_HATCH_PATREON_MODE. Never store tokens or secrets in this file.";

function dataPath(kitDir = process.cwd()): string {
  return join(kitDir, "data", PATREON_MODE_PREFERENCE_FILENAME);
}

export function emptyPatreonModePreference(
  siteId: string
): PatreonModePreference {
  return {
    contract_version: PATREON_MODE_PREFERENCE_CONTRACT,
    site_id: siteId,
    preferred_mode: null,
    selected_at: null,
    switch_off_at: null,
    production_safe: false,
    note: PREFERENCE_NOTE
  };
}

/**
 * Load preference. Corrupt / wrong version / secret-looking keys → empty (fail closed).
 */
export function loadPatreonModePreference(
  siteId: string,
  kitDir = process.cwd()
): PatreonModePreference {
  const path = dataPath(kitDir);
  if (!existsSync(path)) {
    return emptyPatreonModePreference(siteId);
  }
  try {
    const raw = JSON.parse(
      readFileSync(path, "utf8").replace(/^\uFEFF/, "")
    ) as unknown;
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      return emptyPatreonModePreference(siteId);
    }
    const rec = raw as Record<string, unknown>;
    if (rec.contract_version !== PATREON_MODE_PREFERENCE_CONTRACT) {
      return emptyPatreonModePreference(siteId);
    }
    // Reject files that look like they contain secrets
    const forbidden = [
      "token",
      "secret",
      "password",
      "client_secret",
      "refresh",
      "access_token",
      "private_key"
    ];
    for (const key of Object.keys(rec)) {
      const lower = key.toLowerCase();
      if (forbidden.some((f) => lower.includes(f))) {
        return emptyPatreonModePreference(siteId);
      }
    }
    const preferred =
      rec.preferred_mode === null
        ? null
        : isValidOAuthChoiceOption(rec.preferred_mode)
          ? rec.preferred_mode
          : null;
    // Invalid preferred_mode → treat as unset (fail closed; never invent managed)
    return {
      contract_version: PATREON_MODE_PREFERENCE_CONTRACT,
      site_id: typeof rec.site_id === "string" ? rec.site_id : siteId,
      preferred_mode: preferred,
      selected_at:
        typeof rec.selected_at === "string" ? rec.selected_at : null,
      switch_off_at:
        typeof rec.switch_off_at === "string" ? rec.switch_off_at : null,
      production_safe: false,
      note: PREFERENCE_NOTE
    };
  } catch {
    return emptyPatreonModePreference(siteId);
  }
}

function persist(
  next: PatreonModePreference,
  kitDir: string
): PatreonModePreference {
  const dir = join(kitDir, "data");
  mkdirSync(dir, { recursive: true });
  const safe: PatreonModePreference = {
    contract_version: PATREON_MODE_PREFERENCE_CONTRACT,
    site_id: next.site_id,
    preferred_mode: next.preferred_mode,
    selected_at: next.selected_at,
    switch_off_at: next.switch_off_at,
    production_safe: false,
    note: PREFERENCE_NOTE
  };
  writeFileSync(dataPath(kitDir), `${JSON.stringify(safe, null, 2)}\n`, "utf8");
  return safe;
}

/**
 * Record an explicit choice. Requires creator_oauth | relay_managed — never null write as "selected".
 */
export function savePatreonModePreference(
  siteId: string,
  preferredMode: OAuthChoiceOptionId,
  kitDir = process.cwd(),
  nowIso = new Date().toISOString()
): PatreonModePreference {
  if (!isValidOAuthChoiceOption(preferredMode)) {
    throw new Error("preferred_mode must be creator_oauth or relay_managed");
  }
  const prev = loadPatreonModePreference(siteId, kitDir);
  return persist(
    {
      ...prev,
      site_id: siteId,
      preferred_mode: preferredMode,
      selected_at: nowIso,
      switch_off_at:
        preferredMode === "creator_oauth" ? prev.switch_off_at : null,
      production_safe: false,
      note: PREFERENCE_NOTE
    },
    kitDir
  );
}

/**
 * Switch-off toward creator_oauth without deleting patrons or requiring rebuild.
 * Preference only — operator must still set ESCAPE_HATCH_PATREON_MODE on the host.
 */
export function switchOffToCreatorOAuth(
  siteId: string,
  kitDir = process.cwd(),
  nowIso = new Date().toISOString()
): PatreonModePreference {
  return persist(
    {
      contract_version: PATREON_MODE_PREFERENCE_CONTRACT,
      site_id: siteId,
      preferred_mode: "creator_oauth",
      selected_at: nowIso,
      switch_off_at: nowIso,
      production_safe: false,
      note: PREFERENCE_NOTE
    },
    kitDir
  );
}

export type SwitchOffResult = {
  preference: PatreonModePreference;
  envInstruction: string;
  patronsPreserved: true;
  rebuildRequired: false;
  productionSafe: false;
};

export function buildSwitchOffResult(
  siteId: string,
  kitDir = process.cwd()
): SwitchOffResult {
  const preference = switchOffToCreatorOAuth(siteId, kitDir);
  return {
    preference,
    envInstruction:
      "Set ESCAPE_HATCH_PATREON_MODE=creator_oauth on the host secret store / .env.local. Preference file is not runtime authority.",
    patronsPreserved: true,
    rebuildRequired: false,
    productionSafe: false
  };
}
