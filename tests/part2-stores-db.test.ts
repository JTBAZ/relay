import { describe, expect, it, vi } from "vitest";
import { DbCloneSiteStore } from "../src/clone/clone-store-db.js";
import { DbPaymentStore } from "../src/payments/payment-store-db.js";

describe("DbCloneSiteStore", () => {
  it("upserts payload JSON", async () => {
    const upsert = vi.fn().mockResolvedValue({});
    const prisma = { cloneSite: { upsert } };
    const store = new DbCloneSiteStore(prisma as never);
    await store.upsert({
      site_id: "s1",
      creator_id: "c1",
      generated_at: "2026-01-01T00:00:00.000Z",
      base_url: "https://x",
      tiers: [],
      posts: [],
      total_media: 0
    });
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { creatorId: "c1" },
        create: expect.objectContaining({ creatorId: "c1" })
      })
    );
  });
});

describe("DbPaymentStore", () => {
  it("appendCheckout creates a row", async () => {
    const create = vi.fn().mockResolvedValue({});
    const prisma = { paymentCheckout: { create } };
    const store = new DbPaymentStore(prisma as never);
    await store.appendCheckout({
      checkout_id: "co_1",
      tier_id: "t1",
      provider: "stripe",
      status: "success",
      amount_cents: 100,
      currency: "usd",
      dry_run: true,
      processed_at: "2026-01-01T00:00:00.000Z"
    });
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ checkoutId: "co_1", dryRun: true })
      })
    );
  });
});
