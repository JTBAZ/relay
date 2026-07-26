/**
 * @fileoverview One-shot migration: legacy page layout JSON → `page_layouts` table.
 */

import type { Prisma } from "@prisma/client";
import type { PrismaClient } from "@prisma/client";
import { readFile } from "node:fs/promises";
import type { PageLayoutRoot } from "./types.js";

/**
 * @description Replaces all `page_layouts` rows from `page_layout.json` (full `layouts` map).
 * @param args.prisma Prisma client.
 * @param args.filePath Path to JSON root file.
 * @returns Paths + inserted layout count.
 * @async
 * @throws Propagates filesystem JSON parse errors and Prisma transaction failures.
 * @see prisma/schema.prisma `PageLayout`
 * @todo Published-at fallback from `updated_at` may not match historical publish semantics—verify during migration QA.
 */
export async function backfillPageLayoutFromFile(args: {
  prisma: PrismaClient;
  filePath: string;
}): Promise<{ filePath: string; layoutCount: number }> {
  const raw = await readFile(args.filePath, "utf8");
  const root = JSON.parse(raw) as PageLayoutRoot;
  const entries = Object.entries(root.layouts ?? {});
  await args.prisma.$transaction(async (tx) => {
    await tx.pageLayout.deleteMany({});
    for (const [creatorId, layout] of entries) {
      const { published_at, ...layoutRest } = layout;
      const json = { ...layoutRest, creator_id: creatorId } as unknown as Prisma.InputJsonValue;
      const publishedAt =
        published_at != null
          ? new Date(published_at)
          : new Date(layout.updated_at ?? Date.now());
      await tx.pageLayout.create({
        data: {
          creatorId,
          layoutJson: json,
          version: 1,
          publishedAt
        }
      });
    }
  });
  return { filePath: args.filePath, layoutCount: entries.length };
}
