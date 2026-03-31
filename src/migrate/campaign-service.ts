import { randomUUID } from "node:crypto";
import type { InMemoryEventBus } from "../events/event-bus.js";
import { generateSignedLink } from "./signed-links.js";
import type { FileMigrationStore } from "./migration-store.js";
import type {
  CampaignPreflightResult,
  MigrationCampaign,
  MigrationRecipient,
  SendBatchResult,
  TierMapping
} from "./types.js";

const BOUNCE_PAUSE_THRESHOLD = 0.05;
const COMPLAINT_PAUSE_THRESHOLD = 0.001;

export class CampaignService {
  private readonly store: FileMigrationStore;
  private readonly eventBus: InMemoryEventBus;

  public constructor(store: FileMigrationStore, eventBus: InMemoryEventBus) {
    this.store = store;
    this.eventBus = eventBus;
  }

  public async create(
    creatorId: string,
    tierMappings: TierMapping[],
    recipients: Array<{ member_id: string; email: string; source_tier_id: string }>,
    messageSubject: string,
    messageBodyTemplate: string,
    traceId: string
  ): Promise<MigrationCampaign> {
    const campaignId = `mig_${randomUUID()}`;
    const suppressionList = await this.store.getSuppressionList(creatorId);
    const suppressSet = new Set(suppressionList.map((e) => e.toLowerCase()));

    const mapped: MigrationRecipient[] = recipients.map((r) => {
      const mapping = tierMappings.find((m) => m.source_tier_id === r.source_tier_id);
      return {
        member_id: r.member_id,
        email: r.email.toLowerCase().trim(),
        source_tier_id: r.source_tier_id,
        destination_tier_id: mapping?.destination_tier_id ?? r.source_tier_id,
        suppressed: suppressSet.has(r.email.toLowerCase().trim())
      };
    });

    const campaign: MigrationCampaign = {
      campaign_id: campaignId,
      creator_id: creatorId,
      status: "draft",
      tier_mappings: tierMappings,
      recipients: mapped,
      batches_sent: 0,
      total_recipients: mapped.length,
      total_suppressed: mapped.filter((r) => r.suppressed).length,
      bounce_count: 0,
      complaint_count: 0,
      click_count: 0,
      resubscribe_count: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      message_subject: messageSubject,
      message_body_template: messageBodyTemplate
    };

    await this.store.upsertCampaign(campaign);
    await this.audit(campaignId, creatorId, "campaign_created", `${mapped.length} recipients, ${tierMappings.length} tier mappings`);

    this.eventBus.publish(
      "migration_campaign_created",
      creatorId,
      traceId,
      {
        primary_id: campaignId,
        campaign_id: campaignId,
        creator_id: creatorId,
        created_at: campaign.created_at,
        target_tier_map_count: tierMappings.length
      },
      { producer: "migration-service" }
    );

    return campaign;
  }

  public async preflight(campaignId: string): Promise<CampaignPreflightResult> {
    const campaign = await this.store.getCampaign(campaignId);
    if (!campaign) {
      return {
        campaign_id: campaignId,
        pass: false,
        eligible_recipients: 0,
        suppressed_recipients: 0,
        issues: [{ code: "NOT_FOUND", message: "Campaign not found.", severity: "error" }]
      };
    }

    const issues: CampaignPreflightResult["issues"] = [];
    const eligible = campaign.recipients.filter((r) => !r.suppressed);

    if (eligible.length === 0) {
      issues.push({
        code: "NO_ELIGIBLE",
        message: "All recipients are suppressed.",
        severity: "error"
      });
    }

    if (!campaign.message_subject.trim()) {
      issues.push({
        code: "MISSING_SUBJECT",
        message: "Message subject is empty.",
        severity: "error"
      });
    }

    if (!campaign.message_body_template.includes("{{unsubscribe_url}}")) {
      issues.push({
        code: "MISSING_UNSUBSCRIBE",
        message: "Template must include {{unsubscribe_url}}.",
        severity: "error"
      });
    }

    if (!campaign.message_body_template.includes("{{resubscribe_url}}")) {
      issues.push({
        code: "MISSING_RESUBSCRIBE_LINK",
        message: "Template should include {{resubscribe_url}}.",
        severity: "warning"
      });
    }

    const pass = !issues.some((i) => i.severity === "error");
    if (pass) {
      campaign.status = "preflight_passed";
      campaign.updated_at = new Date().toISOString();
      await this.store.upsertCampaign(campaign);
    }

    return {
      campaign_id: campaignId,
      pass,
      eligible_recipients: eligible.length,
      suppressed_recipients: campaign.total_suppressed,
      issues
    };
  }

  public async sendBatch(
    campaignId: string,
    batchSize: number,
    baseUrl: string,
    traceId: string
  ): Promise<SendBatchResult> {
    const campaign = await this.store.getCampaign(campaignId);
    if (!campaign) throw new Error("Campaign not found.");
    if (campaign.status !== "preflight_passed" && campaign.status !== "sending") {
      throw new Error(`Cannot send in status ${campaign.status}. Run preflight first.`);
    }

    this.checkThresholds(campaign);

    const eligible = campaign.recipients.filter((r) => !r.suppressed);
    const start = campaign.batches_sent * batchSize;
    const batch = eligible.slice(start, start + batchSize);

    if (batch.length === 0) {
      campaign.status = "completed";
      campaign.updated_at = new Date().toISOString();
      await this.store.upsertCampaign(campaign);
      return {
        campaign_id: campaignId,
        batch_number: campaign.batches_sent,
        recipients_in_batch: 0,
        links_generated: 0
      };
    }

    let linksGenerated = 0;
    for (const r of batch) {
      const link = generateSignedLink(campaignId, r.member_id, r.destination_tier_id, baseUrl);
      await this.store.storeSignedLink(link);
      linksGenerated += 1;
    }

    campaign.batches_sent += 1;
    campaign.status = "sending";
    campaign.updated_at = new Date().toISOString();
    await this.store.upsertCampaign(campaign);

    await this.audit(campaignId, campaign.creator_id, "batch_sent", `batch ${campaign.batches_sent}, ${batch.length} recipients`);

    this.eventBus.publish(
      "migration_campaign_sent",
      campaign.creator_id,
      traceId,
      {
        primary_id: `${campaignId}_batch_${campaign.batches_sent}`,
        campaign_id: campaignId,
        creator_id: campaign.creator_id,
        sent_at: new Date().toISOString(),
        recipient_count: batch.length,
        staged_batch: campaign.batches_sent
      },
      { producer: "migration-service" }
    );

    return {
      campaign_id: campaignId,
      batch_number: campaign.batches_sent,
      recipients_in_batch: batch.length,
      links_generated: linksGenerated
    };
  }

  public async recordBounce(campaignId: string, email: string): Promise<void> {
    const campaign = await this.store.getCampaign(campaignId);
    if (!campaign) return;
    campaign.bounce_count += 1;
    await this.store.addToSuppression(campaign.creator_id, [email]);
    this.checkThresholds(campaign);
    campaign.updated_at = new Date().toISOString();
    await this.store.upsertCampaign(campaign);
    await this.audit(campaignId, campaign.creator_id, "bounce", email);
  }

  public async recordComplaint(campaignId: string, email: string): Promise<void> {
    const campaign = await this.store.getCampaign(campaignId);
    if (!campaign) return;
    campaign.complaint_count += 1;
    await this.store.addToSuppression(campaign.creator_id, [email]);
    this.checkThresholds(campaign);
    campaign.updated_at = new Date().toISOString();
    await this.store.upsertCampaign(campaign);
    await this.audit(campaignId, campaign.creator_id, "complaint", email);
  }

  public async recordClick(
    campaignId: string,
    memberId: string,
    tierId: string,
    traceId: string
  ): Promise<void> {
    const campaign = await this.store.getCampaign(campaignId);
    if (!campaign) return;
    campaign.click_count += 1;
    campaign.updated_at = new Date().toISOString();
    await this.store.upsertCampaign(campaign);

    this.eventBus.publish(
      "migration_repopulate_link_clicked",
      campaign.creator_id,
      traceId,
      {
        primary_id: `${campaignId}_${memberId}`,
        campaign_id: campaignId,
        creator_id: campaign.creator_id,
        member_id: memberId,
        tier_id: tierId,
        clicked_at: new Date().toISOString()
      },
      { producer: "migration-service" }
    );
  }

  public async recordResubscribe(
    campaignId: string,
    memberId: string,
    tierId: string,
    paymentProvider: string,
    traceId: string
  ): Promise<void> {
    const campaign = await this.store.getCampaign(campaignId);
    if (!campaign) return;
    campaign.resubscribe_count += 1;
    campaign.updated_at = new Date().toISOString();
    await this.store.upsertCampaign(campaign);

    this.eventBus.publish(
      "migration_resubscribe_completed",
      campaign.creator_id,
      traceId,
      {
        primary_id: `${campaignId}_${memberId}`,
        campaign_id: campaignId,
        creator_id: campaign.creator_id,
        member_id: memberId,
        tier_id: tierId,
        completed_at: new Date().toISOString(),
        payment_provider: paymentProvider
      },
      { producer: "migration-service" }
    );

    await this.audit(campaignId, campaign.creator_id, "resubscribe", `${memberId} → ${tierId}`);
  }

  public async getCampaign(campaignId: string): Promise<MigrationCampaign | null> {
    return this.store.getCampaign(campaignId);
  }

  public async getPreview(campaignId: string): Promise<{
    subject: string;
    body_preview: string;
    recipients_by_tier: Array<{ tier_id: string; count: number }>;
    risk_flags: string[];
  } | null> {
    const campaign = await this.store.getCampaign(campaignId);
    if (!campaign) return null;

    const eligible = campaign.recipients.filter((r) => !r.suppressed);
    const tierCounts: Record<string, number> = {};
    for (const r of eligible) {
      tierCounts[r.destination_tier_id] = (tierCounts[r.destination_tier_id] ?? 0) + 1;
    }

    const riskFlags: string[] = [];
    if (campaign.total_suppressed > 0) {
      riskFlags.push(`${campaign.total_suppressed} suppressed recipient(s)`);
    }
    const suppressionRatio = campaign.total_suppressed / Math.max(1, campaign.total_recipients);
    if (suppressionRatio > 0.1) {
      riskFlags.push("High suppression ratio (>10%)");
    }

    return {
      subject: campaign.message_subject,
      body_preview: campaign.message_body_template.slice(0, 500),
      recipients_by_tier: Object.entries(tierCounts).map(([tier_id, count]) => ({
        tier_id,
        count
      })),
      risk_flags: riskFlags
    };
  }

  private checkThresholds(campaign: MigrationCampaign): void {
    const sent = campaign.recipients.filter((r) => !r.suppressed).length;
    if (sent === 0) return;
    const bounceRate = campaign.bounce_count / sent;
    const complaintRate = campaign.complaint_count / sent;
    if (bounceRate > BOUNCE_PAUSE_THRESHOLD || complaintRate > COMPLAINT_PAUSE_THRESHOLD) {
      campaign.status = "paused";
    }
  }

  private async audit(
    campaignId: string,
    creatorId: string,
    action: string,
    detail: string
  ): Promise<void> {
    await this.store.appendAudit({
      timestamp: new Date().toISOString(),
      campaign_id: campaignId,
      creator_id: creatorId,
      action,
      detail
    });
  }
}
