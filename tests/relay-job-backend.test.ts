import { describe, expect, it } from "vitest";
import {
  relayJobBackendFromEnv,
  relaySplitWorkerProcessFromEnv
} from "../src/jobs/relay-job-backend.js";

describe("relayJobBackendFromEnv", () => {
  it('defaults to memory when unset', () => {
    expect(relayJobBackendFromEnv({})).toBe("memory");
    expect(relayJobBackendFromEnv({ RELAY_JOB_BACKEND: "  " })).toBe("memory");
    expect(relayJobBackendFromEnv({ RELAY_JOB_BACKEND: "MEMORY" })).toBe("memory");
  });

  it("bullmq requires REDIS_URL", () => {
    expect(() =>
      relayJobBackendFromEnv({ RELAY_JOB_BACKEND: "bullmq" })
    ).toThrow(/REDIS_URL/);
  });

  it("bullmq accepts valid REDIS_URL", () => {
    expect(
      relayJobBackendFromEnv({
        RELAY_JOB_BACKEND: "bullmq",
        REDIS_URL: "redis://localhost:6379"
      })
    ).toBe("bullmq");
  });

  it("rejects unknown value", () => {
    expect(() =>
      relayJobBackendFromEnv({ RELAY_JOB_BACKEND: "kafka" })
    ).toThrow(/RELAY_JOB_BACKEND/);
  });
});

describe("relaySplitWorkerProcessFromEnv", () => {
  it("is false when unset", () => {
    expect(relaySplitWorkerProcessFromEnv({})).toBe(false);
  });

  it("accepts truthy strings", () => {
    expect(relaySplitWorkerProcessFromEnv({ RELAY_SPLIT_WORKER_PROCESS: "1" })).toBe(
      true
    );
    expect(relaySplitWorkerProcessFromEnv({ RELAY_SPLIT_WORKER_PROCESS: "true" })).toBe(
      true
    );
    expect(relaySplitWorkerProcessFromEnv({ RELAY_SPLIT_WORKER_PROCESS: "yes" })).toBe(
      true
    );
  });
});
