/**
 * Optional Patreon → kit CMS sync state (EH-063).
 * Preview-only JSON under data/ — productionSafe remains false.
 */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync
} from "node:fs";
import { join } from "node:path";

export const PATREON_SYNC_STATE_CONTRACT =
  "patreon-sync-state/1.0.0" as const;

export type SyncPostOrigin = "imported" | "native" | "crossposted";

export type SyncConflictKind =
  | "local_edit"
  | "native_post"
  | "upstream_revision";

export type SyncPostTracking = {
  origin: SyncPostOrigin;
  locally_edited: boolean;
  upstream_id: string | null;
  upstream_revision: string | null;
};

export type SyncConflictItem = {
  conflict_id: string;
  kind: SyncConflictKind;
  post_id: string;
  summary: string;
  upstream_revision: string | null;
  created_at: string;
};

export type PatreonSyncStateDocument = {
  contract_version: typeof PATREON_SYNC_STATE_CONTRACT;
  site_id: string;
  production_safe: false;
  updated_at: string;
  last_sync_at: string | null;
  last_status: "ok" | "degraded" | "failed" | "never";
  last_error: string | null;
  posts: Record<string, SyncPostTracking>;
  conflict_queue: SyncConflictItem[];
};

function statePath(kitDir: string): string {
  return join(kitDir, "data", "patreon-sync-state.json");
}

export function emptyPatreonSyncState(
  siteId: string
): PatreonSyncStateDocument {
  return {
    contract_version: PATREON_SYNC_STATE_CONTRACT,
    site_id: siteId,
    production_safe: false,
    updated_at: new Date().toISOString(),
    last_sync_at: null,
    last_status: "never",
    last_error: null,
    posts: {},
    conflict_queue: []
  };
}

export function loadPatreonSyncState(
  siteId: string,
  kitDir = process.cwd()
): PatreonSyncStateDocument {
  const path = statePath(kitDir);
  if (!existsSync(path)) return emptyPatreonSyncState(siteId);
  try {
    const raw = JSON.parse(
      readFileSync(path, "utf8").replace(/^\uFEFF/, "")
    ) as Partial<PatreonSyncStateDocument>;
    if (
      raw.contract_version !== PATREON_SYNC_STATE_CONTRACT ||
      !raw.posts ||
      typeof raw.posts !== "object" ||
      !Array.isArray(raw.conflict_queue)
    ) {
      return emptyPatreonSyncState(siteId);
    }
    return {
      contract_version: PATREON_SYNC_STATE_CONTRACT,
      site_id: siteId,
      production_safe: false,
      updated_at:
        typeof raw.updated_at === "string"
          ? raw.updated_at
          : new Date().toISOString(),
      last_sync_at:
        typeof raw.last_sync_at === "string" ? raw.last_sync_at : null,
      last_status:
        raw.last_status === "ok" ||
        raw.last_status === "degraded" ||
        raw.last_status === "failed" ||
        raw.last_status === "never"
          ? raw.last_status
          : "never",
      last_error:
        typeof raw.last_error === "string" ? raw.last_error : null,
      posts: raw.posts as Record<string, SyncPostTracking>,
      conflict_queue: raw.conflict_queue as SyncConflictItem[]
    };
  } catch {
    return emptyPatreonSyncState(siteId);
  }
}

export function savePatreonSyncState(
  doc: PatreonSyncStateDocument,
  kitDir = process.cwd()
): void {
  const normalized: PatreonSyncStateDocument = {
    ...doc,
    contract_version: PATREON_SYNC_STATE_CONTRACT,
    production_safe: false,
    updated_at: new Date().toISOString()
  };
  mkdirSync(join(kitDir, "data"), { recursive: true });
  writeFileSync(
    statePath(kitDir),
    `${JSON.stringify(normalized, null, 2)}\n`,
    "utf8"
  );
}

export function isProtectedSyncPost(
  tracking: SyncPostTracking | undefined
): boolean {
  if (!tracking) return false;
  return (
    tracking.origin === "native" ||
    tracking.origin === "crossposted" ||
    tracking.locally_edited
  );
}

/** Mark a CMS save as local-edit protected (EH-063). */
export function markPostLocallyEdited(
  siteId: string,
  postId: string,
  opts?: { created?: boolean; kitDir?: string }
): void {
  const kitDir = opts?.kitDir ?? process.cwd();
  const doc = loadPatreonSyncState(siteId, kitDir);
  const prior = doc.posts[postId];
  doc.posts[postId] = {
    origin: prior?.origin ?? (opts?.created ? "native" : "native"),
    locally_edited: true,
    upstream_id: prior?.upstream_id ?? null,
    upstream_revision: prior?.upstream_revision ?? null
  };
  // Keep imported origin if already imported
  if (prior?.origin === "imported" || prior?.origin === "crossposted") {
    doc.posts[postId]!.origin = prior.origin;
  }
  savePatreonSyncState(doc, kitDir);
}

/** Mark a Relay Crosspost ingest as origin=crossposted (EH-064). */
export function markPostCrossposted(
  siteId: string,
  postId: string,
  opts: {
    upstream_id: string;
    upstream_revision?: string | null;
    kitDir?: string;
  }
): void {
  const kitDir = opts.kitDir ?? process.cwd();
  const doc = loadPatreonSyncState(siteId, kitDir);
  const prior = doc.posts[postId];
  doc.posts[postId] = {
    origin: "crossposted",
    locally_edited: prior?.locally_edited ?? false,
    upstream_id: opts.upstream_id,
    upstream_revision:
      opts.upstream_revision !== undefined
        ? opts.upstream_revision
        : (prior?.upstream_revision ?? null)
  };
  savePatreonSyncState(doc, kitDir);
}

export function conflictCount(doc: PatreonSyncStateDocument): number {
  return doc.conflict_queue.length;
}
