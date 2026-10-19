/** @fileoverview Preflight legacy replay evidence and exact operator decisions before applying a batch. */
import type { CanonicalSnapshot } from "./canonical-store.js";
import { getTierExpansionReplayState } from "./auto-enrich.js";
import { ingestIdempotencyKey, legacyIngestIdempotencyKey } from "./idempotency.js";
import type { SyncBatchInput } from "./types.js";

const namespaces = ["ingest_campaign", "ingest_tier", "ingest_post", "ingest_media_rev"] as const;
export type ReplayIdentity = [typeof namespaces[number], string, string, string];
export type ReplayResolution = { parts: ReplayIdentity; action: "already_processed" | "import_once" };
export type ReplayCheck = { key: string; replay: boolean; legacy?: { first_seen_at: string } };

export class IngestReplayConflict extends Error {
  public constructor(public readonly parts: ReplayIdentity, public readonly legacyKey: string) {
    super(`INGEST_REPLAY_CONFLICT: legacy key ${legacyKey} needs an exact-identity operator decision.`);
    this.name = "IngestReplayConflict";
  }
}

/** Operator-only input; public ingestion validation never reads reconciliation decisions. */
export function parseReplayResolutions(value: unknown): ReplayResolution[] {
  if (!Array.isArray(value)) throw new Error("Replay resolutions must be an array.");
  return value.map((entry) => {
    if (!entry || typeof entry !== "object" || !Array.isArray(entry.parts) || entry.parts.length !== 4 ||
      !entry.parts.every((part: unknown) => typeof part === "string") ||
      !namespaces.includes(entry.parts[0]) || !["already_processed", "import_once"].includes(entry.action)) {
      throw new Error("Each replay resolution needs four exact identity fields and a valid action.");
    }
    return { parts: [...entry.parts] as ReplayIdentity, action: entry.action };
  });
}

function hasExactEvidence(snapshot: CanonicalSnapshot, [namespace, creatorId, id, revision]: ReplayIdentity): boolean {
  switch (namespace) {
    case "ingest_campaign": {
      if (snapshot.legacy_timestamps_normalized) return false;
      const row = snapshot.campaigns[creatorId]?.[id];
      return row?.creator_id === creatorId && row.upstream_updated_at === revision;
    }
    case "ingest_tier": {
      if (snapshot.legacy_timestamps_normalized) return false;
      const row = snapshot.tiers[creatorId]?.[id];
      return row?.creator_id === creatorId && row.upstream_updated_at === revision;
    }
    case "ingest_post": {
      const row = snapshot.posts[creatorId]?.[id];
      return row?.creator_id === creatorId && row.source !== "RELAY" &&
        (row.current.upstream_revision === revision || row.versions.some((version) => version.upstream_revision === revision));
    }
    case "ingest_media_rev": {
      const row = snapshot.media[creatorId]?.[id];
      return row?.creator_id === creatorId &&
        (row.current.upstream_revision === revision || row.versions.some((version) => version.upstream_revision === revision));
    }
  }
}

/** Resolve every potentially applied identity before snapshot mutations or event publication. */
export function prepareReplayChecks(
  snapshot: CanonicalSnapshot,
  batch: SyncBatchInput,
  resolutions: ReplayResolution[]
): Map<string, ReplayCheck> {
  const decisions = new Map<string, ReplayResolution>();
  for (const resolution of parseReplayResolutions(resolutions)) {
    const key = ingestIdempotencyKey(resolution.parts);
    if (resolution.parts[1] !== batch.creator_id || decisions.has(key)) {
      throw new Error("Replay resolutions must be unique and belong to the batch creator.");
    }
    decisions.set(key, resolution);
  }
  const checks = new Map<string, ReplayCheck>();
  const check = (parts: ReplayIdentity): ReplayCheck => {
    const key = ingestIdempotencyKey(parts);
    const known = checks.get(key);
    if (known) return known;
    const legacyKey = legacyIngestIdempotencyKey(parts);
    const legacy = snapshot.ingest_idempotency[legacyKey];
    let result: ReplayCheck = { key, replay: !!snapshot.ingest_idempotency[key] };
    if (decisions.has(key) && !result.replay && !legacy) {
      throw new Error("A replay resolution requires an existing legacy marker or completed v2 identity.");
    }
    if (!result.replay && legacy) {
      if (parts.every((part) => !part.includes("|")) || hasExactEvidence(snapshot, parts) ||
        decisions.get(key)?.action === "already_processed") {
        result = { key, replay: true, legacy };
      } else if (decisions.get(key)?.action !== "import_once") {
        throw new IngestReplayConflict(parts, legacyKey);
      }
    }
    checks.set(key, result);
    return result;
  };
  const creatorId = batch.creator_id;
  for (const c of batch.campaigns ?? []) check(["ingest_campaign", creatorId, c.campaign_id, c.upstream_updated_at]);
  for (const t of batch.tiers ?? []) check(["ingest_tier", creatorId, t.tier_id, t.upstream_updated_at]);
  const potentiallyChangedPosts = new Set<string>();
  for (const post of batch.posts ?? []) {
    const parts: ReplayIdentity = ["ingest_post", creatorId, post.post_id, post.upstream_revision];
    const expansion = getTierExpansionReplayState(post, snapshot.posts[creatorId]?.[post.post_id]);
    let replay: boolean;
    if (expansion === "replay") {
      const key = ingestIdempotencyKey(parts);
      checks.set(key, { key, replay: true });
      replay = true;
    } else {
      replay = check(parts).replay && expansion !== "changed";
    }
    if (!replay || potentiallyChangedPosts.has(post.post_id)) {
      potentiallyChangedPosts.add(post.post_id);
      for (const media of post.media) check(["ingest_media_rev", creatorId, media.media_id, media.upstream_revision]);
    }
  }
  if ([...decisions.keys()].some((key) => !checks.has(key))) {
    throw new Error("Replay resolutions must match identities processed by this batch.");
  }
  return checks;
}
