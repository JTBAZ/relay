import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FilePatreonCookieStore } from "../src/auth/cookie-store.js";
import type { PatreonAuthService } from "../src/auth/auth-service.js";
import type { PatreonTokenStore } from "../src/auth/token-store.js";
import { InMemoryEventBus } from "../src/events/event-bus.js";
import type { ExportService } from "../src/export/export-service.js";
import type { CanonicalSnapshot, CanonicalStore } from "../src/ingest/canonical-store.js";
import { IngestService } from "../src/ingest/ingest-service.js";
import type { JsonApiDocument, JsonApiResource } from "../src/patreon/jsonapi-types.js";
import { PatreonSyncService } from "../src/patreon/patreon-sync-service.js";
import { dispatchVerifiedPatreonPlatformPayload } from "../src/patreon/patreon-webhook-platform.js";
import type { PatreonMemberSyncCoordinator } from "../src/patreon/patreon-member-sync-coordinator.js";

const fixture = JSON.parse(readFileSync(new URL("./fixtures/patreon/sync-baseline.json", import.meta.url), "utf8")) as {
  creator_id: string;
  campaign_id: string;
  campaigns: JsonApiDocument;
  head: JsonApiDocument;
  tail: JsonApiDocument;
  cookie_head: JsonApiDocument;
  updated_old_post: JsonApiResource;
};
const creatorId = fixture.creator_id;

function setup() {
  const snapshot: CanonicalSnapshot = { campaigns: {}, tiers: {}, posts: {}, media: {}, ingest_idempotency: {} };
  const bus = new InMemoryEventBus();
  const state = { head: structuredClone(fixture.head), cookie: false, watermark: null as string | null, failExport: false };
  const mutateForCreator = vi.fn<CanonicalStore["mutateForCreator"]>(async (_id, mutate) => { await mutate(snapshot); });
  const ingest = new IngestService({ mutateForCreator } as unknown as CanonicalStore, bus);
  const fetchImpl = vi.fn<typeof fetch>(async (input) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    if (url.pathname === "/api/oauth2/v2/campaigns") return Response.json(fixture.campaigns);
    if (url.pathname === `/api/oauth2/v2/campaigns/${fixture.campaign_id}/posts`) {
      return Response.json(url.searchParams.has("page[cursor]") ? fixture.tail : state.head);
    }
    if (url.pathname === "/api/posts") return Response.json(fixture.cookie_head);
    throw new Error(`Unexpected baseline request: ${url.pathname}`);
  });
  const exportMedia = vi.fn(async () => {
    if (state.failExport) throw new Error("Synthetic exhausted download failure");
  });
  const service = new PatreonSyncService(
    { getByCreatorId: async () => ({ access_token: "fixture-only", credential_health_status: "healthy" }) } as unknown as PatreonTokenStore,
    { getCookieLocalStatus: async () => state.cookie ? "ok" : "none", getSessionId: async () => state.cookie ? "fixture-only" : null } as unknown as FilePatreonCookieStore,
    ingest,
    { get: async () => state.watermark, getRow: async () => null, set: async (_creator, _campaign, value) => { state.watermark = value; } },
    { ensureFreshAccessForAutomation: async () => {} } as unknown as PatreonAuthService,
    fetchImpl,
    { exportMedia } as unknown as ExportService
  );
  const sync = (maxPages = 2) => service.scrapeOrSync(creatorId, "ps00-baseline", { campaign_id: fixture.campaign_id, max_post_pages: maxPages });
  const dispatch = (eventHeader: string) => dispatchVerifiedPatreonPlatformPayload({
    creatorId, eventHeader, campaignId: fixture.campaign_id, traceId: "ps00-webhook", syncService: service,
    memberCoordinator: {} as PatreonMemberSyncCoordinator
  });
  return { snapshot, bus, state, sync, dispatch, mutateForCreator, exportMedia };
}

describe("PS-00 fixture controls", () => {
  it("imports both pages and their paid-tier catalog through real mapping and ingest", async () => {
    const run = setup();
    const result = await run.sync();
    expect(result.posts_fetched).toBe(2);
    expect(Object.keys(run.snapshot.posts[creatorId]!)).toEqual(expect.arrayContaining(["patreon_post_9001", "patreon_post_9002"]));
    expect(run.snapshot.tiers[creatorId]!.patreon_tier_9100!.amount_cents).toBe(500);
  });

  it("imports cookie media and attempts its export when credentials exist initially", async () => {
    const run = setup();
    run.state.cookie = true;
    const result = await run.sync();
    expect(result.media_source).toBe("cookie");
    expect(run.snapshot.posts[creatorId]!.patreon_post_9002!.current.media_ids).toEqual(["patreon_media_9200"]);
    expect(run.exportMedia).toHaveBeenCalledTimes(1);
  });
});

describe("PS-05 / R05 completed baseline", () => {
  it("emits no publication event when the canonical save fails", async () => {
    const run = setup();
    run.mutateForCreator.mockImplementationOnce(async (_id, mutate) => {
      await mutate(run.snapshot);
      throw new Error("Synthetic canonical save failure");
    });
    await expect(run.sync()).rejects.toThrow("Synthetic canonical save failure");
    expect(run.bus.getAll()).toEqual([]);
  });
});

// Each owning fix removes its expected-failure marker. Setup errors fail normally in beforeEach.
const gaps: Array<{ id: string; name: string; observe: () => Promise<unknown>; expected: unknown }> = [
  {
    id: "PS-09 / R09", name: "an old-post update refreshes its imported title", expected: "Older edited",
    observe: async () => {
      const run = setup();
      await run.sync();
      const newest = (fixture.head.data as JsonApiResource[])[0]!;
      run.state.head = { data: [newest, fixture.updated_old_post], links: {} };
      await run.dispatch("posts:update");
      return run.snapshot.posts[creatorId]!.patreon_post_9001!.current.title;
    }
  },
  {
    id: "PS-09 / R09", name: "an old-post deletion marks the imported post deleted", expected: "deleted",
    observe: async () => {
      const run = setup();
      await run.sync();
      run.state.head = { data: fixture.head.data, links: {} };
      await run.dispatch("posts:delete");
      return run.snapshot.posts[creatorId]!.patreon_post_9001!.upstream_status;
    }
  },
  {
    id: "PS-11 / R11", name: "a capped archive reaches its tail on the following run", expected: 2,
    observe: async () => {
      const run = setup();
      await run.sync(1);
      await run.sync(1);
      return Object.keys(run.snapshot.posts[creatorId]!).length;
    }
  },
  {
    id: "PS-12 / R12", name: "cookie recovery fills media on an already imported post", expected: 1,
    observe: async () => {
      const run = setup();
      await run.sync();
      run.state.cookie = true;
      await run.sync();
      return run.snapshot.posts[creatorId]!.patreon_post_9002!.current.media_ids.length;
    }
  },
  {
    id: "PS-12 / R12", name: "a later ordinary sync retries an exhausted media download", expected: 2,
    observe: async () => {
      const run = setup();
      run.state.cookie = true;
      run.state.failExport = true;
      await run.sync();
      run.state.failExport = false;
      await run.sync();
      return run.exportMedia.mock.calls.length;
    }
  }
];

describe.each(gaps)("$id: $name", ({ observe, expected }) => {
  let observed: unknown;
  beforeEach(async () => { observed = await observe(); });
  it.fails("does not yet meet the owning acceptance case", () => { expect(observed).toEqual(expected); });
});
