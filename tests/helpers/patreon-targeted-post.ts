import type { SyncWatermarkStoreAPI } from "../../src/ingest/sync-watermark-store.js";
import { vi } from "vitest";
import { IngestService } from "../../src/ingest/ingest-service.js";
import type { CanonicalSnapshot, CanonicalStore } from "../../src/ingest/canonical-store.js";
import { InMemoryEventBus } from "../../src/events/event-bus.js";
import { PatreonSyncService } from "../../src/patreon/patreon-sync-service.js";
import { buildCampaignAndTiersFromCampaignsDoc, buildSyncBatchFromParts, mapPatreonPostToIngest } from "../../src/patreon/map-patreon-to-ingest.js";
import type { PatreonTokenStore } from "../../src/auth/token-store.js";
import type { PatreonAuthService } from "../../src/auth/auth-service.js";
import type { PatreonCookieStore } from "../../src/auth/cookie-store.js";
import type { JsonApiDocument, JsonApiResource } from "../../src/patreon/jsonapi-types.js";

export function memoryStore(): CanonicalStore {
  let snapshot: CanonicalSnapshot = { posts: {}, media: {}, campaigns: {}, tiers: {}, ingest_idempotency: {} };
  let pending = Promise.resolve();
  const load = async () => structuredClone(snapshot);
  const save = async (next: CanonicalSnapshot) => { snapshot = structuredClone(next); };
  const mutate = (fn: Parameters<CanonicalStore["mutate"]>[0]) => {
    const next = pending.then(async () => { const copy = await load(); await fn(copy); await save(copy); });
    pending = next.catch(() => {});
    return next;
  };
  return { supportsAtomicCreatorMutations: true, load, save, mutate, loadForCreator: load, saveForCreator: (_id, next) => save(next), mutateForCreator: (_id, fn) => mutate(fn) };
}

export function targetedFixture(store: CanonicalStore = memoryStore(), creatorId = "ps09_fixture", campaignId = "9000", resourceId = "9001", watermarkStore?: SyncWatermarkStoreAPI) {
  const campaigns: JsonApiDocument = { data: [{ type: "campaign", id: campaignId,
    attributes: { name: "Targeted fixture", created_at: "2026-01-01T00:00:00.000Z" },
    relationships: { tiers: { data: [{ type: "tier", id: "9100" }] } } }],
    included: [{ type: "tier", id: "9100", attributes: { title: "Paid", amount_cents: 500, created_at: "2026-01-01T00:00:00.000Z" } }] };
  const resource = (title = "Original", isPublic = true): JsonApiResource => ({ type: "post", id: resourceId,
    attributes: { title, content: `<p>${title}</p>`, published_at: "2026-01-01T00:00:00.000Z", is_public: isPublic, tiers: isPublic ? [] : ["9100"] },
    relationships: { campaign: { data: { type: "campaign", id: campaignId } } } });
  const state = { post: resource(), status: 200, cookie: false,
    postResponse: undefined as (() => Promise<Response>) | undefined,
    cookieResponse: undefined as (() => Promise<Response>) | undefined,
    listResponse: undefined as ((url: URL) => Promise<Response>) | undefined };
  const fetchImpl = vi.fn<typeof fetch>(async (input) => {
    const url = new URL(String(input));
    if (url.pathname === "/api/oauth2/v2/campaigns") return Response.json(campaigns);
    if (url.pathname === `/api/oauth2/v2/posts/${resourceId}`) return state.postResponse ? state.postResponse() : state.status === 200 ? Response.json({ data: state.post }) : new Response("{}", { status: state.status });
    if (url.pathname === `/api/posts/${resourceId}`) return state.cookieResponse ? state.cookieResponse() : Response.json({ data: state.post });
    if (url.pathname === `/api/oauth2/v2/campaigns/${campaignId}/posts`) return state.listResponse ? state.listResponse(url) : Response.json({ data: [state.post] });
    throw new Error(`Unexpected targeted fixture request ${url.pathname}`);
  });
  const bus = new InMemoryEventBus();
  const ingest = new IngestService(store, bus);
  const watermark = { get: vi.fn(async () => "2026-10-19T00:00:00.000Z"), getRow: vi.fn(async () => null), set: vi.fn(async () => {}) };
  const rejected = vi.fn(async () => {});
  const service = new PatreonSyncService(
    { getByCreatorId: async () => ({ access_token: "fixture" }) } as unknown as PatreonTokenStore,
    { getSessionId: async () => state.cookie ? "fixture-session" : null, getCookieLocalStatus: async () => state.cookie ? "ok" : "none", hasRemoteRejectionMarker: async () => false, markPatreonRejectedSession: rejected } as unknown as PatreonCookieStore,
    ingest, watermarkStore ?? watermark, { ensureFreshAccessForAutomation: async () => {} } as unknown as PatreonAuthService, fetchImpl);
  const mapped = buildCampaignAndTiersFromCampaignsDoc(campaigns, creatorId, campaignId)!;
  const seed = async (post = resource()) => ingest.runBatch(buildSyncBatchFromParts(creatorId, mapped.campaign, mapped.tiers, [mapPatreonPostToIngest(post)]), "ps09-seed", undefined, [], { currentPatreonSnapshot: true });
  return { store, creatorId, campaignId, resourceId, resource, state, service, ingest, fetchImpl, watermark, bus, rejected, seed,
    refresh: (deletion = false) => service.refreshPost(creatorId, "ps09-target", campaignId, resourceId, deletion),
    post: async () => (await store.loadForCreator(creatorId)).posts[creatorId]![`patreon_post_${resourceId}`]! };
}

export function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}
