import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { InMemoryEventBus } from "../src/events/event-bus.js";
import { applySyncBatchToSnapshot } from "../src/ingest/apply-batch.js";
import { enrichBatch } from "../src/ingest/auto-enrich.js";
import { FileCanonicalStore, type CanonicalSnapshot } from "../src/ingest/canonical-store.js";
import { ingestIdempotencyKey, legacyIngestIdempotencyKey } from "../src/ingest/idempotency.js";
import { IngestService } from "../src/ingest/ingest-service.js";
import { FileDeadLetterQueue } from "../src/ingest/dlq.js";
import { IngestRetryQueue } from "../src/ingest/retry-queue.js";
import { IngestReplayConflict, parseReplayResolutions, type ReplayIdentity } from "../src/ingest/replay-compatibility.js";
import type { IngestPost, SyncBatchInput } from "../src/ingest/types.js";
import { validateIngestBatchBody } from "../src/ingest/validate-body.js";

const firstSeen = "2026-01-01T00:00:00.000Z";
const empty = (): CanonicalSnapshot => ({ ingest_idempotency: {}, campaigns: {}, tiers: {}, posts: {}, media: {} });
const post = (id: string, revision: string): IngestPost => ({
  post_id: id, upstream_revision: revision, title: id, published_at: firstSeen, tag_ids: [], tier_ids: [], media: []
});
const batch = (...posts: IngestPost[]): SyncBatchInput => ({ creator_id: "c1", posts });
const parts = (p: IngestPost): ReplayIdentity => ["ingest_post", "c1", p.post_id, p.upstream_revision];
const a = post("post|part", "r1");
const b = post("post", "part|r1");

function legacyPost(p = a): CanonicalSnapshot {
  const snapshot = empty();
  applySyncBatchToSnapshot(snapshot, batch(p), "seed", "trace", new InMemoryEventBus());
  snapshot.ingest_idempotency = { [legacyIngestIdempotencyKey(parts(p))]: { first_seen_at: firstSeen } };
  return snapshot;
}

describe("versioned replay identity", () => {
  it.each(["ingest_campaign", "ingest_tier", "ingest_post", "ingest_media_rev"])("separates ambiguous %s tuples and preserves legacy lookup", (namespace) => {
    const x = [namespace, "c1", "entity|part", "revision"];
    const y = [namespace, "c1", "entity", "part|revision"];
    expect(legacyIngestIdempotencyKey(x)).toBe(createHash("sha256").update(x.join("|")).digest("hex"));
    expect(legacyIngestIdempotencyKey(x)).toBe(legacyIngestIdempotencyKey(y));
    expect(ingestIdempotencyKey(x)).toMatch(/^ingest:v2:[a-f0-9]{64}$/);
    expect(ingestIdempotencyKey(x)).not.toBe(ingestIdempotencyKey(y));
    expect(ingestIdempotencyKey(x)).toBe(ingestIdempotencyKey([...x]));
  });

  it("imports colliding posts once each and replays independently after reload", () => {
    const snapshot = empty();
    const bus = new InMemoryEventBus();
    expect(applySyncBatchToSnapshot(snapshot, batch(a, b), "j1", "trace", bus)).toMatchObject({ posts_written: 2, events_emitted: 2 });
    const reloaded = JSON.parse(JSON.stringify(snapshot));
    expect(applySyncBatchToSnapshot(reloaded, batch(b, a), "j2", "trace", bus)).toMatchObject({ posts_written: 0, events_emitted: 0 });
    expect(Object.keys(reloaded.ingest_idempotency)).toHaveLength(2);
    expect(Object.keys(reloaded.ingest_idempotency).every((key) => key.startsWith("ingest:v2:"))).toBe(true);
    expect(reloaded.posts.c1[a.post_id].versions).toHaveLength(1);
    expect(reloaded.posts.c1[b.post_id].versions).toHaveLength(1);
  });

  it("keeps creator and entity namespaces separate, including delimiters, quotes and unicode", () => {
    const tuples = [
      ["ingest_post", "c1|post", "part", "r1"], parts(a),
      ["ingest_media_rev", "c1", a.post_id, "r1"],
      ["ingest_post", "c1", 'post|"雪"', "r1"], ["ingest_post", "c1", "post", '|"雪"|r1']
    ];
    expect(new Set(tuples.map(ingestIdempotencyKey)).size).toBe(tuples.length);
  });
});

describe("legacy compatibility and exact reconciliation", () => {
  it("preserves an unambiguous legacy marker even when entity history is missing", () => {
    const p = post("ordinary", "r1");
    const snapshot = empty();
    const legacy = legacyIngestIdempotencyKey(parts(p));
    snapshot.ingest_idempotency[legacy] = { first_seen_at: firstSeen };
    const bus = new InMemoryEventBus();
    expect(applySyncBatchToSnapshot(snapshot, batch(p), "j", "trace", bus)).toMatchObject({ posts_written: 0, events_emitted: 0 });
    expect(snapshot.posts).toEqual({});
    expect(snapshot.ingest_idempotency).toEqual({
      [legacy]: { first_seen_at: firstSeen }, [ingestIdempotencyKey(parts(p))]: { first_seen_at: firstSeen }
    });
  });

  it("recognizes an exact historical post revision without overwriting newer content", () => {
    const snapshot = legacyPost();
    applySyncBatchToSnapshot(snapshot, batch(post(a.post_id, "r2")), "j1", "trace", new InMemoryEventBus());
    snapshot.posts.c1![a.post_id]!.upstream_status = "deleted";
    const before = structuredClone(snapshot.posts);
    expect(applySyncBatchToSnapshot(snapshot, batch(a), "j2", "trace", new InMemoryEventBus())).toMatchObject({ posts_written: 0, events_emitted: 0 });
    expect(snapshot.posts).toEqual(before);
    expect(snapshot.ingest_idempotency[ingestIdempotencyKey(parts(a))]).toEqual({ first_seen_at: firstSeen });
  });

  it("stops a late ambiguous identity before any batch mutation or event", () => {
    const snapshot = legacyPost();
    const before = structuredClone(snapshot);
    const bus = new InMemoryEventBus();
    const input = batch(post("new", "r1"), b);
    input.campaigns = [{ campaign_id: "new-campaign", name: "New", upstream_updated_at: firstSeen }];
    expect(() => applySyncBatchToSnapshot(snapshot, input, "j", "trace", bus)).toThrow(IngestReplayConflict);
    expect(snapshot).toEqual(before);
    expect(bus.getAll()).toEqual([]);
  });

  it("admits only the exact reconciled collision once and retains both replay identities", () => {
    const snapshot = legacyPost();
    const bus = new InMemoryEventBus();
    const decisions = [{ parts: parts(b), action: "import_once" as const }];
    expect(applySyncBatchToSnapshot(snapshot, batch(b), "j1", "trace", bus, decisions)).toMatchObject({ posts_written: 1 });
    expect(applySyncBatchToSnapshot(snapshot, batch(b, a), "j2", "trace", bus, decisions)).toMatchObject({ posts_written: 0, events_emitted: 0 });
    expect(snapshot.posts.c1![a.post_id]!.versions).toHaveLength(1);
    expect(snapshot.posts.c1![b.post_id]!.versions).toHaveLength(1);
    expect(snapshot.ingest_idempotency[legacyIngestIdempotencyKey(parts(a))]).toEqual({ first_seen_at: firstSeen });
    expect(bus.getAll()).toHaveLength(1);
  });

  it("can record an operator-confirmed replay without inventing missing entity history", () => {
    const snapshot = legacyPost();
    delete snapshot.posts.c1;
    const bus = new InMemoryEventBus();
    expect(applySyncBatchToSnapshot(snapshot, batch(b), "j", "trace", bus, [{ parts: parts(b), action: "already_processed" }]))
      .toMatchObject({ posts_written: 0, events_emitted: 0 });
    expect(snapshot.posts).toEqual({});
    expect(snapshot.ingest_idempotency[ingestIdempotencyKey(parts(b))]).toEqual({ first_seen_at: firstSeen });
  });

  it("does not let import_once override a proven replay", () => {
    const snapshot = legacyPost();
    expect(applySyncBatchToSnapshot(snapshot, batch(a), "j", "trace", new InMemoryEventBus(), [{ parts: parts(a), action: "import_once" }]))
      .toMatchObject({ posts_written: 0 });
  });

  it.each(["ingest_campaign", "ingest_tier"] as const)("uses exact current %s evidence and stops missing historical timestamps", (namespace) => {
    const snapshot = empty();
    const id = "entity|part";
    const identity: ReplayIdentity = [namespace, "c1", id, firstSeen];
    snapshot.ingest_idempotency[legacyIngestIdempotencyKey(identity)] = { first_seen_at: firstSeen };
    const row = { creator_id: "c1", upstream_updated_at: firstSeen, version_seq: 1 };
    const input: SyncBatchInput = namespace === "ingest_campaign"
      ? { creator_id: "c1", campaigns: [{ campaign_id: id, name: "Old", upstream_updated_at: firstSeen }] }
      : { creator_id: "c1", tiers: [{ tier_id: id, title: "Old", upstream_updated_at: firstSeen }] };
    if (namespace === "ingest_campaign") snapshot.campaigns.c1 = { [id]: { ...row, campaign_id: id, name: "Old" } };
    else snapshot.tiers.c1 = { [id]: { ...row, tier_id: id, title: "Old" } };
    expect(applySyncBatchToSnapshot(snapshot, input, "j", "trace", new InMemoryEventBus()).idempotent_skips).toBe(1);
    delete snapshot.ingest_idempotency[ingestIdempotencyKey(identity)];
    snapshot.legacy_timestamps_normalized = true;
    expect(() => applySyncBatchToSnapshot(snapshot, input, "j", "trace", new InMemoryEventBus())).toThrow(IngestReplayConflict);
    delete snapshot.legacy_timestamps_normalized;
    const stored = namespace === "ingest_campaign" ? snapshot.campaigns.c1![id]! : snapshot.tiers.c1![id]!;
    stored.upstream_updated_at = "2026-02-01T00:00:00.000Z";
    expect(() => applySyncBatchToSnapshot(snapshot, input, "j", "trace", new InMemoryEventBus())).toThrow(IngestReplayConflict);
    // A DB-normalized date is not proof of the original timestamp string.
    stored.upstream_updated_at = firstSeen.replace(".000Z", "Z");
    expect(() => applySyncBatchToSnapshot(snapshot, input, "j", "trace", new InMemoryEventBus())).toThrow(IngestReplayConflict);
  });

  it("does not borrow legacy evidence from another creator", () => {
    const snapshot = legacyPost();
    snapshot.posts.other = snapshot.posts.c1!;
    delete snapshot.posts.c1;
    const before = structuredClone(snapshot);
    expect(() => applySyncBatchToSnapshot(snapshot, batch(a), "j", "trace", new InMemoryEventBus())).toThrow(IngestReplayConflict);
    expect(snapshot).toEqual(before);
  });

  it("ignores reconciliation fields in the public wire payload", () => {
    const parsed = validateIngestBatchBody({ ...batch(b), replay_resolutions: [{ parts: parts(b), action: "import_once" }] });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(() => applySyncBatchToSnapshot(legacyPost(), parsed.batch, "j", "trace", new InMemoryEventBus())).toThrow(IngestReplayConflict);
  });

  it.each([
    [{ parts: ["ingest_post", "other", "post", "part|r1"], action: "import_once" }],
    [{ parts: ["ingest_post", "c1", "missing", "r1"], action: "import_once" }],
    [{ parts: parts(b), action: "import_once" }, { parts: parts(b), action: "already_processed" }],
    [{ parts: parts(b), action: "unknown" }],
    [{ parts: ["ingest_post", "c1", ""], action: "import_once" }]
  ].map((decisions) => ({ decisions })))("rejects invalid, duplicate, foreign or unused operator decisions", ({ decisions }) => {
    const snapshot = legacyPost();
    const before = structuredClone(snapshot);
    expect(() => applySyncBatchToSnapshot(snapshot, batch(b), "j", "trace", new InMemoryEventBus(), parseReplayResolutions(decisions))).toThrow();
    expect(snapshot).toEqual(before);
  });

  it("refuses a stale decision when no legacy marker or completed v2 identity exists", () => {
    const snapshot = empty();
    expect(() => applySyncBatchToSnapshot(snapshot, batch(b), "j", "trace", new InMemoryEventBus(), [{ parts: parts(b), action: "already_processed" }])).toThrow("existing legacy marker");
    expect(snapshot).toEqual(empty());
  });

  it("preserves lenient timestamp identity strings when reconciling file-store records", () => {
    const snapshot = empty();
    const identity: ReplayIdentity = ["ingest_campaign", "c1", "camp|part", " "];
    snapshot.ingest_idempotency[legacyIngestIdempotencyKey(identity)] = { first_seen_at: firstSeen };
    const input = { creator_id: "c1", campaigns: [{ campaign_id: "camp|part", name: "Old", upstream_updated_at: " " }] };
    const decisions = parseReplayResolutions([{ parts: identity, action: "already_processed" }]);
    expect(applySyncBatchToSnapshot(snapshot, input, "j", "trace", new InMemoryEventBus(), decisions)).toMatchObject({ campaigns_upserted: 0 });
    expect(snapshot.ingest_idempotency[ingestIdempotencyKey(identity)]).toEqual({ first_seen_at: firstSeen });
  });

  it("does not inspect unused media behind a replayed post", () => {
    const snapshot = legacyPost(post("ordinary", "r1"));
    const p = post("ordinary", "r1");
    p.media = [{ media_id: "unknown|media", upstream_revision: "r1" }];
    snapshot.ingest_idempotency[legacyIngestIdempotencyKey(["ingest_media_rev", "c1", "unknown|media", "r1"])] = { first_seen_at: firstSeen };
    expect(applySyncBatchToSnapshot(snapshot, batch(p), "j", "trace", new InMemoryEventBus())).toMatchObject({ posts_written: 0, media_upserted: 0 });
  });
});

describe("media legacy compatibility", () => {
  it("does not bypass an ambiguous legacy marker when the target media is absent", () => {
    const snapshot = empty();
    const owner = post("owner", "r1");
    owner.media = [{ media_id: "media|part", upstream_revision: "r1" }];
    applySyncBatchToSnapshot(snapshot, batch(owner), "seed", "trace", new InMemoryEventBus());
    const legacy = legacyIngestIdempotencyKey(["ingest_media_rev", "c1", "media|part", "r1"]);
    snapshot.ingest_idempotency[legacy] = { first_seen_at: firstSeen };
    delete snapshot.ingest_idempotency[ingestIdempotencyKey(["ingest_media_rev", "c1", "media|part", "r1"])];
    const incoming = post("new-post", "r1");
    incoming.media = [{ media_id: "media", upstream_revision: "part|r1" }];
    const identity: ReplayIdentity = ["ingest_media_rev", "c1", "media", "part|r1"];
    const before = structuredClone(snapshot);
    const bus = new InMemoryEventBus();
    expect(() => applySyncBatchToSnapshot(snapshot, batch(incoming), "j1", "trace", bus)).toThrow(IngestReplayConflict);
    expect(snapshot).toEqual(before);
    expect(bus.getAll()).toEqual([]);
    expect(applySyncBatchToSnapshot(snapshot, batch(incoming), "j2", "trace", bus, [{ parts: identity, action: "import_once" }]))
      .toMatchObject({ posts_written: 1, media_upserted: 1 });
    expect(snapshot.media.c1!.media!.current.upstream_revision).toBe("part|r1");
    expect(snapshot.ingest_idempotency[legacy]).toEqual({ first_seen_at: firstSeen });
    expect(applySyncBatchToSnapshot(snapshot, batch(incoming), "j3", "trace", bus)).toMatchObject({ posts_written: 0, media_upserted: 0 });
  });

  it("uses media history to suppress older revisions without changing URL or deletion status", () => {
    const snapshot = empty();
    const owner = post("owner", "r1");
    owner.media = [{ media_id: "media|part", upstream_revision: "r1", upstream_url: "https://cdn.example/old" }];
    applySyncBatchToSnapshot(snapshot, batch(owner), "seed", "trace", new InMemoryEventBus());
    const identity: ReplayIdentity = ["ingest_media_rev", "c1", "media|part", "r1"];
    snapshot.ingest_idempotency[legacyIngestIdempotencyKey(identity)] = { first_seen_at: firstSeen };
    delete snapshot.ingest_idempotency[ingestIdempotencyKey(identity)];
    const newer = post("owner", "r2");
    newer.media = [{ ...owner.media[0]!, upstream_revision: "r2", upstream_url: "https://cdn.example/new" }];
    applySyncBatchToSnapshot(snapshot, batch(newer), "newer", "trace", new InMemoryEventBus());
    snapshot.media.c1!["media|part"]!.upstream_status = "deleted";
    const incoming = post("another", "r1");
    incoming.media = owner.media;
    expect(applySyncBatchToSnapshot(snapshot, batch(incoming), "j", "trace", new InMemoryEventBus())).toMatchObject({ posts_written: 1, media_upserted: 0 });
    expect(snapshot.media.c1!["media|part"]).toMatchObject({ upstream_status: "deleted", current: { upstream_revision: "r2", upstream_url: "https://cdn.example/new" } });
    expect(snapshot.media.c1!["media|part"]!.versions).toHaveLength(2);
    expect(snapshot.ingest_idempotency[ingestIdempotencyKey(identity)]).toEqual({ first_seen_at: firstSeen });
  });

  it("preflights media when earlier entries can change an expanded post's access", () => {
    const paid = (id: string) => ({ tier_id: id, title: id, amount_cents: 100, upstream_updated_at: firstSeen });
    const snapshot = empty();
    const serviceBatch = (tiers: string[]): SyncBatchInput => ({ creator_id: "c1", tiers: tiers.map(paid), posts: [
      { ...post("p", "r1"), tier_ids: ["relay_tier_all_patrons"] }
    ] });
    // Seed the first access state through the same enrichment as the service.
    const initial = enrichBatch(serviceBatch(["patreon_tier_a"])).batch;
    applySyncBatchToSnapshot(snapshot, initial, "seed", "trace", new InMemoryEventBus());
    const changed = enrichBatch(serviceBatch(["patreon_tier_a", "patreon_tier_b"])).batch.posts![0]!;
    const returning = structuredClone(initial.posts![0]!);
    returning.media = [{ media_id: "ambiguous|media", upstream_revision: "m1" }];
    snapshot.ingest_idempotency[legacyIngestIdempotencyKey(["ingest_media_rev", "c1", "ambiguous|media", "m1"])] = { first_seen_at: firstSeen };
    const before = structuredClone(snapshot);
    const bus = new InMemoryEventBus();
    expect(() => applySyncBatchToSnapshot(snapshot, batch(changed, returning), "j", "trace", bus)).toThrow(IngestReplayConflict);
    expect(snapshot).toEqual(before);
    expect(bus.getAll()).toEqual([]);
  });
});

describe("legacy file persistence", () => {
  it("leaves a conflicted file unchanged, reconciles once, then replays after restart", async () => {
    const root = await mkdtemp(join(tmpdir(), "relay-replay-v2-"));
    const path = join(root, "canonical.json");
    try {
      const store = new FileCanonicalStore(path);
      await store.save(legacyPost());
      const before = await readFile(path, "utf8");
      const bus = new InMemoryEventBus();
      const service = new IngestService(store, bus);
      await expect(service.runBatch(batch(post("new", "r1"), b), "trace")).rejects.toThrow(IngestReplayConflict);
      expect(await readFile(path, "utf8")).toBe(before);
      expect(bus.getAll()).toEqual([]);
      const dlq = new FileDeadLetterQueue(join(root, "dlq.json"));
      const queue = new IngestRetryQueue({ max_attempts: 2, base_delay_ms: 0 }, async (input, trace, job) => {
        await service.runBatch(input, trace, job);
      }, dlq, async () => {});
      queue.enqueue({ id: "conflict-job", creator_id: "c1", trace_id: "trace", batch: batch(b), attempts: 0 });
      await queue.drain();
      expect(await dlq.readAll()).toMatchObject([{ job_id: "conflict-job", attempts: 2, error_message: expect.stringContaining("INGEST_REPLAY_CONFLICT") }]);
      expect(await readFile(path, "utf8")).toBe(before);
      expect(bus.getAll()).toEqual([]);
      await service.runBatch(batch(b), "trace", undefined, [{ parts: parts(b), action: "import_once" }]);
      const restarted = new IngestService(new FileCanonicalStore(path), bus);
      expect(await restarted.runBatch(batch(a, b), "trace")).toMatchObject({ posts_written: 0, events_emitted: 0 });
      const snapshot = await store.load();
      expect(snapshot.ingest_idempotency[legacyIngestIdempotencyKey(parts(a))]).toEqual({ first_seen_at: firstSeen });
      expect(snapshot.posts.c1![a.post_id]!.versions).toHaveLength(1);
      expect(snapshot.posts.c1![b.post_id]!.versions).toHaveLength(1);
      expect(bus.getAll()).toHaveLength(1);
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  it("does not treat unreadable or corrupt legacy storage as an empty store", async () => {
    const root = await mkdtemp(join(tmpdir(), "relay-replay-read-"));
    const path = join(root, "canonical.json");
    try {
      await writeFile(path, "{broken");
      const bus = new InMemoryEventBus();
      await expect(new IngestService(new FileCanonicalStore(path), bus).runBatch(batch(b), "trace")).rejects.toThrow();
      expect(await readFile(path, "utf8")).toBe("{broken");
      await expect(new FileCanonicalStore(root).load()).rejects.toThrow();
      expect(await new FileCanonicalStore(join(root, "new.json")).load()).toEqual(empty());
      expect(bus.getAll()).toEqual([]);
    } finally { await rm(root, { recursive: true, force: true }); }
  });
});
