/**
 * @fileoverview Validates minimal signed change identities and executes claimed Patreon work.
 * @description Assumes caller verified `X-Patreon-Signature` and resolved `creator_id` for opaque URLs.
 * @async
 * @throws {Error} From `scrapeOrSync` when post-shaped events fire.
 * @see {@link ../webhooks/patreon-webhook.js}
 * @see prisma/schema.prisma Indirect via sync + member pipelines
 */
import type { PatreonMemberSyncCoordinator } from "./patreon-member-sync-coordinator.js";
import type { PatreonSyncService } from "./patreon-sync-service.js";
import type { PatreonChangeDescriptor } from "./patreon-change-work.js";
import {
  isPatreonMemberFamilyTrigger,
  isPatreonPostEventTrigger
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

/** Validate every accumulated resource before accepting any work; attributes and patron PII are discarded. */
export function patreonChangeDescriptors(creatorId: string, event: string | undefined, parsed: unknown): PatreonChangeDescriptor[] {
  const eventType = event?.trim().toLowerCase() ?? "";
  const resourceType = isPatreonPostEventTrigger(eventType) ? "post" : isPatreonMemberFamilyTrigger(eventType) ? "member" : null;
  if (!resourceType) return [];
  if (!/^(posts:(publish|update|delete)|members:(create|update|delete|pledge:(create|update|delete)))$/.test(eventType)) throw new Error("Unsupported Patreon change event.");
  const data = (parsed as { data?: unknown } | null)?.data;
  const rows = Array.isArray(data) ? data : [data];
  if (rows.length === 0 || rows.length > 1000) throw new Error("Invalid Patreon change resource count.");
  return rows.map((row) => {
    const value = row as { id?: unknown; type?: unknown } | null;
    const campaignId = campaignIdFromResourceRelationships(row);
    if (value?.type !== resourceType || typeof value.id !== "string" || !/^[a-zA-Z0-9_-]{1,128}$/.test(value.id) || !campaignId || !/^\d{1,32}$/.test(campaignId)) throw new Error("Patreon change requires a resource and campaign identity.");
    return { creatorId, campaignId, resourceType, resourceId: value.id, eventType };
  });
}

export async function dispatchVerifiedPatreonPlatformPayload(args: {
  creatorId: string;
  eventHeader: string | undefined;
  /** From `extractCampaignIdFromPatreonWebhookPayload(parsed)` — computed once in the route after JSON parse. */
  campaignId: string | null;
  traceId: string;
  syncService: PatreonSyncService;
  memberCoordinator: PatreonMemberSyncCoordinator;
  resourceId?: string;
}): Promise<{ action: "post_sync" | "member_sync" | "ignored" }> {
  const ev = args.eventHeader?.trim() ?? "";
  const campaignId = args.campaignId;

  if (isPatreonPostEventTrigger(ev)) {
    if (!args.resourceId || !campaignId) throw new Error("Signed Patreon post work requires a resource and campaign identity.");
    await args.syncService.refreshPost(args.creatorId, args.traceId, campaignId, args.resourceId, ev.toLowerCase() === "posts:delete");
    return { action: "post_sync" };
  }

  if (isPatreonMemberFamilyTrigger(ev)) {
    if (!args.resourceId || !campaignId) throw new Error("Signed Patreon member work requires a resource and campaign identity.");
    await args.syncService.refreshMember(args.creatorId, args.traceId, campaignId, args.resourceId, ev.toLowerCase().endsWith(":delete"));
    return { action: "member_sync" };
  }

  return { action: "ignored" };
}
