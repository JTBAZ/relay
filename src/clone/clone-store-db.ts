/**
 * @fileoverview Prisma `CloneSite` JSON persistence implementing `CloneSiteStore`.
 * @description Stores full `CloneSiteModel` as `payload` JSON on upsert.
 * @see ./clone-store.js
 * @see prisma/schema.prisma CloneSite
 */

import type { Prisma } from "@prisma/client";
import type { PrismaClient } from "@prisma/client";
import type { CloneSiteStore } from "./clone-store.js";
import type { CloneSiteModel } from "./types.js";

/**
 * @description Database adapter for generated clone models keyed by `creatorId`.
 * @security-audit-required Payloads describe creator content topology; enforce creator authz at API layer.
 */
export class DbCloneSiteStore implements CloneSiteStore {
  /**
   * @description Binds a Prisma client for `cloneSite` access.
   * @param prisma Shared Prisma client.
   */
  public constructor(private readonly prisma: PrismaClient) {}

  /**
   * @description Upserts JSON payload for the model's `creator_id`.
   * @param model Clone graph to persist.
   * @async
   * @throws {Error} Prisma `upsert` failures (connection, constraint, RLS).
   */
  public async upsert(model: CloneSiteModel): Promise<void> {
    const payload = model as unknown as Prisma.InputJsonValue;
    await this.prisma.cloneSite.upsert({
      where: { creatorId: model.creator_id },
      create: { creatorId: model.creator_id, payload },
      update: { payload }
    });
  }

  /**
   * @description Loads latest stored clone model for a creator.
   * @param creatorId Creator key.
   * @returns Parsed `CloneSiteModel` or `null`.
   * @async
   * @throws {Error} Prisma read failures; cast assumes payload matches schema.
   */
  public async getByCreator(creatorId: string): Promise<CloneSiteModel | null> {
    const row = await this.prisma.cloneSite.findUnique({
      where: { creatorId }
    });
    if (!row) {
      return null;
    }
    return row.payload as CloneSiteModel;
  }
}
