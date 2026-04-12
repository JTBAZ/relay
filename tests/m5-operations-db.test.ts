import { describe, expect, it, vi } from "vitest";
import { DbDeadLetterQueue } from "../src/ingest/dlq-db.js";
import { DbEventBus } from "../src/events/event-bus-db.js";

describe("DbDeadLetterQueue", () => {
  it("upserts ingest_dlq rows from DeadLetterRecord", async () => {
    const upsert = vi.fn().mockResolvedValue({});
    const findMany = vi.fn().mockResolvedValue([]);
    const count = vi.fn().mockResolvedValue(0);
    const prisma = {
      jobRun: { upsert, findMany, count }
    };
    const q = new DbDeadLetterQueue(prisma as never);
    await q.append({
      job_id: "job_1",
      creator_id: "cr_1",
      trace_id: "tr_1",
      error_message: "boom",
      attempts: 3,
      failed_at: "2026-04-10T12:00:00.000Z",
      batch: { creator_id: "cr_1", posts: [] }
    });
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "job_1" },
        create: expect.objectContaining({
          kind: "ingest_dlq",
          status: "dead_letter",
          creatorId: "cr_1"
        })
      })
    );
    await q.readAll();
    expect(findMany).toHaveBeenCalled();
    await q.count();
    expect(count).toHaveBeenCalled();
  });
});

describe("DbEventBus", () => {
  it("publish buffers for getAll and triggers async outbox insert", async () => {
    const create = vi.fn().mockResolvedValue({});
    const prisma = { outboxEvent: { create } };
    const bus = new DbEventBus(prisma as never);
    const ev = bus.publish("test_evt", "tenant_a", "trace_x", {
      primary_id: "p1",
      foo: 1
    });
    expect(ev.event_name).toBe("test_evt");
    expect(bus.getAll()).toHaveLength(1);
    await new Promise<void>((r) => setImmediate(() => r()));
    expect(create).toHaveBeenCalled();
  });
});
