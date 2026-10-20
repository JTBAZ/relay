import type { PrismaClient } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import { DbEventBus } from "../src/events/event-bus-db.js";
import type { CanonicalSnapshot, CanonicalStore } from "../src/ingest/canonical-store.js";
import { IngestService } from "../src/ingest/ingest-service.js";
import { IngestOwnershipConflict } from "../src/ingest/ownership-conflict.js";
import { IngestReplayConflict } from "../src/ingest/replay-compatibility.js";
import { legacyIngestIdempotencyKey } from "../src/ingest/idempotency.js";
import type { SyncBatchInput } from "../src/ingest/types.js";

const empty = (): CanonicalSnapshot => ({ campaigns: {}, tiers: {}, posts: {}, media: {}, ingest_idempotency: {} });
const batch = (creatorId = "creator1", prefix = "patreon"): SyncBatchInput => ({
  creator_id: creatorId,
  posts: ["one", "two"].map((label) => ({
    post_id: `${prefix}_post_${label}`, upstream_revision: "r1", title: label,
    published_at: "2026-10-01T00:00:00.000Z", tag_ids: ["art"], tier_ids: ["paid"],
    media: [{ media_id: `${prefix}_media_${label}`, upstream_revision: "m1" }]
  }))
});

function setup() {
  const state = { committed: empty() };
  const mutate = vi.fn<CanonicalStore["mutateForCreator"]>(async (_id, fn) => {
    const draft = structuredClone(state.committed);
    await fn(draft);
    state.committed = draft;
  });
  const create = vi.fn().mockResolvedValue({});
  const bus = new DbEventBus({ outboxEvent: { create } } as unknown as PrismaClient);
  const service = new IngestService({ mutateForCreator: mutate } as unknown as CanonicalStore, bus);
  return { state, mutate, create, bus, service };
}

function gate() {
  let open!: () => void;
  const promise = new Promise<void>((resolve) => { open = resolve; });
  return { promise, open };
}

describe("PS-05 publication after canonical saving", () => {
  it.each(["before application", "during save", "at commit"])("publishes nothing when rejected %s", async (stage) => {
    const run = setup();
    const failure = new Error(stage);
    const applying = gate();
    const commit = gate();
    run.mutate.mockImplementationOnce(async (_id, fn) => {
      if (stage === "before application") throw failure;
      await fn(structuredClone(run.state.committed));
      applying.open();
      if (stage === "at commit") await commit.promise;
      throw failure;
    });
    const operation = run.service.runBatch(batch(), "failed-trace");
    const rejected = expect(operation).rejects.toBe(failure);
    if (stage === "at commit") {
      await applying.promise;
      const beforeCommit = { events: run.bus.getAll(), writes: run.create.mock.calls.length };
      commit.open();
      await rejected;
      expect(beforeCommit).toEqual({ events: [], writes: 0 });
    } else {
      await rejected;
    }
    expect(run.bus.getAll()).toEqual([]);
    expect(run.create).not.toHaveBeenCalled();
    expect(run.state.committed).toEqual(empty());
  });

  it.each(["patreon", "substar"])("publishes %s events in order with their existing payloads after commit", async (source) => {
    const run = setup();
    const input = batch("creator1", source);
    const applying = gate();
    const commit = gate();
    run.mutate.mockImplementationOnce(async (_id, fn) => {
      const draft = structuredClone(run.state.committed);
      await fn(draft);
      applying.open();
      await commit.promise;
      run.state.committed = draft;
    });
    const operation = run.service.runBatch(input, "accepted-trace", "accepted-job");
    await applying.promise;
    const beforeCommit = { events: run.bus.getAll(), writes: run.create.mock.calls.length };
    commit.open();
    expect(await operation).toMatchObject({ job_id: "accepted-job", posts_written: 2, media_upserted: 2, events_emitted: 2 });
    expect(beforeCommit).toEqual({ events: [], writes: 0 });
    const events = run.bus.getAll();
    expect(events).toHaveLength(2);
    input.posts!.forEach((post, index) => {
      expect(run.state.committed.posts.creator1![post.post_id]).toBeDefined();
      expect(events[index]).toMatchObject({ event_name: "post_published", producer: "ingestion-service",
        tenant_id: "creator1", trace_id: "accepted-trace", version: "1.0",
        payload: { primary_id: post.post_id, post_id: post.post_id, creator_id: "creator1",
          published_at: post.published_at, title: post.title, tag_ids: post.tag_ids,
          tier_ids: post.tier_ids, media_ids: post.media.map((media) => media.media_id) } });
      expect(events[index]!.event_id).toMatch(/^evt_/);
      expect(Number.isFinite(Date.parse(events[index]!.occurred_at))).toBe(true);
      expect(run.create.mock.calls[index]![0].data).toMatchObject({ eventId: events[index]!.event_id,
        eventName: "post_published", primaryId: post.post_id, producer: "ingestion-service",
        tenantId: "creator1", traceId: "accepted-trace", payload: events[index]!.payload });
    });
    expect(run.create).toHaveBeenCalledTimes(2);
  });

  it("publishes only the successful retry and emits nothing for a committed replay", async () => {
    const run = setup();
    run.mutate.mockImplementationOnce(async (_id, fn) => {
      await fn(empty());
      throw new Error("save failed");
    });
    await expect(run.service.runBatch(batch(), "retry-trace", "retry-job")).rejects.toThrow("save failed");
    expect(run.create).not.toHaveBeenCalled();
    expect(await run.service.runBatch(batch(), "retry-trace", "retry-job")).toMatchObject({ events_emitted: 2, posts_written: 2 });
    expect(await run.service.runBatch(batch(), "replay-trace", "retry-job")).toMatchObject({ events_emitted: 0, posts_written: 0 });
    expect(run.bus.getAll()).toHaveLength(2);
    expect(run.create).toHaveBeenCalledTimes(2);
  });

  it("discards events collected before an ownership rejection", async () => {
    const run = setup();
    const conflict = new IngestOwnershipConflict({ entity_type: "post", entity_id: "foreign", owner_creator_id: "other" });
    run.mutate.mockImplementationOnce(async (_id, fn) => {
      const draft = empty();
      await fn(draft);
      expect(Object.keys(draft.posts.creator1!)).toHaveLength(2);
      throw conflict;
    });
    await expect(run.service.runBatch(batch(), "ownership-trace")).rejects.toBe(conflict);
    expect(run.bus.getAll()).toEqual([]);
    expect(run.create).not.toHaveBeenCalled();
  });

  it("publishes nothing when replay compatibility rejects a later record", async () => {
    const run = setup();
    const input = batch();
    input.posts![1]!.post_id = "ambiguous";
    input.posts![1]!.upstream_revision = "part|r1";
    run.state.committed.ingest_idempotency[legacyIngestIdempotencyKey(["ingest_post", "creator1", "ambiguous", "part|r1"])] = { first_seen_at: "2026-10-01T00:00:00.000Z" };
    await expect(run.service.runBatch(input, "replay-conflict-trace")).rejects.toBeInstanceOf(IngestReplayConflict);
    expect(run.create).not.toHaveBeenCalled();
    expect(run.bus.getAll()).toEqual([]);
    expect(run.state.committed.posts).toEqual({});
  });

  it("keeps overlapping batches' buffers separate when one fails", async () => {
    const run = setup();
    const applying = gate();
    const rollback = gate();
    run.mutate.mockImplementationOnce(async (_id, fn) => {
      await fn(empty());
      applying.open();
      await rollback.promise;
      throw new Error("rolled back");
    });
    const first = expect(run.service.runBatch(batch(), "failed-trace")).rejects.toThrow("rolled back");
    await applying.promise;
    try {
      await run.service.runBatch(batch("creator2", "substar"), "successful-trace");
    } finally {
      rollback.open();
    }
    await first;
    expect(run.bus.getAll()).toHaveLength(2);
    expect(run.bus.getAll().every((event) => event.tenant_id === "creator2" && event.trace_id === "successful-trace")).toBe(true);
    expect(run.create).toHaveBeenCalledTimes(2);
  });

  it.each(["P2002", "P1001"])("retains DbEventBus asynchronous failure handling for %s after commit", async (code) => {
    const run = setup();
    const failure = { code };
    run.create.mockRejectedValue(failure);
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      expect(await run.service.runBatch(batch(), "delivery-trace")).toMatchObject({ events_emitted: 2 });
      await Promise.resolve();
      expect(run.bus.getAll()).toHaveLength(2);
      expect(Object.keys(run.state.committed.posts.creator1!)).toHaveLength(2);
      if (code === "P2002") expect(log).not.toHaveBeenCalled();
      else expect(log).toHaveBeenCalledWith("DbEventBus: outbox insert failed", failure);
    } finally { log.mockRestore(); }
  });

  it("propagates synchronous publish failure after commit; replay does not recover unpublished events", async () => {
    const run = setup();
    const publish = run.bus.publish.bind(run.bus);
    vi.spyOn(run.bus, "publish").mockImplementationOnce(publish).mockImplementationOnce(() => { throw new Error("delivery failed"); });
    await expect(run.service.runBatch(batch(), "delivery-trace")).rejects.toThrow("delivery failed");
    expect(Object.keys(run.state.committed.posts.creator1!)).toHaveLength(2);
    expect(run.bus.getAll()).toHaveLength(1);
    expect(await run.service.runBatch(batch(), "retry-trace")).toMatchObject({ events_emitted: 0 });
    expect(run.create).toHaveBeenCalledTimes(1);
  });
});
