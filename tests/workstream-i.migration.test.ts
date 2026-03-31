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

describe("Workstream I re-populate audience recovery", () => {
  it("full lifecycle: create, preflight, preview, staged send, click, resubscribe, metrics events", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "relay-i-"));
    const { app, eventBus } = testApp(tempDir);

    const createRes = await request(app)
      .post("/api/v1/migrations/campaigns")
      .send({
        creator_id: "cr1",
        tier_mappings: [
          { source_tier_id: "t_gold", destination_tier_id: "d_gold" },
          { source_tier_id: "t_silver", destination_tier_id: "d_silver" }
        ],
        recipients: [
          { member_id: "m1", email: "a@example.com", source_tier_id: "t_gold" },
          { member_id: "m2", email: "b@example.com", source_tier_id: "t_silver" },
          { member_id: "m3", email: "c@example.com", source_tier_id: "t_gold" }
        ],
        message_subject: "Join us on our new platform!",
        message_body_template:
          "Hello! Click {{resubscribe_url}} to rejoin. Unsubscribe: {{unsubscribe_url}}"
      });
    expect(createRes.status).toBe(201);
    const campaignId = createRes.body.data.campaign_id as string;
    expect(createRes.body.data.total_recipients).toBe(3);
    expect(createRes.body.data.total_suppressed).toBe(0);

    const createdEvt = eventBus
      .getAll()
      .find((e) => e.event_name === "migration_campaign_created");
    expect(createdEvt).toBeDefined();
    expect(createdEvt!.producer).toBe("migration-service");

    const preview = await request(app).get(
      `/api/v1/migrations/campaigns/${campaignId}/preview`
    );
    expect(preview.status).toBe(200);
    expect(preview.body.data.recipients_by_tier.length).toBe(2);

    const pf = await request(app)
      .post(`/api/v1/migrations/campaigns/${campaignId}/preflight`);
    expect(pf.status).toBe(200);
    expect(pf.body.data.pass).toBe(true);
    expect(pf.body.data.eligible_recipients).toBe(3);

    const batch1 = await request(app)
      .post(`/api/v1/migrations/campaigns/${campaignId}/send`)
      .send({ batch_size: 2, base_url: "https://clone.example" });
    expect(batch1.status).toBe(200);
    expect(batch1.body.data.recipients_in_batch).toBe(2);
    expect(batch1.body.data.links_generated).toBe(2);

    const sentEvt = eventBus
      .getAll()
      .find((e) => e.event_name === "migration_campaign_sent");
    expect(sentEvt).toBeDefined();

    const batch2 = await request(app)
      .post(`/api/v1/migrations/campaigns/${campaignId}/send`)
      .send({ batch_size: 2, base_url: "https://clone.example" });
    expect(batch2.body.data.recipients_in_batch).toBe(1);

    await request(app)
      .post(`/api/v1/migrations/campaigns/${campaignId}/click`)
      .send({ member_id: "m1", tier_id: "d_gold" });
    const clickEvt = eventBus
      .getAll()
      .find((e) => e.event_name === "migration_repopulate_link_clicked");
    expect(clickEvt).toBeDefined();

    await request(app)
      .post(`/api/v1/migrations/campaigns/${campaignId}/resubscribe`)
      .send({ member_id: "m1", tier_id: "d_gold", payment_provider: "stripe" });
    const resubEvt = eventBus
      .getAll()
      .find((e) => e.event_name === "migration_resubscribe_completed");
    expect(resubEvt).toBeDefined();

    const status = await request(app).get(
      `/api/v1/migrations/campaigns/${campaignId}`
    );
    expect(status.status).toBe(200);
    expect(status.body.data.click_count).toBe(1);
    expect(status.body.data.resubscribe_count).toBe(1);
    expect(status.body.data.batches_sent).toBe(2);
  });

  it("suppression list enforcement and preflight failure", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "relay-i2-"));
    const { app } = testApp(tempDir);

    await request(app).post("/api/v1/migrations/suppression").send({
      creator_id: "cr1",
      emails: ["suppressed@example.com"]
    });

    const createRes = await request(app)
      .post("/api/v1/migrations/campaigns")
      .send({
        creator_id: "cr1",
        tier_mappings: [{ source_tier_id: "t_gold", destination_tier_id: "d_gold" }],
        recipients: [
          { member_id: "m1", email: "suppressed@example.com", source_tier_id: "t_gold" }
        ],
        message_subject: "Rejoin",
        message_body_template: "Click {{resubscribe_url}}. {{unsubscribe_url}}"
      });
    expect(createRes.body.data.total_suppressed).toBe(1);

    const pf = await request(app)
      .post(
        `/api/v1/migrations/campaigns/${createRes.body.data.campaign_id}/preflight`
      );
    expect(pf.body.data.pass).toBe(false);
    expect(pf.body.data.issues.some((i: { code: string }) => i.code === "NO_ELIGIBLE")).toBe(
      true
    );
  });

  it("preflight fails when unsubscribe link missing", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "relay-i3-"));
    const { app } = testApp(tempDir);

    const createRes = await request(app)
      .post("/api/v1/migrations/campaigns")
      .send({
        creator_id: "cr1",
        tier_mappings: [],
        recipients: [
          { member_id: "m1", email: "ok@example.com", source_tier_id: "t_gold" }
        ],
        message_subject: "Join",
        message_body_template: "Click here to join."
      });
    const pf = await request(app)
      .post(
        `/api/v1/migrations/campaigns/${createRes.body.data.campaign_id}/preflight`
      );
    expect(pf.body.data.pass).toBe(false);
    expect(
      pf.body.data.issues.some(
        (i: { code: string }) => i.code === "MISSING_UNSUBSCRIBE"
      )
    ).toBe(true);
  });

  it("bounce threshold auto-pauses campaign", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "relay-i4-"));
    const { app } = testApp(tempDir);

    const emails = Array.from({ length: 20 }, (_, i) => ({
      member_id: `m${i}`,
      email: `u${i}@example.com`,
      source_tier_id: "t_gold"
    }));

    const createRes = await request(app)
      .post("/api/v1/migrations/campaigns")
      .send({
        creator_id: "cr1",
        tier_mappings: [{ source_tier_id: "t_gold", destination_tier_id: "d_gold" }],
        recipients: emails,
        message_subject: "Rejoin us",
        message_body_template: "{{resubscribe_url}} {{unsubscribe_url}}"
      });
    const cid = createRes.body.data.campaign_id as string;

    await request(app).post(`/api/v1/migrations/campaigns/${cid}/preflight`);
    await request(app)
      .post(`/api/v1/migrations/campaigns/${cid}/send`)
      .send({ batch_size: 100, base_url: "https://clone.example" });

    for (let i = 0; i < 2; i++) {
      await request(app)
        .post(`/api/v1/migrations/campaigns/${cid}/bounce`)
        .send({ email: `u${i}@example.com` });
    }

    const status = await request(app).get(`/api/v1/migrations/campaigns/${cid}`);
    expect(status.body.data.status).toBe("paused");
    expect(status.body.data.bounce_count).toBe(2);
  });
});
