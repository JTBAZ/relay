import { describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { prisma } from "../../../src/lib/db.js";
import {
  STUDIO_LAB2_CREATOR_ID,
  STUDIO_LAB2_DEFAULT_COLLECTION_ID,
  STUDIO_LAB2_DEFAULT_COLLECTION_TITLE,
  STUDIO_LAB2_LABEL
} from "../../../src/studio/lab2/corpus-spec.js";
import { restoreStudioLab2PlaygroundBaseline } from "../../../src/studio/lab2/seed-studio-lab2.js";

const hasDatabaseUrl = Boolean(process.env.DATABASE_URL?.trim());

describe("Lab 2 playground baseline reset", () => {
  it("refuses production and foreign creators before touching Prisma", async () => {
    await expect(
      restoreStudioLab2PlaygroundBaseline({} as PrismaClient, {
        env: { NODE_ENV: "production" }
      })
    ).rejects.toThrow(/production/);
    await expect(
      restoreStudioLab2PlaygroundBaseline({} as PrismaClient, {
        creatorId: "cr_other",
        env: { NODE_ENV: "test" }
      })
    ).rejects.toThrow(/rcx_studio_lab2/);
  });
});

describe.skipIf(!hasDatabaseUrl)("Lab 2 playground baseline reset (db)", () => {
  it("removes Hero Academy and keeps Photo Studies and posts", async () => {
    const postsBefore = await prisma.post.count({ where: { creatorId: STUDIO_LAB2_CREATOR_ID } });
    if (postsBefore < 1) return;
    await prisma.libraryCollection.upsert({
      where: { id: "sl2_col_hero_academy" },
      create: {
        id: "sl2_col_hero_academy",
        creatorId: STUDIO_LAB2_CREATOR_ID,
        title: "Hero Academy",
        themeTagIds: [STUDIO_LAB2_LABEL],
        sortOrder: 9,
        createdAt: new Date()
      },
      update: { title: "Hero Academy" }
    });
    const out = await restoreStudioLab2PlaygroundBaseline(prisma, {
      env: { ...process.env, NODE_ENV: "test" }
    });
    expect(out.removed_collection_ids).toContain("sl2_col_hero_academy");
    expect(out.collection_count).toBe(1);
    expect(await prisma.libraryCollection.findUnique({ where: { id: "sl2_col_hero_academy" } })).toBeNull();
    const photo = await prisma.libraryCollection.findUnique({
      where: { id: STUDIO_LAB2_DEFAULT_COLLECTION_ID }
    });
    expect(photo?.title).toBe(STUDIO_LAB2_DEFAULT_COLLECTION_TITLE);
    expect(await prisma.post.count({ where: { creatorId: STUDIO_LAB2_CREATOR_ID } })).toBe(postsBefore);
  });
});
