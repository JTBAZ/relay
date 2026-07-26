/**
 * @fileoverview One-shot migration helper: JSON `analytics.json` into Prisma analytics tables.
 * @description Full-replace via `DbAnalyticsStore.save` after loading `FileAnalyticsStore`.
 * @see ./analytics-store.js
 * @see ./analytics-store-db.js
 * @see prisma/schema.prisma AnalyticsSnapshotRow, RecommendationRecord, AnalyticsActionExecution, AnalyticsOutcome
 */

import type { PrismaClient } from "@prisma/client";
import { DbAnalyticsStore } from "./analytics-store-db.js";
import { FileAnalyticsStore } from "./analytics-store.js";

/**
 * @description Full-replace backfill: `analytics.json` → analytics / recommendation / action / outcome tables.
 * @param args.prisma Shared Prisma client.
 * @param args.filePath Path to JSON analytics file on disk.
 * @returns Count summary and source path.
 * @async
 * @throws {Error} On file read, JSON parse, or Prisma transaction failure during `db.save`.
 * @security-audit-required Imports creator-scoped operational data; restrict to trusted operators and locked-down paths.
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
