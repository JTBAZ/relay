import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createApp } from "../src/server.js";

function testApp(tempDir: string) {
  return createApp({
    patreon_client_id: "c",
    patreon_client_secret: "s",
    relay_token_encryption_key: randomBytes(32).toString("base64"),
    credential_store_path: join(tempDir, "patreon.json"),
    ingest_canonical_path: join(tempDir, "canonical.json"),
    ingest_dlq_path: join(tempDir, "dlq.json"),
    export_storage_root: join(tempDir, "exports"),
    gallery_post_overrides_path: join(tempDir, "gallery_overrides.json"),
    gallery_saved_filters_path: join(tempDir, "saved_filters.json"),
    analytics_store_path: join(tempDir, "analytics.json"),
    clone_store_path: join(tempDir, "clone_sites.json"),
    identity_store_path: join(tempDir, "identity.json"),
    payment_store_path: join(tempDir, "payments.json"),
    migration_store_path: join(tempDir, "migrations.json"),
    deploy_store_path: join(tempDir, "deploys.json"),
    fetch_impl: vi.fn(async () => new Response("{}", { status: 200 })) as unknown as typeof fetch
  });
}

describe("Workstream H payment provider handoff", () => {
  it("mapping, preflight, dry-run checkout, live-mode guard, live checkout", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "relay-h-"));
    const { app } = testApp(tempDir);

    await request(app)
      .post("/api/v1/ingest/batches?process_sync=true")
      .send({
        creator_id: "cr1",
        tiers: [
          { tier_id: "t_gold", title: "Gold", upstream_updated_at: "2026-03-30T12:00:00Z" },
          { tier_id: "t_silver", title: "Silver", upstream_updated_at: "2026-03-30T12:00:00Z" }
        ],
        posts: [
          {
            post_id: "p1",
            title: "Post",
            published_at: "2026-03-15T12:00:00Z",
            tag_ids: [],
            tier_ids: ["t_gold"],
            upstream_revision: "r1",
            media: []
          }
        ]
      });
    await request(app)
      .post("/api/v1/clone/generate")
      .send({ creator_id: "cr1" });

    const mapGold = await request(app).post("/api/v1/payments/mappings").send({
      creator_id: "cr1",
      tier_id: "t_gold",
      provider: "stripe",
      product_id: "prod_gold",
      price_id: "price_gold",
      currency: "usd",
      amount_cents: 999,
      billing_interval: "month",
      tax_behavior: "exclusive"
    });
    expect(mapGold.status).toBe(200);
    expect(mapGold.body.data.mappings_count).toBe(1);

    const mapSilver = await request(app).post("/api/v1/payments/mappings").send({
      creator_id: "cr1",
      tier_id: "t_silver",
      provider: "paypal",
      product_id: "pp_silver",
      price_id: "pp_plan_silver",
      currency: "usd",
      amount_cents: 499,
      billing_interval: "month",
      tax_behavior: "inclusive"
    });
    expect(mapSilver.status).toBe(200);

    const cfg = await request(app).get("/api/v1/payments/config?creator_id=cr1");
    expect(cfg.status).toBe(200);
    expect(cfg.body.data.mappings.length).toBe(2);
    expect(cfg.body.data.live_mode).toBe(false);

    const preflight = await request(app)
      .post("/api/v1/payments/preflight")
      .send({ creator_id: "cr1" });
    expect(preflight.status).toBe(200);
    expect(preflight.body.data.pass).toBe(true);
    expect(preflight.body.data.mappings_checked).toBe(2);
    expect(preflight.body.data.issues.length).toBe(0);

    const dryRun = await request(app).post("/api/v1/payments/checkout").send({
      creator_id: "cr1",
      tier_id: "t_gold",
      user_id: "usr_test",
      email: "test@example.com",
      dry_run: true
    });
    expect(dryRun.status).toBe(200);
    expect(dryRun.body.data.dry_run).toBe(true);
    expect(dryRun.body.data.status).toBe("success");
    expect(dryRun.body.data.amount_cents).toBe(999);

    const liveBlocked = await request(app).post("/api/v1/payments/checkout").send({
      creator_id: "cr1",
      tier_id: "t_gold",
      user_id: "usr_test",
      email: "test@example.com",
      dry_run: false
    });
    expect(liveBlocked.status).toBe(400);
    expect(liveBlocked.body.error.code).toBe("LIVE_MODE_BLOCKED");

    const setLive = await request(app).post("/api/v1/payments/live-mode").send({
      creator_id: "cr1",
      live: true
    });
    expect(setLive.status).toBe(200);
    expect(setLive.body.data.live_mode).toBe(true);

    const liveCheckout = await request(app).post("/api/v1/payments/checkout").send({
      creator_id: "cr1",
      tier_id: "t_silver",
      user_id: "usr_test",
      email: "test@example.com",
      dry_run: false
    });
    expect(liveCheckout.status).toBe(200);
    expect(liveCheckout.body.data.dry_run).toBe(false);
    expect(liveCheckout.body.data.status).toBe("success");
    expect(liveCheckout.body.data.provider).toBe("paypal");
  });

  it("preflight detects currency mismatch and missing mappings", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "relay-h2-"));
    const { app } = testApp(tempDir);

    await request(app)
      .post("/api/v1/ingest/batches?process_sync=true")
      .send({
        creator_id: "cr2",
        tiers: [
          { tier_id: "t_a", title: "A", upstream_updated_at: "2026-03-30T12:00:00Z" },
          { tier_id: "t_b", title: "B", upstream_updated_at: "2026-03-30T12:00:00Z" }
        ],
        posts: []
      });
    await request(app)
      .post("/api/v1/clone/generate")
      .send({ creator_id: "cr2" });

    await request(app).post("/api/v1/payments/mappings").send({
      creator_id: "cr2",
      tier_id: "t_a",
      provider: "stripe",
      product_id: "prod_a",
      price_id: "price_a",
      currency: "eur",
      amount_cents: 500,
      billing_interval: "month",
      tax_behavior: "exclusive"
    });

    const preflight = await request(app)
      .post("/api/v1/payments/preflight")
      .send({ creator_id: "cr2" });
    expect(preflight.status).toBe(200);
    expect(preflight.body.data.pass).toBe(false);

    const codes = (preflight.body.data.issues as Array<{ code: string }>).map((i) => i.code);
    expect(codes).toContain("MISSING_MAPPING");
  });
});
