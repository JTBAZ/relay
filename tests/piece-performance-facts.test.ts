import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { buildPiecePerformanceFacts, readPiecePerformanceBinding } from "../src/analytics/piece-performance-facts.js";

const CUTOFF = new Date("2026-10-22T12:00:00.000Z");
const START = new Date("2026-09-22T00:00:00.000Z");
const link = {
  id: "pi_x", postId: "post-a", destination: "x", externalUrl: "https://x.example/post/1", externalId: "x1",
  attemptId: "attempt-x", linkedAt: new Date("2026-10-01T00:00:00Z"), status: "active"
};

function createPrisma(overrides: Record<string, unknown> = {}) {
  const tenantFind = vi.fn(async (args: any) => {
    expect(args.where).toEqual({ relayCreatorId: "creator-a" });
    return overrides.noTenant ? null : { id: "tenant-a" };
  });
  const postFind = vi.fn(async (args: any) => {
    expect(args.where.creatorId).toBe("creator-a");
    if (overrides.postMissing) return null;
    return args.where.id === "post-a" ? { id: "post-a", versions: [{ title: (overrides.title as string) ?? "Blue Hour" }] } : null;
  });
  const postMany = vi.fn(async (args: any) => {
    expect(args.where.creatorId).toBe("creator-a");
    const ids = (overrides.work as any)?.members?.map((member: any) => member.postId) ?? ["post-a"];
    return ids.map((id: string) => ({ id }));
  });
  const workFind = vi.fn(async (args: any) => {
    expect(args.where.creatorId).toBe("creator-a");
    return (overrides.work as unknown) ?? null;
  });
  const instanceFind = vi.fn(async (args: any) => {
    expect(args.where.creatorId).toBe("creator-a");
    expect(args.where.status).toBe("active");
    expect(args.take).toBe(33);
    return (overrides.links as unknown[] | undefined) ?? (overrides.noLinks ? [] : [link]);
  });
  const snapshotFind = vi.fn(async (args: any) => {
    expect(args.where).toMatchObject({ creatorId: "creator-a", postId: "post-a", capturedAt: { lte: CUTOFF } });
    expect(args.take).toBe(201);
    expect(args.orderBy).toEqual([{ capturedAt: "desc" }, { id: "asc" }]);
    expect(args.where.source.in).toEqual(["platform_api", "extension_dom", "third_party", "public_scrape", "manual"]);
    expect(args.where.OR).toEqual(expect.arrayContaining([expect.objectContaining({ platformInstanceId: expect.any(String) })]));
    if (overrides.snapshotFailure || overrides.snapshotFailureMetric === args.where.metricType) throw new Error("redacted database failure");
    const metric = args.where.metricType;
    return (overrides.snapshots as Record<string, unknown[]>)?.[metric] ?? [];
  });
  const snapshotLatest = vi.fn(async (args: any) => {
    expect(args.where).toMatchObject({ creatorId: "creator-a", postId: "post-a", capturedAt: { lte: CUTOFF } });
    if (overrides.snapshotFailure || overrides.snapshotFailureMetric === args.where.metricType) throw new Error("redacted database failure");
    const rows = ((overrides.snapshots as Record<string, any[]>)?.[args.where.metricType] ?? [])
      .filter((row) => row.source === args.where.source)
      .sort((a, b) => b.capturedAt.getTime() - a.capturedAt.getTime() || a.id.localeCompare(b.id));
    return rows[0] ?? null;
  });
  const dailyFind = vi.fn(async (args: any) => {
    expect(args.where.creatorId).toBe("creator-a");
    expect(args.where.postId).toEqual({ in: ["post-a"] });
    expect(args.where.day.gte).toEqual(START);
    return (overrides.rollups as unknown[]) ?? [];
  });
  const csvFind = vi.fn(async (args: any) => {
    expect(args.where).toMatchObject({ creatorId: "creator-a", postId: "post-a", import: { creatorId: "creator-a", uploadedAt: { lte: CUTOFF } } });
    if (overrides.csvFailure) throw new Error("redacted database failure");
    return ((overrides.csv as any[]) ?? []).filter((row) => row.import.uploadedAt <= args.where.import.uploadedAt.lte);
  });
  const queryRaw = vi.fn(async (query: any) => {
    const sql = query?.sql ?? "";
    expect(sql).toContain("date_trunc('day'");
    expect(sql).toContain("creator_id");
    if (overrides.relayFailure) throw new Error("redacted database failure");
    return sql.includes("relay_engagement_events") ? ((overrides.relay as unknown[]) ?? []) : ((overrides.telemetry as unknown[]) ?? []);
  });
  return {
    tenant: { findUnique: tenantFind }, post: { findFirst: postFind, findMany: postMany },
    creativeWork: { findFirst: workFind }, platformInstance: { findMany: instanceFind },
    externalPostMetricSnapshot: { findMany: snapshotFind, findFirst: snapshotLatest },
    patreonInsightsPostMetric: { findMany: csvFind }, externalPostMetricDaily: { findMany: dailyFind },
    $queryRaw: queryRaw,
    calls: { tenantFind, postFind, instanceFind, snapshotFind, snapshotLatest, dailyFind, csvFind, queryRaw }
  } as unknown as PrismaClient & { calls: Record<string, ReturnType<typeof vi.fn>> };
}

function snapshot(input: Partial<Record<string, unknown>> = {}) {
  return {
    id: "snap-1", postId: "post-a", creatorId: "creator-a", destination: "x", platformInstanceId: "pi_x", attemptId: "attempt-x",
    externalUrl: link.externalUrl, externalId: link.externalId, metricType: "likes", value: 5, source: "platform_api", capturedAt: new Date("2026-10-22T10:00:00Z"),
    ...input
  };
}

async function build(prisma: PrismaClient) {
  return buildPiecePerformanceFacts(prisma, "creator-a", { selectedPostIds: ["post-a"], range: "30d", asOf: CUTOFF });
}

describe("buildPiecePerformanceFacts", () => {
  it("keeps default post scope to the selected post and asserts creator-scoped bounded reads", async () => {
    const prisma = createPrisma({ snapshots: { likes: [snapshot()] } });
    const result = await build(prisma);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.facts.subject).toEqual({ kind: "post", id: "post-a", title: "Blue Hour", post_ids: ["post-a"] });
    expect(prisma.calls.postFind).toHaveBeenCalledTimes(1);
    expect(prisma.calls.snapshotFind).toHaveBeenCalledTimes(5);
    expect(result.facts.metrics.find((fact) => fact.metric === "likes" && fact.basis === "captured_total")?.value).toBe(5);
  });

  it("uses the newest null snapshot as unknown and does not revive an older value", async () => {
    const prisma = createPrisma({ snapshots: { likes: [
      snapshot({ id: "new-null", value: null, capturedAt: new Date("2026-10-22T11:00:00Z") }),
      snapshot({ id: "old-known", value: 99, capturedAt: new Date("2026-10-20T11:00:00Z") })
    ] } });
    const result = await build(prisma);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const fact = result.facts.metrics.find((item) => item.metric === "likes" && item.basis === "captured_total");
    expect(fact).toMatchObject({ value: null, availability: "unavailable", unavailable_reason: "not_collected" });
  });

  it("uses existing source precedence for equal-time snapshots, then a stable ID tie break", async () => {
    const sameTime = new Date("2026-10-22T10:00:00Z");
    const prisma = createPrisma({ snapshots: { likes: [
      snapshot({ id: "z-api", source: "platform_api", value: 8, capturedAt: sameTime }),
      snapshot({ id: "a-extension", source: "extension_dom", value: 7, capturedAt: sameTime })
    ] } });
    const result = await build(prisma);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.facts.metrics.find((item) => item.metric === "likes" && item.basis === "captured_total")?.value).toBe(8);
  });

  it("preserves a real zero and uses observation age rather than fresh rollup computation time", async () => {
    const prisma = createPrisma({
      snapshots: { comments: [snapshot({ id: "zero", metricType: "comments", value: 0, capturedAt: new Date("2026-10-18T10:00:00Z") })] },
      rollups: [{ id: "recent-compute", postId: "post-a", destination: "x", metricType: "comments", day: new Date("2026-10-20T00:00:00Z"), value: 0, deltaFromPrior: null, source: "platform_api", computedAt: new Date("2026-10-22T11:59:00Z") }]
    });
    const result = await build(prisma);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const fact = result.facts.metrics.find((item) => item.metric === "comments" && item.basis === "captured_total");
    expect(fact).toMatchObject({ value: 0, captured_at: "2026-10-18T10:00:00.000Z", stale: true });
  });

  it("requires a start-boundary baseline before reporting rollup change", async () => {
    const prisma = createPrisma({
      snapshots: { likes: [snapshot({ id: "old-base", value: 10, capturedAt: new Date("2026-09-20T00:00:00Z") }), snapshot({ id: "within-window", value: 20, capturedAt: new Date("2026-10-01T00:00:00Z") })] }
    });
    const result = await build(prisma);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.facts.metrics.find((item) => item.destination === "x" && item.metric === "likes" && item.basis === "window_change")).toMatchObject({ value: null, unavailable_reason: "incomplete_baseline" });
  });

  it("accepts an exact-cutoff snapshot baseline and derives a raw counter delta", async () => {
    const prisma = createPrisma({
      snapshots: { likes: [snapshot({ id: "start-base", value: 10, capturedAt: START }), snapshot({ id: "in-window", value: 15, capturedAt: new Date("2026-10-01T00:00:00Z") })] }
    });
    const result = await build(prisma);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.facts.metrics.find((item) => item.destination === "x" && item.metric === "likes" && item.basis === "window_change")).toMatchObject({ value: 5, availability: "available" });
  });

  it("rejects an unselected post promotion and malformed subject keys", async () => {
    const prisma = createPrisma();
    const outside = await buildPiecePerformanceFacts(prisma, "creator-a", { selectedPostIds: ["post-a"], subject: { kind: "post", id: "sibling" }, range: "30d", asOf: CUTOFF });
    const malformed = await buildPiecePerformanceFacts(prisma, "creator-a", { selectedPostIds: ["post-a"], subject: { kind: "post", id: "post-a", title: "client title" } as never, range: "30d", asOf: CUTOFF });
    expect(outside).toEqual({ ok: false, code: "INVALID_SELECTION" });
    expect(malformed).toEqual({ ok: false, code: "INVALID_SELECTION" });
    expect(prisma.calls.postFind).not.toHaveBeenCalled();
  });

  it("fingerprints owned title and link identity while ignoring later metric captures", async () => {
    const original = createPrisma();
    const changedTitle = createPrisma({ title: "Changed title" });
    const changedLink = createPrisma({ links: [{ ...link, externalUrl: "https://x.example/post/relinked", externalId: "x2" }] });
    const advancedCapture = createPrisma({ snapshots: { likes: [snapshot({ capturedAt: new Date("2026-10-22T11:30:00Z"), value: 400 })] } });
    const request = { selectedPostIds: ["post-a"], subject: { kind: "post" as const, id: "post-a" } };
    const [a, b, c, d] = await Promise.all([
      readPiecePerformanceBinding(original, "creator-a", request),
      readPiecePerformanceBinding(changedTitle, "creator-a", request),
      readPiecePerformanceBinding(changedLink, "creator-a", request),
      buildPiecePerformanceFacts(advancedCapture, "creator-a", { ...request, range: "30d", asOf: CUTOFF })
    ]);
    expect(a.ok && b.ok && c.ok && d.ok).toBe(true);
    if (!a.ok || !b.ok || !c.ok || !d.ok) return;
    expect(a.binding.subject_fingerprint).not.toBe(b.binding.subject_fingerprint);
    expect(a.binding.subject_fingerprint).not.toBe(c.binding.subject_fingerprint);
    expect(a.binding.subject_fingerprint).toBe(d.facts.subject_fingerprint);
  });

  it("fingerprints complete work membership and keeps submitted anchors inside the work", async () => {
    const work = (memberIds: string[]) => ({ id: "work-a", creatorId: "creator-a", title: "Series", titleMode: "independent", seriesMember: null, members: memberIds.map((postId, sortOrder) => ({ postId, sortOrder })) });
    const a = createPrisma({ work: work(["post-a", "post-b"]), noLinks: true });
    const b = createPrisma({ work: work(["post-a", "post-c"]), noLinks: true });
    const request = { selectedPostIds: ["post-a"], subject: { kind: "work" as const, id: "work-a" } };
    const [first, second] = await Promise.all([
      readPiecePerformanceBinding(a, "creator-a", request),
      readPiecePerformanceBinding(b, "creator-a", request)
    ]);
    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(first.binding.subject.post_ids).toEqual(["post-a", "post-b"]);
    expect(first.binding.subject_fingerprint).not.toBe(second.binding.subject_fingerprint);
  });

  it("merges same-day Relay view sources by max and reports no events as unknown coverage", async () => {
    const day = new Date("2026-10-01T00:00:00Z");
    const relay = createPrisma({ noLinks: true, relay: [{ postId: "post-a", metric: "views", day, count: 4n, observedAt: new Date("2026-10-01T17:00:00Z") }], telemetry: [{ postId: "post-a", metric: "views", eventName: "post_view", day, count: 6n, observedAt: new Date("2026-10-01T18:00:00Z") }] });
    const result = await build(relay);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.facts.metrics.find((fact) => fact.destination === "relay" && fact.metric === "views" && fact.basis === "window_change")).toMatchObject({ value: 6, source: "manual", captured_at: "2026-10-01T18:00:00.000Z" });
    expect(result.facts.metrics.some((fact) => fact.destination === "relay" && fact.metric === "views" && fact.basis === "captured_total")).toBe(false);

    const noEvents = await build(createPrisma({ noLinks: true }));
    expect(noEvents.ok).toBe(true);
    if (noEvents.ok) expect(noEvents.facts.coverage.find((item) => item.destination === "relay")).toMatchObject({ state: "no_observations", missing_metrics: ["views", "likes", "comments"] });
  });

  it("marks an explicitly requested destination with no current link as unlinked", async () => {
    const result = await buildPiecePerformanceFacts(createPrisma({ noLinks: true }) as PrismaClient, "creator-a", { selectedPostIds: ["post-a"], range: "30d", destination: "x", asOf: CUTOFF });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.facts.coverage).toContainEqual(expect.objectContaining({ destination: "x", state: "unlinked" }));
  });

  it("uses the distribution catalog for destination validation and includes Relay", async () => {
    const accepted = await buildPiecePerformanceFacts(createPrisma({ noLinks: true }) as PrismaClient, "creator-a", { selectedPostIds: ["post-a"], range: "30d", destination: "bluesky", asOf: CUTOFF });
    const rejected = await buildPiecePerformanceFacts(createPrisma() as PrismaClient, "creator-a", { selectedPostIds: ["post-a"], range: "30d", destination: "instagram", asOf: CUTOFF });
    expect(accepted.ok).toBe(true);
    expect(rejected).toEqual({ ok: false, code: "INVALID_ARGUMENT" });
  });

  it("returns not found for missing or foreign ownership and never reads evidence without a tenant", async () => {
    const missingPost = await build(createPrisma({ postMissing: true }));
    const missingTenant = await build(createPrisma({ noTenant: true }));
    expect(missingPost).toEqual({ ok: false, code: "NOT_FOUND" });
    expect(missingTenant).toEqual({ ok: false, code: "NOT_FOUND" });
  });

  it("detects work and active-link scope overflow with one past-limit row", async () => {
    const members = Array.from({ length: 17 }, (_, index) => ({ postId: `post-${index}`, sortOrder: index }));
    const workWide = createPrisma({ work: { id: "work-a", creatorId: "creator-a", title: "Wide", titleMode: "independent", seriesMember: null, members } });
    const tooManyMembers = await buildPiecePerformanceFacts(workWide, "creator-a", { selectedPostIds: ["post-0"], subject: { kind: "work", id: "work-a" }, range: "30d", asOf: CUTOFF });
    const links = Array.from({ length: 33 }, (_, index) => ({ ...link, id: `pi-${index}`, destination: `platform-${index}` }));
    const tooManyLinks = await buildPiecePerformanceFacts(createPrisma({ links }), "creator-a", { selectedPostIds: ["post-a"], range: "30d", asOf: CUTOFF });
    expect(tooManyMembers).toEqual({ ok: false, code: "TOO_BROAD" });
    expect(tooManyLinks).toEqual({ ok: false, code: "TOO_BROAD" });
  });

  it("accepts an exact legacy attempt-only snapshot and rejects stale relink identity", async () => {
    const oldStyle = snapshot({ platformInstanceId: null, attemptId: "attempt-x", value: 12 });
    const accepted = await build(createPrisma({ snapshots: { likes: [oldStyle] } }));
    const stale = await build(createPrisma({ snapshots: { likes: [snapshot({ externalUrl: "https://x.example/post/old", value: 88 })] } }));
    expect(accepted.ok && accepted.facts.metrics.find((fact) => fact.destination === "x" && fact.metric === "likes" && fact.basis === "captured_total")?.value).toBe(12);
    expect(stale.ok && stale.facts.metrics.some((fact) => fact.destination === "x" && fact.metric === "likes" && fact.basis === "captured_total")).toBe(false);
  });

  it("uses only owned Patreon CSV rows at or before cutoff, with import-time fallback", async () => {
    const patreonLink = { ...link, id: "pi_patron", destination: "patreon", externalUrl: "https://www.patreon.com/posts/one-123", externalId: "123", attemptId: null };
    const csv = [
      { id: "fallback", postId: "post-a", creatorId: "creator-a", impressions: 0, seen: null, likes: 3, comments: null, asOf: null, import: { uploadedAt: new Date("2026-10-18T00:00:00Z") } },
      { id: "future-upload", postId: "post-a", creatorId: "creator-a", impressions: 999, seen: null, likes: null, comments: null, asOf: null, import: { uploadedAt: new Date("2026-10-23T00:00:00Z") } },
      { id: "future-observation", postId: "post-a", creatorId: "creator-a", impressions: 888, seen: null, likes: null, comments: null, asOf: new Date("2026-10-23T00:00:00Z"), import: { uploadedAt: new Date("2026-10-20T00:00:00Z") } }
    ];
    const result = await buildPiecePerformanceFacts(createPrisma({ links: [patreonLink], csv }), "creator-a", { selectedPostIds: ["post-a"], range: "30d", asOf: CUTOFF });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.facts.metrics.find((fact) => fact.destination === "patreon" && fact.metric === "impressions" && fact.basis === "captured_total")).toMatchObject({ value: 0, source: "third_party", captured_at: "2026-10-18T00:00:00.000Z", evidence: [expect.objectContaining({ id: expect.stringContaining(":import_time_fallback") })] });
    expect(result.facts.metrics.find((fact) => fact.destination === "patreon" && fact.metric === "likes" && fact.basis === "captured_total")?.value).toBe(3);
  });

  it("lets a newer null platform snapshot block a known CSV value", async () => {
    const patreonLink = { ...link, id: "pi_patron", destination: "patreon", externalUrl: "https://www.patreon.com/posts/one-123", externalId: "123", attemptId: null };
    const latestNull = snapshot({ id: "null-snapshot", destination: "patreon", platformInstanceId: "pi_patron", attemptId: null, externalUrl: patreonLink.externalUrl, externalId: "123", metricType: "likes", value: null, capturedAt: new Date("2026-10-22T11:00:00Z") });
    const csv = [{ id: "csv-likes", postId: "post-a", creatorId: "creator-a", impressions: null, seen: null, likes: 45, comments: null, asOf: new Date("2026-10-18T00:00:00Z"), import: { uploadedAt: new Date("2026-10-19T00:00:00Z") } }];
    const result = await buildPiecePerformanceFacts(createPrisma({ links: [patreonLink], snapshots: { likes: [latestNull] }, csv }), "creator-a", { selectedPostIds: ["post-a"], range: "30d", asOf: CUTOFF });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.facts.metrics.find((fact) => fact.destination === "patreon" && fact.metric === "likes" && fact.basis === "captured_total")).toMatchObject({ value: null, unavailable_reason: "not_collected", source: "platform_api", captured_at: "2026-10-22T11:00:00.000Z", evidence: [expect.objectContaining({ id: "null-snapshot" })] });
  });

  it("includes optional Patreon views only when a snapshot actually captured them", async () => {
    const patreonLink = { ...link, id: "pi_patron", destination: "patreon", externalUrl: "https://www.patreon.com/posts/one-123", externalId: "123", attemptId: null };
    const views = snapshot({ id: "patreon-views", destination: "patreon", platformInstanceId: "pi_patron", attemptId: null, externalUrl: patreonLink.externalUrl, externalId: "123", metricType: "views", value: 17 });
    const result = await buildPiecePerformanceFacts(createPrisma({ links: [patreonLink], snapshots: { views: [views] } }), "creator-a", { selectedPostIds: ["post-a"], range: "30d", asOf: CUTOFF });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.facts.metrics.find((fact) => fact.destination === "patreon" && fact.metric === "views" && fact.basis === "captured_total")).toMatchObject({ value: 17, availability: "available" });
    expect(result.facts.metrics.some((fact) => fact.destination === "patreon" && fact.metric === "views" && fact.basis === "window_change")).toBe(true);
  });

  it("does not use a Patreon CSV value when that metric's snapshot lookup failed", async () => {
    const patreonLink = { ...link, id: "pi_patron", destination: "patreon", externalUrl: "https://www.patreon.com/posts/one-123", externalId: "123", attemptId: null };
    const csv = [{ id: "csv-impressions", postId: "post-a", creatorId: "creator-a", impressions: 42, seen: null, likes: null, comments: null, asOf: new Date("2026-10-18T00:00:00Z"), import: { uploadedAt: new Date("2026-10-19T00:00:00Z") } }];
    const result = await buildPiecePerformanceFacts(createPrisma({ links: [patreonLink], snapshots: { likes: [snapshot({ id: "known-likes", destination: "patreon", platformInstanceId: "pi_patron", attemptId: null, externalUrl: patreonLink.externalUrl, externalId: "123", metricType: "likes", value: 3 })] }, snapshotFailureMetric: "impressions", csv }), "creator-a", { selectedPostIds: ["post-a"], range: "30d", asOf: CUTOFF });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.facts.metrics.find((fact) => fact.destination === "patreon" && fact.metric === "impressions" && fact.basis === "captured_total")).toMatchObject({ value: null, unavailable_reason: "source_unavailable" });
    expect(result.facts.metrics.some((fact) => fact.destination === "patreon" && fact.metric === "impressions" && fact.evidence.some((evidence) => evidence.kind === "csv_metric"))).toBe(false);
    expect(result.facts.source_failures).toContain("snapshots");
  });

  it("keeps latest captured values when history overflows and rejects reset deltas", async () => {
    const many = Array.from({ length: 201 }, (_, index) => snapshot({ id: `history-${index}`, capturedAt: new Date(START.getTime() + index * 60_000), value: index }));
    many.push(snapshot({ id: "latest", capturedAt: new Date("2026-10-22T11:00:00Z"), value: 300 }));
    const overflow = await build(createPrisma({ snapshots: { likes: many } }));
    expect(overflow.ok && overflow.facts.metrics.find((fact) => fact.destination === "x" && fact.metric === "likes" && fact.basis === "captured_total")?.value).toBe(300);
    expect(overflow.ok && overflow.facts.metrics.find((fact) => fact.destination === "x" && fact.metric === "likes" && fact.basis === "window_change")?.availability).toBe("unavailable");
    const reset = await build(createPrisma({ snapshots: { likes: [snapshot({ id: "baseline", value: 10, capturedAt: START }), snapshot({ id: "before-reset", value: 20, capturedAt: new Date("2026-10-01T00:00:00Z") }), snapshot({ id: "reset", value: 4, capturedAt: new Date("2026-10-10T00:00:00Z") })] } }));
    expect(reset.ok && reset.facts.metrics.find((fact) => fact.destination === "x" && fact.metric === "likes" && fact.basis === "window_change")?.availability).toBe("unavailable");
  });

  it("ignores a newer snapshot with an unknown source label", async () => {
    const result = await build(createPrisma({ snapshots: { likes: [
      snapshot({ id: "known", value: 4, capturedAt: new Date("2026-10-21T10:00:00Z") }),
      snapshot({ id: "unknown-source", source: "invented", value: 999, capturedAt: new Date("2026-10-22T11:00:00Z") })
    ] } }));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.facts.metrics.find((fact) => fact.destination === "x" && fact.metric === "likes" && fact.basis === "captured_total")?.value).toBe(4);
  });

  it("returns source unavailable on total applicable reader failure and partial facts on a scoped failure", async () => {
    const totalFailure = await build(createPrisma({ snapshotFailure: true }));
    expect(totalFailure).toEqual({ ok: false, code: "SOURCE_UNAVAILABLE" });
    const partial = await build(createPrisma({ snapshotFailureMetric: "comments", snapshots: { likes: [snapshot()] } }));
    expect(partial.ok).toBe(true);
    if (partial.ok) expect(partial.facts.source_failures).toContain("snapshots");
  });

  it("detects Patreon CSV history overflow instead of returning incomplete data", async () => {
    const rows = Array.from({ length: 257 }, (_, index) => ({ id: `csv-${index}`, postId: "post-a", creatorId: "creator-a", impressions: index, seen: null, likes: null, comments: null, asOf: null, import: { uploadedAt: new Date("2026-10-18T00:00:00Z") } }));
    const result = await buildPiecePerformanceFacts(createPrisma({ csv: rows }), "creator-a", { selectedPostIds: ["post-a"], range: "30d", asOf: CUTOFF });
    expect(result).toEqual({ ok: false, code: "TOO_BROAD" });
  });

  it("keeps destination-filtered evidence while fingerprinting every current link", async () => {
    const patreon = { ...link, id: "pi_patron", destination: "patreon", externalUrl: "https://www.patreon.com/posts/one-123", externalId: "123" };
    const xAndPatreon = createPrisma({ links: [link, patreon] });
    const request = { selectedPostIds: ["post-a"], subject: { kind: "post" as const, id: "post-a" } };
    const binding = await readPiecePerformanceBinding(xAndPatreon, "creator-a", request);
    const facts = await buildPiecePerformanceFacts(xAndPatreon, "creator-a", { ...request, range: "30d", destination: "patreon", asOf: CUTOFF });
    expect(binding.ok && facts.ok).toBe(true);
    if (binding.ok && facts.ok) expect(binding.binding.subject_fingerprint).toBe(facts.facts.subject_fingerprint);
  });

  it("does not let unrelated CSV or Relay failures poison an explicit X-only read", async () => {
    const oversizedCsv = Array.from({ length: 257 }, (_, index) => ({ id: `csv-${index}`, postId: "post-a", creatorId: "creator-a", impressions: index, seen: null, likes: null, comments: null, asOf: null, import: { uploadedAt: new Date("2026-10-18T00:00:00Z") } }));
    const prisma = createPrisma({ csv: oversizedCsv, csvFailure: true, relayFailure: true, snapshots: { likes: [snapshot()] } });
    const result = await buildPiecePerformanceFacts(prisma, "creator-a", { selectedPostIds: ["post-a"], range: "30d", destination: "x", asOf: CUTOFF });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.facts.source_failures).toEqual([]);
    expect(prisma.calls.csvFind).not.toHaveBeenCalled();
    expect(prisma.calls.queryRaw).not.toHaveBeenCalled();
  });
});
