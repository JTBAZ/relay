import { CreatorPlan, SubscriptionStatus, type Prisma, type PrismaClient } from "@prisma/client";
import { listConnectedPlatforms } from "../distribution/connected-platforms-service.js";
import { resolvePostNaming, scopedNamingWork, type NamingWork } from "../gallery-editor/naming.js";
import type { SourceMediaRow, SourcePostRow, SourceTemplateRow, TrustedLookup } from "./compiler.js";
import type { Destination } from "./contract.js";

const MAX_IDS = 32;
const MAX_RELATIONS = 128;
const PLAN_RANK: Record<CreatorPlan, number> = {
  [CreatorPlan.studio_core]: 1,
  [CreatorPlan.autopost]: 2,
  [CreatorPlan.growth_engine]: 3
};
const idList = (ids: readonly string[]) => {
  const unique = [...new Set(ids)];
  if (unique.length > MAX_IDS || unique.some(id => !id || id.length > 160 || id.trim() !== id)) throw new Error("Lookup selection exceeds safe bounds");
  return unique;
};
const assertCreator = (creatorId: string) => {
  if (!creatorId || creatorId.length > 160 || creatorId.trim() !== creatorId) throw new Error("Invalid creator scope");
};

const postTitleSelect = {
  id: true,
  creatorId: true,
  publishState: true,
  versions: { orderBy: { versionSeq: "desc" }, take: 1, select: { title: true, mediaIds: true } },
  presentation: { select: { creatorId: true, titleMode: true, relayTitle: true } },
  creativeWorkMember: {
    select: {
      creatorId: true,
      creativeWork: {
        select: {
          id: true, creatorId: true, title: true, titleMode: true,
          seriesMember: {
            select: {
              id: true, creatorId: true, partLabel: true,
              creativeSeries: { select: { id: true, creatorId: true, title: true } }
            }
          }
        }
      }
    }
  }
} satisfies Prisma.PostSelect;

export type PlanningLookupReadDb = Pick<PrismaClient,
  "mediaAsset" | "post" | "creativeWorkMember" | "creatorPreviewTemplate" |
  "creatorPlanEntitlement" | "account" | "planSubscription" | "creatorPostingGoal" | "creatorBlueskyCredential" | "creatorProfile">;
type Db = PlanningLookupReadDb;

/** Production, database-backed, creator-scoped read adapter for the plan compiler. */
export function createPlanningLookup(prisma: PlanningLookupReadDb): PlanningLookup {
  const db: Db = prisma;
  const lookup: TrustedLookup = {
    async loadMedia(creatorId, ids): Promise<SourceMediaRow[]> {
      assertCreator(creatorId); const wanted = idList(ids); if (!wanted.length) return [];
      const rows = await db.mediaAsset.findMany({ where: { creatorId, id: { in: wanted } }, select: {
        id: true, creatorId: true, processingStatus: true, ingestOrigin: true, primaryPostId: true,
        postIds: true, autopostDraftId: true, currentMimeType: true
      } });
      return rows.map(row => ({ id: row.id, creatorId: row.creatorId,
        processingStatus: row.processingStatus === "READY" ? "READY" : row.processingStatus === "FAILED" ? "FAILED" : "PENDING",
        ingestOrigin: row.ingestOrigin, primaryPostId: row.primaryPostId, postIds: [...row.postIds],
        autopostDraftId: row.autopostDraftId, filename: null, mimeType: row.currentMimeType }));
    },
    async loadPosts(creatorId, ids): Promise<SourcePostRow[]> {
      assertCreator(creatorId); const wanted = idList(ids); if (!wanted.length) return [];
      const rows = await db.post.findMany({ where: { creatorId, id: { in: wanted } }, select: {
        ...postTitleSelect
      } });
      const versionMediaIds = [...new Set(rows.flatMap(row => row.versions[0]?.mediaIds ?? []))];
      if (versionMediaIds.length > MAX_RELATIONS) throw new Error("Post has too many linked media rows");
      const media = rows.length ? await db.mediaAsset.findMany({
        where: { creatorId, OR: [
          { primaryPostId: { in: wanted } },
          { postIds: { hasSome: wanted } },
          ...(versionMediaIds.length ? [{ id: { in: versionMediaIds } }] : [])
        ] }, take: MAX_RELATIONS + 1, select: { id: true, primaryPostId: true, postIds: true }
      }) : [];
      if (media.length > MAX_RELATIONS) throw new Error("Post has too many linked media rows");
      return rows.map(row => {
        const member = row.creativeWorkMember;
        const safeMember = member?.creatorId === creatorId ? member : null;
        const work = scopedNamingWork(creatorId, safeMember as Parameters<typeof scopedNamingWork>[1]);
        const namingWork: NamingWork | null = work;
        const presentation = row.presentation?.creatorId === creatorId ? row.presentation : null;
        const effectiveTitle = resolvePostNaming({ sourceTitle: row.versions[0]?.title ?? row.id, presentation, work: namingWork }).effectiveTitle;
        const series = work?.seriesMember;
        const linkedMediaIds = media.filter(m => m.primaryPostId === row.id || m.postIds.includes(row.id) || (row.versions[0]?.mediaIds ?? []).includes(m.id)).map(m => m.id);
        return { id: row.id, creatorId: row.creatorId, publishState: row.publishState,
          effectiveTitle,
          mediaIds: [...new Set(linkedMediaIds)],
          creativeWorkId: work?.id ?? null, seriesMemberId: series ? (safeMember?.creativeWork.seriesMember?.id ?? null) : null,
          verifiedPartLabel: series?.partLabel ?? null };
      });
    },
    async loadSourceRelations(creatorId, mediaIds) {
      assertCreator(creatorId); const wanted = idList(mediaIds);
      const media = await db.mediaAsset.findMany({ where: { creatorId, id: { in: wanted } },
        select: { id: true, primaryPostId: true, postIds: true } });
      if (media.length !== wanted.length) throw new Error("Missing creator-owned media");
      const postIds = [...new Set(media.flatMap(m => [...m.postIds, ...(m.primaryPostId ? [m.primaryPostId] : [])]))];
      if (postIds.length > MAX_RELATIONS) throw new Error("Source has too many linked posts");
      const posts = postIds.length ? await db.post.findMany({ where: { creatorId, id: { in: postIds } }, select: { id: true } }) : [];
      const ownedPostIds = new Set(posts.map(p => p.id));
      const members = ownedPostIds.size ? await db.creativeWorkMember.findMany({ where: { creatorId, postId: { in: [...ownedPostIds] }, creativeWork: { creatorId } }, take: MAX_RELATIONS + 1, select: {
        postId: true, creativeWorkId: true, creativeWork: { select: { creatorId: true, seriesMember: { select: { id: true, creatorId: true, creativeSeries: { select: { creatorId: true } } } } } }
      } }) : [];
      if (members.length > MAX_RELATIONS) throw new Error("Source has too many work relations");
      const byPost = new Map<string, { works: Set<string>; members: Set<string> }>();
      for (const member of members) {
        if (member.creativeWork.creatorId !== creatorId) continue;
        const entry = byPost.get(member.postId) ?? { works: new Set<string>(), members: new Set<string>() };
        entry.works.add(member.creativeWorkId);
        const series = member.creativeWork.seriesMember;
        if (series?.creatorId === creatorId && series.creativeSeries.creatorId === creatorId) entry.members.add(series.id);
        byPost.set(member.postId, entry);
      }
      const output = new Map<string, { postIds: ReadonlySet<string>; creativeWorkIds: ReadonlySet<string>; creativeSeriesMemberIds: ReadonlySet<string> }>();
      for (const m of media) {
        const validPosts = [...new Set([...m.postIds, ...(m.primaryPostId ? [m.primaryPostId] : [])])].filter(id => ownedPostIds.has(id));
        const rels = validPosts.flatMap(id => { const rel = byPost.get(id); return rel ? [rel] : []; });
        output.set(m.id, { postIds: new Set(validPosts), creativeWorkIds: new Set(rels.flatMap(r => [...r.works])), creativeSeriesMemberIds: new Set(rels.flatMap(r => [...r.members])) });
      }
      return output;
    },
    async loadTemplates(creatorId, ids): Promise<SourceTemplateRow[]> {
      assertCreator(creatorId); const wanted = idList(ids); if (!wanted.length) return [];
      const rows = await db.creatorPreviewTemplate.findMany({ where: { creatorId, id: { in: wanted } }, select: { id: true, creatorId: true, name: true, config: true, updatedAt: true } });
      return rows.map(row => ({ id: row.id, creatorId: row.creatorId, name: row.name, config: row.config, updatedAt: row.updatedAt.toISOString() }));
    },
    async listTemplatesByName(creatorId, name): Promise<SourceTemplateRow[]> {
      assertCreator(creatorId); if (name.length > 160) throw new Error("Template name exceeds bound");
      const rows = await db.creatorPreviewTemplate.findMany({ where: { creatorId, name }, take: 4, orderBy: { id: "asc" }, select: { id: true, creatorId: true, name: true, config: true, updatedAt: true } });
      return rows.map(row => ({ id: row.id, creatorId: row.creatorId, name: row.name, config: row.config, updatedAt: row.updatedAt.toISOString() }));
    },
    async destinationReadiness(creatorId) {
      assertCreator(creatorId);
      const rows = await listConnectedPlatforms(prisma, creatorId);
      return new Map(rows.map(row => [row.destination, row.readiness === "available" ? "available" : row.readiness === "needs_credential" ? "needs_credential" : "needs_extension"] as const)) as ReadonlyMap<Destination, "available" | "needs_credential" | "needs_extension">;
    },
    async hasAutopostEntitlement(creatorId) { return hasEffectiveAutopostReadOnly(db, creatorId); }
  };
  return { lookup, loadCreatorTimezone: (creatorId) => loadCreatorTimezone(db, creatorId) };
}

export type PlanningLookup = Readonly<{
  lookup: TrustedLookup;
  /** Reads the stored creator setting directly; no default-creating goal getter. */
  loadCreatorTimezone(creatorId: string): Promise<string | null>;
}>;

/** Mirrors requireCreatorPlanAtLeast(autopost) without its entitlement upsert/delete behavior. */
export async function hasEffectiveAutopostReadOnly(db: PlanningLookupReadDb, creatorId: string, now = new Date()): Promise<boolean> {
  assertCreator(creatorId);
  const snapshot = await db.creatorPlanEntitlement.findUnique({ where: { creatorId }, select: { plan: true, source: true, expiresAt: true } });
  const snapshotValid = !!snapshot && (!snapshot.expiresAt || snapshot.expiresAt > now);
  if (snapshotValid && PLAN_RANK[snapshot.plan] >= PLAN_RANK[CreatorPlan.autopost]) return true;
  if (snapshotValid && (snapshot.source === "operator_grant" || snapshot.source === "pilot")) return false;
  const account = await db.account.findFirst({ where: { primaryRelayCreatorId: creatorId }, select: { id: true } });
  if (!account) return false;
  const subscription = await db.planSubscription.findFirst({ where: { accountId: account.id, scope: "creator", status: { in: [SubscriptionStatus.active, SubscriptionStatus.trialing] }, creatorPlan: { not: null } }, orderBy: { updatedAt: "desc" }, select: { creatorPlan: true } });
  return subscription?.creatorPlan != null && PLAN_RANK[subscription.creatorPlan] >= PLAN_RANK[CreatorPlan.autopost];
}

export async function loadCreatorTimezone(db: Pick<PrismaClient, "creatorPostingGoal">, creatorId: string): Promise<string | null> {
  assertCreator(creatorId);
  const row = await db.creatorPostingGoal.findUnique({ where: { creatorId }, select: { timezone: true } });
  if (!row?.timezone) return null;
  try { new Intl.DateTimeFormat("en", { timeZone: row.timezone }); return row.timezone; } catch { return null; }
}

