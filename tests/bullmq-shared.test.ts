import { describe, expect, it } from "vitest";
import {
  relayBullMqConcurrencyForQueue,
  relayBullMqWorkerStallRecoveryOptions
} from "../src/jobs/bullmq-shared.js";
import { RELAY_JOB_QUEUE_NAMES } from "../src/jobs/queue-names.js";

describe("relayBullMqConcurrencyForQueue", () => {
  it("defaults to 1", () => {
    expect(
      relayBullMqConcurrencyForQueue(
        RELAY_JOB_QUEUE_NAMES.NOTIFICATION_DELIVERY,
        {}
      )
    ).toBe(1);
  });

  it("uses RELAY_BULLMQ_CONCURRENCY", () => {
    expect(
      relayBullMqConcurrencyForQueue(
        RELAY_JOB_QUEUE_NAMES.NOTIFICATION_DELIVERY,
        { RELAY_BULLMQ_CONCURRENCY: "3" }
      )
    ).toBe(3);
  });

  it("per-queue env overrides default", () => {
    expect(
      relayBullMqConcurrencyForQueue(
        RELAY_JOB_QUEUE_NAMES.NOTIFICATION_DELIVERY,
        {
          RELAY_BULLMQ_CONCURRENCY: "2",
          RELAY_BULLMQ_CONCURRENCY_NOTIFICATION_DELIVERY: "8"
        }
      )
    ).toBe(8);
  });

  it("rejects invalid values", () => {
    expect(() =>
      relayBullMqConcurrencyForQueue(
        RELAY_JOB_QUEUE_NAMES.PATREON_INCREMENTAL_AUTOSYNC,
        { RELAY_BULLMQ_CONCURRENCY: "0" }
      )
    ).toThrow(/Invalid BullMQ concurrency/);
    expect(() =>
      relayBullMqConcurrencyForQueue(
        RELAY_JOB_QUEUE_NAMES.PATREON_INCREMENTAL_AUTOSYNC,
        { RELAY_BULLMQ_CONCURRENCY: "99" }
      )
    ).toThrow(/Invalid BullMQ concurrency/);
  });
});

describe("relayBullMqWorkerStallRecoveryOptions", () => {
  it("matches BullMQ v5 defaults when env unset", () => {
    expect(relayBullMqWorkerStallRecoveryOptions({})).toEqual({
      stalledInterval: 30_000,
      maxStalledCount: 1
    });
  });

  it("parses RELAY_BULLMQ_STALLED_INTERVAL_MS with floor/ceiling", () => {
    expect(
      relayBullMqWorkerStallRecoveryOptions({
        RELAY_BULLMQ_STALLED_INTERVAL_MS: "1000"
      }).stalledInterval
    ).toBe(5_000);
    expect(
      relayBullMqWorkerStallRecoveryOptions({
        RELAY_BULLMQ_STALLED_INTERVAL_MS: "999999"
      }).stalledInterval
    ).toBe(300_000);
  });

  it("parses RELAY_BULLMQ_MAX_STALLED_COUNT with cap", () => {
    expect(
      relayBullMqWorkerStallRecoveryOptions({
        RELAY_BULLMQ_MAX_STALLED_COUNT: "3"
      }).maxStalledCount
    ).toBe(3);
    expect(
      relayBullMqWorkerStallRecoveryOptions({
        RELAY_BULLMQ_MAX_STALLED_COUNT: "99"
      }).maxStalledCount
    ).toBe(10);
  });
});
