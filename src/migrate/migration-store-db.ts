import type { Prisma } from "@prisma/client";
import type { PrismaClient } from "@prisma/client";
import type { MigrationStore } from "./migration-store.js";
import type {
  AuditEntry,
  MigrationCampaign,
  SignedLink
} from "./types.js";

export class DbMigrationStore implements MigrationStore {
  public constructor(private readonly prisma: PrismaClient) {}

  public async upsertCampaign(campaign: MigrationCampaign): Promise<void> {
    const payload = campaign as unknown as Prisma.InputJsonValue;
    await this.prisma.audienceMigrationCampaign.upsert({
      where: { campaignId: campaign.campaign_id },
      create: {
        campaignId: campaign.campaign_id,
        creatorId: campaign.creator_id,
        payload
      },
      update: { payload, updatedAt: new Date(campaign.updated_at) }
    });
  }

  public async getCampaign(campaignId: string): Promise<MigrationCampaign | null> {
    const row = await this.prisma.audienceMigrationCampaign.findUnique({
      where: { campaignId }
    });
    if (!row) {
      return null;
    }
    return row.payload as MigrationCampaign;
  }

  public async appendAudit(entry: AuditEntry): Promise<void> {
    await this.prisma.migrationAuditEntry.create({
      data: {
        ts: new Date(entry.timestamp),
        campaignId: entry.campaign_id,
        creatorId: entry.creator_id,
        action: entry.action,
        detail: entry.detail
      }
    });
  }

  public async getSuppressionList(creatorId: string): Promise<string[]> {
    const rows = await this.prisma.migrationSuppressionEntry.findMany({
      where: { creatorId },
      orderBy: { emailNorm: "asc" }
    });
    return rows.map((r) => r.emailNorm);
  }

  public async addToSuppression(creatorId: string, emails: string[]): Promise<void> {
    const data = emails.map((e) => ({
      creatorId,
      emailNorm: e.toLowerCase().trim()
    }));
    await this.prisma.migrationSuppressionEntry.createMany({
      data,
      skipDuplicates: true
    });
  }

  public async storeSignedLink(link: SignedLink): Promise<void> {
    await this.prisma.migrationSignedLink.upsert({
      where: { token: link.token },
      create: {
        token: link.token,
        memberId: link.member_id,
        tierId: link.tier_id,
        url: link.url,
        expiresAt: new Date(link.expires_at)
      },
      update: {
        memberId: link.member_id,
        tierId: link.tier_id,
        url: link.url,
        expiresAt: new Date(link.expires_at)
      }
    });
  }

  public async resolveSignedLink(token: string): Promise<SignedLink | null> {
    const row = await this.prisma.migrationSignedLink.findUnique({
      where: { token }
    });
    if (!row) {
      return null;
    }
    if (row.expiresAt.getTime() < Date.now()) {
      return null;
    }
    return {
      member_id: row.memberId,
      tier_id: row.tierId,
      token: row.token,
      url: row.url,
      expires_at: row.expiresAt.toISOString()
    };
  }
}
