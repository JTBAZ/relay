import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { PatreonSyncService } from "../src/patreon/patreon-sync-service.js";
import type { PatreonAuthService } from "../src/auth/auth-service.js";
import type { PatreonTokenStore } from "../src/auth/token-store.js";
import type { PatreonCookieStore } from "../src/auth/cookie-store.js";
import type { IngestService } from "../src/ingest/ingest-service.js";
const fixture = JSON.parse(readFileSync(new URL("./fixtures/patreon/sync-baseline.json", import.meta.url), "utf8"));
function setup(cookie: boolean, list: (url: URL) => Response) {
  const apply = vi.fn().mockResolvedValue({});
  const setWatermark = vi.fn();
  const fake = vi.fn<typeof fetch>(async (input) => {
    const url = new URL(String(input));
    if (url.pathname === "/api/oauth2/v2/campaigns") return Response.json(fixture.campaigns);
    if (url.pathname === "/api/oauth2/v2/campaigns/9000/posts") return list(url);
    if (url.pathname === "/api/posts") return Response.json(fixture.cookie_head);
    if (url.pathname === "/api/oauth2/v2/posts/9002") return Response.json({ data: fixture.head.data[0] });
    throw new Error("Unexpected fixture request");
  });
  const svc = new PatreonSyncService(
    { getByCreatorId: async () => ({ access_token: "fixture" }) } as unknown as PatreonTokenStore,
    { getCookieLocalStatus: async () => cookie ? "ok" : "none", getSessionId: async () => cookie ? "fixture" : null } as unknown as PatreonCookieStore,
    { runBatch: apply, getPatreonPostStates: async () => ({}) } as unknown as IngestService,
    { get: async () => null, set: setWatermark, getRow: async () => null },
    { ensureFreshAccessForAutomation: async () => {} } as unknown as PatreonAuthService, fake
  );
  return { fake, apply, setWatermark, sync: () => svc.scrapeOrSync("fixture", "ps07", { campaign_id: "9000", max_post_pages: 3 }) };
}
describe("PS-07 list-first OAuth enrichment", () => {
  it("keeps the same revision when identical final content moves between cookie and list enrichment", async () => {
    const response = () => Response.json(fixture.head);
    const original = await setup(true, response).sync();
    const old = fixture.cookie_head.data[0].attributes.content;
    fixture.cookie_head.data[0].attributes.content = null;
    try {
      const filled = await setup(true, response).sync();
      expect(filled.batch.posts![0]!.upstream_revision).toBe(original.batch.posts![0]!.upstream_revision);
    } finally { fixture.cookie_head.data[0].attributes.content = old; }
  });
  it("stops at the last cookie target, uses list bodies, and skips resolved public posts in per-post fallback", async () => {
    const old = fixture.cookie_head.data[0].attributes.content;
    fixture.cookie_head.data[0].attributes.content = null;
    try {
      const run = setup(true, () => Response.json(fixture.head));
      const result = await run.sync();
      expect(result.batch.posts![0]!.description).toContain("Newest body");
      expect(run.fake.mock.calls.filter(([input]) => String(input).includes("/api/oauth2/v2/campaigns/9000/posts"))).toHaveLength(1);
      expect(run.fake.mock.calls.some(([input]) => String(input).includes("/api/oauth2/v2/posts/"))).toBe(false);
    } finally { fixture.cookie_head.data[0].attributes.content = old; }
  });
  it("uses per-post fallback only after a sparse list cannot resolve the target", async () => {
    const order: string[] = [];
    const run = setup(true, () => { order.push("list"); return Response.json({ data: [{ type: "post", id: "9002", attributes: { content: null } }] }); });
    await run.sync();
    const urls = run.fake.mock.calls.map(([input]) => String(input));
    expect(urls.findIndex((u) => u.includes("/campaigns/9000/posts"))).toBeLessThan(urls.findIndex((u) => u.includes("/v2/posts/9002")));
    expect(order).toEqual(["list"]);
  });
  it("does not ingest a partial OAuth archive or advance its watermark after a later page fails", async () => {
    const run = setup(false, (url) => url.searchParams.has("page[cursor]") ? Response.json({ errors: [{ retry_after_seconds: 1800 }] }, { status: 429 }) : Response.json(fixture.head));
    await expect(run.sync()).rejects.toMatchObject({ retriable: true });
    expect(run.apply).not.toHaveBeenCalled(); expect(run.setWatermark).not.toHaveBeenCalled();
  });
  it("does not turn failed per-post enrichment into a successful import", async () => {
    const run = setup(true, () => Response.json({ data: [] }));
    run.fake.mockImplementation(async (input) => {
      const url = new URL(String(input));
      if (url.pathname === "/api/oauth2/v2/campaigns") return Response.json(fixture.campaigns);
      if (url.pathname === "/api/posts") return Response.json(fixture.cookie_head);
      if (url.pathname.endsWith("/9000/posts")) return Response.json({ data: [] });
      return Response.json({}, { status: 403 });
    });
    await expect(run.sync()).rejects.toMatchObject({ status: 403 });
    expect(run.apply).not.toHaveBeenCalled(); expect(run.setWatermark).not.toHaveBeenCalled();
  });
});
