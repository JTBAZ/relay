export type TierMapping = {
  source_tier_id: string;
  destination_tier_id: string;
};

export type MigrationRecipient = {
  member_id: string;
  email: string;
  source_tier_id: string;
  destination_tier_id: string;
  suppressed: boolean;
};

export type CampaignStatus =
  | "draft"
  | "preflight_passed"
  | "sending"
  | "paused"
  | "completed";

export type MigrationCampaign = {
  campaign_id: string;
  creator_id: string;
  status: CampaignStatus;
  tier_mappings: TierMapping[];
  recipients: MigrationRecipient[];
  batches_sent: number;
  total_recipients: number;
  total_suppressed: number;
  bounce_count: number;
  complaint_count: number;
  click_count: number;
  resubscribe_count: number;
  created_at: string;
  updated_at: string;
  message_subject: string;
  message_body_template: string;
};

export type SignedLink = {
  member_id: string;
  tier_id: string;
  token: string;
  url: string;
  expires_at: string;
};

export type AuditEntry = {
  timestamp: string;
  campaign_id: string;
  creator_id: string;
  action: string;
  detail: string;
};

export type MigrationStoreRoot = {
  campaigns: Record<string, MigrationCampaign>;
  suppression_list: Record<string, string[]>;
  audit_log: AuditEntry[];
  signed_links: Record<string, SignedLink>;
};

export type CampaignPreflightResult = {
  campaign_id: string;
  pass: boolean;
  eligible_recipients: number;
  suppressed_recipients: number;
  issues: Array<{ code: string; message: string; severity: "error" | "warning" }>;
};

export type SendBatchResult = {
  campaign_id: string;
  batch_number: number;
  recipients_in_batch: number;
  links_generated: number;
};
