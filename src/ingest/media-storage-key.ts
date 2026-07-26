/**
 * @fileoverview Mutates canonical snapshot media rows with materialized `storage_key` (MIG-31).
 * @description Used when upstream supplies or backfills object storage keys on a media version.
 * @see ./canonical-store.js
 */

import type { CanonicalSnapshot } from "./canonical-store.js";

/**
 * @param {CanonicalSnapshot} snapshot
 * @param {string} creatorId
 * @param {string} mediaId
 * @param {string} storageKey
 * @returns {boolean} False when media row missing.
 */
export function applyStorageKeyToCanonicalSnapshot(
  snapshot: CanonicalSnapshot,
  creatorId: string,
  mediaId: string,
  storageKey: string
): boolean {
  const mmap = snapshot.media[creatorId];
  if (!mmap?.[mediaId]) return false;
  const mr = mmap[mediaId]!;
  mr.current = { ...mr.current, storage_key: storageKey };
  const vi = mr.versions.findIndex((v) => v.version_seq === mr.current.version_seq);
  if (vi >= 0) {
    const v = mr.versions[vi]!;
    mr.versions[vi] = { ...v, storage_key: storageKey };
  }
  return true;
}
