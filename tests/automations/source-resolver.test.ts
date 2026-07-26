/**
 * AUT-VS4-T02 — latest-eligible Patreon source resolver.
 */
import { describe, expect, it, vi } from "vitest";
import { PostSource } from "@prisma/client";
import { resolveLatestEligiblePatreonPost } from "../../src/autopost/automation-source-resolver.js";
import { AUTOMATIONS_QA_PERSONA, AUTOMATIONS_QA_POSTS } from "./fixtures.js";

const CREATOR = AUTOMATIONS_QA_PERSONA.creator_id;
const OTHER = "creator_other_001";
const RULE = "rule_owned_preview_1";

type PostFixture = {
  id: string;
  creatorId: string;
  source: string;
  publishState: string;
  publishedAt: Date | null;
  mediaIds: string[];
};

function createResolverPrisma(args: {
  posts: PostFixture[];
  blockingRuns: Array<{ sourcePostId: string; status: string; creatorId?: string }>;
}) {
  return {
    creatorDistributionRuleRun: {
      findMany: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
        return args.blockingRuns
          .filter((r) => {
            if (where.ruleId && where.ruleId !== RULE) return false;
            if (where.creatorId && r.creatorId && r.creatorId !== where.creatorId) return false;
            const statuses = (where.status as { in?: string[] } | undefined)?.in;
            if (statuses && !statuses.includes(r.status)) return false;
            return true;
          })
          .map((r) => ({ sourcePostId: r.sourcePostId }));
      })
    },
    post: {
      findMany: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
        return args.posts
          .filter((p) => {
            if (where.creatorId && p.creatorId !== where.creatorId) return false;
            if (where.source && p.source !== where.source) return false;
            if (where.publishState && p.publishState !== where.publishState) return false;
            return true;
          })
          .map((p) => ({
            id: p.id,
            versions: [
              {
                publishedAt: p.publishedAt,
                mediaIds: p.mediaIds
              }
            ]
          }));
      })
    }
  } as any;
}

describe("resolveLatestEligiblePatreonPost", () => {
  it("returns newest published Patreon post with media", async () => {
    const prisma = createResolverPrisma({
      posts: [
        {
          id: AUTOMATIONS_QA_POSTS.older_already_processed.post_id,
          creatorId: CREATOR,
          source: PostSource.PATREON,
          publishState: "published",
          publishedAt: new Date(AUTOMATIONS_QA_POSTS.older_already_processed.published_at),
          mediaIds: [AUTOMATIONS_QA_POSTS.older_already_processed.media_id!]
        },
        {
          id: AUTOMATIONS_QA_POSTS.newest_with_image.post_id,
          creatorId: CREATOR,
          source: PostSource.PATREON,
          publishState: "published",
          publishedAt: new Date(AUTOMATIONS_QA_POSTS.newest_with_image.published_at),
          mediaIds: [AUTOMATIONS_QA_POSTS.newest_with_image.media_id!]
        }
      ],
      blockingRuns: []
    });

    const result = await resolveLatestEligiblePatreonPost(prisma, {
      creatorId: CREATOR,
      distributionRuleId: RULE
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.source.post_id).toBe(AUTOMATIONS_QA_POSTS.newest_with_image.post_id);
      expect(result.source.has_image_media).toBe(true);
    }
  });

  it("skips already-processed (non-cancelled) posts and picks next", async () => {
    const prisma = createResolverPrisma({
      posts: [
        {
          id: AUTOMATIONS_QA_POSTS.newest_with_image.post_id,
          creatorId: CREATOR,
          source: PostSource.PATREON,
          publishState: "published",
          publishedAt: new Date(AUTOMATIONS_QA_POSTS.newest_with_image.published_at),
          mediaIds: [AUTOMATIONS_QA_POSTS.newest_with_image.media_id!]
        },
        {
          id: AUTOMATIONS_QA_POSTS.older_already_processed.post_id,
          creatorId: CREATOR,
          source: PostSource.PATREON,
          publishState: "published",
          publishedAt: new Date(AUTOMATIONS_QA_POSTS.older_already_processed.published_at),
          mediaIds: [AUTOMATIONS_QA_POSTS.older_already_processed.media_id!]
        }
      ],
      blockingRuns: [
        {
          sourcePostId: AUTOMATIONS_QA_POSTS.newest_with_image.post_id,
          status: "materialized"
        }
      ]
    });

    const result = await resolveLatestEligiblePatreonPost(prisma, {
      creatorId: CREATOR,
      distributionRuleId: RULE
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.source.post_id).toBe(AUTOMATIONS_QA_POSTS.older_already_processed.post_id);
    }
  });

  it("allows re-eligibility after cancelled run", async () => {
    const prisma = createResolverPrisma({
      posts: [
        {
          id: AUTOMATIONS_QA_POSTS.newest_with_image.post_id,
          creatorId: CREATOR,
          source: PostSource.PATREON,
          publishState: "published",
          publishedAt: new Date(AUTOMATIONS_QA_POSTS.newest_with_image.published_at),
          mediaIds: [AUTOMATIONS_QA_POSTS.newest_with_image.media_id!]
        }
      ],
      // cancelled is excluded from BLOCKING_RUN_STATUSES query filter
      blockingRuns: [
        {
          sourcePostId: AUTOMATIONS_QA_POSTS.newest_with_image.post_id,
          status: "cancelled"
        }
      ]
    });

    const result = await resolveLatestEligiblePatreonPost(prisma, {
      creatorId: CREATOR,
      distributionRuleId: RULE
    });
    expect(result.ok).toBe(true);
  });

  it("ignores unpublished posts and cross-creator rows", async () => {
    const prisma = createResolverPrisma({
      posts: [
        {
          id: "post_draft",
          creatorId: CREATOR,
          source: PostSource.PATREON,
          publishState: "draft",
          publishedAt: new Date("2026-07-19T00:00:00.000Z"),
          mediaIds: ["m1"]
        },
        {
          id: "post_other",
          creatorId: OTHER,
          source: PostSource.PATREON,
          publishState: "published",
          publishedAt: new Date("2026-07-19T12:00:00.000Z"),
          mediaIds: ["m2"]
        }
      ],
      blockingRuns: []
    });

    const result = await resolveLatestEligiblePatreonPost(prisma, {
      creatorId: CREATOR,
      distributionRuleId: RULE
    });
    expect(result).toEqual({ ok: false, code: "AUTOMATION_NO_ELIGIBLE_POST" });
  });

  it("returns AUTOMATION_SOURCE_MEDIA_REQUIRED for newest unprocessed without media", async () => {
    const prisma = createResolverPrisma({
      posts: [
        {
          id: "post_qa_newest_no_media",
          creatorId: CREATOR,
          source: PostSource.PATREON,
          publishState: "published",
          publishedAt: new Date("2026-07-19T16:00:00.000Z"),
          mediaIds: []
        },
        {
          id: AUTOMATIONS_QA_POSTS.older_already_processed.post_id,
          creatorId: CREATOR,
          source: PostSource.PATREON,
          publishState: "published",
          publishedAt: new Date(AUTOMATIONS_QA_POSTS.older_already_processed.published_at),
          mediaIds: [AUTOMATIONS_QA_POSTS.older_already_processed.media_id!]
        }
      ],
      blockingRuns: []
    });

    const result = await resolveLatestEligiblePatreonPost(prisma, {
      creatorId: CREATOR,
      distributionRuleId: RULE
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("AUTOMATION_SOURCE_MEDIA_REQUIRED");
      expect(result.source?.post_id).toBe("post_qa_newest_no_media");
    }
  });
});
