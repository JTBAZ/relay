import { createHash } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import { EXTERNAL_METRIC_SOURCE_PRECEDENCE } from "./external-metric-rollup-service.js";
import { confidenceFromSource } from "./performance-intelligence-read.js";
import { resolveUnifiedPerformanceWindow, type UnifiedPerformanceRange } from "./creator-unified-performance.js";
import { DISTRIBUTION_DESTINATIONS } from "../distribution/platform-destinations.js";
import { namingWorkSelect, resolvePostNaming, resolveWorkTitle, scopedNamingWork } from "../gallery-editor/naming.js";

export const PIECE_PERFORMANCE_METRICS = ["impressions", "seen", "views", "likes", "comments"] as const;
export type PiecePerformanceMetric = (typeof PIECE_PERFORMANCE_METRICS)[number];
export type PiecePerformanceSubjectRef = { kind: "post" | "work"; id: string };
export type PiecePerformanceRequest = {
  selectedPostIds: string[];
  subject?: PiecePerformanceSubjectRef | null;
  range: UnifiedPerformanceRange;
  destination?: string | null;
  asOf?: Date;
};
export type PiecePerformanceEvidenceRef = {
  kind: "snapshot" | "csv_metric" | "daily_rollup" | "relay_aggregate";
  id: string;
  observed_at: string | null;
};
export type PiecePerformanceMetricFact = {
  id: string;
  post_id: string;
  destination: string;
  metric: PiecePerformanceMetric;
  basis: "captured_total" | "window_change";
  value: number | null;
  availability: "available" | "unavailable";
  unavailable_reason: "not_collected" | "unknown_period" | "ambiguous_link" | "incomplete_baseline" | "source_unavailable" | null;
  source: string | null;
  confidence: "high" | "medium" | "low" | "unknown";
  captured_at: string | null;
  computed_at: string | null;
  stale: boolean;
  evidence: PiecePerformanceEvidenceRef[];
};
export type PiecePerformanceCoverage = {
  id: string;
  post_id: string;
  destination: string;
  state: "observed" | "partial" | "no_observations" | "unlinked" | "unavailable";
  missing_metrics: PiecePerformanceMetric[];
};
export type PiecePerformanceFacts = {
  as_of: string;
  range: UnifiedPerformanceRange;
  time_range: { start: string; end: string };
  subject: { kind: "post" | "work"; id: string; title: string; post_ids: string[] };
  subject_fingerprint: string;
  status: "complete" | "partial" | "no_data";
  metrics: PiecePerformanceMetricFact[];
  coverage: PiecePerformanceCoverage[];
  source_failures: Array<"snapshots" | "csv" | "relay_events">;
};
export type PiecePerformanceFactsError = "INVALID_SELECTION" | "INVALID_ARGUMENT" | "NOT_FOUND" | "TOO_BROAD" | "SOURCE_UNAVAILABLE";
export type PiecePerformanceBindingRequest = Pick<PiecePerformanceRequest, "selectedPostIds" | "subject">;
export type PiecePerformanceBinding = { subject: PiecePerformanceFacts["subject"]; subject_fingerprint: string };
export type BuildPiecePerformanceFactsResult =
  | { ok: true; facts: PiecePerformanceFacts }
  | { ok: false; code: PiecePerformanceFactsError };

const MAX_POSTS = 16;
const MAX_INSTANCES = 32;
const HISTORY_LIMIT = 200;
const STALE_AFTER_MS = 48 * 60 * 60 * 1000;
const SOURCE_ORDER = new Map<string, number>(EXTERNAL_METRIC_SOURCE_PRECEDENCE.map((name, i) => [name, i]));
const METRIC_SET = new Set<string>(PIECE_PERFORMANCE_METRICS);
const TELEMETRY_METRICS: Record<string, PiecePerformanceMetric> = {
  post_view: "views",
  post_liked: "likes",
  comment_created: "comments"
};
const SUPPORTED_DESTINATIONS = new Set<string>([...DISTRIBUTION_DESTINATIONS, "relay"]);

type InstanceRow = {
  id: string; postId: string; destination: string; externalUrl: string | null; externalId: string | null;
  attemptId: string | null; linkedAt: Date; status: string;
};
export type PiecePerformanceBindingDb = Pick<Prisma.TransactionClient, "tenant" | "post" | "creativeWork" | "platformInstance">;
type SnapshotRow = {
  id: string; postId: string; creatorId: string; destination: string; platformInstanceId: string | null;
  attemptId: string | null; externalUrl: string; externalId: string | null; metricType: string;
  value: number | null; source: string; capturedAt: Date;
};
type CsvRow = {
  id: string; postId: string | null; creatorId: string; impressions: number | null; seen: number | null;
  likes: number | null; comments: number | null; asOf: Date | null; import: { uploadedAt: Date };
};

function validId(value: unknown): value is string {
  return typeof value === "string" && value === value.trim() && value.length >= 1 && value.length <= 200;
}
function safeCount(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}
function sourceRank(source: string): number { return SOURCE_ORDER.get(source) ?? SOURCE_ORDER.size; }
function sha256(value: string): string { return createHash("sha256").update(value).digest("hex"); }
function asIso(value: Date | null): string | null { return value && Number.isFinite(value.getTime()) ? value.toISOString() : null; }

function metricFromCsv(row: CsvRow, metric: PiecePerformanceMetric): number | null {
  return metric === "impressions" ? row.impressions : metric === "seen" ? row.seen : metric === "likes" ? row.likes : metric === "comments" ? row.comments : null;
}

function snapshotMatchesCurrentLink(row: SnapshotRow, instance: InstanceRow): boolean {
  if (row.platformInstanceId != null && row.platformInstanceId !== instance.id) return false;
  if (row.platformInstanceId == null && (!instance.attemptId || row.attemptId !== instance.attemptId)) return false;
  if (row.attemptId != null && row.attemptId !== instance.attemptId) return false;
  const url = instance.externalUrl?.trim();
  if (!url || row.externalUrl.trim() !== url) return false;
  const externalId = instance.externalId?.trim() || null;
  return (row.externalId?.trim() || null) === externalId;
}

function latestSnapshot(rows: SnapshotRow[]): SnapshotRow | null {
  return [...rows].sort((a, b) => b.capturedAt.getTime() - a.capturedAt.getTime() || sourceRank(a.source) - sourceRank(b.source) || a.id.localeCompare(b.id))[0] ?? null;
}

function newFact(input: Omit<PiecePerformanceMetricFact, "confidence" | "stale">, asOf: Date): PiecePerformanceMetricFact {
  const capture = input.captured_at ? new Date(input.captured_at) : null;
  const age = capture ? asOf.getTime() - capture.getTime() : Number.POSITIVE_INFINITY;
  return { ...input, confidence: input.source && capture ? confidenceFromSource(input.source, age / 3_600_000) : "unknown", stale: !capture || age > STALE_AFTER_MS };
}

function factId(postId: string, destination: string, metric: PiecePerformanceMetric, basis: string): string {
  return `pf_${sha256(`${postId}\0${destination}\0${metric}\0${basis}`).slice(0, 24)}`;
}

function explicitSubjectIsExact(subject: unknown): subject is PiecePerformanceSubjectRef {
  if (subject === null || typeof subject !== "object" || Array.isArray(subject)) return false;
  const value = subject as Record<string, unknown>;
  return Object.keys(value).length === 2 && Object.keys(value).every((key) => key === "kind" || key === "id") &&
    (value.kind === "post" || value.kind === "work") && validId(value.id);
}

async function resolveSubject(prisma: PiecePerformanceBindingDb, creatorId: string, request: PiecePerformanceRequest): Promise<
  | { ok: true; subject: PiecePerformanceFacts["subject"]; membership: Array<{ postId: string; sortOrder: number }> }
  | { ok: false; code: "INVALID_SELECTION" | "NOT_FOUND" | "TOO_BROAD" }
> {
  const anchors = [...new Set(request.selectedPostIds)];
  if (anchors.length === 0 || anchors.length > MAX_POSTS || anchors.some((id) => !validId(id))) return { ok: false, code: "INVALID_SELECTION" };
  const ref = request.subject;
  if (ref != null && !explicitSubjectIsExact(ref)) return { ok: false, code: "INVALID_SELECTION" };
  if (ref?.kind === "post" && (!anchors.includes(ref.id) || anchors.length !== 1)) return { ok: false, code: "INVALID_SELECTION" };
  if (ref?.kind === "work") {
    const work = await prisma.creativeWork.findFirst({
      where: { id: ref.id, creatorId }, select: { ...namingWorkSelect,
        members: { where: { creatorId }, orderBy: [{ sortOrder: "asc" }, { linkedAt: "asc" }, { postId: "asc" }], take: MAX_POSTS + 1,
          select: { postId: true, sortOrder: true } } }
    });
    if (!work) return { ok: false, code: "NOT_FOUND" };
    const namingWork = scopedNamingWork(creatorId, { creatorId: work.creatorId, creativeWork: work });
    if (!namingWork) return { ok: false, code: "NOT_FOUND" };
    if (work.members.length > MAX_POSTS) return { ok: false, code: "TOO_BROAD" };
    if (work.members.length === 0 || anchors.some((id) => !work.members.some((member) => member.postId === id))) return { ok: false, code: "INVALID_SELECTION" };
    const owned = await prisma.post.findMany({ where: { creatorId, id: { in: work.members.map((m) => m.postId) } }, select: { id: true }, take: MAX_POSTS + 1 });
    if (owned.length !== work.members.length) return { ok: false, code: "NOT_FOUND" };
    return { ok: true, subject: { kind: "work", id: work.id, title: resolveWorkTitle(namingWork), post_ids: work.members.map((m) => m.postId) }, membership: work.members };
  }
  if (anchors.length !== 1 || (ref && ref.kind !== "post")) return { ok: false, code: "INVALID_SELECTION" };
  const post = await prisma.post.findFirst({ where: { id: anchors[0], creatorId }, select: {
    id: true, versions: { orderBy: { versionSeq: "desc" }, take: 1, select: { title: true } },
    presentation: { select: { creatorId: true, titleMode: true, relayTitle: true } },
    creativeWorkMember: { select: { creatorId: true, creativeWork: { select: namingWorkSelect } } }
  } });
  if (!post) return { ok: false, code: "NOT_FOUND" };
  const naming = resolvePostNaming({
    sourceTitle: post.versions[0]?.title ?? post.id,
    presentation: post.presentation?.creatorId === creatorId ? post.presentation : null,
    work: scopedNamingWork(creatorId, post.creativeWorkMember)
  });
  return { ok: true, subject: { kind: "post", id: post.id, title: naming.effectiveTitle, post_ids: [post.id] }, membership: [{ postId: post.id, sortOrder: 0 }] };
}

function bindingFingerprint(
  creatorId: string,
  subject: PiecePerformanceFacts["subject"],
  membership: Array<{ postId: string; sortOrder: number }>,
  links: InstanceRow[]
): string {
  const payload = JSON.stringify({
    creatorId,
    kind: subject.kind,
    id: subject.id,
    title: subject.title,
    members: membership.map((member) => [member.postId, member.sortOrder]),
    links: links.map((instance) => [instance.id, instance.postId, instance.destination, instance.externalUrl, instance.externalId, instance.attemptId, instance.status])
      .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))
  });
  return sha256(payload);
}

/** Re-reads only owned subject membership and current link identity for SPP-03 CAS checks. */
export async function readPiecePerformanceBinding(
  prisma: PiecePerformanceBindingDb,
  authenticatedCreatorId: string,
  request: PiecePerformanceBindingRequest
): Promise<{ ok: true; binding: PiecePerformanceBinding } | { ok: false; code: PiecePerformanceFactsError }> {
  const creatorId = authenticatedCreatorId.trim();
  if (!creatorId || !request || !Array.isArray(request.selectedPostIds)) return { ok: false, code: "INVALID_ARGUMENT" };
  try {
    if (!await prisma.tenant.findUnique({ where: { relayCreatorId: creatorId }, select: { id: true } })) return { ok: false, code: "NOT_FOUND" };
    const resolved = await resolveSubject(prisma, creatorId, { ...request, range: "30d" });
    if (!resolved.ok) return resolved;
    const links = await prisma.platformInstance.findMany({
      where: { creatorId, postId: { in: resolved.subject.post_ids }, status: "active" },
      select: { id: true, postId: true, destination: true, externalUrl: true, externalId: true, attemptId: true, linkedAt: true, status: true },
      orderBy: [{ postId: "asc" }, { destination: "asc" }, { linkedAt: "desc" }, { id: "asc" }], take: MAX_INSTANCES + 1
    }) as InstanceRow[];
    if (links.length > MAX_INSTANCES) return { ok: false, code: "TOO_BROAD" };
    return { ok: true, binding: { subject: resolved.subject, subject_fingerprint: bindingFingerprint(creatorId, resolved.subject, resolved.membership, links) } };
  } catch {
    return { ok: false, code: "SOURCE_UNAVAILABLE" };
  }
}

/**
 * Builds the frozen SPP-01 subject and evidence projection. The creator ID must come from
 * the authenticated server principal; it is never accepted from the request object.
 */
export async function buildPiecePerformanceFacts(
  prisma: PrismaClient,
  authenticatedCreatorId: string,
  request: PiecePerformanceRequest
): Promise<BuildPiecePerformanceFactsResult> {
  const creatorId = authenticatedCreatorId.trim();
  if (!creatorId || !request || !Array.isArray(request.selectedPostIds) || !["7d", "30d", "90d"].includes(request.range) ||
    (request.destination != null && (typeof request.destination !== "string" || !SUPPORTED_DESTINATIONS.has(request.destination.trim()))) ||
    (request.asOf != null && (!(request.asOf instanceof Date) || !Number.isFinite(request.asOf.getTime())))) return { ok: false, code: "INVALID_ARGUMENT" };
  const asOf = request.asOf ?? new Date();
  try {
    const tenant = await prisma.tenant.findUnique({ where: { relayCreatorId: creatorId }, select: { id: true } });
    if (!tenant) return { ok: false, code: "NOT_FOUND" };
    const resolved = await resolveSubject(prisma, creatorId, request);
    if (!resolved.ok) return resolved;
    const window = resolveUnifiedPerformanceWindow(request.range, asOf);
    const postIds = resolved.subject.post_ids;
    const destination = request.destination?.trim() || undefined;
    const links = await prisma.platformInstance.findMany({
      where: { creatorId, postId: { in: postIds }, status: "active" },
      select: { id: true, postId: true, destination: true, externalUrl: true, externalId: true, attemptId: true, linkedAt: true, status: true },
      orderBy: [{ postId: "asc" }, { destination: "asc" }, { linkedAt: "desc" }, { id: "asc" }], take: MAX_INSTANCES + 1
    }) as InstanceRow[];
    if (links.length > MAX_INSTANCES) return { ok: false, code: "TOO_BROAD" };
    const evidenceLinks = destination ? links.filter((link) => link.destination === destination) : links;
    const snapshotLinks = evidenceLinks.filter((link) => link.destination !== "relay");

    const failures: PiecePerformanceFacts["source_failures"] = [];
    const csvFailedPosts = new Set<string>();
    const facts: PiecePerformanceMetricFact[] = [];
    const coverage: PiecePerformanceCoverage[] = [];
    let usableObservations = 0;

    const snapshotsByGrain = new Map<string, SnapshotRow[]>();
    const snapshotFailedGrains = new Set<string>();
    for (const link of snapshotLinks) {
      for (const metric of PIECE_PERFORMANCE_METRICS) {
        const key = `${link.postId}\0${link.destination}\0${metric}`;
        try {
          const identityWhere = {
            creatorId, postId: link.postId, destination: link.destination, metricType: metric,
            externalUrl: link.externalUrl?.trim() ?? "", externalId: link.externalId?.trim() || null,
            capturedAt: { lte: asOf },
            OR: [
              { platformInstanceId: link.id, attemptId: link.attemptId },
              { platformInstanceId: link.id, attemptId: null },
              ...(link.attemptId ? [{ platformInstanceId: null, attemptId: link.attemptId }] : [])
            ]
          };
          // Read the newest row per known source independently. A large amount of stale-link
          // history can never push the actual current latest observation out of this bound.
          const latestBySource = await Promise.all(EXTERNAL_METRIC_SOURCE_PRECEDENCE.map((source) =>
            prisma.externalPostMetricSnapshot.findFirst({
              where: { ...identityWhere, source },
              select: { id: true, postId: true, creatorId: true, destination: true, platformInstanceId: true, attemptId: true, externalUrl: true, externalId: true, metricType: true, value: true, source: true, capturedAt: true },
              orderBy: [{ capturedAt: "desc" }, { id: "asc" }]
            })
          )) as Array<SnapshotRow | null>;
          const rows = await prisma.externalPostMetricSnapshot.findMany({
            where: { ...identityWhere, source: { in: [...EXTERNAL_METRIC_SOURCE_PRECEDENCE] }, capturedAt: { gte: window.start, lte: asOf } },
            select: { id: true, postId: true, creatorId: true, destination: true, platformInstanceId: true, attemptId: true, externalUrl: true, externalId: true, metricType: true, value: true, source: true, capturedAt: true },
            orderBy: [{ capturedAt: "desc" }, { id: "asc" }], take: HISTORY_LIMIT + 1
          }) as SnapshotRow[];
          const eligible = [...latestBySource.filter((row): row is SnapshotRow => row !== null), ...rows]
            .filter((row) => SOURCE_ORDER.has(row.source) && snapshotMatchesCurrentLink(row, link));
          snapshotsByGrain.set(key, rows.length > HISTORY_LIMIT ? latestBySource.filter((row): row is SnapshotRow => row !== null) : eligible);
        } catch {
          snapshotFailedGrains.add(key);
          if (!failures.includes("snapshots")) failures.push("snapshots");
        }
      }
    }

    const csvByGrain = new Map<string, { row: CsvRow; value: number; observedAt: Date; importFallback: boolean }>();
    try {
      if (destination && destination !== "patreon") {
        // Explicit destination requests only consult sources that can report that destination.
      } else {
      const csvRows: CsvRow[] = [];
      for (const postId of postIds) {
        const rows = await prisma.patreonInsightsPostMetric.findMany({
          where: { creatorId, postId, import: { creatorId, uploadedAt: { lte: asOf } } },
          select: { id: true, postId: true, creatorId: true, impressions: true, seen: true, likes: true, comments: true, asOf: true, import: { select: { uploadedAt: true } } },
          orderBy: [{ asOf: "desc" }, { id: "desc" }], take: 257
        }) as CsvRow[];
        if (rows.length > 256) return { ok: false, code: "TOO_BROAD" };
        csvRows.push(...rows);
      }
      for (const row of csvRows) {
        if (!row.postId || !postIds.includes(row.postId)) continue;
        const observedAt = row.asOf ?? row.import.uploadedAt;
        if (observedAt > asOf) continue;
        for (const metric of ["impressions", "seen", "likes", "comments"] as const) {
          const value = metricFromCsv(row, metric);
          if (!safeCount(value)) continue;
          const key = `${row.postId}\0patreon\0${metric}`;
          const current = csvByGrain.get(key);
          if (!current || observedAt > current.observedAt || (observedAt.getTime() === current.observedAt.getTime() && row.id.localeCompare(current.row.id) > 0)) csvByGrain.set(key, { row, value, observedAt, importFallback: row.asOf == null });
        }
      }
      }
    } catch { failures.push("csv"); }

    const relayCounts = new Map<string, { count: number; observedAt: Date | null; ref: string }>();
    try {
      if (destination && destination !== "relay") {
        // Relay-native observations are unrelated to an explicit external destination.
      } else {
      const events = await prisma.$queryRaw<Array<{ postId: string; metric: PiecePerformanceMetric; day: Date; count: bigint | number; observedAt: Date | null }>>(Prisma.sql`
        SELECT post_id AS "postId", 'views' AS metric,
          date_trunc('day', occurred_at)::date AS day,
          COUNT(*)::bigint AS count, MAX(occurred_at) AS "observedAt"
        FROM relay_engagement_events
        WHERE creator_id = ${creatorId} AND post_id IN (${Prisma.join(postIds)})
          AND event_type IN ('gallery_view', 'profile_view') AND occurred_at >= ${window.start} AND occurred_at <= ${asOf}
        GROUP BY post_id, day
      `);
      const telemetry = await prisma.$queryRaw<Array<{ postId: string; metric: PiecePerformanceMetric; eventName: string; day: Date; count: bigint | number; observedAt: Date | null }>>(Prisma.sql`
        SELECT payload->>'post_id' AS "postId", event_name AS "eventName",
          CASE event_name WHEN 'post_view' THEN 'views' WHEN 'post_liked' THEN 'likes' WHEN 'comment_created' THEN 'comments' END AS metric,
          date_trunc('day', occurred_at)::date AS day,
          COUNT(*)::bigint AS count, MAX(occurred_at) AS "observedAt"
        FROM platform_telemetry_events
        WHERE creator_id = ${creatorId} AND payload->>'post_id' IN (${Prisma.join(postIds)})
          AND event_name IN (${Prisma.join(Object.keys(TELEMETRY_METRICS))}) AND occurred_at >= ${window.start} AND occurred_at <= ${asOf}
        GROUP BY payload->>'post_id', event_name, day
      `);
      const addRelay = (postId: string, metric: PiecePerformanceMetric, day: string, count: number, observedAt: Date | null, id: string) => {
        const key = `${postId}\0relay\0${metric}\0${day}`;
        const old = relayCounts.get(key);
        if (!old || count > old.count) relayCounts.set(key, { count, observedAt, ref: id });
        else if (count === old.count && observedAt && (!old.observedAt || observedAt > old.observedAt)) relayCounts.set(key, { ...old, observedAt });
      };
      for (const row of events) {
        const count = Number(row.count);
        if (!postIds.includes(row.postId) || !safeCount(count)) continue;
        const day = row.day.toISOString().slice(0, 10);
        addRelay(row.postId, row.metric, day, count, row.observedAt, `relay-engagement:${row.postId}:${day}`);
      }
      for (const row of telemetry) {
        const count = Number(row.count);
        if (!postIds.includes(row.postId) || !safeCount(count)) continue;
        const day = row.day.toISOString().slice(0, 10);
        addRelay(row.postId, row.metric, day, count, row.observedAt, `relay-telemetry:${row.postId}:${row.eventName}:${day}`);
      }
      }
    } catch { failures.push("relay_events"); }

    const linkByGrain = new Map<string, InstanceRow>();
    for (const link of evidenceLinks) {
      const key = `${link.postId}\0${link.destination}`;
      if (!linkByGrain.has(key)) linkByGrain.set(key, link);
    }
    const destinationsByPost = new Map<string, Set<string>>();
    for (const link of evidenceLinks) (destinationsByPost.get(link.postId) ?? (destinationsByPost.set(link.postId, new Set()), destinationsByPost.get(link.postId)!)).add(link.destination);
    for (const key of csvByGrain.keys()) { const [postId, dest] = key.split("\0"); if (postId && dest) (destinationsByPost.get(postId) ?? (destinationsByPost.set(postId, new Set()), destinationsByPost.get(postId)!)).add(dest); }
    for (const key of relayCounts.keys()) { const [postId] = key.split("\0"); if (postId) (destinationsByPost.get(postId) ?? (destinationsByPost.set(postId, new Set()), destinationsByPost.get(postId)!)).add("relay"); }
    if (!destination || destination === "relay") for (const postId of postIds) (destinationsByPost.get(postId) ?? (destinationsByPost.set(postId, new Set()), destinationsByPost.get(postId)!)).add("relay");
    for (const postId of postIds) {
      const destinations = [...(destinationsByPost.get(postId) ?? new Set<string>())].filter((d) => !destination || d === destination).sort();
      for (const dest of destinations) {
        const applicable: PiecePerformanceMetric[] = dest === "patreon" ? ["impressions", "seen", "likes", "comments", ...((snapshotsByGrain.get(`${postId}\0${dest}\0views`) ?? []).length > 0 ? ["views" as const] : [])] : dest === "relay" ? ["views", "likes", "comments"] :
          PIECE_PERFORMANCE_METRICS.filter((metric) => (snapshotsByGrain.get(`${postId}\0${dest}\0${metric}`) ?? []).length > 0);
        const snapshotReadFailed = dest !== "relay" && snapshotLinks.some((candidate) => candidate.postId === postId && candidate.destination === dest && applicable.some((metric) => snapshotFailedGrains.has(`${postId}\0${dest}\0${metric}`)));
        const periodReadFailed = snapshotReadFailed || (dest === "relay" && failures.includes("relay_events"));
        const missing: PiecePerformanceMetric[] = [];
        for (const metric of applicable) {
          const key = `${postId}\0${dest}\0${metric}`;
          const link = linkByGrain.get(`${postId}\0${dest}`);
          const snapshots = (snapshotsByGrain.get(key) ?? []).filter((row) => !link || snapshotMatchesCurrentLink(row, link));
          const latest = latestSnapshot(snapshots);
          const csv = dest === "patreon" ? csvByGrain.get(key) : undefined;
          const hasSnapshot = latest !== null;
          const snapshotLookupFailed = snapshotFailedGrains.has(key);
          const effective = dest === "relay" ? null : latest && safeCount(latest.value) ? { value: latest.value, source: latest.source, capturedAt: latest.capturedAt, evidence: [{ kind: "snapshot" as const, id: latest.id, observed_at: asIso(latest.capturedAt) }] } :
            !hasSnapshot && !snapshotLookupFailed && csv ? { value: csv.value, source: "third_party", capturedAt: csv.observedAt, evidence: [{ kind: "csv_metric" as const, id: `patreon_insights_csv:${csv.row.id}:${metric}${csv.importFallback ? ":import_time_fallback" : ""}`, observed_at: asIso(csv.observedAt) }] } : null;
          if (effective) {
            usableObservations++;
            facts.push(newFact({ id: factId(postId, dest, metric, "captured_total"), post_id: postId, destination: dest, metric, basis: "captured_total", value: effective.value, availability: "available", unavailable_reason: null, source: effective.source, captured_at: asIso(effective.capturedAt), computed_at: null, evidence: effective.evidence }, asOf));
          } else if (dest !== "relay") {
            missing.push(metric);
            facts.push(newFact({ id: factId(postId, dest, metric, "captured_total"), post_id: postId, destination: dest, metric, basis: "captured_total", value: null, availability: "unavailable", unavailable_reason: (snapshotLookupFailed || (dest === "patreon" && failures.includes("csv"))) ? "source_unavailable" : "not_collected", source: latest?.source ?? null, captured_at: asIso(latest?.capturedAt ?? null), computed_at: null, evidence: latest ? [{ kind: "snapshot", id: latest.id, observed_at: asIso(latest.capturedAt) }] : [] }, asOf));
          }
          let delta: number | null = null;
          let deltaEvidence: PiecePerformanceEvidenceRef[] = [];
          let deltaSource: string | null = null;
          let deltaCapturedAt: Date | null = null;
          if (dest === "relay") {
            const daily = [...relayCounts.entries()].filter(([relayKey]) => relayKey.startsWith(`${postId}\0relay\0${metric}\0`));
            if (daily.length) { delta = daily.reduce((sum, [, entry]) => sum + entry.count, 0); deltaEvidence = daily.map(([, entry]) => ({ kind: "relay_aggregate", id: entry.ref, observed_at: asIso(entry.observedAt) })); deltaSource = "manual"; deltaCapturedAt = daily.reduce<Date | null>((max, [, e]) => !e.observedAt ? max : !max || e.observedAt > max ? e.observedAt : max, null); }
          } else {
            const history = snapshots.filter((row) => row.capturedAt >= window.start && row.capturedAt <= asOf).sort((a, b) => a.capturedAt.getTime() - b.capturedAt.getTime() || a.id.localeCompare(b.id));
            const baseline = history.find((row) => row.capturedAt.getTime() === window.start.getTime());
            const ending = history.at(-1);
            const interval = baseline && ending && ending.capturedAt > baseline.capturedAt ? history.filter((row) => row.capturedAt >= baseline.capturedAt) : [];
            const cleanInterval = interval.length >= 2 && interval.every((row) => row.source === baseline?.source && safeCount(row.value)) && interval.every((row, index) => index === 0 || (row.value as number) >= (interval[index - 1]?.value as number));
            if (cleanInterval && baseline && ending) {
              delta = (ending.value as number) - (baseline.value as number);
              deltaEvidence = [baseline, ending].map((row) => ({ kind: "snapshot", id: row.id, observed_at: row.capturedAt.toISOString() }));
              deltaSource = baseline.source;
              deltaCapturedAt = ending.capturedAt;
            }
          }
          if (delta != null) usableObservations++;
          if (dest === "relay" && delta == null) missing.push(metric);
          const periodReason = delta == null ? periodReadFailed ? "source_unavailable" : dest === "relay" ? "not_collected" : (dest === "patreon" && csv && !latest ? "unknown_period" : "incomplete_baseline") : null;
          facts.push(newFact({ id: factId(postId, dest, metric, "window_change"), post_id: postId, destination: dest, metric, basis: "window_change", value: delta, availability: delta == null ? "unavailable" : "available", unavailable_reason: periodReason, source: deltaSource, captured_at: asIso(deltaCapturedAt), computed_at: null, evidence: deltaEvidence }, asOf));
        }
        coverage.push({ id: `pc_${sha256(`${postId}\0${dest}`).slice(0, 24)}`, post_id: postId, destination: dest, state: applicable.length === 0 ? "no_observations" : missing.length === 0 ? "observed" : facts.some((fact) => fact.post_id === postId && fact.destination === dest && fact.availability === "available") ? "partial" : "no_observations", missing_metrics: missing });
      }
      if (destination && !destinations.includes(destination)) coverage.push({ id: `pc_${sha256(`${postId}\0${destination}`).slice(0, 24)}`, post_id: postId, destination, state: "unlinked", missing_metrics: destination === "patreon" ? ["impressions", "seen", "likes", "comments"] : [] });
    }

    const factsDoc: PiecePerformanceFacts = {
      as_of: asOf.toISOString(), range: request.range, time_range: { start: window.start.toISOString(), end: window.end.toISOString() },
      subject: resolved.subject, subject_fingerprint: bindingFingerprint(creatorId, resolved.subject, resolved.membership, links), status: usableObservations === 0 ? "no_data" : facts.some((f) => f.availability === "unavailable") || failures.length > 0 ? "partial" : "complete",
      metrics: facts, coverage, source_failures: failures
    };
    if (Buffer.byteLength(JSON.stringify(factsDoc), "utf8") > 64 * 1024) return { ok: false, code: "TOO_BROAD" };
    const relevantFailures = failures.filter((source) => (source === "snapshots" && snapshotLinks.length > 0) || (source === "csv" && (!destination || destination === "patreon")) || (source === "relay_events" && (!destination || destination === "relay")));
    if (relevantFailures.length > 0 && usableObservations === 0) return { ok: false, code: "SOURCE_UNAVAILABLE" };
    return { ok: true, facts: factsDoc };
  } catch {
    return { ok: false, code: "SOURCE_UNAVAILABLE" };
  }
}
