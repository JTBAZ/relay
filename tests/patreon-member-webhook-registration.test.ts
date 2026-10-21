import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomBytes } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { ensurePatreonPlatformWebhook, PATREON_PLATFORM_WEBHOOK_TRIGGERS } from "../src/patreon/patreon-webhook-registration.js";
import { PatreonWebhookMetadataStore } from "../src/patreon/patreon-webhook-metadata-store.js";
import { TokenEncryption } from "../src/lib/crypto.js";

describe("PS10 webhook trigger reconciliation", () => {
  async function setup(confirm = true, create = false) {
    const store = new PatreonWebhookMetadataStore(join(await mkdtemp(join(tmpdir(), "relay-ps10-wh-")), "metadata.json"), new TokenEncryption(randomBytes(32).toString("base64")));
    const creator = "fixture", opaque = await store.ensureOpaqueToken(creator), uri = `https://relay.fixture/api/v1/webhooks/patreon/platform/${opaque}`;
    let triggers = ["posts:update"], patches = 0, created = false;
    const fetchImpl = vi.fn<typeof fetch>(async (url, options) => {
      const path = new URL(String(url)).pathname;
      if (path.endsWith("/campaigns")) return Response.json({ data: [{ type: "campaign", id: "123" }] });
      if (options?.method === "POST") {
        created = true; if (confirm) triggers = JSON.parse(String(options.body)).data.attributes.triggers;
        return Response.json({ data: { type: "webhook", id: "webhook", attributes: { uri, secret: "fixture", triggers } } });
      }
      if (options?.method === "PATCH") {
        const body = JSON.parse(String(options.body)); expect(body.data.attributes).not.toHaveProperty("paused");
        expect(body.data.id).toBe("webhook"); patches++;
        if (confirm) triggers = body.data.attributes.triggers;
        return Response.json({ data: { type: "webhook", id: "webhook" } });
      }
      if (path.endsWith("/webhooks")) return Response.json({ data: create && !created ? [] : [{ type: "webhook", id: "webhook", attributes: { uri, secret: "fixture", triggers } }] });
      throw new Error("Unexpected webhook request");
    });
    const register = () => ensurePatreonPlatformWebhook({ creatorId: creator, tokenStore: { getByCreatorId: async () => ({ access_token: "fixture" }) } as never,
      webhookMetaStore: store, campaignIndex: { upsert: async () => ({ ok: true }) } as never, publicWebhookBaseUrl: "https://relay.fixture", fetchImpl });
    return { register, store, patches: () => patches };
  }
  it("adds members:create to an existing endpoint and confirms upstream triggers", async () => {
    const f = await setup(); expect((await f.register()).ok).toBe(true); expect(f.patches()).toBe(1);
    expect((await f.store.getByCreatorId("fixture"))!.triggers).toEqual([...PATREON_PLATFORM_WEBHOOK_TRIGGERS]);
    expect((await f.register()).ok).toBe(true); expect(f.patches()).toBe(1);
  });
  it("confirms actual triggers on a newly created endpoint", async () => {
    const f = await setup(true, true); expect((await f.register()).ok).toBe(true);
    const missing = await setup(false, true); expect((await missing.register()).ok).toBe(false);
    expect((await missing.store.getByCreatorId("fixture"))!.registration_status).not.toBe("ok");
  });
  it("does not record successful registration when the provider did not accept missing triggers", async () => {
    const f = await setup(false); expect((await f.register()).ok).toBe(false);
    expect((await f.store.getByCreatorId("fixture"))!.registration_status).not.toBe("ok");
  });
});
