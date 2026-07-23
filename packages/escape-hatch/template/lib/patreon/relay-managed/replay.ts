/**
 * Replay protection for Relay assertions (EH-041) — process-local jti store.
 */

export type AssertionReplayStore = {
  /** Returns false if jti already consumed. */
  consume(jti: string, expiresAtMs: number): boolean;
};

export function createMemoryAssertionReplayStore(): AssertionReplayStore {
  const seen = new Map<string, number>();
  return {
    consume(jti, expiresAtMs) {
      const now = Date.now();
      for (const [k, exp] of seen) {
        if (exp < now) seen.delete(k);
      }
      if (seen.has(jti)) return false;
      seen.set(jti, expiresAtMs);
      return true;
    }
  };
}

/** Shared preview store for adapter/routes until durable store is wired. */
export const previewAssertionReplayStore = createMemoryAssertionReplayStore();
