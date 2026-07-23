/**
 * Local kit manual grants (EH-061).
 * Stores data/manual-grants.json — preview_only; not a production entitlement store.
 */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync
} from "node:fs";
import { join } from "node:path";
import type { EntitlementGrant } from "../entitlements/types";
import { grantFromSnapshot } from "../entitlements/merge";

export const MANUAL_GRANTS_CONTRACT_VERSION = "manual-grants/1.0.0" as const;

export type ManualGrantRecord = {
  grant_id: string;
  site_id: string;
  /** Local preview subject key (email, user id, or soft label). */
  subject_key: string;
  tier_ids: string[];
  reason: string;
  actor: string;
  created_at: string;
  expires_at: string | null;
  revoked_at: string | null;
};

export type ManualGrantsDocument = {
  contract_version: typeof MANUAL_GRANTS_CONTRACT_VERSION;
  site_id: string;
  production_safe: false;
  updated_at: string;
  grants: ManualGrantRecord[];
};

function grantsPath(kitDir: string): string {
  return join(kitDir, "data", "manual-grants.json");
}

function emptyDoc(siteId: string): ManualGrantsDocument {
  return {
    contract_version: MANUAL_GRANTS_CONTRACT_VERSION,
    site_id: siteId,
    production_safe: false,
    updated_at: new Date().toISOString(),
    grants: []
  };
}

export function loadManualGrants(
  siteId: string,
  kitDir = process.cwd()
): ManualGrantsDocument {
  const path = grantsPath(kitDir);
  if (!existsSync(path)) return emptyDoc(siteId);
  try {
    const raw = JSON.parse(readFileSync(path, "utf8").replace(/^\uFEFF/, "")) as
      | ManualGrantsDocument
      | Record<string, unknown>;
    if (
      !raw ||
      typeof raw !== "object" ||
      (raw as ManualGrantsDocument).contract_version !==
        MANUAL_GRANTS_CONTRACT_VERSION ||
      !Array.isArray((raw as ManualGrantsDocument).grants)
    ) {
      return emptyDoc(siteId);
    }
    const doc = raw as ManualGrantsDocument;
    return {
      ...doc,
      site_id: siteId,
      production_safe: false,
      grants: doc.grants.filter((g) => g && g.site_id === siteId)
    };
  } catch {
    return emptyDoc(siteId);
  }
}

export function saveManualGrants(
  doc: ManualGrantsDocument,
  kitDir = process.cwd()
): void {
  const normalized: ManualGrantsDocument = {
    ...doc,
    contract_version: MANUAL_GRANTS_CONTRACT_VERSION,
    production_safe: false,
    updated_at: new Date().toISOString()
  };
  mkdirSync(join(kitDir, "data"), { recursive: true });
  writeFileSync(grantsPath(kitDir), `${JSON.stringify(normalized, null, 2)}\n`, "utf8");
}

export type UpsertManualGrantInput = {
  site_id: string;
  subject_key: string;
  tier_ids: string[];
  reason: string;
  actor: string;
  expires_at?: string | null;
  grant_id?: string;
};

export type UpsertManualGrantResult =
  | { ok: true; grant: ManualGrantRecord; created: boolean }
  | { ok: false; reason: string };

export function upsertManualGrant(
  input: UpsertManualGrantInput,
  kitDir = process.cwd()
): UpsertManualGrantResult {
  const subject = input.subject_key?.trim() ?? "";
  const reason = input.reason?.trim() ?? "";
  const actor = input.actor?.trim() || "local-operator";
  if (!subject) return { ok: false, reason: "subject_required" };
  if (!reason) return { ok: false, reason: "reason_required" };
  if (!Array.isArray(input.tier_ids) || input.tier_ids.length === 0) {
    return { ok: false, reason: "tier_ids_required" };
  }
  const tier_ids = [
    ...new Set(input.tier_ids.map((t) => t.trim()).filter(Boolean))
  ];
  if (tier_ids.length === 0) return { ok: false, reason: "tier_ids_required" };

  let expires_at: string | null =
    input.expires_at === undefined ? null : input.expires_at;
  if (expires_at != null) {
    const ms = Date.parse(expires_at);
    if (!Number.isFinite(ms)) return { ok: false, reason: "invalid_expires_at" };
    expires_at = new Date(ms).toISOString();
  }

  const doc = loadManualGrants(input.site_id, kitDir);
  const now = new Date().toISOString();
  const existingIdx = input.grant_id
    ? doc.grants.findIndex((g) => g.grant_id === input.grant_id)
    : -1;

  const grant: ManualGrantRecord =
    existingIdx >= 0
      ? {
          ...doc.grants[existingIdx]!,
          subject_key: subject,
          tier_ids,
          reason,
          actor,
          expires_at,
          revoked_at: null
        }
      : {
          grant_id: `grant_${Date.now().toString(36)}_${Math.random()
            .toString(36)
            .slice(2, 8)}`,
          site_id: input.site_id,
          subject_key: subject,
          tier_ids,
          reason,
          actor,
          created_at: now,
          expires_at,
          revoked_at: null
        };

  const grants = [...doc.grants];
  if (existingIdx >= 0) grants[existingIdx] = grant;
  else grants.push(grant);
  saveManualGrants({ ...doc, grants }, kitDir);
  return { ok: true, grant, created: existingIdx < 0 };
}

export function revokeManualGrant(
  siteId: string,
  grantId: string,
  kitDir = process.cwd()
): { ok: true; grant: ManualGrantRecord } | { ok: false; reason: string } {
  const doc = loadManualGrants(siteId, kitDir);
  const idx = doc.grants.findIndex((g) => g.grant_id === grantId);
  if (idx < 0) return { ok: false, reason: "not_found" };
  const grant: ManualGrantRecord = {
    ...doc.grants[idx]!,
    revoked_at: new Date().toISOString()
  };
  const grants = [...doc.grants];
  grants[idx] = grant;
  saveManualGrants({ ...doc, grants }, kitDir);
  return { ok: true, grant };
}

/** Convert active local grants for a subject into EntitlementGrant rows. */
export function manualGrantsForSubject(
  siteId: string,
  subjectKey: string,
  opts?: { nowMs?: number; kitDir?: string }
): EntitlementGrant[] {
  const nowMs = opts?.nowMs ?? Date.now();
  const kitDir = opts?.kitDir ?? process.cwd();
  const key = subjectKey.trim().toLowerCase();
  const doc = loadManualGrants(siteId, kitDir);
  const out: EntitlementGrant[] = [];
  for (const g of doc.grants) {
    if (g.subject_key.trim().toLowerCase() !== key) continue;
    out.push(
      grantFromSnapshot({
        source: "manual",
        tierIds: g.tier_ids,
        observedAt: g.created_at,
        staleAfter: null,
        expiresAt: g.expires_at,
        revokedAt: g.revoked_at,
        reason: g.reason,
        nowMs
      })
    );
  }
  return out;
}

export function describeAccessReason(reason: string, detail: string): string {
  const labels: Record<string, string> = {
    public_resource: "Public resource",
    staff_override: "Staff override",
    entitlement_grant: "Active entitlement grant",
    soft_persona_preview: "Soft persona preview (local only)",
    anonymous_denied: "Anonymous — sign in required",
    missing_credentials: "Missing credentials",
    no_entitlement: "No active entitlement",
    entitlement_expired: "Entitlement expired",
    entitlement_revoked: "Entitlement revoked",
    entitlement_stale: "Entitlement stale",
    tier_insufficient: "Tier insufficient",
    unknown_resource: "Unknown resource",
    provider_invalid: "Identity provider invalid",
    soft_persona_blocked: "Soft persona blocked (provider configured)",
    unpublished_resource: "Unpublished / draft"
  };
  const label = labels[reason] ?? reason;
  return detail ? `${label}: ${detail}` : label;
}
