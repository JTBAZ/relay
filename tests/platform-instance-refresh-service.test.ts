import { describe, expect, it, vi } from "vitest";

vi.mock("../src/analytics/external-metric-rollup-service.js", () => ({
  computeDailyRollups: vi.fn().mockResolvedValue({
    creator_id: "creator_a",
    upserted: 3,
    since: "2026-06-29T00:00:00.000Z",
    until: "2026-07-01T12:00:00.000Z"
  })
}));

import {
  evaluatePlatformInstanceRefreshCooldown,
  getPlatformInstanceRefreshStatus,
  manualCooldownMsForDestination,
  requestPlatformInstanceManualRefresh
} from "../src/analytics/platform-instance-refresh-service.js";

const CREATOR_ID = "creator_a";
const INSTANCE_ID = "pi_attempt_1";

function baseInstance(overrides: Record<string, unknown> = {}) {
  return {
    id: INSTANCE_ID,
    creatorId: CREATOR_ID,
    postId: "post_a",
    destination: "patreon",
    externalUrl: "https://patreon.com/posts/1",
    externalId: null,
    attemptId: "attempt_1",
    linkSource: "autopost_success",
    status: "active",
    refreshPolicy: "conservative",
    linkedAt: new Date("2026-06-01T00:00:00.000Z"),
    lastRefreshedAt: null,
    lastManualRefreshRequestedAt: null,
    ...overrides
  };
}

describe("manualCooldownMsForDestination", () => {
  it("uses destination defaults and env override", () => {
    expect(manualCooldownMsForDestination("relay")).toBe(5 * 60 * 1000);
    expect(manualCooldownMsForDestination("patreon")).toBe(15 * 60 * 1000);
    expect(
      manualCooldownMsForDestination("patreon", {
        RELAY_PLATFORM_INSTANCE_MANUAL_COOLDOWN_MS: "120000"
      })
    ).toBe(120_000);
  });
});

describe("evaluatePlatformInstanceRefreshCooldown", () => {
  it("returns inactive cooldown when anchor is outside window", () => {
    const now = new Date("2026-07-01T12:00:00.000Z");
    const result = evaluatePlatformInstanceRefreshCooldown(
      baseInstance({
        lastManualRefreshRequestedAt: new Date("2026-07-01T11:00:00.000Z")
      }),
      now
    );
    expect(result.active).toBe(false);
  });

  it("returns active cooldown within destination window", () => {
    const now = new Date("2026-07-01T12:00:00.000Z");
    const result = evaluatePlatformInstanceRefreshCooldown(
      baseInstance({
        lastManualRefreshRequestedAt: new Date("2026-07-01T11:50:00.000Z")
      }),
      now
    );
    expect(result.active).toBe(true);
    expect(result.retryAfterSeconds).toBeGreaterThan(0);
  });
});

describe("requestPlatformInstanceManualRefresh", () => {
  it("returns handoff_required for linked Patreon instance", async () => {
    const update = vi.fn().mockResolvedValue({});
    const prisma = {
      tenant: { findUnique: vi.fn().mockResolvedValue({ id: "tenant_1" }) },
      platformInstance: {
        findFirst: vi.fn().mockResolvedValue(baseInstance()),
        update
      }
    };

    const out = await requestPlatformInstanceManualRefresh(prisma as never, CREATOR_ID, INSTANCE_ID);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.result.status).toBe("handoff_required");
    expect(out.result.handoff).toMatchObject({
      post_id: "post_a",
      attempt_id: "attempt_1",
      platform_instance_id: INSTANCE_ID,
      destination: "patreon"
    });
    expect(update).toHaveBeenCalled();
  });

  it("returns handoff_required for ingest Patreon instance without attemptId", async () => {
    const update = vi.fn().mockResolvedValue({});
    const prisma = {
      tenant: { findUnique: vi.fn().mockResolvedValue({ id: "tenant_1" }) },
      platformInstance: {
        findFirst: vi.fn().mockResolvedValue(
          baseInstance({
            id: "pi_manual_patreon_post_1_patreon",
            attemptId: null,
            linkSource: "api_identity",
            externalUrl: "https://www.patreon.com/posts/1"
          })
        ),
        update
      }
    };

    const out = await requestPlatformInstanceManualRefresh(
      prisma as never,
      CREATOR_ID,
      "pi_manual_patreon_post_1_patreon"
    );
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.result.status).toBe("handoff_required");
    expect(out.result.handoff).toEqual({
      post_id: "post_a",
      attempt_id: null,
      platform_instance_id: "pi_manual_patreon_post_1_patreon",
      destination: "patreon",
      external_url: "https://www.patreon.com/posts/1"
    });
  });

  it("returns cooldown without updating when still cooling down", async () => {
    const now = new Date("2026-07-01T12:00:00.000Z");
    const update = vi.fn();
    const prisma = {
      tenant: { findUnique: vi.fn().mockResolvedValue({ id: "tenant_1" }) },
      platformInstance: {
        findFirst: vi.fn().mockResolvedValue(
          baseInstance({
            lastManualRefreshRequestedAt: new Date("2026-07-01T11:50:00.000Z")
          })
        ),
        update
      }
    };

    const out = await requestPlatformInstanceManualRefresh(prisma as never, CREATOR_ID, INSTANCE_ID, {
      now
    });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.result.status).toBe("cooldown");
    expect(update).not.toHaveBeenCalled();
  });

  it("completes relay-native refresh via rollup", async () => {
    const update = vi.fn().mockResolvedValue({});
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const prisma = {
      tenant: { findUnique: vi.fn().mockResolvedValue({ id: "tenant_1" }) },
      platformInstance: {
        findFirst: vi.fn().mockResolvedValue(
          baseInstance({
            id: "pi_relay_post_a",
            destination: "relay",
            externalUrl: null,
            attemptId: null
          })
        ),
        update,
        updateMany
      }
    };

    const out = await requestPlatformInstanceManualRefresh(
      prisma as never,
      CREATOR_ID,
      "pi_relay_post_a"
    );
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.result.status).toBe("completed");
    expect(out.result.method).toBe("relay_engagement_rollup");
    expect(out.result.rollup_upserted).toBe(3);
  });

  it("returns handoff_required for linked X instance", async () => {
    const update = vi.fn().mockResolvedValue({});
    const prisma = {
      tenant: { findUnique: vi.fn().mockResolvedValue({ id: "tenant_1" }) },
      platformInstance: {
        findFirst: vi.fn().mockResolvedValue(
          baseInstance({
            destination: "x",
            externalUrl: "https://x.com/handle/status/1234567890"
          })
        ),
        update
      }
    };

    const out = await requestPlatformInstanceManualRefresh(prisma as never, CREATOR_ID, INSTANCE_ID);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.result.status).toBe("handoff_required");
    expect(out.result.handoff).toMatchObject({
      post_id: "post_a",
      attempt_id: "attempt_1",
      platform_instance_id: INSTANCE_ID,
      destination: "x"
    });
    expect(update).toHaveBeenCalled();
  });
});

describe("getPlatformInstanceRefreshStatus", () => {
  it("returns NOT_FOUND for missing instance", async () => {
    const prisma = {
      tenant: { findUnique: vi.fn().mockResolvedValue({ id: "tenant_1" }) },
      platformInstance: { findFirst: vi.fn().mockResolvedValue(null) }
    };

    await expect(
      getPlatformInstanceRefreshStatus(prisma as never, CREATOR_ID, "missing")
    ).resolves.toEqual({ ok: false, code: "NOT_FOUND" });
  });
});
