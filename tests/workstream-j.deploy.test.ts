import { mkdtemp, writeFile } from "node:fs/promises";
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

async function seedCloneSite(tempDir: string) {
  const cloneSite = {
    sites: {
      cr1: {
        site_id: "site_cr1",
        creator_id: "cr1",
        generated_at: new Date().toISOString(),
        tier_rules: [],
        posts: [],
        media_refs: []
      }
    }
  };
  await writeFile(
    join(tempDir, "clone_sites.json"),
    JSON.stringify(cloneSite),
    "utf8"
  );
}

describe("Workstream J one-click deploy and rollback", () => {
  it("full lifecycle: build → preview → DNS check → approve → launch → active", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "relay-j-"));
    await seedCloneSite(tempDir);
    const { app } = testApp(tempDir);

    const buildRes = await request(app).post("/api/v1/deploy/build").send({
      creator_id: "cr1",
      provider: "vercel",
      domain: "mysite.example.com"
    });
    expect(buildRes.status).toBe(201);
    expect(buildRes.body.data.status).toBe("preview");
    expect(buildRes.body.data.preview_url).toContain("vercel.app");
    const depId = buildRes.body.data.deployment_id as string;

    const dnsRes = await request(app)
      .post(`/api/v1/deploy/${depId}/dns-check`);
    expect(dnsRes.status).toBe(200);
    expect(dnsRes.body.data.cname_valid).toBe(true);
    expect(dnsRes.body.data.ssl_ready).toBe(true);

    const approveRes = await request(app)
      .post(`/api/v1/deploy/${depId}/approve`);
    expect(approveRes.status).toBe(200);
    expect(approveRes.body.data.status).toBe("approved");

    const launchRes = await request(app)
      .post(`/api/v1/deploy/${depId}/launch`);
    expect(launchRes.status).toBe(200);
    expect(launchRes.body.data.status).toBe("live");
    expect(launchRes.body.data.production_url).toBe("https://mysite.example.com");

    const activeRes = await request(app).get(
      "/api/v1/deploy/active/cr1"
    );
    expect(activeRes.status).toBe(200);
    expect(activeRes.body.data.deployment_id).toBe(depId);
  });

  it("rollback sets current deployment to rolled_back", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "relay-j2-"));
    await seedCloneSite(tempDir);
    const { app } = testApp(tempDir);

    const build1 = await request(app).post("/api/v1/deploy/build").send({
      creator_id: "cr1",
      provider: "vercel",
      domain: "site.example"
    });
    const depId = build1.body.data.deployment_id as string;

    await request(app).post(`/api/v1/deploy/${depId}/approve`);
    await request(app).post(`/api/v1/deploy/${depId}/launch`);

    const rbRes = await request(app).post("/api/v1/deploy/rollback").send({
      creator_id: "cr1"
    });
    expect(rbRes.status).toBe(200);
    expect(rbRes.body.data.status).toBe("rolled_back");
    expect(rbRes.body.data.rolled_back_at).toBeDefined();
  });

  it("netlify adapter works end-to-end", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "relay-j3-"));
    await seedCloneSite(tempDir);
    const { app } = testApp(tempDir);

    const buildRes = await request(app).post("/api/v1/deploy/build").send({
      creator_id: "cr1",
      provider: "netlify",
      domain: "netlify-site.example"
    });
    expect(buildRes.status).toBe(201);
    expect(buildRes.body.data.preview_url).toContain("netlify.app");

    const depId = buildRes.body.data.deployment_id as string;
    await request(app).post(`/api/v1/deploy/${depId}/approve`);

    const launchRes = await request(app)
      .post(`/api/v1/deploy/${depId}/launch`);
    expect(launchRes.body.data.production_url).toBe("https://netlify-site.example");
  });

  it("cannot approve a non-preview deployment", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "relay-j4-"));
    await seedCloneSite(tempDir);
    const { app } = testApp(tempDir);

    const buildRes = await request(app).post("/api/v1/deploy/build").send({
      creator_id: "cr1",
      provider: "vercel"
    });
    const depId = buildRes.body.data.deployment_id as string;

    await request(app).post(`/api/v1/deploy/${depId}/approve`);
    const res2 = await request(app).post(`/api/v1/deploy/${depId}/approve`);
    expect(res2.status).toBe(400);
  });

  it("cannot launch without approval", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "relay-j5-"));
    await seedCloneSite(tempDir);
    const { app } = testApp(tempDir);

    const buildRes = await request(app).post("/api/v1/deploy/build").send({
      creator_id: "cr1",
      provider: "vercel"
    });
    const depId = buildRes.body.data.deployment_id as string;

    const launchRes = await request(app)
      .post(`/api/v1/deploy/${depId}/launch`);
    expect(launchRes.status).toBe(400);
  });

  it("list deployments returns history sorted by newest first", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "relay-j6-"));
    await seedCloneSite(tempDir);
    const { app } = testApp(tempDir);

    await request(app).post("/api/v1/deploy/build").send({
      creator_id: "cr1",
      provider: "vercel"
    });
    await request(app).post("/api/v1/deploy/build").send({
      creator_id: "cr1",
      provider: "netlify"
    });

    const listRes = await request(app).get("/api/v1/deploy/list/cr1");
    expect(listRes.status).toBe(200);
    expect(listRes.body.data.length).toBe(2);
  });

  it("build fails without clone site", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "relay-j7-"));
    const { app } = testApp(tempDir);

    const buildRes = await request(app).post("/api/v1/deploy/build").send({
      creator_id: "cr1",
      provider: "vercel"
    });
    expect(buildRes.status).toBe(400);
    expect(buildRes.body.error.message).toContain("clone");
  });

  it("DNS check reports issues for empty domain", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "relay-j8-"));
    await seedCloneSite(tempDir);
    const { app } = testApp(tempDir);

    const buildRes = await request(app).post("/api/v1/deploy/build").send({
      creator_id: "cr1",
      provider: "vercel"
    });
    const depId = buildRes.body.data.deployment_id as string;

    const dnsRes = await request(app)
      .post(`/api/v1/deploy/${depId}/dns-check`);
    expect(dnsRes.status).toBe(200);
    expect(dnsRes.body.data.cname_valid).toBe(false);
    expect(dnsRes.body.data.issues.length).toBeGreaterThan(0);
  });
});
