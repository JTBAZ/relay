import { Prisma, PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ConnectedPlatformReadDb } from "../../src/distribution/connected-platforms-service.js";
import { createPlanningContextSource, type PlanningContextReadDb } from "../../src/conversational-planning/context.js";
import { createPlanningLookup, type PlanningLookupReadDb } from "../../src/conversational-planning/lookup.js";

type Assert<T extends true> = T;
type GeneratedClientReadAssignments = [
  Assert<PrismaClient extends ConnectedPlatformReadDb ? true : false>,
  Assert<Prisma.TransactionClient extends ConnectedPlatformReadDb ? true : false>,
  Assert<PrismaClient extends PlanningLookupReadDb ? true : false>,
  Assert<Prisma.TransactionClient extends PlanningLookupReadDb ? true : false>,
  Assert<PrismaClient extends PlanningContextReadDb ? true : false>,
  Assert<Prisma.TransactionClient extends PlanningContextReadDb ? true : false>
];
const generatedClientReadAssignments: GeneratedClientReadAssignments = [true, true, true, true, true, true];

describe("Prisma read-factory transaction types", () => {
  let client: PrismaClient | undefined;
  let pool: Pool | undefined;
  afterEach(async () => {
    try {
      if (client) await client.$disconnect();
    } finally {
      client = undefined;
      if (pool) await pool.end();
      pool = undefined;
      vi.restoreAllMocks();
    }
  });

  it("accepts the generated PrismaClient and TransactionClient types", () => {
    expect(generatedClientReadAssignments).toEqual([true, true, true, true, true, true]);
  });

  it("binds nested source, template, readiness and entitlement reads to a read-only tx delegate set", async () => {
    // The delegates are real generated Prisma delegates. Every method used below is
    // intercepted before it can reach this deliberately unused connection pool.
    pool = new Pool({ connectionString: "postgresql://localhost:5432/read_type_sentinel" });
    const poolConnect = vi.spyOn(pool, "connect").mockRejectedValue(new Error("Read sentinel forbids database connections"));
    const poolQuery = vi.spyOn(pool, "query").mockRejectedValue(new Error("Read sentinel forbids database queries"));
    client = new PrismaClient({ adapter: new PrismaPg(pool) });
    const tx = {
      mediaAsset: client.mediaAsset,
      post: client.post,
      creativeWorkMember: client.creativeWorkMember,
      creatorPreviewTemplate: client.creatorPreviewTemplate,
      creatorPlanEntitlement: client.creatorPlanEntitlement,
      account: client.account,
      planSubscription: client.planSubscription,
      creatorPostingGoal: client.creatorPostingGoal,
      creatorBlueskyCredential: client.creatorBlueskyCredential,
      creatorProfile: client.creatorProfile
    } satisfies PlanningContextReadDb;

    const ownedMedia = { id: "media-a", creatorId: "creator-a", processingStatus: "READY", ingestOrigin: "RELAY_UPLOAD", primaryPostId: "post-a", postIds: ["post-a"], autopostDraftId: null, currentMimeType: "image/png" };
    const relationMedia = { id: "media-a", primaryPostId: "post-a", postIds: ["post-a"] };
    const fingerprintMedia = { id: "media-a", creatorId: "creator-a", processingStatus: "READY", ingestOrigin: "RELAY_UPLOAD", currentVersionSeq: 3, currentUpstreamRevision: "media-revision-3", currentMimeType: "image/png", currentRole: "primary", primaryPostId: "post-a", postIds: ["post-a"] };
    const postRow = { id: "post-a", creatorId: "creator-a", publishState: "published", versions: [{ versionSeq: 7, upstreamRevision: "post-revision-7", title: "Metadata post", mediaIds: ["media-a"] }], presentation: null, creativeWorkMember: null };
    const sourceMedia = vi.spyOn(tx.mediaAsset, "findMany")
      .mockResolvedValueOnce([ownedMedia] as never)
      .mockResolvedValueOnce([relationMedia] as never)
      .mockResolvedValueOnce([ownedMedia] as never)
      .mockResolvedValueOnce([relationMedia] as never)
      .mockResolvedValueOnce([fingerprintMedia] as never)
      .mockResolvedValueOnce([fingerprintMedia] as never);
    const sourcePosts = vi.spyOn(tx.post, "findMany")
      .mockResolvedValueOnce([{ id: "post-a" }] as never)
      .mockResolvedValueOnce([{ id: "post-a" }] as never)
      .mockResolvedValueOnce([postRow] as never)
      .mockResolvedValueOnce([postRow] as never);
    const sourceWorks = vi.spyOn(tx.creativeWorkMember, "findMany").mockResolvedValue([]);
    const templates = vi.spyOn(tx.creatorPreviewTemplate, "findMany").mockResolvedValue([]);
    const entitlement = vi.spyOn(tx.creatorPlanEntitlement, "findUnique").mockResolvedValue(null);
    const account = vi.spyOn(tx.account, "findFirst").mockResolvedValue(null);
    const bluesky = vi.spyOn(tx.creatorBlueskyCredential, "findUnique").mockResolvedValue(null);
    const profile = vi.spyOn(tx.creatorProfile, "findFirst").mockResolvedValue(null);
    const timezone = vi.spyOn(tx.creatorPostingGoal, "findUnique").mockResolvedValue(null);
    const entitlementUpsert = vi.spyOn(tx.creatorPlanEntitlement, "upsert");
    const entitlementDelete = vi.spyOn(tx.creatorPlanEntitlement, "delete");
    const goalCreate = vi.spyOn(tx.creatorPostingGoal, "create");
    const goalUpsert = vi.spyOn(tx.creatorPostingGoal, "upsert");

    const lookup = createPlanningLookup(tx);
    const context = createPlanningContextSource(tx, { now: () => new Date("2026-10-17T10:00:00.000Z") });
    await lookup.lookup.loadMedia("creator-a", ["media-a"]);
    await lookup.lookup.loadSourceRelations("creator-a", ["media-a"]);
    await lookup.lookup.loadTemplates("creator-a", ["template-a"]);
    await lookup.lookup.destinationReadiness("creator-a");
    await lookup.lookup.hasAutopostEntitlement("creator-a");
    await lookup.loadCreatorTimezone("creator-a");
    await context.lookup.loadTemplates("creator-a", ["template-b"]);
    await context.lookup.destinationReadiness("creator-a");
    await context.lookup.hasAutopostEntitlement("creator-a");
    const contextResult = await context.buildRequestContext({
      authenticatedCreatorId: "creator-a", selectedMediaIds: ["media-a"], selectedPostIds: [],
      receivedAtUtc: "2026-10-17T10:00:00.000Z"
    });

    expect(sourceMedia).toHaveBeenCalled();
    expect(sourcePosts).toHaveBeenCalled();
    expect(sourceWorks).toHaveBeenCalled();
    expect(templates).toHaveBeenCalled();
    expect(entitlement).toHaveBeenCalled();
    expect(account).toHaveBeenCalled();
    expect(bluesky).toHaveBeenCalled();
    expect(profile).toHaveBeenCalled();
    expect(timezone).toHaveBeenCalled();
    expect(entitlementUpsert).not.toHaveBeenCalled();
    expect(entitlementDelete).not.toHaveBeenCalled();
    expect(goalCreate).not.toHaveBeenCalled();
    expect(goalUpsert).not.toHaveBeenCalled();
    expect("$transaction" in tx).toBe(false);
    expect(contextResult.kind).toBe("ok");
    if (contextResult.kind === "ok") expect(contextResult.sourceFingerprint).toMatch(/^src1_[a-f0-9]{64}$/);
    expect(poolConnect).not.toHaveBeenCalled();
    expect(poolQuery).not.toHaveBeenCalled();
  });
});
