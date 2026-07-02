import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createApp } from "../src/server.js";

function baseConfig(tempDir: string) {
  return {
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
  };
}

describe("POST /api/v1/platform-metrics/events (PMD-041)", () => {
  it("returns 503 when telemetry storage is unavailable", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "relay-pme-"));
    const { app } = createApp(baseConfig(tempDir));
    const res = await request(app)
      .post("/api/v1/platform-metrics/events")
      .send({
        event_name: "page_view",
        occurred_at: "2026-05-24T19:00:00.000Z",
        payload: { surface: "web", path: "/feed" }
      });
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe("STORAGE_UNAVAILABLE");
  });

  it("returns 400 for invalid payloads", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "relay-pme-"));
    const { app } = createApp({
      ...baseConfig(tempDir),
      prisma: {} as never,
      relay_db_store_analytics: true
    });
    const res = await request(app)
      .post("/api/v1/platform-metrics/events")
      .send({ event_name: "page_view" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("returns 422 for domain-sourced events", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "relay-pme-"));
    const { app } = createApp({
      ...baseConfig(tempDir),
      prisma: {} as never,
      relay_db_store_analytics: true
    });
    const res = await request(app)
      .post("/api/v1/platform-metrics/events")
      .send({
        event_name: "follow_created",
        occurred_at: "2026-05-24T19:00:00.000Z",
        payload: { creator_id: "creator_1" }
      });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("EVENT_NOT_ACCEPTED");
  });

  it("returns 202 when event is accepted", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "relay-pme-"));
    const create = vi.fn().mockResolvedValue({ id: "pte_route_1" });
    const { app } = createApp({
      ...baseConfig(tempDir),
      prisma: { platformTelemetryEvent: { create } } as never,
      relay_db_store_analytics: true
    });
    const res = await request(app)
      .post("/api/v1/platform-metrics/events")
      .send({
        event_name: "session_start",
        occurred_at: "2026-05-24T19:00:00.000Z",
        session_key: "sess_route",
        payload: {}
      });
    expect(res.status).toBe(202);
    expect(res.body.data.accepted).toBe(true);
    expect(res.body.data.event_id).toBe("pte_route_1");
  });
});
