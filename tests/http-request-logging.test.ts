import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { Writable } from "node:stream";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createLogger } from "../src/lib/logger.js";
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

async function flushLogs(): Promise<void> {
  await new Promise<void>((r) => setImmediate(r));
}

describe("HTTP request logging (P2-obs-002)", () => {
  it("logs method, path, status, durationMs, and traceId after response finishes", async () => {
    const chunks: string[] = [];
    const dest = new Writable({
      write(chunk, _enc, cb) {
        chunks.push(chunk.toString());
        cb();
      }
    });
    const httpLogger = createLogger({
      name: "relay-http-test",
      destination: dest,
      env: { LOG_LEVEL: "info", NODE_ENV: "development" }
    });

    const tempDir = await mkdtemp(join(tmpdir(), "relay-http-log-"));
    const { app } = createApp({ ...baseConfig(tempDir), http_request_logger: httpLogger });

    const res = await request(app).get("/api/v1/health").set("X-Trace-Id", "client-trace-xyz");

    expect(res.status).toBe(200);
    expect(res.headers["x-trace-id"]).toBe("client-trace-xyz");

    await flushLogs();
    const line = chunks.join("");
    const row = JSON.parse(line.trim()) as Record<string, unknown>;
    expect(row.msg).toBe("http_request");
    expect(row.method).toBe("GET");
    expect(row.path).toBe("/api/v1/health");
    expect(row.status).toBe(200);
    expect(row.traceId).toBe("client-trace-xyz");
    expect(typeof row.durationMs).toBe("number");
    expect(row.durationMs as number).toBeGreaterThanOrEqual(0);
  });

  it("production + LOG_LEVEL=info: health access line is trace only (no JSON line)", async () => {
    const prevNodeEnv = process.env.NODE_ENV;
    const prevSample = process.env.RELAY_LOG_SAMPLE_RATE;
    process.env.NODE_ENV = "production";
    delete process.env.RELAY_LOG_SAMPLE_RATE;
    const chunks: string[] = [];
    const dest = new Writable({
      write(chunk, _enc, cb) {
        chunks.push(chunk.toString());
        cb();
      }
    });
    const httpLogger = createLogger({
      name: "relay-http-test",
      destination: dest,
      env: { LOG_LEVEL: "info", NODE_ENV: "production" }
    });

    const tempDir = await mkdtemp(join(tmpdir(), "relay-http-log-prod-"));
    const { app } = createApp({ ...baseConfig(tempDir), http_request_logger: httpLogger });

    try {
      await request(app).get("/api/v1/health");
      await flushLogs();
      expect(chunks.join("").trim()).toBe("");
    } finally {
      process.env.NODE_ENV = prevNodeEnv;
      if (prevSample === undefined) delete process.env.RELAY_LOG_SAMPLE_RATE;
      else process.env.RELAY_LOG_SAMPLE_RATE = prevSample;
    }
  });

  it("production + RELAY_LOG_SAMPLE_RATE=1 logs health at info", async () => {
    const prevNodeEnv = process.env.NODE_ENV;
    const prevSample = process.env.RELAY_LOG_SAMPLE_RATE;
    process.env.NODE_ENV = "production";
    process.env.RELAY_LOG_SAMPLE_RATE = "1";
    const chunks: string[] = [];
    const dest = new Writable({
      write(chunk, _enc, cb) {
        chunks.push(chunk.toString());
        cb();
      }
    });
    const httpLogger = createLogger({
      name: "relay-http-test",
      destination: dest,
      env: { LOG_LEVEL: "info", NODE_ENV: "production" }
    });

    const tempDir = await mkdtemp(join(tmpdir(), "relay-http-log-sampled-"));
    const { app } = createApp({ ...baseConfig(tempDir), http_request_logger: httpLogger });

    try {
      await request(app).get("/api/v1/health");
      await flushLogs();
      const line = chunks.join("");
      const row = JSON.parse(line.trim()) as Record<string, unknown>;
      expect(row.msg).toBe("http_request");
      expect(row.path).toBe("/api/v1/health");
    } finally {
      process.env.NODE_ENV = prevNodeEnv;
      if (prevSample === undefined) delete process.env.RELAY_LOG_SAMPLE_RATE;
      else process.env.RELAY_LOG_SAMPLE_RATE = prevSample;
    }
  });
});
