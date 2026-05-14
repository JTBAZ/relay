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
  processors: [] as Array<{
    name: string;
    processor: (job: {
      id?: string;
      data: Record<string, unknown>;
    }) => Promise<void>;
  }>,
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
  Worker: vi.fn(
    (
      name: string,
      processor: (job: {
        id?: string;
        data: Record<string, unknown>;
      }) => Promise<void>,
      _opts: Record<string, unknown>
    ) => {
      hoisted.processors.push({ name, processor });
      return {
        name,
        on: vi.fn(),
        close: vi.fn().mockResolvedValue(undefined)
      };
    }
  )
}));

vi.mock("../src/patreon/incremental-sync-worker.js", () => ({
  runIncrementalAutosyncOnce: vi.fn().mockResolvedValue(undefined)
}));

const WorkerMock = vi.mocked(Worker);

describe("registerRelayBullMqWorkers trace logging", () => {
  const env = { REDIS_URL: "redis://localhost:6379" };

  beforeEach(() => {
    hoisted.processors.length = 0;
    hoisted.redisInstances.length = 0;
    WorkerMock.mockClear();
  });

  it("logs relay-bullmq: job start with synthesized traceId when data empty", async () => {
    const log = vi.fn();
    registerRelayBullMqWorkers({
      prisma: null,
      tokenStore: {} as PatreonTokenStore,
      patreonSyncService: {} as PatreonSyncService,
      encryption: {} as TokenEncryption,
      patreonClient: {} as PatreonClient,
      ingestService: {} as IngestService,
      fetchImpl: globalThis.fetch,
      env,
      log
    });
    const autosync = hoisted.processors.find(
      (p) => p.name === RELAY_JOB_QUEUE_NAMES.PATREON_INCREMENTAL_AUTOSYNC
    );
    expect(autosync).toBeDefined();
    await autosync!.processor({ id: "jid-1", data: {} });
    expect(log).toHaveBeenCalledWith(
      "relay-bullmq: job start",
      expect.objectContaining({
        queue: RELAY_JOB_QUEUE_NAMES.PATREON_INCREMENTAL_AUTOSYNC,
        jobId: "jid-1",
        traceId: expect.stringMatching(
          /^job_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
        )
      })
    );
    const startCtx = log.mock.calls.find((c) => c[0] === "relay-bullmq: job start")?.[1] as {
      traceId: string;
    };
    expect(startCtx?.traceId).toBeDefined();
    expect(log).toHaveBeenCalledWith(
      "relay-bullmq: job complete",
      expect.objectContaining({
        queue: RELAY_JOB_QUEUE_NAMES.PATREON_INCREMENTAL_AUTOSYNC,
        jobId: "jid-1",
        traceId: startCtx.traceId
      })
    );
  });

  it("uses payload traceId when present", async () => {
    const log = vi.fn();
    registerRelayBullMqWorkers({
      prisma: null,
      tokenStore: {} as PatreonTokenStore,
      patreonSyncService: {} as PatreonSyncService,
      encryption: {} as TokenEncryption,
      patreonClient: {} as PatreonClient,
      ingestService: {} as IngestService,
      fetchImpl: globalThis.fetch,
      env,
      log
    });
    const autosync = hoisted.processors.find(
      (p) => p.name === RELAY_JOB_QUEUE_NAMES.PATREON_INCREMENTAL_AUTOSYNC
    );
    await autosync!.processor({
      id: "jid-2",
      data: { traceId: "req-abc" }
    });
    expect(log).toHaveBeenCalledWith(
      "relay-bullmq: job start",
      expect.objectContaining({
        traceId: "req-abc",
        jobId: "jid-2"
      })
    );
    expect(log).toHaveBeenCalledWith(
      "relay-bullmq: job complete",
      expect.objectContaining({
        queue: RELAY_JOB_QUEUE_NAMES.PATREON_INCREMENTAL_AUTOSYNC,
        traceId: "req-abc",
        jobId: "jid-2"
      })
    );
  });
});
