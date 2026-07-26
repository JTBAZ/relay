/**
 * PE-K (BO-P2-05) — Idempotency store.
 *
 * @fileoverview Idempotency reservation/record contract and bounded in-memory implementation.
 *
 * Contract used by `idempotency-middleware.ts` to safely replay mutating requests when the
 * caller passes an `Idempotency-Key` header (RFC draft `idempotency-key-header-01`).
 *
 * Lifecycle per key:
 *   1. tryReserve(key, ttl) — atomic. Returns "fresh" the first time, "in_flight" if another
 *      request is currently executing under the same key, or "replay" if a final response is
 *      already cached.
 *   2. recordResponse(key, snapshot, ttl) — caller stores the final response after success or
 *      after a deterministic 4xx so a retry returns the same body + status.
 *   3. getResponse(key) — replay path; returns the recorded snapshot or null.
 *   4. release(key) — releases the in-flight lock without recording a response (used when the
 *      handler throws and we don't want to cache a 5xx).
 *
 * # Why an interface?
 *
 * Today single-node deploys are fine with an in-memory `Map`. A multi-node future (or BullMQ
 * adoption for PE-G) needs a shared store -- typically Redis (`SETNX` + `EXPIRE`). By keeping
 * the interface async and side-effect-free, the swap is one DI line in `src/server.ts`. See
 * the comment at the top of `InMemoryIdempotencyStore` for the Redis swap recipe.
 *
 * # Why not raw `Map`?
 *
 * - We need a TTL with bounded memory growth (deploys can stay up for weeks).
 * - We need an in-flight lock so concurrent retries serialize instead of double-executing.
 * - We need an LRU cap so a misbehaving caller can't OOM the process by cycling random keys.
 *
 * # What this is NOT
 *
 * - Not request-body fingerprinting. The middleware only verifies the body matches the
 *   originally-recorded body for the same key (cheap hash); divergent bodies under the same key
 *   are rejected with 422 to surface client bugs early.
 * - Not a queue. Long-running operations should not block on `tryReserve`; they should accept
 *   the in-flight verdict and 409 the second caller.
 */

export interface IdempotencyResponseSnapshot {
  status: number;
  /** Response body the route emitted (typically the success/error envelope). */
  body: unknown;
  /** Subset of headers worth replaying; we deliberately do not echo Set-Cookie. */
  headers: Record<string, string>;
  /** SHA-256 of the canonicalized request body at original-execution time. */
  bodyHash: string;
  /** Wall-clock ms when this snapshot was recorded; used for staleness calculations. */
  recordedAt: number;
}

export type ReserveOutcome =
  | { state: "fresh" }
  | { state: "in_flight" }
  | { state: "replay"; snapshot: IdempotencyResponseSnapshot };

/**
 * Storage contract. All methods are async so the same shape can be backed by Redis later
 * without touching call sites.
 */
export interface IdempotencyStore {
  /**
   * Reserve a slot for `key`.
   *
   * - "fresh" -> caller proceeds with the operation; MUST eventually call `recordResponse` or `release`.
   * - "in_flight" -> another request currently holds the lock; caller should 409.
   * - "replay" -> the snapshot already exists; caller MUST replay it (after body-hash check).
   */
  tryReserve(key: string, lockTtlMs: number): Promise<ReserveOutcome>;
  /** Persist the final response and TTL it. Releases the in-flight lock implicitly. */
  recordResponse(
    key: string,
    snapshot: IdempotencyResponseSnapshot,
    responseTtlMs: number
  ): Promise<void>;
  /** Read-only fetch of an existing snapshot (used after a fresh reserve loses a race). */
  getResponse(key: string): Promise<IdempotencyResponseSnapshot | null>;
  /** Release an in-flight lock without recording (used when the handler throws). */
  release(key: string): Promise<void>;
}

interface MemoryEntry {
  /** When set, request is in-flight. Wall-clock ms when the lock auto-expires. */
  lockedUntil?: number;
  /** When set, response has been recorded. */
  snapshot?: IdempotencyResponseSnapshot;
  /** Wall-clock ms when the SNAPSHOT expires (independent from lockedUntil). */
  snapshotExpiresAt?: number;
}

/**
 * In-memory `Map`-backed store with bounded LRU eviction and TTL.
 *
 * # Multi-node story
 *
 * This implementation is per-process. If `Idempotency-Key: abc` lands on node A and a retry
 * lands on node B, node B will see no record and re-execute. That's acceptable today because
 * the deploy is single-node; when that changes, swap to a Redis-backed implementation:
 *
 *   - tryReserve  -> Lua script: SETNX lock; if exists -> GET snapshot; else SET lock with PX TTL.
 *   - recordResponse -> SET snapshot with PX responseTtl; DEL lock.
 *   - getResponse -> GET snapshot; JSON.parse.
 *   - release -> DEL lock (no snapshot touched).
 *
 * Same interface, same call sites. No consumer code changes.
 */
export class InMemoryIdempotencyStore implements IdempotencyStore {
  private readonly map = new Map<string, MemoryEntry>();
  /**
   * Hard cap on cached entries. When exceeded we evict the oldest insertion-ordered entry
   * (Map iteration is insertion-ordered in JS), which approximates LRU when keys are written
   * once and read at most once each (typical for idempotency).
   */
  public constructor(private readonly maxEntries = 10_000) {}

  public async tryReserve(key: string, lockTtlMs: number): Promise<ReserveOutcome> {
    const now = Date.now();
    const entry = this.map.get(key);
    if (entry?.snapshot && (entry.snapshotExpiresAt ?? 0) > now) {
      return { state: "replay", snapshot: entry.snapshot };
    }
    if (entry?.lockedUntil && entry.lockedUntil > now) {
      return { state: "in_flight" };
    }
    // Stale entry (expired snapshot or expired lock) is treated as a fresh slot.
    this.touch(key, { lockedUntil: now + lockTtlMs });
    return { state: "fresh" };
  }

  public async recordResponse(
    key: string,
    snapshot: IdempotencyResponseSnapshot,
    responseTtlMs: number
  ): Promise<void> {
    const expiresAt = Date.now() + responseTtlMs;
    // Clear the in-flight lock at the same time we record the snapshot. The operation has
    // finished, so a parallel retry should immediately see "replay" rather than waiting for
    // the lock TTL to lapse.
    this.touch(key, { snapshot, snapshotExpiresAt: expiresAt, lockedUntil: undefined });
  }

  public async getResponse(key: string): Promise<IdempotencyResponseSnapshot | null> {
    const entry = this.map.get(key);
    if (!entry?.snapshot) return null;
    if ((entry.snapshotExpiresAt ?? 0) <= Date.now()) {
      this.map.delete(key);
      return null;
    }
    return entry.snapshot;
  }

  public async release(key: string): Promise<void> {
    const entry = this.map.get(key);
    if (!entry) return;
    if (entry.snapshot) {
      // Don't clobber a recorded snapshot just because a later request released the lock.
      this.map.set(key, { snapshot: entry.snapshot, snapshotExpiresAt: entry.snapshotExpiresAt });
      return;
    }
    this.map.delete(key);
  }

  /** For tests only — synchronous size accessor. Not part of the interface. */
  public size(): number {
    return this.map.size;
  }

  private touch(key: string, patch: Partial<MemoryEntry>): void {
    const existing = this.map.get(key) ?? {};
    // Re-insert to move to the tail (insertion-order LRU approximation).
    this.map.delete(key);
    this.map.set(key, { ...existing, ...patch });
    if (this.map.size > this.maxEntries) {
      const firstKey = this.map.keys().next().value;
      if (firstKey !== undefined) this.map.delete(firstKey);
    }
  }
}
