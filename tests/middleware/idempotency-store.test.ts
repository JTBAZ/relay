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
    expect(await store.tryReserve("k1", 60_000)).toEqual({ state: "fresh" });
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
    expect(await store.tryReserve("k1", 30_000)).toEqual({ state: "fresh" });
  });

  it("after recordResponse a tryReserve returns 'replay' with the stored snapshot", async () => {
    const store = new InMemoryIdempotencyStore();
    await store.tryReserve("k1", 60_000);
    const s = snap();
    await store.recordResponse("k1", s, 1_000);
    const out = await store.tryReserve("k1", 60_000);
    expect(out.state).toBe("replay");
    if (out.state === "replay") expect(out.snapshot).toEqual(s);
  });

  it("replay snapshot expires after responseTtlMs", async () => {
    const store = new InMemoryIdempotencyStore();
    await store.tryReserve("k1", 60_000);
    await store.recordResponse("k1", snap(), 5_000);
    vi.advanceTimersByTime(5_001);
    expect(await store.tryReserve("k1", 60_000)).toEqual({ state: "fresh" });
    expect(await store.getResponse("k1")).toBeNull();
  });

  it("release unlocks an in-flight slot but preserves a recorded snapshot", async () => {
    const store = new InMemoryIdempotencyStore();
    await store.tryReserve("k1", 60_000);
    await store.recordResponse("k1", snap(), 60_000);
    await store.release("k1");
    expect(await store.getResponse("k1")).not.toBeNull();
  });

  it("release on lock-only entry deletes the entry so a retry can proceed immediately", async () => {
    const store = new InMemoryIdempotencyStore();
    await store.tryReserve("k1", 60_000);
    await store.release("k1");
    expect(await store.tryReserve("k1", 60_000)).toEqual({ state: "fresh" });
  });

  it("evicts the oldest entry once maxEntries is exceeded (insertion-order LRU approximation)", async () => {
    const store = new InMemoryIdempotencyStore(3);
    for (const k of ["a", "b", "c"]) {
      await store.tryReserve(k, 60_000);
      await store.recordResponse(k, snap(), 60_000);
    }
    expect(store.size()).toBe(3);
    await store.tryReserve("d", 60_000);
    await store.recordResponse("d", snap(), 60_000);
    expect(store.size()).toBe(3);
    // 'a' was the oldest insertion; should be the eviction target.
    expect(await store.getResponse("a")).toBeNull();
    expect(await store.getResponse("d")).not.toBeNull();
  });

  it("reading a recently-touched key prevents eviction (re-insert moves it to tail)", async () => {
    const store = new InMemoryIdempotencyStore(3);
    for (const k of ["a", "b", "c"]) {
      await store.tryReserve(k, 60_000);
      await store.recordResponse(k, snap(), 60_000);
    }
    // Re-record 'a' to bump it to tail.
    await store.recordResponse("a", snap(), 60_000);
    await store.tryReserve("d", 60_000);
    await store.recordResponse("d", snap(), 60_000);
    // 'b' is now the oldest.
    expect(await store.getResponse("b")).toBeNull();
    expect(await store.getResponse("a")).not.toBeNull();
  });
});
