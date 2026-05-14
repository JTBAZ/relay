import type { PrismaClient } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Worker } from "bullmq";
import { Redis } from "ioredis";
import type { PatreonClient } from "../src/auth/patreon-client.js";
import type { PatreonTokenStore } from "../src/auth/token-store.js";
import type { TokenEncryption } from "../src/lib/crypto.js";
import type { PatreonSyncService } from "../src/patreon/patreon-sync-service.js";
import type { IngestService } from "../src/ingest/ingest-service.js";
import { registerRelayBullMqWorkers } from "../src/jobs/register-workers.js";
import { RELAY_JOB_QUEUE_NAMES } from "../src/jobs/queue-names.js";

const hoisted = vi.hoisted(() => ({
  workerCalls: [] as { name: string; opts: Record<string, unknown> }[],
  redisInstances: [] as { quit: ReturnType<typeof vi.fn> }[]
}));

vi.mock("ioredis", () => {
  const RedisMock = vi.fn().mockImplementation(() => {
    const inst = { quit: vi.fn().mockResolvedValue("OK") };
    hoisted.redisInstances.push(inst);
    return inst;
  });
  return { Redis: RedisMock, default: RedisMock };
});

vi.mock("bullmq", () => ({
  Worker: vi.fn((name: string, _processor: unknown, opts: Record<string, unknown>) => {
    hoisted.workerCalls.push({ name, opts });
    return {
      name,
      on: vi.fn(),
      close: vi.fn().mockResolvedValue(undefined)
    };
  })
}));

const WorkerMock = vi.mocked(Worker);
/** Mocked constructor from `vi.mock("ioredis")`. */
const RedisConstructor = vi.mocked(Redis);

describe("registerRelayBullMqWorkers", () => {
  const env = {
    REDIS_URL: "redis://localhost:6379",
    RELAY_BULLMQ_CONCURRENCY_NOTIFICATION_DELIVERY: "4"
  };

  beforeEach(() => {
    hoisted.workerCalls.length = 0;
    hoisted.redisInstances.length = 0;
    WorkerMock.mockClear();
    RedisConstructor.mockClear();
  });

  function minimalDeps(overrides?: {
    prisma?: PrismaClient | null;
    redisConnection?: Redis;
    log?: (msg: string, ctx?: Record<string, unknown>) => void;
  }) {
    return {
      prisma: (overrides?.prisma ?? ({} as PrismaClient)) as PrismaClient,
      tokenStore: {} as PatreonTokenStore,
      patreonSyncService: {} as PatreonSyncService,
      encryption: {} as TokenEncryption,
      patreonClient: {} as PatreonClient,
      ingestService: {} as IngestService,
      fetchImpl: globalThis.fetch,
      env,
      ...overrides
    };
  }

  it("creates one shared ioredis client and passes it to every worker", () => {
    registerRelayBullMqWorkers(minimalDeps());

    expect(RedisConstructor).toHaveBeenCalledTimes(1);
    expect(hoisted.workerCalls.length).toBe(5);
    const [firstConn] = hoisted.workerCalls.map((c) => c.opts.connection);
    expect(
      hoisted.workerCalls.every((c) => c.opts.connection === firstConn)
    ).toBe(true);
  });

  it("applies per-queue concurrency from env", () => {
    registerRelayBullMqWorkers(minimalDeps());

    const notification = hoisted.workerCalls.find(
      (c) => c.name === RELAY_JOB_QUEUE_NAMES.NOTIFICATION_DELIVERY
    );
    expect(notification?.opts.concurrency).toBe(4);
    const autosync = hoisted.workerCalls.find(
      (c) => c.name === RELAY_JOB_QUEUE_NAMES.PATREON_INCREMENTAL_AUTOSYNC
    );
    expect(autosync?.opts.concurrency).toBe(1);
  });

  it("sets worker retention options", () => {
    registerRelayBullMqWorkers(minimalDeps());

    for (const c of hoisted.workerCalls) {
      expect(c.opts.removeOnComplete).toEqual({ count: 500 });
      expect(c.opts.removeOnFail).toEqual({ count: 200 });
    }
  });

  it("passes stall recovery options matching BullMQ v5 defaults", () => {
    registerRelayBullMqWorkers(minimalDeps());
    for (const c of hoisted.workerCalls) {
      expect(c.opts.stalledInterval).toBe(30_000);
      expect(c.opts.maxStalledCount).toBe(1);
    }
  });

  it("registers failed hook that logs final job errors", () => {
    const log = vi.fn();
    registerRelayBullMqWorkers(minimalDeps({ log }));
    const workerInst = WorkerMock.mock.results[0]?.value as {
      on: ReturnType<typeof vi.fn>;
    };
    const failedEntry = workerInst.on.mock.calls.find(([ev]) => ev === "failed");
    expect(failedEntry).toBeDefined();
    const onFailed = failedEntry![1] as (
      job:
        | {
            id?: string;
            name?: string;
            data?: { traceId?: string };
            attemptsMade?: number;
          }
        | undefined,
      err: Error,
      prev: string
    ) => void;
    onFailed(
      {
        id: "jid-99",
        name: "relay-tick",
        data: { traceId: "req-z" },
        attemptsMade: 5
      },
      new Error("boom"),
      "active"
    );
    expect(log).toHaveBeenCalledWith(
      "relay-bullmq: job failed (final — see BullMQ failed set / removeOnFail)",
      expect.objectContaining({
        queue: RELAY_JOB_QUEUE_NAMES.PATREON_INCREMENTAL_AUTOSYNC,
        jobId: "jid-99",
        jobName: "relay-tick",
        traceId: "req-z",
        attemptsMade: 5,
        failedReason: "boom",
        prevState: "active"
      })
    );
  });

  it("failed hook logs when job is undefined (BullMQ removeOnFail edge)", () => {
    const log = vi.fn();
    registerRelayBullMqWorkers(minimalDeps({ log }));
    const workerInst = WorkerMock.mock.results[0]?.value as {
      on: ReturnType<typeof vi.fn>;
    };
    const onFailed = workerInst.on.mock.calls.find(([ev]) => ev === "failed")![1] as (
      job: undefined,
      err: Error,
      prev: string
    ) => void;
    onFailed(undefined, new Error("no job ref"), "active");
    expect(log).toHaveBeenCalledWith(
      "relay-bullmq: job failed (final — see BullMQ failed set / removeOnFail)",
      expect.objectContaining({
        queue: RELAY_JOB_QUEUE_NAMES.PATREON_INCREMENTAL_AUTOSYNC,
        failedReason: "no job ref",
        prevState: "active"
      })
    );
    expect(log.mock.calls[0]![1]).not.toHaveProperty("traceId");
  });

  it("closes workers then quits redis when it owns the client", async () => {
    const close = registerRelayBullMqWorkers(minimalDeps());
    await close();

    expect(WorkerMock).toHaveBeenCalled();
    const quit = hoisted.redisInstances[0]?.quit;
    expect(quit).toHaveBeenCalledTimes(1);
  });

  it("does not quit injected redisConnection", async () => {
    const injected = { quit: vi.fn().mockResolvedValue("OK") } as unknown as Redis;
    const close = registerRelayBullMqWorkers(
      minimalDeps({ redisConnection: injected })
    );
    await close();

    expect(RedisConstructor).not.toHaveBeenCalled();
    expect(injected.quit).not.toHaveBeenCalled();
  });

  it("registers only autosync when prisma is null", () => {
    registerRelayBullMqWorkers(minimalDeps({ prisma: null }));

    expect(hoisted.workerCalls.map((c) => c.name)).toEqual([
      RELAY_JOB_QUEUE_NAMES.PATREON_INCREMENTAL_AUTOSYNC
    ]);
  });
});
