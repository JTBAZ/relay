import { beforeEach, describe, expect, it, vi } from "vitest";
import { Worker } from "bullmq";
import { Redis } from "ioredis";
import type { PatreonClient } from "../src/auth/patreon-client.js";
import type { PatreonTokenStore } from "../src/auth/token-store.js";
import type { TokenEncryption } from "../src/lib/crypto.js";
import type { PatreonSyncService } from "../src/patreon/patreon-sync-service.js";
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
  redisInstances: [] as { quit: ReturnType<typeof vi.fn> }[],
  sentryTagCalls: [] as Array<{ key: string; value: string }>,
  sentryIsInitialized: vi.fn(() => false)
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

vi.mock("@sentry/node", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@sentry/node")>();
  return {
    ...actual,
    isInitialized: () => hoisted.sentryIsInitialized(),
    withScope: <T>(callback: (scope: { setTag: (k: string, v: string) => void }) => T): T => {
      const scope = {
        setTag(key: string, value: string) {
          hoisted.sentryTagCalls.push({ key, value });
        }
      };
      return callback(scope);
    }
  };
});

const WorkerMock = vi.mocked(Worker);

describe("registerRelayBullMqWorkers Sentry scope (P2-obs-004)", () => {
  const env = { REDIS_URL: "redis://localhost:6379" };

  beforeEach(() => {
    hoisted.processors.length = 0;
    hoisted.redisInstances.length = 0;
    hoisted.sentryTagCalls.length = 0;
    hoisted.sentryIsInitialized.mockReturnValue(false);
    WorkerMock.mockClear();
  });

  it("does not set Sentry scope tags when Sentry is not initialized", async () => {
    hoisted.sentryIsInitialized.mockReturnValue(false);
    registerRelayBullMqWorkers({
      prisma: null,
      tokenStore: {} as PatreonTokenStore,
      patreonSyncService: {} as PatreonSyncService,
      encryption: {} as TokenEncryption,
      patreonClient: {} as PatreonClient,
      fetchImpl: globalThis.fetch,
      env,
      log: vi.fn()
    });
    const autosync = hoisted.processors.find(
      (p) => p.name === RELAY_JOB_QUEUE_NAMES.PATREON_INCREMENTAL_AUTOSYNC
    );
    await autosync!.processor({ id: "j1", data: { traceId: "t-xyz" } });
    expect(hoisted.sentryTagCalls).toEqual([]);
  });

  it("sets relay.bullmq.* and relay.trace_id tags when Sentry is initialized", async () => {
    hoisted.sentryIsInitialized.mockReturnValue(true);
    registerRelayBullMqWorkers({
      prisma: null,
      tokenStore: {} as PatreonTokenStore,
      patreonSyncService: {} as PatreonSyncService,
      encryption: {} as TokenEncryption,
      patreonClient: {} as PatreonClient,
      fetchImpl: globalThis.fetch,
      env,
      log: vi.fn()
    });
    const autosync = hoisted.processors.find(
      (p) => p.name === RELAY_JOB_QUEUE_NAMES.PATREON_INCREMENTAL_AUTOSYNC
    );
    await autosync!.processor({ id: "j2", data: { traceId: "tscoped" } });
    expect(hoisted.sentryTagCalls).toEqual(
      expect.arrayContaining([
        { key: "relay.bullmq.queue", value: RELAY_JOB_QUEUE_NAMES.PATREON_INCREMENTAL_AUTOSYNC },
        { key: "relay.trace_id", value: "tscoped" },
        { key: "relay.bullmq.job_id", value: "j2" }
      ])
    );
  });
});
