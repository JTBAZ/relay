import { describe, expect, it, vi } from "vitest";
import {
  PlatformRevenueEventKind,
  PlatformRevenueSourceLabel
} from "@prisma/client";
import {
  recordCheckoutRevenueTelemetry,
  recordPlatformRevenueEvent
} from "../src/platform-metrics/platform-revenue-telemetry-service.js";

describe("platform revenue telemetry service (PMD-061)", () => {
  it("persists validated checkout_completed events", async () => {
    const create = vi.fn().mockResolvedValue({ id: "rev_1" });
    const prisma = { platformRevenueEvent: { create } } as never;

    const result = await recordPlatformRevenueEvent(
      { prisma, relay_db_store_analytics: true },
      {
        event_kind: "checkout_completed",
        creator_id: "creator_1",
        checkout_id: "chk_1",
        amount_cents: 1800,
        currency: "USD",
        status: "success",
        provider: "stripe"
      }
    );

    expect(result.ok).toBe(true);
    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        eventKind: PlatformRevenueEventKind.checkout_completed,
        sourceLabel: PlatformRevenueSourceLabel.relay_native,
        creatorId: "creator_1",
        checkoutId: "chk_1",
        amountCents: 1800
      })
    });
  });

  it("records checkout lifecycle and subscription_created for recurring tiers", async () => {
    const create = vi.fn().mockResolvedValue({ id: "rev_x" });
    const prisma = { platformRevenueEvent: { create } } as never;
    const cfg = { prisma, relay_db_store_analytics: true };
    const mapping = {
      tier_id: "tier_supporter",
      provider: "stripe" as const,
      product_id: "prod_test",
      price_id: "price_test",
      currency: "USD",
      amount_cents: 500,
      billing_interval: "month" as const,
      tax_behavior: "exclusive" as const
    };

    await recordCheckoutRevenueTelemetry({
      cfg,
      phase: "started",
      creatorId: "creator_1",
      mapping
    });
    await recordCheckoutRevenueTelemetry({
      cfg,
      phase: "completed",
      creatorId: "creator_1",
      mapping,
      result: {
        checkout_id: "chk_1",
        tier_id: "tier_supporter",
        provider: "stripe",
        status: "success",
        amount_cents: 500,
        currency: "USD",
        dry_run: true,
        processed_at: "2026-05-25T12:00:00.000Z"
      }
    });

    expect(create).toHaveBeenCalledTimes(3);
    const kinds = create.mock.calls.map(
      (call) => (call[0] as { data: { eventKind: string } }).data.eventKind
    );
    expect(kinds).toEqual([
      PlatformRevenueEventKind.checkout_started,
      PlatformRevenueEventKind.checkout_completed,
      PlatformRevenueEventKind.subscription_created
    ]);
  });
});
