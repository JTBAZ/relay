import { afterEach, describe, expect, it, vi } from "vitest";
import {
  awaitRelayBullMqWorkersClose,
  relayBullMqWorkerCloseGraceMsFromEnv,
  type RelayBullMqWorkersClose
} from "../src/jobs/bullmq-shutdown.js";

describe("relayBullMqWorkerCloseGraceMsFromEnv", () => {
  it("defaults when unset or empty", () => {
    expect(relayBullMqWorkerCloseGraceMsFromEnv({})).toBe(30_000);
    expect(
      relayBullMqWorkerCloseGraceMsFromEnv({
        RELAY_BULLMQ_WORKER_CLOSE_GRACE_MS: "  "
      })
    ).toBe(30_000);
  });

  it("floors / caps parsed values", () => {
    expect(
      relayBullMqWorkerCloseGraceMsFromEnv({
        RELAY_BULLMQ_WORKER_CLOSE_GRACE_MS: "50"
      })
    ).toBe(1000);
    expect(
      relayBullMqWorkerCloseGraceMsFromEnv({
        RELAY_BULLMQ_WORKER_CLOSE_GRACE_MS: "99999999"
      })
    ).toBe(600_000);
  });

  it("uses finite number when valid", () => {
    expect(
      relayBullMqWorkerCloseGraceMsFromEnv({
        RELAY_BULLMQ_WORKER_CLOSE_GRACE_MS: "5000"
      })
    ).toBe(5000);
  });

  it("falls back to default when not a number", () => {
    expect(
      relayBullMqWorkerCloseGraceMsFromEnv({
        RELAY_BULLMQ_WORKER_CLOSE_GRACE_MS: "nope"
      })
    ).toBe(30_000);
  });
});

describe("awaitRelayBullMqWorkersClose", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("no-ops when close is undefined", async () => {
    await awaitRelayBullMqWorkersClose(undefined, vi.fn());
  });

  it("waits for one graceful close when it settles before grace", async () => {
    const close = vi.fn<RelayBullMqWorkersClose>().mockResolvedValue(undefined);
    const log = vi.fn();
    await awaitRelayBullMqWorkersClose(close, log);
    expect(close).toHaveBeenCalledTimes(1);
    expect(close.mock.calls[0][0]).toBeUndefined();
    expect(log).not.toHaveBeenCalled();
  });

  it("calls close with force after grace timeout", async () => {
    vi.useFakeTimers();
    const close = vi
      .fn<RelayBullMqWorkersClose>()
      .mockImplementationOnce(
        () =>
          new Promise(() => {
            /* never resolves — simulates stuck drain */
          })
      )
      .mockImplementationOnce(async (opts?: { force?: boolean }) => {
        expect(opts?.force).toBe(true);
      });
    const log = vi.fn();
    const env = { RELAY_BULLMQ_WORKER_CLOSE_GRACE_MS: "1000" };
    const done = awaitRelayBullMqWorkersClose(close, log, env);
    await vi.advanceTimersByTimeAsync(1000);
    await done;
    expect(close).toHaveBeenCalledTimes(2);
    expect(log).toHaveBeenCalledWith(
      "relay-bullmq: worker close grace exceeded; forcing",
      { graceMs: 1000 }
    );
  });

  it("rejects when graceful close throws a non-timeout error", async () => {
    const close = vi
      .fn<RelayBullMqWorkersClose>()
      .mockRejectedValue(new Error("upstream"));
    await expect(awaitRelayBullMqWorkersClose(close, vi.fn())).rejects.toThrow(
      "upstream"
    );
    expect(close).toHaveBeenCalledTimes(1);
  });
});
