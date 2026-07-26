/**
 * Automations HTTP API surface (VS2 / B06).
 * Route registration + GET purity + error mapping — no live DB required.
 */
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createApp } from "../../src/server.js";
import {
  AUTOMATIONS_API_FIXTURES,
  AUTOMATIONS_CREATE_PREVIEW_CROSSPOST,
  AUTOMATIONS_SAMPLE_CONNECTOR_PREVIEW
} from "./fixtures.js";

function fileIdentityApp(tempDir: string) {
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
    page_layout_store_path: join(tempDir, "page_layout.json"),
    patron_favorites_store_path: join(tempDir, "patron_favorites.json"),
    analytics_store_path: join(tempDir, "analytics.json"),
    clone_store_path: join(tempDir, "clone_sites.json"),
    identity_store_path: join(tempDir, "identity.json"),
    payment_store_path: join(tempDir, "payments.json"),
    migration_store_path: join(tempDir, "migrations.json"),
    deploy_store_path: join(tempDir, "deploys.json"),
    fetch_impl: vi.fn(async () => new Response("{}", { status: 200 })) as unknown as typeof fetch
  });
}

describe("automations HTTP API (B06)", () => {
  it("registers collection routes (503 without DB, not 404)", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "relay-auto-api-"));
    const { app } = fileIdentityApp(tempDir);

    const getRes = await request(app).get(AUTOMATIONS_API_FIXTURES.paths.collection);
    expect(getRes.status).toBe(503);
    expect(getRes.body?.error?.code).toBe("SERVICE_UNAVAILABLE");

    const postRes = await request(app)
      .post(AUTOMATIONS_API_FIXTURES.paths.collection)
      .send(AUTOMATIONS_CREATE_PREVIEW_CROSSPOST);
    expect(postRes.status).toBe(503);
  });

  it("registers item/runs/delete routes (503 without DB)", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "relay-auto-api-item-"));
    const { app } = fileIdentityApp(tempDir);
    const id = AUTOMATIONS_SAMPLE_CONNECTOR_PREVIEW.automation_id;

    expect((await request(app).get(AUTOMATIONS_API_FIXTURES.paths.item(id))).status).toBe(503);
    expect(
      (await request(app).patch(AUTOMATIONS_API_FIXTURES.paths.item(id)).send({ version: 1 })).status
    ).toBe(503);
    expect((await request(app).delete(AUTOMATIONS_API_FIXTURES.paths.item(id))).status).toBe(503);
    expect((await request(app).get(AUTOMATIONS_API_FIXTURES.paths.runs(id))).status).toBe(503);
    expect(
      (
        await request(app).get(
          AUTOMATIONS_API_FIXTURES.paths.approvalContext(id, "run_qa_1")
        )
      ).status
    ).toBe(503);
  });

  it("keeps GETs side-effect-free in route source (HTTP verb hygiene)", () => {
    const src = readFileSync(
      path.resolve(__dirname, "../../src/server.ts"),
      "utf8"
    );
    const blockStart = src.indexOf("Schedule Rail Automations");
    const blockEnd = src.indexOf("Autopost social playbooks", blockStart);
    expect(blockStart).toBeGreaterThan(0);
    expect(blockEnd).toBeGreaterThan(blockStart);
    const block = src.slice(blockStart, blockEnd);

    expect(block).toMatch(/app\.get\("\/api\/v1\/creator\/autopost\/automations"/);
    expect(block).toMatch(/listAutomations\(/);
    expect(block).toMatch(/getAutomation\(/);
    expect(block).toMatch(/listAutomationRuns\(/);
    // GETs must not call mutating service entry points.
    const getHandlers = block.split(/app\.get\(/).slice(1);
    for (const handler of getHandlers) {
      const nextApp = handler.search(/\n\s*app\.(get|post|patch|delete)\(/);
      const body = nextApp >= 0 ? handler.slice(0, nextApp) : handler;
      expect(body).not.toMatch(/\bcreateAutomation\(/);
      expect(body).not.toMatch(/\bpatchAutomation\(/);
      expect(body).not.toMatch(/\barchiveAutomation\(/);
    }
  });

  it("maps plan gate to 402 and DELETE to archive semantics", () => {
    const src = readFileSync(
      path.resolve(__dirname, "../../src/server.ts"),
      "utf8"
    );
    expect(src).toMatch(/AUTOMATION_PLAN_REQUIRED[\s\S]*status\(402\)/);
    expect(src).toMatch(/required_plan:\s*"autopost"/);
    expect(src).toMatch(/Archive semantics[\s\S]*archiveAutomation\(/);
    expect(src).toMatch(/sendAutomationError/);
    expect(src).toMatch(/result\.receipt\.created \? 201 : 200/);
  });

  it("freezes API fixtures for UI consumers", () => {
    expect(AUTOMATIONS_API_FIXTURES.create.receipt.created).toBe(true);
    expect(AUTOMATIONS_API_FIXTURES.list.automations[0]?.preset_kind).toBe(
      "preview_crosspost"
    );
    expect(AUTOMATIONS_API_FIXTURES.runs.runs[0]?.plan_id).toBeNull();
  });
});
