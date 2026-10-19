import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  InMemoryIdempotencyStore,
  type IdempotencyResponseSnapshot
} from "../../src/middleware/idempotency-store.js";

function snap(over?: Partial<IdempotencyResponseSnapshot>): IdempotencyResponseSnapshot {
  return {
    status: 200,
    body: { ok: true },
    headers: { "content-type": "application/json" },
    bodyHash: "h1",
    recordedAt: Date.now(),
    ...over
  };
}

async function acquire(store: InMemoryIdempotencyStore, key: string, ttlMs = 60_000): Promise<string> {
  const reservation = await store.tryReserve(key, ttlMs);
  if (reservation.state !== "fresh") throw new Error(`Expected a fresh reservation for ${key}`);
  return reservation.reservationId;
}

describe("InMemoryIdempotencyStore", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-22T20:00:00.000Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("first tryReserve returns 'fresh' and locks the slot", async () => {
    const store = new InMemoryIdempotencyStore();
    expect(await store.tryReserve("k1", 60_000)).toEqual({ state: "fresh", reservationId: expect.any(String) });
  });

  it("second concurrent tryReserve returns 'in_flight' until lock expires", async () => {
    const store = new InMemoryIdempotencyStore();
    await store.tryReserve("k1", 60_000);
    expect(await store.tryReserve("k1", 60_000)).toEqual({ state: "in_flight" });
  });

  it("lock expires after the lockTtlMs window so retries can recover from a crashed handler", async () => {
    const store = new InMemoryIdempotencyStore();
    await store.tryReserve("k1", 30_000);
    vi.advanceTimersByTime(30_001);
    expect(await store.tryReserve("k1", 30_000)).toMatchObject({ state: "fresh" });
  });

  it("after recordResponse a tryReserve returns 'replay' with the stored snapshot", async () => {
    const store = new InMemoryIdempotencyStore();
    const reservationId = await acquire(store, "k1");
    const s = snap();
    await store.recordResponse("k1", reservationId, s, 1_000);
    const out = await store.tryReserve("k1", 60_000);
    expect(out.state).toBe("replay");
    if (out.state === "replay") expect(out.snapshot).toEqual(s);
  });

  it("replay snapshot expires after responseTtlMs", async () => {
    const store = new InMemoryIdempotencyStore();
    const reservationId = await acquire(store, "k1");
    await store.recordResponse("k1", reservationId, snap(), 5_000);
    vi.advanceTimersByTime(5_001);
    expect(await store.tryReserve("k1", 60_000)).toMatchObject({ state: "fresh" });
    expect(await store.getResponse("k1")).toBeNull();
    expect(await store.tryReserve("k1", 60_000)).toEqual({ state: "in_flight" });
  });

  it("release unlocks an in-flight slot but preserves a recorded snapshot", async () => {
    const store = new InMemoryIdempotencyStore();
    const reservationId = await acquire(store, "k1");
    await store.recordResponse("k1", reservationId, snap(), 60_000);
    await store.release("k1", reservationId);
    expect(await store.getResponse("k1")).not.toBeNull();
  });

  it("release on lock-only entry deletes the entry so a retry can proceed immediately", async () => {
    const store = new InMemoryIdempotencyStore();
    const reservationId = await acquire(store, "k1");
    await store.release("k1", reservationId);
    expect(await acquire(store, "k1")).not.toBe(reservationId);
  });

  it("evicts the oldest entry once maxEntries is exceeded (insertion-order LRU approximation)", async () => {
    const store = new InMemoryIdempotencyStore(3);
    for (const k of ["a", "b", "c"]) {
      const reservationId = await acquire(store, k);
      await store.recordResponse(k, reservationId, snap(), 60_000);
    }
    expect(store.size()).toBe(3);
    const d = await acquire(store, "d");
    await store.recordResponse("d", d, snap(), 60_000);
    expect(store.size()).toBe(3);
    // 'a' was the oldest insertion; should be the eviction target.
    expect(await store.getResponse("a")).toBeNull();
    expect(await store.getResponse("d")).not.toBeNull();
  });

  it("re-recording the current owner's response moves it to the eviction tail", async () => {
    const store = new InMemoryIdempotencyStore(3);
    const owners = new Map<string, string>();
    for (const k of ["a", "b", "c"]) {
      const reservationId = await acquire(store, k);
      owners.set(k, reservationId);
      await store.recordResponse(k, reservationId, snap(), 60_000);
    }
    // Re-record 'a' to bump it to tail.
    await store.recordResponse("a", owners.get("a")!, snap(), 60_000);
    const d = await acquire(store, "d");
    await store.recordResponse("d", d, snap(), 60_000);
    // 'b' is now the oldest.
    expect(await store.getResponse("b")).toBeNull();
    expect(await store.getResponse("a")).not.toBeNull();
  });

  it("ignores an expired owner's release while the newer owner is running", async () => {
    const store = new InMemoryIdempotencyStore();
    const a = await acquire(store, "k1");
    vi.advanceTimersByTime(60_001);
    const b = await acquire(store, "k1");
    expect(b).not.toBe(a);
    await store.release("k1", a);
    expect(await store.tryReserve("k1", 60_000)).toEqual({ state: "in_flight" });
    await store.release("k1", b);
    expect(await acquire(store, "k1")).not.toBe(b);
  });

  it("ignores stale completion before and after the newer owner records its result", async () => {
    const store = new InMemoryIdempotencyStore();
    const a = await acquire(store, "k1");
    vi.advanceTimersByTime(60_001);
    const b = await acquire(store, "k1");
    const oldResponse = snap({ body: { owner: "A" }, bodyHash: "body-A" });
    const newResponse = snap({ body: { owner: "B" }, bodyHash: "body-B" });
    await store.recordResponse("k1", a, oldResponse, 60_000);
    expect(await store.tryReserve("k1", 60_000)).toEqual({ state: "in_flight" });
    await store.recordResponse("k1", b, newResponse, 60_000);
    await store.recordResponse("k1", a, oldResponse, 60_000);
    await store.release("k1", a);
    expect(await store.tryReserve("k1", 60_000)).toEqual({ state: "replay", snapshot: newResponse });
  });

  it("does not resurrect an evicted reservation or disturb its replacement", async () => {
    const store = new InMemoryIdempotencyStore(1);
    const a = await acquire(store, "k1");
    await acquire(store, "other");
    await store.recordResponse("k1", a, snap(), 60_000);
    expect(store.size()).toBe(1);
    expect(await store.getResponse("k1")).toBeNull();
    const b = await acquire(store, "k1");
    expect(b).not.toBe(a);
    await store.release("k1", a);
    await store.recordResponse("k1", a, snap(), 60_000);
    expect(await store.tryReserve("k1", 60_000)).toEqual({ state: "in_flight" });
  });
});
