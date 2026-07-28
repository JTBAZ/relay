import { describe, expect, it, vi } from "vitest";
import { backfillPatreonPackaging } from "../src/analytics/backfill-patreon-packaging.js";

describe("backfillPatreonPackaging", () => {
  it("ensures creative work + patreon instance for each scanned post", async () => {
    const findMany = vi
      .fn()
      .mockResolvedValueOnce([
        {
          id: "patreon_post_42",
          creatorId: "cr_1",
          createdAt: new Date("2026-01-01T00:00:00.000Z"),
          versions: [{ title: "Hello", publishedAt: new Date("2026-01-02T00:00:00.000Z") }]
        }
      ])
      .mockResolvedValueOnce([]);

    const creativeWorkMemberFindUnique = vi.fn().mockResolvedValue(null);
    const creativeWorkUpsert = vi.fn().mockResolvedValue({});
    const creativeWorkMemberCreate = vi.fn().mockResolvedValue({});
    const platformInstanceFindUnique = vi.fn().mockResolvedValue(null);
    const platformInstanceCreate = vi.fn().mockResolvedValue({});

    const prisma = {
      post: { findMany },
      creativeWorkMember: {
        findUnique: creativeWorkMemberFindUnique,
        create: creativeWorkMemberCreate
      },
      creativeWork: { upsert: creativeWorkUpsert },
      platformInstance: {
        findUnique: platformInstanceFindUnique,
        create: platformInstanceCreate,
        update: vi.fn()
      }
    };

    const result = await backfillPatreonPackaging(prisma as never);

    expect(result).toEqual({
      scanned: 1,
      creative_works_created: 1,
      platform_instances_created: 1,
      platform_instances_updated: 0,
      skipped_non_patreon_id: 0
    });
    expect(creativeWorkUpsert).toHaveBeenCalled();
    expect(platformInstanceCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        postId: "patreon_post_42",
        destination: "patreon",
        linkSource: "api_identity",
        externalUrl: "https://www.patreon.com/posts/42"
      })
    });
  });
});
