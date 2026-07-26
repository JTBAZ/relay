import { describe, expect, it, vi } from "vitest";
import { PaymentService } from "../src/payments/payment-service.js";
import type { PaymentStore } from "../src/payments/payment-store.js";
import type { ProviderAdapter } from "../src/payments/provider-adapter.js";
import type { CheckoutResult, PaymentConfig } from "../src/payments/types.js";
import * as revenueTelemetry from "../src/platform-metrics/platform-revenue-telemetry-service.js";

describe("payment checkout revenue telemetry (PMD-061)", () => {
  it("records checkout started and completed through PaymentService", async () => {
    const recordSpy = vi
      .spyOn(revenueTelemetry, "recordCheckoutRevenueTelemetry")
      .mockResolvedValue(undefined);

    const config: PaymentConfig = {
      creator_id: "creator_1",
      default_currency: "USD",
      default_billing_interval: "month",
      live_mode: true,
      created_at: "2026-05-01T00:00:00.000Z",
      updated_at: "2026-05-01T00:00:00.000Z",
      mappings: [
        {
          tier_id: "tier_1",
          provider: "stripe",
          product_id: "prod_test",
          price_id: "price_test",
          currency: "USD",
          amount_cents: 1800,
          billing_interval: "month",
          tax_behavior: "exclusive"
        }
      ]
    };

    const paymentStore: PaymentStore = {
      getConfig: vi.fn().mockResolvedValue(config),
      upsertConfig: vi.fn(),
      appendCheckout: vi.fn().mockResolvedValue(undefined)
    };

    const cloneService = {
      getLatest: vi.fn()
    } as never;

    const checkoutResult: CheckoutResult = {
      checkout_id: "chk_1",
      tier_id: "tier_1",
      provider: "stripe",
      status: "success",
      amount_cents: 1800,
      currency: "USD",
      dry_run: false,
      processed_at: "2026-05-25T12:00:00.000Z"
    };

    const adapter: ProviderAdapter = {
      provider: "stripe",
      validateMapping: vi.fn().mockReturnValue(null),
      processCheckout: vi.fn().mockResolvedValue(checkoutResult),
      verifyWebhookSignature: vi.fn().mockReturnValue(true)
    };

    const service = new PaymentService(
      paymentStore,
      cloneService,
      new Map([["stripe", adapter]]),
      { prisma: {} as never, relay_db_store_analytics: true }
    );

    await service.checkout("creator_1", "tier_1", "user_1", "buyer@example.com", false);

    expect(recordSpy).toHaveBeenCalledTimes(2);
    expect(recordSpy.mock.calls[0]?.[0]?.phase).toBe("started");
    expect(recordSpy.mock.calls[1]?.[0]?.phase).toBe("completed");
    expect(recordSpy.mock.calls[1]?.[0]?.result?.checkout_id).toBe("chk_1");
  });
});
