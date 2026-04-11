import type { PatreonMemberSyncCoordinator } from "./patreon-member-sync-coordinator.js";
import type { PatreonSyncService } from "./patreon-sync-service.js";
import {
  isPatreonMemberFamilyTrigger,
  isPatreonPostEventTrigger,
  scrapeOrSyncFromVerifiedPlatform
} from "../webhooks/patreon-webhook.js";

function campaignIdFromResourceRelationships(resource: unknown): string | null {
  if (!resource || typeof resource !== "object") return null;
  const rel = (resource as Record<string, unknown>).relationships as
    | Record<string, unknown>
    | undefined;
  const camp = rel?.campaign as { data?: { id?: unknown } } | undefined;
  const id = camp?.data?.id;
  return typeof id === "string" ? id : null;
}

/**
 * Extract Patreon numeric campaign id from a JSON:API webhook document (member, post, etc.).
 */
export function extractCampaignIdFromPatreonWebhookPayload(parsed: unknown): string | null {
  if (!parsed || typeof parsed !== "object") return null;
  const root = parsed as Record<string, unknown>;
  const data = root.data;
  if (Array.isArray(data)) {
    for (const row of data) {
      const id = campaignIdFromResourceRelationships(row);
      if (id) return id;
    }
    return null;
  }
  const single = campaignIdFromResourceRelationships(data);
  if (single) return single;
  const included = root.included;
  if (!Array.isArray(included)) return null;
  for (const item of included) {
    if (item && typeof item === "object" && (item as { type?: string }).type === "campaign") {
      const id = (item as { id?: string }).id;
      if (typeof id === "string") return id;
    }
  }
  return null;
}

export async function dispatchVerifiedPatreonPlatformPayload(args: {
  creatorId: string;
  eventHeader: string | undefined;
  /** From `extractCampaignIdFromPatreonWebhookPayload(parsed)` — computed once in the route after JSON parse. */
  campaignId: string | null;
  traceId: string;
  syncService: PatreonSyncService;
  memberCoordinator: PatreonMemberSyncCoordinator;
}): Promise<{ action: "post_sync" | "member_sync_scheduled" | "ignored" }> {
  const ev = args.eventHeader?.trim() ?? "";
  const campaignId = args.campaignId;

  if (isPatreonPostEventTrigger(ev)) {
    await scrapeOrSyncFromVerifiedPlatform(args.syncService, args.creatorId, args.traceId, {
      campaign_id: campaignId ?? undefined
    });
    return { action: "post_sync" };
  }

  if (isPatreonMemberFamilyTrigger(ev)) {
    args.memberCoordinator.scheduleMemberSync(args.creatorId, campaignId ?? undefined);
    return { action: "member_sync_scheduled" };
  }

  return { action: "ignored" };
}
