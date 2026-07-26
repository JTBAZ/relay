import { describe, expect, it, vi } from "vitest";
import {
  defaultCreativeWorkIdForPost,
  defaultCreativeWorkMemberIdForPost,
  ensureDefaultCreativeWorkForPost,
  getCreativeWorkForPost
} from "../src/analytics/creative-work-service.js";

const POST_ID = "post_alpha";
const CREATOR_ID = "creator_a";

describe("creative-work-service", () => {
  it("builds deterministic default ids from post id", () => {
    expect(defaultCreativeWorkIdForPost(POST_ID)).toBe("cw_default_post_alpha");
    expect(defaultCreativeWorkMemberIdForPost(POST_ID)).toBe("cwm_default_post_alpha");
  });

  it("returns existing membership without creating duplicates", async () => {
    const findUnique = vi.fn().mockResolvedValue({
      id: "cwm_existing",
      creativeWorkId: "cw_existing"
    });
    const db = {
      creativeWorkMember: { findUnique, create: vi.fn() },
      creativeWork: { upsert: vi.fn() }
    };

    const result = await ensureDefaultCreativeWorkForPost(db as never, {
      postId: POST_ID,
      creatorId: CREATOR_ID,
      title: "Alpha"
    });

    expect(result).toEqual({
      creativeWorkId: "cw_existing",
      memberId: "cwm_existing",
      created: false
    });
    expect(db.creativeWork.upsert).not.toHaveBeenCalled();
  });

  it("creates default work and member when missing", async () => {
    const findUnique = vi
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        variantRole: "standalone",
        creativeWork: {
          id: defaultCreativeWorkIdForPost(POST_ID),
          title: "Alpha",
          isDefaultBundle: true
        }
      });
    const upsert = vi.fn().mockResolvedValue({});
    const create = vi.fn().mockResolvedValue({});
    const db = {
      creativeWorkMember: { findUnique, create },
      creativeWork: { upsert }
    };

    const result = await ensureDefaultCreativeWorkForPost(db as never, {
      postId: POST_ID,
      creatorId: CREATOR_ID,
      title: "Alpha"
    });

    expect(result.created).toBe(true);
    expect(result.creativeWorkId).toBe(defaultCreativeWorkIdForPost(POST_ID));
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: defaultCreativeWorkIdForPost(POST_ID) },
        create: expect.objectContaining({
          creatorId: CREATOR_ID,
          title: "Alpha",
          isDefaultBundle: true
        })
      })
    );
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          postId: POST_ID,
          variantRole: "standalone"
        })
      })
    );
  });

  it("loads creative work summary for a post", async () => {
    const db = {
      creativeWorkMember: {
        findUnique: vi.fn().mockResolvedValue({
          variantRole: "teaser",
          creativeWork: {
            id: "cw_shared",
            title: "Shared work",
            isDefaultBundle: false
          }
        })
      }
    };

    await expect(getCreativeWorkForPost(db as never, POST_ID)).resolves.toEqual({
      creativeWorkId: "cw_shared",
      variantRole: "teaser",
      title: "Shared work",
      isDefaultBundle: false
    });
  });
});
