import { CreatorPlan, type PrismaClient } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import { createPlanningLookup, hasEffectiveAutopostReadOnly } from "../../src/conversational-planning/lookup.js";

const at = new Date("2026-10-16T10:00:00.000Z");
function prisma(overrides: Record<string, unknown> = {}) {
  const db = {
    mediaAsset: { findMany: vi.fn(async () => []) },
    post: { findMany: vi.fn(async () => []) },
    creativeWorkMember: { findMany: vi.fn(async () => []) },
    creatorPreviewTemplate: { findMany: vi.fn(async () => []) },
    creatorPlanEntitlement: { findUnique: vi.fn(async () => null), upsert: vi.fn(), delete: vi.fn() },
    account: { findFirst: vi.fn(async () => null) },
    planSubscription: { findFirst: vi.fn(async () => null) },
    creatorPostingGoal: { findUnique: vi.fn(async () => null) },
    creatorBlueskyCredential: { findUnique: vi.fn(async () => null) },
    creatorProfile: { findFirst: vi.fn(async () => null) },
    ...overrides
  };
  return db as unknown as PrismaClient;
}

describe("production conversational planning lookup", () => {
  it("scopes selected media, posts, works and series parents to the authenticated creator", async () => {
    const db = prisma({
      mediaAsset: { findMany: vi.fn(async ({ where }: { where: { creatorId: string } }) => {
        expect(where.creatorId).toBe("creator-a");
        return [{ id: "m1", creatorId: "creator-a", processingStatus: "READY", ingestOrigin: "RELAY_UPLOAD", primaryPostId: "p1", postIds: ["p1", "p-foreign"], autopostDraftId: null, currentMimeType: "image/png" }];
      }) },
      post: { findMany: vi.fn(async ({ where }: { where: { creatorId: string }; select?: unknown }) => {
        expect(where.creatorId).toBe("creator-a");
        return [{ id: "p1" }];
      }) },
      creativeWorkMember: { findMany: vi.fn(async ({ where }: { where: { creatorId: string; creativeWork: { creatorId: string } } }) => {
        expect(where.creatorId).toBe("creator-a");
        expect(where.creativeWork.creatorId).toBe("creator-a");
        return [];
      }) }
    });
    const { lookup } = createPlanningLookup(db);
    const media = await lookup.loadMedia("creator-a", ["m1"]);
    expect(media).toEqual([{ id: "m1", creatorId: "creator-a", processingStatus: "READY", ingestOrigin: "RELAY_UPLOAD", primaryPostId: "p1", postIds: ["p1", "p-foreign"], autopostDraftId: null, filename: null, mimeType: "image/png" }]);
    const relations = await lookup.loadSourceRelations("creator-a", ["m1"]);
    expect([...relations.get("m1")!.postIds]).toEqual(["p1"]);
    expect([...relations.get("m1")!.creativeWorkIds]).toEqual([]);
    expect(db.post.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { creatorId: "creator-a", id: { in: ["p1", "p-foreign"] } } }));
  });

  it("uses canonical presentation/work naming and only a verified owned part label", async () => {
    const db = prisma({
      post: { findMany: vi.fn(async () => [{
        id: "p1", creatorId: "creator-a", publishState: "published", versions: [{ title: "Original", mediaIds: ["m1"] }],
        presentation: { creatorId: "creator-a", titleMode: "inherit_work", relayTitle: "ignored custom overlay" },
        creativeWorkMember: { creatorId: "creator-a", creativeWork: {
          id: "w1", creatorId: "creator-a", title: "Work", titleMode: "inherit_series",
          seriesMember: { id: "s1", creatorId: "creator-a", partLabel: "4", creativeSeries: { id: "series1", creatorId: "creator-a", title: "Series" } }
        } }
      }]) },
      mediaAsset: { findMany: vi.fn(async () => [{ id: "m1", primaryPostId: "p1", postIds: ["p1"] }]) }
    });
    const rows = await createPlanningLookup(db).lookup.loadPosts("creator-a", ["p1"]);
    expect(rows[0]).toMatchObject({ effectiveTitle: "Series — 4", mediaIds: ["m1"], creativeWorkId: "w1", seriesMemberId: "s1", verifiedPartLabel: "4" });
  });

  it("does not truncate oversized selections and returns only creator-owned exact-name templates", async () => {
    const findMany = vi.fn(async ({ where, take }: { where: { creatorId: string; name?: string }; take?: number }) => {
      expect(where).toEqual({ creatorId: "creator-a", name: "Square" });
      expect(take).toBe(4);
      return Array.from({ length: 2 }, (_, i) => ({ id: `t${i}`, creatorId: "creator-a", name: "Square", config: {}, updatedAt: at }));
    });
    const db = prisma({ creatorPreviewTemplate: { findMany } });
    const { lookup } = createPlanningLookup(db);
    await expect(lookup.loadMedia("creator-a", Array.from({ length: 33 }, (_, i) => `m${i}`))).rejects.toThrow(/bounds/);
    expect(await lookup.listTemplatesByName("creator-a", "Square")).toHaveLength(2);
    expect(findMany).toHaveBeenCalledTimes(1);
  });

  it("keeps every owned source relation for ambiguity checks and rejects a foreign series parent", async () => {
    const db = prisma({
      mediaAsset: { findMany: vi.fn(async () => [{ id: "m1", primaryPostId: "p1", postIds: ["p1", "p2"] }]) },
      post: { findMany: vi.fn(async () => [{ id: "p1" }, { id: "p2" }]) },
      creativeWorkMember: { findMany: vi.fn(async () => [
        { postId: "p1", creativeWorkId: "w1", creativeWork: { creatorId: "creator-a", seriesMember: { id: "s1", creatorId: "creator-a", creativeSeries: { creatorId: "creator-a" } } } },
        { postId: "p2", creativeWorkId: "w2", creativeWork: { creatorId: "creator-a", seriesMember: { id: "s2", creatorId: "creator-a", creativeSeries: { creatorId: "creator-b" } } } }
      ]) }
    });
    const { lookup } = createPlanningLookup(db);
    const rel = (await lookup.loadSourceRelations("creator-a", ["m1"])).get("m1")!;
    expect([...rel.postIds].sort()).toEqual(["p1", "p2"]);
    expect([...rel.creativeWorkIds].sort()).toEqual(["w1", "w2"]);
    expect([...rel.creativeSeriesMemberIds]).toEqual(["s1"]);
  });

  it("fails closed on oversized version media lists and linkage query overflow", async () => {
    const manyIds = Array.from({ length: 129 }, (_, i) => `m${i}`);
    const postRow = { id: "p1", creatorId: "creator-a", publishState: "published", versions: [{ title: "Post", mediaIds: manyIds }], presentation: null, creativeWorkMember: null };
    const db1 = prisma({ post: { findMany: vi.fn(async () => [postRow]) }, mediaAsset: { findMany: vi.fn() } });
    await expect(createPlanningLookup(db1).lookup.loadPosts("creator-a", ["p1"])).rejects.toThrow(/too many linked media/);
    expect((db1 as unknown as { mediaAsset: { findMany: ReturnType<typeof vi.fn> } }).mediaAsset.findMany).not.toHaveBeenCalled();

    const db2 = prisma({
      post: { findMany: vi.fn(async () => [{ ...postRow, versions: [{ title: "Post", mediaIds: [] }] }]) },
      mediaAsset: { findMany: vi.fn(async ({ take }: { take: number }) => {
        expect(take).toBe(129);
        return Array.from({ length: take }, (_, i) => ({ id: `m${i}`, primaryPostId: "p1", postIds: [] }));
      }) }
    });
    await expect(createPlanningLookup(db2).lookup.loadPosts("creator-a", ["p1"])).rejects.toThrow(/too many linked media/);
  });

  it("preserves connected-platform readiness, including extension requirements", async () => {
    const db = prisma({ creatorProfile: { findFirst: vi.fn(async () => ({ patreonCampaignId: "campaign" })) } });
    const { lookup } = createPlanningLookup(db);
    const readiness = await lookup.destinationReadiness("creator-a");
    expect(readiness.get("patreon")).toBe("available");
    expect(readiness.get("bluesky")).toBe("needs_credential");
    expect(readiness.get("x")).toBe("needs_extension");
    expect(readiness.get("deviantart")).toBe("needs_extension");
  });

  it("matches entitlement gate precedence and plan rank using reads only", async () => {
    const expiredGrant = { plan: CreatorPlan.growth_engine, source: "operator_grant", expiresAt: new Date("2026-10-15T00:00:00.000Z") };
    const subFind = vi.fn(async () => ({ creatorPlan: CreatorPlan.autopost }));
    const db = prisma({
      creatorPlanEntitlement: { findUnique: vi.fn(async () => expiredGrant), upsert: vi.fn(), delete: vi.fn() },
      account: { findFirst: vi.fn(async ({ where }: { where: { primaryRelayCreatorId: string } }) => {
        expect(where.primaryRelayCreatorId).toBe("creator-a"); return { id: "account-a" };
      }) },
      planSubscription: { findFirst: subFind }
    });
    expect(await hasEffectiveAutopostReadOnly(db as unknown as Parameters<typeof hasEffectiveAutopostReadOnly>[0], "creator-a", at)).toBe(true);
    expect(subFind).toHaveBeenCalledWith(expect.objectContaining({ where: { accountId: "account-a", scope: "creator", status: { in: ["active", "trialing"] }, creatorPlan: { not: null } }, orderBy: { updatedAt: "desc" } }));
    const delegates = db as unknown as { creatorPlanEntitlement: { upsert: ReturnType<typeof vi.fn>; delete: ReturnType<typeof vi.fn> } };
    expect(delegates.creatorPlanEntitlement.upsert).not.toHaveBeenCalled();
    expect(delegates.creatorPlanEntitlement.delete).not.toHaveBeenCalled();

    const snapshotDb = prisma({ creatorPlanEntitlement: { findUnique: vi.fn(async () => ({ plan: CreatorPlan.growth_engine, source: "pilot", expiresAt: null })), upsert: vi.fn(), delete: vi.fn() } });
    expect(await hasEffectiveAutopostReadOnly(snapshotDb as unknown as Parameters<typeof hasEffectiveAutopostReadOnly>[0], "creator-a", at)).toBe(true);
    expect((snapshotDb as unknown as { account: { findFirst: ReturnType<typeof vi.fn> } }).account.findFirst).not.toHaveBeenCalled();

    const coreDb = prisma({ creatorPlanEntitlement: { findUnique: vi.fn(async () => ({ plan: CreatorPlan.studio_core, source: "pilot", expiresAt: null })), upsert: vi.fn(), delete: vi.fn() } });
    expect(await hasEffectiveAutopostReadOnly(coreDb as unknown as Parameters<typeof hasEffectiveAutopostReadOnly>[0], "creator-a", at)).toBe(false);
    expect((coreDb as unknown as { account: { findFirst: ReturnType<typeof vi.fn> } }).account.findFirst).not.toHaveBeenCalled();

    const lowerStripeDb = prisma({
      creatorPlanEntitlement: { findUnique: vi.fn(async () => ({ plan: CreatorPlan.studio_core, source: "stripe", expiresAt: null })), upsert: vi.fn(), delete: vi.fn() },
      account: { findFirst: vi.fn(async () => ({ id: "account-a" })) },
      planSubscription: { findFirst: vi.fn(async () => ({ creatorPlan: CreatorPlan.autopost })) }
    });
    expect(await hasEffectiveAutopostReadOnly(lowerStripeDb as unknown as Parameters<typeof hasEffectiveAutopostReadOnly>[0], "creator-a", at)).toBe(true);

    const lowerGrantDb = prisma({
      creatorPlanEntitlement: { findUnique: vi.fn(async () => ({ plan: CreatorPlan.studio_core, source: "operator_grant", expiresAt: null })), upsert: vi.fn(), delete: vi.fn() },
      account: { findFirst: vi.fn(async () => ({ id: "account-a" })) },
      planSubscription: { findFirst: vi.fn(async () => ({ creatorPlan: CreatorPlan.growth_engine })) }
    });
    expect(await hasEffectiveAutopostReadOnly(lowerGrantDb as unknown as Parameters<typeof hasEffectiveAutopostReadOnly>[0], "creator-a", at)).toBe(false);
    expect((lowerGrantDb as unknown as { planSubscription: { findFirst: ReturnType<typeof vi.fn> } }).planSubscription.findFirst).not.toHaveBeenCalled();
  });

  it("reads a valid stored timezone and fails closed for an invalid one", async () => {
    const goal = { findUnique: vi.fn(async () => ({ timezone: "Europe/London" })) };
    const db = prisma({ creatorPostingGoal: goal });
    expect(await createPlanningLookup(db).loadCreatorTimezone("creator-a")).toBe("Europe/London");
    goal.findUnique.mockImplementationOnce(async () => ({ timezone: "Mars/Olympus" }));
    expect(await createPlanningLookup(db).loadCreatorTimezone("creator-a")).toBeNull();
  });
});
