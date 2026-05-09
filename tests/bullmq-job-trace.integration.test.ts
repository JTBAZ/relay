import { describe, expect, it, vi } from "vitest";
import { Queue, Worker } from "bullmq";
import { Redis } from "ioredis";
import { relayJobTraceIdForProcessing } from "../src/jobs/relay-job-trace.js";
import { RELAY_JOB_QUEUE_NAMES } from "../src/jobs/queue-names.js";
import { relayBullMqIoredisOptions } from "../src/jobs/bullmq-shared.js";

const runRedisIt =
  process.env.SKIP_REDIS_IT === "0" && Boolean(process.env.REDIS_URL?.trim());

function waitFor(cond: () => boolean, ms: number): Promise<void> {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const t = setInterval(() => {
      if (cond()) {
        clearInterval(t);
        resolve();
      } else if (Date.now() - start > ms) {
        clearInterval(t);
        reject(new Error("timeout waiting for condition"));
      }
    }, 20);
  });
}

describe.skipIf(!runRedisIt)("BullMQ job traceId (integration)", () => {
  it("processor log includes synthesized job_ traceId when payload omits traceId", async () => {
    const url = process.env.REDIS_URL!.trim();
    const env = { ...process.env, REDIS_URL: url };
    const redis = new Redis(relayBullMqIoredisOptions(env));
    const log = vi.fn();
    const qName = RELAY_JOB_QUEUE_NAMES.NOTIFICATION_DELIVERY;
    const worker = new Worker(
      qName,
      async (job) => {
        const traceId = relayJobTraceIdForProcessing(job.data);
        log("processor", { traceId, jobId: job.id });
      },
      { connection: redis }
    );
    await new Promise<void>((resolve) => {
      worker.once("ready", () => resolve());
    });
    const queue = new Queue(qName, { connection: redis });
    try {
      await queue.add("one-shot", {});
      await waitFor(() => log.mock.calls.length > 0, 15_000);
      expect(log).toHaveBeenCalledWith(
        "processor",
        expect.objectContaining({
          traceId: expect.stringMatching(
            /^job_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
          ),
          jobId: expect.any(String)
        })
      );
    } finally {
      await worker.close();
      await queue.close();
      await redis.quit();
    }
  });
});
