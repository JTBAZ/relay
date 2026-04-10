import type { Prisma } from "@prisma/client";
import type { PrismaClient } from "@prisma/client";
import type { CloneSiteStore } from "./clone-store.js";
import type { CloneSiteModel } from "./types.js";

export class DbCloneSiteStore implements CloneSiteStore {
  public constructor(private readonly prisma: PrismaClient) {}

  public async upsert(model: CloneSiteModel): Promise<void> {
    const payload = model as unknown as Prisma.InputJsonValue;
    await this.prisma.cloneSite.upsert({
      where: { creatorId: model.creator_id },
      create: { creatorId: model.creator_id, payload },
      update: { payload }
    });
  }

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
