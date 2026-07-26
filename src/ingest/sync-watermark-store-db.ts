/**
 * @fileoverview Postgres `syncCursor` implementation of watermark API.
 * @description Upserts `lastSyncedAt` / `updatedAt` per creator+campaign compound key.
 * @see ./sync-watermark-store.js
 */

import type { PrismaClient } from "@prisma/client";
import type { SyncWatermarkStoreAPI, WatermarkRow } from "./sync-watermark-store.js";

/**
 * @description Postgres `syncCursor` rows backing {@link SyncWatermarkStoreAPI}.
 */
export class DbSyncWatermarkStore implements SyncWatermarkStoreAPI {
  public constructor(private readonly prisma: PrismaClient) {}

  public async get(
    creatorId: string,
    campaignId: string
  ): Promise<string | null> {
    const row = await this.getRow(creatorId, campaignId);
    return row?.last_synced_at ?? null;
  }

  public async getRow(
    creatorId: string,
    campaignId: string
  ): Promise<WatermarkRow | null> {
    const row = await this.prisma.syncCursor.findUnique({
      where: {
        creatorId_campaignId: { creatorId, campaignId }
      }
    });
    if (!row) return null;
    return {
      last_synced_at: row.lastSyncedAt.toISOString(),
      updated_at: row.updatedAt.toISOString()
    };
  }

  public async set(
    creatorId: string,
    campaignId: string,
    lastSyncedAt: string
  ): Promise<void> {
    const at = new Date(lastSyncedAt);
    const now = new Date();
    await this.prisma.syncCursor.upsert({
      where: {
        creatorId_campaignId: { creatorId, campaignId }
      },
      create: {
        creatorId,
        campaignId,
        lastSyncedAt: at,
        updatedAt: now
      },
      update: {
        lastSyncedAt: at,
        updatedAt: now
      }
    });
  }
}
