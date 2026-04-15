import type { CanonicalSnapshot } from "./canonical-store.js";

/**
 * Attach a materialized **`storage_key`** (export-relative path or future R2 object key) to the
 * current media version in a canonical snapshot (MIG-31).
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
