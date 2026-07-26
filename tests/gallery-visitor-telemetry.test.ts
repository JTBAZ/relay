import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../src/server.js";
import { RELAY_TIER_PUBLIC } from "../src/patreon/relay-access-tiers.js";
import { enqueueRelayEngagementEvent } from "../src/analytics/relay-engagement-event.js";
import { ingestFirstPartyEvent } from "../src/platform-metrics/first-party-event-ingestion.js";

vi.mock("../src/analytics/relay-engagement-event.js", () => ({
  enqueueRelayEngagementEvent: vi.fn()
}));

vi.mock("../src/platform-metrics/first-party-event-ingestion.js", () => ({
  ingestFirstPartyEvent: vi.fn()
}));

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
    collections_store_path: join(tempDir, "collections.json"),
    analytics_store_path: join(tempDir, "analytics.json"),
    clone_store_path: join(tempDir, "clone_sites.json"),
    identity_store_path: join(tempDir, "identity.json"),
    payment_store_path: join(tempDir, "payments.json"),
    migration_store_path: join(tempDir, "migrations.json"),
    deploy_store_path: join(tempDir, "deploys.json"),
    fetch_impl: vi.fn(async () => new Response("{}", { status: 200 })) as unknown as typeof fetch
  });
}

describe("visitor gallery telemetry (PMD-042)", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("passes visitor session key into profile_view engagement rows", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "relay-vg-telemetry-"));
    const { app } = testApp(tempDir);

    await request(app)
      .post("/api/v1/ingest/batches?process_sync=true")
      .send({
        creator_id: "vg1",
        tiers: [],
        posts: [
          {
            post_id: "p1",
            title: "Public",
            published_at: "2026-03-10T12:00:00Z",
            tag_ids: [],
            tier_ids: [RELAY_TIER_PUBLIC],
            upstream_revision: "v1",
            media: [{ media_id: "m1", mime_type: "image/png", upstream_revision: "mv" }]
          }
        ]
      });

    const res = await request(app)
      .get("/api/v1/gallery/facets?creator_id=vg1&visitor=true")
      .set("X-Relay-Visitor-Session", "sess_test_abc");

    expect(res.status).toBe(200);
    expect(enqueueRelayEngagementEvent).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        creatorId: "vg1",
        eventType: "profile_view",
        sessionKey: "sess_test_abc"
      })
    );
  });

  it("records post_view telemetry on visitor post-detail", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "relay-vg-telemetry-"));
    const { app } = testApp(tempDir);
    vi.mocked(ingestFirstPartyEvent).mockResolvedValue({
      ok: true,
      result: {
        accepted: true,
        event_id: "pte_1",
        event_name: "post_view",
        storage: "platform_telemetry_events",
        occurred_at: "2026-05-24T19:00:00.000Z",
        ingested_at: "2026-05-24T19:00:00.000Z"
      }
    });

    await request(app)
      .post("/api/v1/ingest/batches?process_sync=true")
      .send({
        creator_id: "vg2",
        tiers: [],
        posts: [
          {
            post_id: "p2",
            title: "Detail",
            published_at: "2026-03-10T12:00:00Z",
            tag_ids: [],
            tier_ids: [RELAY_TIER_PUBLIC],
            upstream_revision: "v1",
            media: [{ media_id: "m2", mime_type: "image/png", upstream_revision: "mv" }]
          }
        ]
      });

    const res = await request(app)
      .get("/api/v1/gallery/post-detail?creator_id=vg2&post_id=p2&visitor=true")
      .set("X-Relay-Visitor-Session", "sess_post_view");

    expect(res.status).toBe(200);
    expect(enqueueRelayEngagementEvent).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        creatorId: "vg2",
        eventType: "gallery_view",
        postId: "p2",
        sessionKey: "sess_post_view"
      })
    );
    expect(ingestFirstPartyEvent).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        event_name: "post_view",
        session_key: "sess_post_view",
        payload: expect.objectContaining({
          creator_id: "vg2",
          post_id: "p2"
        })
      }),
      expect.any(String)
    );
  });
});
