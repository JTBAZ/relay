import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchPostById, fetchPostsPage, postsPageUrl, singlePostUrl } from "../src/patreon/patreon-resource-api.js";
import { mapPatreonPostToIngest } from "../src/patreon/map-patreon-to-ingest.js";
import { classifySyncError } from "../src/patreon/sync-error-copy.js";
import { applySyncBatchToSnapshot } from "../src/ingest/apply-batch.js";
import type { CanonicalSnapshot } from "../src/ingest/canonical-store.js";
import { InMemoryEventBus } from "../src/events/event-bus.js";
import { IngestService } from "../src/ingest/ingest-service.js";
import type { CanonicalStore } from "../src/ingest/canonical-store.js";

const resource = (attributes: Record<string, unknown> = {}) => ({
  type: "post", id: "123", attributes: {
    title: "Post", content: "<p>Body</p>", published_at: "2026-01-01T00:00:00.000Z", is_public: false, tiers: ["5"], ...attributes
  }
});
afterEach(() => vi.useRealTimers());
describe("PS-07 OAuth requests and revisions", () => {
  it("requests every consumed supported field on both endpoints and later pages", async () => {
    const required = ["title", "content", "published_at", "is_public", "is_paid", "tiers", "embed_url", "embed_data"];
    const fake = vi.fn<typeof fetch>(async (input) => {
      const fields = new URL(String(input)).searchParams.get("fields[post]")?.split(",") ?? [];
      for (const field of required) expect(fields).toContain(field);
      const attrs = Object.fromEntries(Object.entries(resource().attributes).filter(([key]) => fields.includes(key)));
      return Response.json({ data: [{ ...resource(), attributes: attrs }] });
    });
    const opts = { access_token: "fixture", fetch_impl: fake };
    await fetchPostsPage(opts, "1");
    await fetchPostsPage(opts, "1", "https://www.patreon.com/api/oauth2/v2/campaigns/1/posts?page%5Bcursor%5D=next");
    await fetchPostById(opts, "123");
    expect(new URL(singlePostUrl("123")).searchParams.get("fields[post]")).toBe(new URL(postsPageUrl("1")).searchParams.get("fields[post]"));
  });
  it("rejects unsafe pagination destinations before sending the token", async () => {
    const fake = vi.fn<typeof fetch>();
    for (const next of ["https://attacker.example/posts", "http://www.patreon.com/api/oauth2/v2/campaigns/1/posts", "https://www.patreon.com/api/oauth2/v2/campaigns/other/posts"]) {
      await expect(fetchPostsPage({ access_token: "secret", fetch_impl: fake }, "1", next)).rejects.toThrow();
    }
    expect(fake).not.toHaveBeenCalled();
  });
  it("rejects missing publication time or ambiguous audience without inventing data", () => {
    for (const date of [undefined, null, "", "invalid"]) expect(() => mapPatreonPostToIngest(resource({ published_at: date }))).toThrow();
    expect(() => mapPatreonPostToIngest(resource({ is_public: null, is_paid: null, tiers: null }))).toThrow();
    expect(() => mapPatreonPostToIngest(resource({ is_public: undefined, is_paid: false, tiers: [] }))).toThrow();
    expect(mapPatreonPostToIngest(resource({ title: null, content: null, embed_data: null }))).toMatchObject({ title: "(untitled)", tier_ids: ["patreon_tier_5"] });
  });
  it("accepts content/access edits without an edited_at field and ignores CDN signature renewal", () => {
    const original = mapPatreonPostToIngest(resource());
    for (const attrs of [{ title: "Changed" }, { content: "Changed" }, { tiers: ["6"] }, { is_public: true }]) {
      expect(mapPatreonPostToIngest(resource(attrs)).upstream_revision).not.toBe(original.upstream_revision);
    }
    const url = "https://c10.patreonusercontent.com/art.png?token=old&expires=1&w=100";
    const first = mapPatreonPostToIngest(resource({ content: `<img src="${url}">` }));
    const second = mapPatreonPostToIngest(resource({ content: `<img src="${url.replace('old', 'new').replace('expires=1', 'expires=2')}">` }));
    expect(first.upstream_revision).toBe(second.upstream_revision);
    expect(first.media[0]!.upstream_revision).toBe(second.media[0]!.upstream_revision);
    expect(second.media[0]!.upstream_url).toContain("token=new");
  });
  it("retains legacy replay markers while applying each new content revision once", () => {
    const snapshot: CanonicalSnapshot = { campaigns: {}, tiers: {}, posts: {}, media: {}, ingest_idempotency: {} };
    const bus = new InMemoryEventBus();
    const post = mapPatreonPostToIngest(resource());
    const legacy = { ...post, upstream_revision: post.upstream_revision.split(":sha256:")[0]! };
    const apply = (p: typeof post) => applySyncBatchToSnapshot(snapshot, { creator_id: "c", posts: [p] }, "job", "trace", bus);
    expect(apply(legacy).posts_written).toBe(1);
    expect(apply(post).posts_written).toBe(1);
    expect(apply(post).posts_written).toBe(0);
    expect(apply(legacy).posts_written).toBe(0);
    const edit = mapPatreonPostToIngest(resource({ title: "Changed" }));
    expect(apply(edit).posts_written).toBe(1);
    expect(apply(edit).posts_written).toBe(0);
    expect(snapshot.posts.c!.patreon_post_123!.current.title).toBe("Changed");
  });
  it("accepts fresh A-to-B-to-A snapshots once each, including media, while old batches still replay", async () => {
    const snapshot: CanonicalSnapshot = { campaigns: {}, tiers: {}, posts: {}, media: {}, ingest_idempotency: {} };
    const bus = new InMemoryEventBus();
    const service = new IngestService({ mutateForCreator: async (_id, mutate) => { await mutate(snapshot); } } as CanonicalStore, bus);
    const apply = async (title: string, image: string) => {
      const batch = { creator_id: "c", posts: [mapPatreonPostToIngest(resource({ title, content: `<img src="https://c10.patreonusercontent.com/${image}.png?token=new">` }))] };
      const result = await service.runBatch(batch, "trace", undefined, [], { currentPatreonSnapshot: true });
      return { result, batch };
    };
    const a = await apply("A", "a"), b = await apply("B", "b"), returned = await apply("A", "a");
    for (const { result } of [a, b, returned]) expect(result.posts_written).toBe(1);
    expect(returned.result.media_upserted).toBe(1);
    expect((await apply("A", "a")).result.posts_written).toBe(0);
    expect((await service.runBatch(b.batch, "old-replay")).posts_written).toBe(0);
    expect(snapshot.posts.c!.patreon_post_123!.current.title).toBe("A");
    expect(snapshot.media.c![returned.batch.posts[0]!.media[0]!.media_id]!.current.upstream_url).toContain("/a.png");
  });
  it("honors provider retry_after_seconds and stops after three rate-limited attempts", async () => {
    vi.useFakeTimers();
    const fake = vi.fn<typeof fetch>().mockImplementation(async () => Response.json({ errors: [{ retry_after_seconds: 2 }] }, { status: 429 }));
    const pending = fetchPostsPage({ access_token: "fixture", fetch_impl: fake }, "1");
    const checked = expect(pending).rejects.toMatchObject({ retriable: true, retryAfterMs: 2000 });
    await vi.advanceTimersByTimeAsync(1999); expect(fake).toHaveBeenCalledTimes(1);
    await vi.runAllTimersAsync(); await checked; expect(fake).toHaveBeenCalledTimes(3);
  });
  it("leaves long rate limits retryable without retrying early or echoing response secrets", async () => {
    const fake = vi.fn<typeof fetch>(async () => Response.json({ errors: [{ retry_after_seconds: 1800, detail: "secret" }] }, { status: 429 }));
    const error = await fetchPostsPage({ access_token: "fixture", fetch_impl: fake }, "1").catch((e: Error) => e);
    expect(error).toMatchObject({ retriable: true, retryAfterMs: 1_800_000 });
    expect((error as Error).message).not.toContain("secret");
    expect(classifySyncError((error as Error).message).code).toBe("patreon_retry_required");
    expect(fake).toHaveBeenCalledTimes(1);
  });
  it("bounds a response body that never finishes", async () => {
    vi.useFakeTimers();
    const fake = vi.fn<typeof fetch>(async () => ({ ok: true, status: 200, headers: new Headers(), text: () => new Promise(() => {}) }) as Response);
    const pending = fetchPostsPage({ access_token: "fixture", fetch_impl: fake }, "1");
    const checked = expect(pending).rejects.toMatchObject({ retriable: true });
    await vi.runAllTimersAsync(); await checked;
    expect(fake.mock.calls[0]![1]!.signal!.aborted).toBe(true);
    expect(fake.mock.calls.length).toBeLessThanOrEqual(3);
  });
  it("rejects a malformed successful document rather than treating it as an empty page", async () => {
    for (const doc of [{ errors: [] }, { data: {} }, { data: [null] }]) {
      await expect(fetchPostsPage({ access_token: "fixture", fetch_impl: async () => Response.json(doc) }, "1")).rejects.toThrow();
    }
  });
  it("honors Retry-After headers, including dates, without retrying sooner", async () => {
    vi.useFakeTimers();
    for (const kind of ["seconds", "date"]) {
      const header = kind === "seconds" ? "3" : new Date(Date.now() + 3000).toUTCString();
      const fake = vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json({}, { status: 503, headers: { "Retry-After": header } })).mockResolvedValue(Response.json({ data: [] }));
      const request = fetchPostsPage({ access_token: "fixture", fetch_impl: fake }, "1");
      await vi.advanceTimersByTimeAsync(2000); expect(fake).toHaveBeenCalledTimes(1);
      await vi.runAllTimersAsync(); await request; expect(fake).toHaveBeenCalledTimes(2);
    }
  });
  it("bounds a connection that never returns headers and retries a transient GET", async () => {
    vi.useFakeTimers();
    const fake = vi.fn<typeof fetch>().mockImplementationOnce(() => new Promise(() => {})).mockResolvedValue(Response.json({ data: [] }));
    const request = fetchPostsPage({ access_token: "fixture", fetch_impl: fake }, "1");
    await vi.runAllTimersAsync(); await expect(request).resolves.toEqual({ data: [] });
    expect(fake).toHaveBeenCalledTimes(2);
    expect(fake.mock.calls[0]![1]!.signal!.aborted).toBe(true);
  });
});
