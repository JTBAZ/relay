import { describe, expect, it } from "vitest";
import { Queue } from "bullmq";
import { Redis } from "ioredis";
import { registerRelayBullMqRepeatSchedulers } from "../src/jobs/schedule-bullmq-repeat.js";
import { RELAY_JOB_QUEUE_NAMES } from "../src/jobs/queue-names.js";
import { relayBullMqIoredisOptions } from "../src/jobs/bullmq-shared.js";

const runRedisIt =
  process.env.SKIP_REDIS_IT === "0" && Boolean(process.env.REDIS_URL?.trim());

describe.skipIf(!runRedisIt)(
  "BullMQ repeat scheduler registration (integration)",
  () => {
    it("creates relay-tick repeatable for autosync at RELAY_PATREON_INCREMENTAL_AUTOSYNC_MS", async () => {
      const url = process.env.REDIS_URL!.trim();
      const env = {
        ...process.env,
        REDIS_URL: url,
        RELAY_JOB_BACKEND: "bullmq",
        RELAY_PATREON_INCREMENTAL_AUTOSYNC_MS: "10000"
      };
      const redis = new Redis(relayBullMqIoredisOptions(env));
      const closeSchedulers = await registerRelayBullMqRepeatSchedulers({
        redis,
        prisma: null,
        env
      });
      const q = new Queue(RELAY_JOB_QUEUE_NAMES.PATREON_INCREMENTAL_AUTOSYNC, {
        connection: redis
      });
      try {
        const reps = await q.getRepeatableJobs();
        const tick = reps.find((r) => r.name === "relay-tick");
        expect(tick).toBeDefined();
        expect(Number(tick?.every)).toBe(10_000);
        for (const r of await q.getRepeatableJobs()) {
          await q.removeRepeatableByKey(r.key);
        }
      } finally {
        await q.close();
        await closeSchedulers();
        await redis.quit();
      }
    });
  }
);
