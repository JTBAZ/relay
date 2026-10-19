/**
 * PE-K (BO-P2-05) — Idempotency store.
 *
 * @fileoverview Idempotency reservation/record contract and bounded in-memory implementation.
 *
 * Contract used by `idempotency-middleware.ts` to safely replay mutating requests when the
 * caller passes an `Idempotency-Key` header (RFC draft `idempotency-key-header-01`).
 *
 * Lifecycle per key:
 *   1. tryReserve(key, ttl) — atomic. Returns "fresh" with a reservation id, "in_flight" if another
 *      request is currently executing under the same key, or "replay" if a final response is
 *      already cached.
 *   2. recordResponse(key, reservationId, snapshot, ttl) — the current owner stores the response after success or
 *      after a deterministic 4xx so a retry returns the same body + status.
 *   3. getResponse(key) — replay path; returns the recorded snapshot or null.
 *   4. release(key, reservationId) — the current owner releases the lock without recording a response (used when the
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

import { randomUUID } from "node:crypto";

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
  | { state: "fresh"; reservationId: string }
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
  /** Persist the response and release the lock only if this request still owns the reservation. */
  recordResponse(
    key: string,
    reservationId: string,
    snapshot: IdempotencyResponseSnapshot,
    responseTtlMs: number
  ): Promise<void>;
  /** Read-only fetch of an existing snapshot (used after a fresh reserve loses a race). */
  getResponse(key: string): Promise<IdempotencyResponseSnapshot | null>;
  /** Release an owned in-flight lock without removing a completed response. */
  release(key: string, reservationId: string): Promise<void>;
}

interface MemoryEntry {
  reservationId: string;
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
 *   - recordResponse -> compare reservation id, then SET snapshot with PX responseTtl; DEL lock.
 *   - getResponse -> GET snapshot; JSON.parse.
 *   - release -> compare reservation id, then DEL lock (no snapshot touched).
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
    // Replace expired state so an older snapshot cannot survive in a new reservation.
    const reservationId = randomUUID();
    this.touch(key, { reservationId, lockedUntil: now + lockTtlMs });
    return { state: "fresh", reservationId };
  }

  public async recordResponse(
    key: string,
    reservationId: string,
    snapshot: IdempotencyResponseSnapshot,
    responseTtlMs: number
  ): Promise<void> {
    const entry = this.map.get(key);
    if (!entry || entry.reservationId !== reservationId) return;
    const expiresAt = Date.now() + responseTtlMs;
    // Clear the in-flight lock at the same time we record the snapshot. The operation has
    // finished, so a parallel retry should immediately see "replay" rather than waiting for
    // the lock TTL to lapse.
    this.touch(key, { reservationId, snapshot, snapshotExpiresAt: expiresAt });
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

  public async release(key: string, reservationId: string): Promise<void> {
    const entry = this.map.get(key);
    if (!entry || entry.reservationId !== reservationId || entry.snapshot) return;
    this.map.delete(key);
  }

  /** For tests only — synchronous size accessor. Not part of the interface. */
  public size(): number {
    return this.map.size;
  }

  private touch(key: string, entry: MemoryEntry): void {
    // Re-insert to move to the tail (insertion-order LRU approximation).
    this.map.delete(key);
    this.map.set(key, entry);
    if (this.map.size > this.maxEntries) {
      const firstKey = this.map.keys().next().value;
      if (firstKey !== undefined) this.map.delete(firstKey);
    }
  }
}
