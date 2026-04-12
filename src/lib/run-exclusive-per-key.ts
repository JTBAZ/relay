/**
 * Chains async work by key so that for a given key, jobs run one after another
 * (even if callers invoke in parallel). Different keys run independently.
 * Used to align webhook-triggered scrapes with unattended incremental sync.
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
