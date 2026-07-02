import { describe, expect, it } from "vitest";
import {
  buildXCrossPostPackage,
  formatBlueskyPostText,
  formatXPostText
} from "../src/extension/cross-post-package.js";

describe("formatXPostText", () => {
  it("combines title and body within limit", () => {
    expect(formatXPostText("Hello", "World")).toBe("Hello\n\nWorld");
  });

  it("truncates long combined text", () => {
    const long = "a".repeat(300);
    expect(formatXPostText("Title", long).length).toBeLessThanOrEqual(280);
    expect(formatXPostText("Title", long).endsWith("…")).toBe(true);
  });
});

describe("formatBlueskyPostText", () => {
  it("allows longer text than X", () => {
    const body = "b".repeat(250);
    expect(formatBlueskyPostText("Title", body).length).toBeLessThanOrEqual(300);
  });
});

describe("buildXCrossPostPackage", () => {
  it("returns post_text and caps images at four", async () => {
    const state = {
      accounts: [{ id: "acc1", primaryRelayCreatorId: CREATOR_OWNER }],
      memberships: [],
      posts: [
        {
          id: POST_ID,
          creatorId: CREATOR_OWNER,
          source: "RELAY" as const,
          upstreamStatus: "active" as const,
          versions: [
            {
              versionSeq: 1,
              title: "Studio update",
              description: "Fresh WIP",
              mediaIds: ["m1", "m2", "m3", "m4", "m5"]
            }
          ],
          presentation: null
        }
      ],
      media: ["m1", "m2", "m3", "m4", "m5"].map((id) => ({
        id,
        creatorId: CREATOR_OWNER,
        currentMimeType: "image/png",
        upstreamStatus: "active" as const
      }))
    };

    const prisma = prismaStub(state as never);
    const result = await buildXCrossPostPackage(prisma, {
      postId: POST_ID,
      accountId: "acc1"
    });
    expect(result.status).toBe("ok");
    if (result.status !== "ok") {
      throw new Error("expected ok package");
    }
    expect(result.package.post_text).toContain("Studio update");
    expect(result.package.media).toHaveLength(4);
  });
});

// Reuse stub types from extension-cross-post-package.test.ts — import helpers inline for isolation.
const CREATOR_OWNER = "cr_crosspost_owner";
const POST_ID = "relay_post_crosspost_1";

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
