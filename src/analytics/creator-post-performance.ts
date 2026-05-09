/**
 * P5a-ins-007 — Merge Patreon Insights CSV rows with Relay `Post` / publish metadata; surface linkage gaps.
 */
import type { PrismaClient } from "@prisma/client";

export type PostPerformanceGap = "none" | "metrics_without_relay" | "relay_without_metrics";

export type PostPerformanceRow = {
  patreon_post_id: string;
  post_id: string | null;
  insights: {
    impressions: number | null;
    seen: number | null;
    likes: number | null;
    comments: number | null;
    as_of: string | null;
  } | null;
  relay: {
    title: string | null;
    published_at: string | null;
    source: string;
    upstream_status: string;
    is_public: boolean;
  } | null;
  gap: PostPerformanceGap;
};

export type CreatorPostPerformanceReport = {
  /** API wall-clock for the envelope; import times are on rows / `import_*`. */
  as_of: string;
  import_id: string | null;
  import_uploaded_at: string | null;
  import_label: string | null;
  rows: PostPerformanceRow[];
  /** Posts in Relay with no row in the selected Insights import (capped — see `relay_only_truncated`). */
  relay_only_count: number;
  relay_only_truncated: boolean;
  note: string;
};

function relayFromPost(p: {
  id: string;
  source: string;
  upstreamStatus: string;
  isPublic: boolean;
  versions: Array<{ title: string; publishedAt: Date }>;
}): NonNullable<PostPerformanceRow["relay"]> {
  const v = p.versions[0];
  return {
    title: v?.title ?? null,
    published_at: v?.publishedAt?.toISOString() ?? null,
    source: p.source,
    upstream_status: p.upstreamStatus,
    is_public: p.isPublic
  };
}

export type GetCreatorPostPerformanceResult =
  | { ok: true; report: CreatorPostPerformanceReport }
  | { ok: false; code: "NO_TENANT" | "IMPORT_NOT_FOUND" };

/**
 * @returns Tenant or import errors as discriminated unions; never `null`.
 */
export async function getCreatorPostPerformance(
  prisma: PrismaClient,
  relayCreatorId: string,
  options?: {
    importId?: string | null;
    metricsLimit?: number;
    relayOnlyLimit?: number;
    includeRelayOnly?: boolean;
    asOf?: Date;
  }
): Promise<GetCreatorPostPerformanceResult> {
  const tenant = await prisma.tenant.findUnique({
    where: { relayCreatorId },
    select: { id: true }
  });
  if (!tenant) {
    return { ok: false, code: "NO_TENANT" };
  }

  const asOf = options?.asOf ?? new Date();
  const metricsLimit = Math.min(Math.max(options?.metricsLimit ?? 500, 1), 2000);
  const relayOnlyLimit = Math.min(Math.max(options?.relayOnlyLimit ?? 40, 0), 200);
  const includeRelayOnly = options?.includeRelayOnly !== false;

  const requestedImportId = options?.importId?.trim() ?? "";

  let targetImport: { id: string; uploadedAt: Date; label: string | null } | null = null;

  if (requestedImportId) {
    targetImport = await prisma.patreonInsightsImport.findFirst({
      where: { id: requestedImportId, creatorId: relayCreatorId },
      select: { id: true, uploadedAt: true, label: true }
    });
    if (!targetImport) {
      return { ok: false, code: "IMPORT_NOT_FOUND" };
    }
  } else {
    targetImport = await prisma.patreonInsightsImport.findFirst({
      where: { creatorId: relayCreatorId },
      orderBy: { uploadedAt: "desc" },
      select: { id: true, uploadedAt: true, label: true }
    });
  }

  const importPatreonIds = new Set<string>();
  const metricRows: Array<{
    id: string;
    patreonPostId: string;
    postId: string | null;
    impressions: number | null;
    seen: number | null;
    likes: number | null;
    comments: number | null;
    asOf: Date | null;
  }> = [];

  if (targetImport) {
    const metrics = await prisma.patreonInsightsPostMetric.findMany({
      where: { importId: targetImport.id, creatorId: relayCreatorId },
      select: {
        id: true,
        patreonPostId: true,
        postId: true,
        impressions: true,
        seen: true,
        likes: true,
        comments: true,
        asOf: true
      },
      take: metricsLimit,
      orderBy: [{ seen: "desc" }, { impressions: "desc" }]
    });
    for (const m of metrics) {
      importPatreonIds.add(m.patreonPostId);
      metricRows.push(m);
    }
  }

  const postIdsToLoad = new Set<string>();
  const patreonIdsNeedingResolve = new Set<string>();

  for (const m of metricRows) {
    if (m.postId) {
      postIdsToLoad.add(m.postId);
    } else {
      patreonIdsNeedingResolve.add(m.patreonPostId);
    }
  }

  const postSelect = {
    id: true,
    source: true,
    upstreamStatus: true,
    isPublic: true,
    providerPostId: true,
    versions: {
      orderBy: { versionSeq: "desc" as const },
      take: 1,
      select: { title: true, publishedAt: true }
    }
  };

  const loadedById = new Map<
    string,
    {
      id: string;
      source: string;
      upstreamStatus: string;
      isPublic: boolean;
      providerPostId: string | null;
      versions: Array<{ title: string; publishedAt: Date }>;
    }
  >();

  type LoadedPost = NonNullable<ReturnType<typeof loadedById.get>>;

  if (postIdsToLoad.size > 0) {
    const posts = await prisma.post.findMany({
      where: { creatorId: relayCreatorId, id: { in: [...postIdsToLoad] } },
      select: postSelect
    });
    for (const p of posts) {
      loadedById.set(p.id, p);
    }
  }

  if (patreonIdsNeedingResolve.size > 0) {
    const ids = [...patreonIdsNeedingResolve];
    const or = ids.flatMap((pid) => {
      const clause: Array<{ id: string } | { providerPostId: string }> = [{ id: pid }];
      const m = /^patreon_post_(\d+)$/i.exec(pid);
      if (m) {
        clause.push({ providerPostId: m[1]! });
      }
      return clause;
    });
    const resolved = await prisma.post.findMany({
      where: { creatorId: relayCreatorId, OR: or },
      select: postSelect
    });
    for (const p of resolved) {
      loadedById.set(p.id, p);
    }
  }

  const resolvePostForMetric = (
    m: (typeof metricRows)[0]
  ): { postId: string | null; post: LoadedPost | undefined } => {
    if (m.postId) {
      const hit = loadedById.get(m.postId);
      if (hit) {
        return { postId: m.postId, post: hit };
      }
    }
    const direct = loadedById.get(m.patreonPostId);
    if (direct) {
      return { postId: direct.id, post: direct };
    }
    const num = /^patreon_post_(\d+)$/i.exec(m.patreonPostId)?.[1];
    if (num) {
      for (const p of loadedById.values()) {
        if (p.providerPostId === num || p.providerPostId === m.patreonPostId) {
          return { postId: p.id, post: p };
        }
      }
    }
    return { postId: m.postId, post: undefined };
  };

  const rowsFromMetrics: PostPerformanceRow[] = metricRows.map((m) => {
    const { postId, post } = resolvePostForMetric(m);
    const relay = post ? relayFromPost(post) : null;
    const insights = {
      impressions: m.impressions,
      seen: m.seen,
      likes: m.likes,
      comments: m.comments,
      as_of: m.asOf?.toISOString() ?? null
    };
    return {
      patreon_post_id: m.patreonPostId,
      post_id: postId,
      insights,
      relay,
      gap: relay ? "none" : "metrics_without_relay"
    };
  });

  let relayOnlyRows: PostPerformanceRow[] = [];
  let relayOnlyTruncated = false;

  if (includeRelayOnly && relayOnlyLimit > 0 && targetImport) {
    const andClause: Array<Record<string, unknown>> = [
      { id: { startsWith: "patreon_post_" } },
      ...(importPatreonIds.size > 0
        ? [{ id: { notIn: [...importPatreonIds] } }]
        : [])
    ];
    const relayPosts = await prisma.post.findMany({
      where: {
        creatorId: relayCreatorId,
        AND: andClause
      },
      select: postSelect,
      orderBy: { createdAt: "desc" },
      take: relayOnlyLimit + 1
    });
    relayOnlyTruncated = relayPosts.length > relayOnlyLimit;
    const slice = relayPosts.slice(0, relayOnlyLimit);
    relayOnlyRows = slice.map((p) => ({
      patreon_post_id: p.id,
      post_id: p.id,
      insights: null,
      relay: relayFromPost(p),
      gap: "relay_without_metrics" as const
    }));
  } else if (includeRelayOnly && relayOnlyLimit > 0 && !targetImport) {
    const relayPosts = await prisma.post.findMany({
      where: {
        creatorId: relayCreatorId,
        id: { startsWith: "patreon_post_" }
      },
      select: postSelect,
      orderBy: { createdAt: "desc" },
      take: relayOnlyLimit + 1
    });
    relayOnlyTruncated = relayPosts.length > relayOnlyLimit;
    const slice = relayPosts.slice(0, relayOnlyLimit);
    relayOnlyRows = slice.map((p) => ({
      patreon_post_id: p.id,
      post_id: p.id,
      insights: null,
      relay: relayFromPost(p),
      gap: "relay_without_metrics" as const
    }));
  }

  const rows = [...rowsFromMetrics, ...relayOnlyRows];

  const import_note = targetImport
    ? "Insights numbers come from the selected CSV import; Relay block shows ingested post metadata when the post id matches."
    : "No Patreon Insights CSV import found yet — only Relay posts (if any) are listed as relay_without_metrics.";

  return {
    ok: true,
    report: {
      as_of: asOf.toISOString(),
      import_id: targetImport?.id ?? null,
      import_uploaded_at: targetImport?.uploadedAt.toISOString() ?? null,
      import_label: targetImport?.label ?? null,
      rows,
      relay_only_count: relayOnlyRows.length,
      relay_only_truncated: relayOnlyTruncated,
      note: `${import_note} gap: none = CSV row linked to a Relay post; metrics_without_relay = CSV row with no matching Post; relay_without_metrics = Relay post missing from that import.`
    }
  };
}
