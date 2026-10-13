import type { Prisma, PrismaClient } from "@prisma/client";
import type { NamingProvenance, PostTitleMode, WorkTitleMode } from "./types.js";

/** Partition IDs are the canonical creatorId, not necessarily a User.id. */
export type NamingDb = PrismaClient | Prisma.TransactionClient;
export interface NamingWork {
  id: string;
  title: string;
  titleMode?: WorkTitleMode;
  seriesMember?: {
    partLabel: string;
    creativeSeries: { id: string; title: string };
  } | null;
}
export interface NamingInput {
  sourceTitle: string;
  presentation?: { titleMode?: PostTitleMode; relayTitle?: string | null } | null;
  work?: NamingWork | null;
}

/** Pure resolution keeps all append-only PostVersion values intact. */
export function resolveWorkTitle(work: NamingWork): string {
  if (work.titleMode === "inherit_series" && work.seriesMember) {
    return `${work.seriesMember.creativeSeries.title} — ${work.seriesMember.partLabel}`;
  }
  return work.title;
}

export function resolvePostNaming(input: NamingInput): NamingProvenance {
  const { sourceTitle, presentation, work } = input;
  // Legacy callers/fixtures without modes retain the migration's nonblank-overlay semantics.
  const custom = presentation?.relayTitle;
  const mode = presentation?.titleMode ?? (custom?.trim() ? "custom" : "source");
  const workTitle = work ? resolveWorkTitle(work) : undefined;
  const effectiveTitle = mode === "inherit_work" && workTitle !== undefined
    ? workTitle
    : mode === "custom" && custom?.trim() ? custom : sourceTitle;
  const series = work?.seriesMember;
  return {
    mode, effectiveTitle, sourceTitle,
    ...(work ? { workId: work.id, workTitle, workTitleMode: work.titleMode ?? "independent" } : {}),
    ...(series ? {
      seriesId: series.creativeSeries.id,
      seriesTitle: series.creativeSeries.title,
      partLabel: series.partLabel
    } : {}),
    exception: mode === "custom"
  };
}

export const namingWorkSelect = {
  id: true, creatorId: true, title: true, titleMode: true,
  seriesMember: { select: { creatorId: true, partLabel: true, creativeSeries: { select: { id: true, creatorId: true, title: true } } } }
} satisfies Prisma.CreativeWorkSelect;

type ScopedNamingWork = Prisma.CreativeWorkGetPayload<{ select: typeof namingWorkSelect }>;

/** Defense for pre-migration/corrupt graphs in addition to composite DB FKs. */
export function scopedNamingWork(creatorId: string, member: {
  creatorId: string; creativeWork: ScopedNamingWork;
} | null | undefined): NamingWork | null {
  if (!member || member.creatorId !== creatorId || member.creativeWork.creatorId !== creatorId) return null;
  const work = member.creativeWork;
  const series = work.seriesMember;
  return {
    ...work,
    seriesMember: series && series.creatorId === creatorId && series.creativeSeries.creatorId === creatorId ? series : null
  };
}

/** Transaction-compatible read used by preview, commit receipts and authenticated routes. */
export async function loadPostNaming(
  db: NamingDb, creatorId: string, postIds?: string[]
): Promise<Record<string, NamingProvenance>> {
  if (postIds?.length === 0) return {};
  const posts = await db.post.findMany({
    where: { creatorId, ...(postIds ? { id: { in: [...new Set(postIds)] } } : {}) },
    select: {
      id: true,
      versions: { orderBy: { versionSeq: "desc" }, take: 1, select: { title: true } },
      presentation: { select: { creatorId: true, titleMode: true, relayTitle: true } },
      creativeWorkMember: { select: { creatorId: true, creativeWork: { select: namingWorkSelect } } }
    }
  });
  return Object.fromEntries(posts.map((p) => [p.id, resolvePostNaming({
    sourceTitle: p.versions[0]?.title ?? p.id,
    presentation: p.presentation?.creatorId === creatorId ? p.presentation : null,
    work: scopedNamingWork(creatorId, p.creativeWorkMember)
  })]));
}
