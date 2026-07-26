/**
 * @fileoverview Per-key async serialization: parallel calls for the same key run sequentially.
 * @description Used to align webhook-triggered scrapes with incremental sync (Patreon campaign key).
 * @see src/patreon/incremental-sync-worker.ts Potential consumer of exclusive runners
 */

/**
 * @description Factory returning a runner that chains promises per trimmed string key.
 * @returns {<T>(key: string, fn: () => Promise<T>) => Promise<T>} Exclusive runner function.
 */
export function createExclusivePerKeyRunner(): <T>(
  key: string,
  fn: () => Promise<T>
) => Promise<T> {
  const tails = new Map<string, Promise<unknown>>();
  return <T>(key: string, fn: () => Promise<T>): Promise<T> => {
    const id = key.trim();
    if (!id) {
      return fn();
    }
    const prev = tails.get(id) ?? Promise.resolve();
    const next = prev.catch(() => {}).then(fn) as Promise<T>;
    tails.set(id, next);
    return next;
  };
}
