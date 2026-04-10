import type { PrismaClient } from "@prisma/client";
import { DbAnalyticsStore } from "./analytics-store-db.js";
import { FileAnalyticsStore } from "./analytics-store.js";

/**
 * Full-replace backfill: `analytics.json` → analytics / recommendation / action / outcome tables.
 */
export async function backfillAnalyticsFromFile(args: {
  prisma: PrismaClient;
  filePath: string;
}): Promise<{
  filePath: string;
  snapshots: number;
  cards: number;
  actions: number;
  outcomes: number;
}> {
  const file = new FileAnalyticsStore(args.filePath);
  const root = await file.load();
  const db = new DbAnalyticsStore(args.prisma);
  await db.save(root);
  let snapshots = 0;
  for (const list of Object.values(root.snapshots)) {
    snapshots += list.length;
  }
  let cards = 0;
  for (const list of Object.values(root.recommendations)) {
    cards += list.length;
  }
  return {
    filePath: args.filePath,
    snapshots,
    cards,
    actions: root.actions.length,
    outcomes: root.outcomes.length
  };
}
