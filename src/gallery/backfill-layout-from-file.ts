import type { Prisma } from "@prisma/client";
import type { PrismaClient } from "@prisma/client";
import { readFile } from "node:fs/promises";
import type { PageLayoutRoot } from "./types.js";

/**
 * Replace all `page_layouts` rows from `page_layout.json` (full `layouts` map).
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
      const json = { ...layout, creator_id: creatorId } as unknown as Prisma.InputJsonValue;
      await tx.pageLayout.create({
        data: {
          creatorId,
          layoutJson: json,
          version: 1
        }
      });
    }
  });
  return { filePath: args.filePath, layoutCount: entries.length };
}
