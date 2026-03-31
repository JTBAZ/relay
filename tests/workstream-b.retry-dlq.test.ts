import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { FileDeadLetterQueue } from "../src/ingest/dlq.js";
import { IngestRetryQueue } from "../src/ingest/retry-queue.js";

describe("Workstream B retry and DLQ", () => {
  it("exhausts retries and records dead-letter entry", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "relay-b-dlq-"));
    const dlq = new FileDeadLetterQueue(join(tempDir, "dlq.json"));
    let attempts = 0;
    const runBatch = vi.fn(async () => {
      attempts += 1;
      throw new Error("upstream unavailable");
    });

    const queue = new IngestRetryQueue(
      { max_attempts: 3, base_delay_ms: 0 },
      runBatch,
      dlq,
      async () => {}
    );

    queue.enqueue({
      id: "job_fail",
      creator_id: "creator_123",
      trace_id: "trace_x",
      batch: { creator_id: "creator_123", posts: [] },
      attempts: 0
    });
    await queue.drain();

    expect(attempts).toBe(3);
    expect(runBatch).toHaveBeenCalledTimes(3);
    const dead = await dlq.readAll();
    expect(dead).toHaveLength(1);
    expect(dead[0].job_id).toBe("job_fail");
    expect(dead[0].attempts).toBe(3);
  });
});
