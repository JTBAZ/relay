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
    analytics_confidence_threshold: 0.3,
    fetch_impl: vi.fn(async () => new Response("{}", { status: 200 })) as unknown as typeof fetch
  });
}

describe("Workstream E analytics + action center", () => {
  it("snapshot generation, cadence rescue card, accept, execute, dismiss, explain, metrics", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "relay-e-"));
    const { app, eventBus } = testApp(tempDir);

    await request(app)
      .post("/api/v1/ingest/batches?process_sync=true")
      .send({
        creator_id: "cr1",
        tiers: [
          { tier_id: "t1", title: "Gold", upstream_updated_at: "2026-03-30T12:00:00Z" }
        ],
        posts: [
          {
            post_id: "p1",
            title: "Ep 1",
            published_at: "2026-01-01T12:00:00Z",
            tag_ids: ["story"],
            tier_ids: ["t1"],
            upstream_revision: "r1",
            media: [{ media_id: "m1", mime_type: "image/png", upstream_revision: "mr1" }]
          }
        ]
      });

    const gen = await request(app)
      .post("/api/v1/analytics/generate")
      .send({ creator_id: "cr1" });
    expect(gen.status).toBe(200);
    expect(gen.body.data.recommendations_created).toBeGreaterThanOrEqual(1);

    const shown = eventBus.getAll().filter((e) => e.event_name === "recommendation_shown");
    expect(shown.length).toBeGreaterThanOrEqual(1);
    expect(shown[0].producer).toBe("recommendation-service");
    expect((shown[0].payload as Record<string, unknown>).primary_id).toBeDefined();
    expect((shown[0].payload as Record<string, unknown>).card_type).toBe("cadence_rescue");

    const cards = await request(app).get("/api/v1/action-center/cards?creator_id=cr1");
    expect(cards.status).toBe(200);
    expect(cards.body.data.items.length).toBeGreaterThanOrEqual(1);
    const card = cards.body.data.items[0] as {
      recommendation_id: string;
      card_type: string;
      title: string;
      signal: string;
      diagnosis: string;
      recommendation: string;
      confidence_score: number;
      expected_impact: { metric: string; delta_range: number[]; horizon_days: number };
      status: string;
    };
    expect(card.card_type).toBe("cadence_rescue");
    expect(card.confidence_score).toBeGreaterThanOrEqual(0.3);
    expect(card.expected_impact.metric).toBe("churn_rate");
    expect(card.status).toBe("open");

    const explain = await request(app).get(
      `/api/v1/action-center/cards/${card.recommendation_id}/explanation?creator_id=cr1`
    );
    expect(explain.status).toBe(200);
    expect(explain.body.data.reason_codes).toContain("cadence_drop");
    expect(explain.body.data.evidence_refs.length).toBeGreaterThan(0);

    const accept = await request(app)
      .post(`/api/v1/action-center/cards/${card.recommendation_id}/accept`)
      .send({ creator_id: "cr1", notes: "looks good" });
    expect(accept.status).toBe(200);
    expect(accept.body.data.status).toBe("accepted");

    const acceptEvt = eventBus.getAll().find((e) => e.event_name === "recommendation_accepted");
    expect(acceptEvt).toBeDefined();
    expect(acceptEvt!.producer).toBe("action-center-api");

    const gen2 = await request(app)
      .post("/api/v1/analytics/generate")
      .send({ creator_id: "cr1" });
    expect(gen2.status).toBe(200);
    const cards2 = await request(app).get("/api/v1/action-center/cards?creator_id=cr1");
    const secondCard = cards2.body.data.items[0] as { recommendation_id: string };
    expect(secondCard).toBeDefined();

    const exec = await request(app)
      .post(`/api/v1/action-center/cards/${secondCard.recommendation_id}/execute`)
      .send({
        creator_id: "cr1",
        action_type: "generate_post_drafts",
        options: { count: 2, theme: "story arc", target_tier_ids: ["t1"] }
      });
    expect(exec.status).toBe(200);
    expect(exec.body.data.execution_status).toBe("queued");
    expect(exec.body.data.action_job_id).toBeDefined();

    const execEvt = eventBus.getAll().find((e) => e.event_name === "recommendation_executed");
    expect(execEvt).toBeDefined();

    const gen3 = await request(app)
      .post("/api/v1/analytics/generate")
      .send({ creator_id: "cr1" });
    expect(gen3.status).toBe(200);
    const cards3 = await request(app).get("/api/v1/action-center/cards?creator_id=cr1");
    const thirdCard = cards3.body.data.items[0] as { recommendation_id: string } | undefined;
    if (thirdCard) {
      const dismiss = await request(app)
        .post(`/api/v1/action-center/cards/${thirdCard.recommendation_id}/dismiss`)
        .send({ creator_id: "cr1", reason_code: "not_relevant_now" });
      expect(dismiss.status).toBe(200);
      expect(dismiss.body.data.status).toBe("dismissed");
    }

    const summary = await request(app).get("/api/v1/metrics/summary?creator_id=cr1");
    expect(summary.status).toBe(200);
    expect(summary.body.data).toMatchObject({
      creator_id: "cr1",
      total_posts: 1,
      total_media: 1,
      active_tiers: 1,
      top_tags: expect.any(Array)
    });
    expect(typeof summary.body.data.posting_cadence_30d).toBe("number");
  });
});
