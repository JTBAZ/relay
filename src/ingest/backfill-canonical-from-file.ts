/**
 * @fileoverview Canonical snapshot backfill + parity helpers from `canonical.json`.
 * @description Uses `DbCanonicalStore.save` semantics; includes sampling helpers for large files.
 * @see ./canonical-store-db.js
 */

import { readFile } from "node:fs/promises";
import type { PrismaClient } from "@prisma/client";
import type { CanonicalSnapshot, PostRow } from "./canonical-store.js";
import { DbCanonicalStore } from "./canonical-store-db.js";

export type CanonicalEntityCounts = {
  campaigns: number;
  tiers: number;
  posts: number;
  media: number;
  ingestIdempotencyKeys: number;
};

/** Count entities in a file snapshot (nested record shapes from `canonical-store.ts`). */
export function countCanonicalSnapshotEntities(
  snapshot: CanonicalSnapshot
): CanonicalEntityCounts {
  let campaigns = 0;
  for (const cmap of Object.values(snapshot.campaigns)) {
    campaigns += Object.keys(cmap).length;
  }
  let tiers = 0;
  for (const tmap of Object.values(snapshot.tiers)) {
    tiers += Object.keys(tmap).length;
  }
  let posts = 0;
  for (const pmap of Object.values(snapshot.posts)) {
    posts += Object.keys(pmap).length;
  }
  let media = 0;
  for (const mmap of Object.values(snapshot.media)) {
    media += Object.keys(mmap).length;
  }
  return {
    campaigns,
    tiers,
    posts,
    media,
    ingestIdempotencyKeys: Object.keys(snapshot.ingest_idempotency).length
  };
}

/** All post rows from snapshot (for sample parity checks). */
export function allPostsFromSnapshot(snapshot: CanonicalSnapshot): PostRow[] {
  const out: PostRow[] = [];
  for (const pmap of Object.values(snapshot.posts)) {
    for (const p of Object.values(pmap)) {
      out.push(p as PostRow);
    }
  }
  return out;
}

/**
 * Deterministic sample: sort `post_id`, take up to `n`.
 * Used to compare file vs DB-loaded snapshots without comparing entire huge maps.
 */
export function samplePostIds(snapshot: CanonicalSnapshot, n: number): string[] {
  const ids = allPostsFromSnapshot(snapshot).map((p) => p.post_id);
  ids.sort();
  return ids.slice(0, Math.max(0, n));
}

export async function loadCanonicalSnapshotFromFile(
  filePath: string
): Promise<CanonicalSnapshot> {
  const raw = await readFile(filePath, "utf8");
  return JSON.parse(raw) as CanonicalSnapshot;
}

export type BackfillCanonicalResult = {
  filePath: string;
  counts: CanonicalEntityCounts;
};

/**
 * Replace Postgres canonical tables with the contents of `canonical.json` (same semantics as
 * `DbCanonicalStore.save` — full replace). Chunking is by **batched post creates** inside one
 * transaction (`DbCanonicalStore` may still OOM on very large snapshots — split file first).
 */
export async function backfillCanonicalFromFile(args: {
  prisma: PrismaClient;
  filePath: string;
}): Promise<BackfillCanonicalResult> {
  const snapshot = await loadCanonicalSnapshotFromFile(args.filePath);
  const counts = countCanonicalSnapshotEntities(snapshot);
  const store = new DbCanonicalStore(args.prisma);
  await store.save(snapshot);
  return { filePath: args.filePath, counts };
}

/**
 * Compare DB-loaded snapshot to file snapshot: entity counts must match; sample `post_id`s
 * must have deep-equal `PostRow` in both (from `posts[creator][id]` maps).
 */
export function compareCanonicalParity(args: {
  fileSnapshot: CanonicalSnapshot;
  dbSnapshot: CanonicalSnapshot;
  sampleSize: number;
}): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  const a = countCanonicalSnapshotEntities(args.fileSnapshot);
  const b = countCanonicalSnapshotEntities(args.dbSnapshot);
  if (a.campaigns !== b.campaigns) {
    errors.push(`campaigns: file=${a.campaigns} db=${b.campaigns}`);
  }
  if (a.tiers !== b.tiers) errors.push(`tiers: file=${a.tiers} db=${b.tiers}`);
  if (a.posts !== b.posts) errors.push(`posts: file=${a.posts} db=${b.posts}`);
  if (a.media !== b.media) errors.push(`media: file=${a.media} db=${b.media}`);
  if (a.ingestIdempotencyKeys !== b.ingestIdempotencyKeys) {
    errors.push(
      `ingest_idempotency: file=${a.ingestIdempotencyKeys} db=${b.ingestIdempotencyKeys}`
    );
  }

  const ids = samplePostIds(args.fileSnapshot, args.sampleSize);
  for (const postId of ids) {
    const filePost = findPostRow(args.fileSnapshot, postId);
    const dbPost = findPostRow(args.dbSnapshot, postId);
    if (!filePost) {
      errors.push(`sample post ${postId}: missing in file snapshot`);
      continue;
    }
    if (!dbPost) {
      errors.push(`sample post ${postId}: missing in db snapshot`);
      continue;
    }
    if (JSON.stringify(filePost) !== JSON.stringify(dbPost)) {
      errors.push(`sample post ${postId}: JSON mismatch`);
    }
  }

  return { ok: errors.length === 0, errors };
}

function findPostRow(snapshot: CanonicalSnapshot, postId: string): PostRow | null {
  for (const pmap of Object.values(snapshot.posts)) {
    const p = pmap[postId] as PostRow | undefined;
    if (p) return p;
  }
  return null;
}
