/**
 * Admin attention marks under data/admin-attention.json (EH-022).
 * Local-prototype operator notes only — not auth, not export mutation.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  ADMIN_ATTENTION_CONTRACT_VERSION,
  type AdminAttentionState
} from "./types";

const FILENAME = "admin-attention.json";

function dataPath(kitDir = process.cwd()): string {
  return join(kitDir, "data", FILENAME);
}

function emptyState(siteId: string): AdminAttentionState {
  return {
    contract_version: ADMIN_ATTENTION_CONTRACT_VERSION,
    site_id: siteId,
    production_safe: false,
    updated_at: new Date().toISOString(),
    marks: {}
  };
}

export function loadAdminAttention(
  siteId: string,
  kitDir = process.cwd()
): AdminAttentionState {
  const path = dataPath(kitDir);
  if (!existsSync(path)) {
    return emptyState(siteId);
  }
  try {
    const raw = JSON.parse(readFileSync(path, "utf8").replace(/^\uFEFF/, "")) as unknown;
    if (!raw || typeof raw !== "object") return emptyState(siteId);
    const rec = raw as Record<string, unknown>;
    if (rec.contract_version !== ADMIN_ATTENTION_CONTRACT_VERSION) {
      return emptyState(siteId);
    }
    const marks =
      rec.marks && typeof rec.marks === "object" && !Array.isArray(rec.marks)
        ? (rec.marks as AdminAttentionState["marks"])
        : {};
    return {
      contract_version: ADMIN_ATTENTION_CONTRACT_VERSION,
      site_id: typeof rec.site_id === "string" ? rec.site_id : siteId,
      production_safe: false,
      updated_at:
        typeof rec.updated_at === "string"
          ? rec.updated_at
          : new Date().toISOString(),
      marks
    };
  } catch {
    return emptyState(siteId);
  }
}

export function markAdminAttention(
  siteId: string,
  postId: string,
  note: string,
  kitDir = process.cwd()
): AdminAttentionState {
  const state = loadAdminAttention(siteId, kitDir);
  const now = new Date().toISOString();
  const next: AdminAttentionState = {
    ...state,
    site_id: siteId,
    production_safe: false,
    updated_at: now,
    marks: {
      ...state.marks,
      [postId]: { note: note.trim() || "Needs attention", marked_at: now }
    }
  };
  const dir = join(kitDir, "data");
  mkdirSync(dir, { recursive: true });
  writeFileSync(dataPath(kitDir), `${JSON.stringify(next, null, 2)}\n`, "utf8");
  return next;
}

export function clearAdminAttention(
  siteId: string,
  postId: string,
  kitDir = process.cwd()
): AdminAttentionState {
  const state = loadAdminAttention(siteId, kitDir);
  const { [postId]: _removed, ...rest } = state.marks;
  const next: AdminAttentionState = {
    ...state,
    site_id: siteId,
    production_safe: false,
    updated_at: new Date().toISOString(),
    marks: rest
  };
  const dir = join(kitDir, "data");
  mkdirSync(dir, { recursive: true });
  writeFileSync(dataPath(kitDir), `${JSON.stringify(next, null, 2)}\n`, "utf8");
  return next;
}
