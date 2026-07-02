import { describe, expect, it } from "vitest";
import { buildDeviantArtCrossPostPackage } from "../src/extension/cross-post-package.js";

const CREATOR_OWNER = "cr_crosspost_owner";
const POST_ID = "relay_post_crosspost_da_1";

type TestPost = {
  id: string;
  creatorId: string;
  source: "RELAY";
  upstreamStatus: "active";
  versions: Array<{
    versionSeq: number;
    title: string;
    description: string | null;
    mediaIds: string[];
  }>;
  presentation: null;
};

type TestMedia = {
  id: string;
  creatorId: string;
  currentMimeType: string | null;
  upstreamStatus: "active";
};

function prismaStub(state: {
  accounts: Array<{ id: string; primaryRelayCreatorId: string | null }>;
  posts: TestPost[];
  media: TestMedia[];
}) {
  const accountsById = new Map(state.accounts.map((a) => [a.id, a]));
  const postsById = new Map(state.posts.map((p) => [p.id, p]));
  const mediaById = new Map(state.media.map((m) => [m.id, m]));
  return {
    account: {
      findUnique: async (args: { where: { id: string } }) => accountsById.get(args.where.id) ?? null
    },
    post: {
      findFirst: async (args: { where: { id: string }; include: unknown }) => {
        const row = postsById.get(args.where.id);
        if (!row) return null;
        return {
          ...row,
          versions: row.versions,
          presentation: row.presentation
        };
      }
    },
    mediaAsset: {
      findMany: async (args: { where: { id: { in: string[] } } }) =>
        args.where.id.in.map((id) => mediaById.get(id)).filter(Boolean)
    }
  } as never;
}

describe("buildDeviantArtCrossPostPackage", () => {
  it("returns title, body, tags, and caps images at one", async () => {
    const state = {
      accounts: [{ id: "acc1", primaryRelayCreatorId: CREATOR_OWNER }],
      posts: [
        {
          id: POST_ID,
          creatorId: CREATOR_OWNER,
          source: "RELAY" as const,
          upstreamStatus: "active" as const,
          versions: [
            {
              versionSeq: 1,
              title: "Character study",
              description: "<p>Full render WIP</p>",
              mediaIds: ["m1", "m2"]
            }
          ],
          presentation: null
        }
      ],
      media: ["m1", "m2"].map((id) => ({
        id,
        creatorId: CREATOR_OWNER,
        currentMimeType: "image/png",
        upstreamStatus: "active" as const
      }))
    };

    const prisma = prismaStub(state);
    const result = await buildDeviantArtCrossPostPackage(prisma, {
      postId: POST_ID,
      accountId: "acc1"
    });

    expect(result.status).toBe("ok");
    if (result.status !== "ok") {
      throw new Error("expected ok package");
    }
    expect(result.package.title).toBe("Character study");
    expect(result.package.body_text).toContain("Full render WIP");
    expect(result.package.body_html).toContain("<p>");
    expect(result.package.tags).toEqual([]);
    expect(result.package.media).toHaveLength(1);
    expect(result.package.media[0]?.media_id).toBe("m1");
  });
});
