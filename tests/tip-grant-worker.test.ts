/**
 * @fileoverview Tip grant worker tests (MB-5).
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { runTipGrantOnce, tipGrantRepeatEveryMsFromEnv } from "../src/tips/tip-grant-worker.js";

vi.mock("../src/ledger/tip-ledger-service.js", () => ({
  grantTips: vi.fn(async ({ accountId }: { accountId: string }) => ({
    wallet: { account_id: accountId, granted_balance: 3, purchased_balance: 0 },
    entries: [],
    idempotent: false
  }))
}));

import { grantTips } from "../src/ledger/tip-ledger-service.js";

describe("tip-grant-worker", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("tipGrantRepeatEveryMsFromEnv is null when tips beta off", () => {
    expect(tipGrantRepeatEveryMsFromEnv({ RELAY_TIPS_BETA: "0" })).toBeNull();
  });

  it("tipGrantRepeatEveryMsFromEnv returns default when beta on", () => {
    expect(tipGrantRepeatEveryMsFromEnv({ RELAY_TIPS_BETA: "1" })).toBe(24 * 60 * 60 * 1000);
  });

  it("tipGrantRepeatEveryMsFromEnv is null when fan premium on", () => {
    expect(
      tipGrantRepeatEveryMsFromEnv({
        RELAY_TIPS_BETA: "1",
        RELAY_FAN_PREMIUM_ENABLED: "1"
      })
    ).toBeNull();
  });

  it("runTipGrantOnce grants each distinct membership account", async () => {
    const prisma = {
      tenantMembership: {
        findMany: vi.fn(async () => [{ accountId: "a1" }, { accountId: "a2" }])
      }
    } as never;

    const result = await runTipGrantOnce(prisma, {
      now: new Date("2026-07-16T12:00:00.000Z"),
      env: { RELAY_TIPS_BETA: "1", RELAY_FAN_PREMIUM_ENABLED: "0" }
    });
    expect(result.period_key).toBe("2026-07");
    expect(result.accounts_scanned).toBe(2);
    expect(result.grants_applied).toBe(2);
    expect(grantTips).toHaveBeenCalledTimes(2);
  });

  it("runTipGrantOnce no-ops when fan premium enabled", async () => {
    const prisma = {
      tenantMembership: {
        findMany: vi.fn(async () => [{ accountId: "a1" }])
      }
    } as never;

    const result = await runTipGrantOnce(prisma, {
      env: { RELAY_TIPS_BETA: "1", RELAY_FAN_PREMIUM_ENABLED: "1" }
    });
    expect(result.skipped_reason).toBe("fan_premium_enabled");
    expect(result.grants_applied).toBe(0);
    expect(grantTips).not.toHaveBeenCalled();
  });
});
