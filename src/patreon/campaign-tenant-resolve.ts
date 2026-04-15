import type { PrismaClient } from "@prisma/client";

/**
 * Resolve Patreon numeric `campaign_id` → Relay `creator_id` via `CreatorProfile.patreonCampaignId`
 * and `Tenant.relayCreatorId` (relational ownership).
 */
export async function getRelayCreatorIdForPatreonCampaignDb(
  prisma: PrismaClient,
  campaignNumericId: string
): Promise<string | null> {
  const c = campaignNumericId.trim();
  if (!c) return null;
  const row = await prisma.creatorProfile.findFirst({
    where: { patreonCampaignId: c },
    select: { tenant: { select: { relayCreatorId: true } } }
  });
  const id = row?.tenant?.relayCreatorId;
  return typeof id === "string" && id.length > 0 ? id : null;
}

export type WebhookCampaignOwnershipResult =
  | { ok: true }
  | { ok: false; reason: "file_index" | "creator_profile" };

/**
 * MIG-21 — Ensure webhook payload `campaign_id` belongs to the same Relay creator as the opaque
 * delivery URL: check file index first (operational map), then `CreatorProfile` when Prisma is available.
 */
export async function resolvePatreonWebhookCampaignOwnership(args: {
  creatorIdFromRoute: string;
  campaignNumericId: string | null;
  fileIndexGetCreatorId: (campaignId: string) => Promise<string | null>;
  prisma: PrismaClient | null | undefined;
}): Promise<WebhookCampaignOwnershipResult> {
  const routeCreator = args.creatorIdFromRoute.trim();
  const camp = args.campaignNumericId?.trim();
  if (!camp) return { ok: true };

  const mappedFile = await args.fileIndexGetCreatorId(camp);
  if (mappedFile && mappedFile !== routeCreator) {
    return { ok: false, reason: "file_index" };
  }

  if (args.prisma) {
    const dbCreator = await getRelayCreatorIdForPatreonCampaignDb(args.prisma, camp);
    if (dbCreator && dbCreator !== routeCreator) {
      return { ok: false, reason: "creator_profile" };
    }
  }

  return { ok: true };
}

/**
 * After a successful sync, persist `CreatorProfile.patreonCampaignId` so webhooks can enforce DB ownership.
 * Skips if no profile row (e.g. file-only OAuth). Does not overwrite a conflicting non-null campaign id.
 */
export async function ensureCreatorProfilePatreonCampaignId(
  prisma: PrismaClient,
  args: { relayCreatorId: string; patreonCampaignId: string }
): Promise<void> {
  const rid = args.relayCreatorId.trim();
  const pcid = args.patreonCampaignId.trim();
  if (!rid || !pcid) return;

  const tenant = await prisma.tenant.findUnique({
    where: { relayCreatorId: rid },
    select: { id: true }
  });
  if (!tenant) return;

  const profile = await prisma.creatorProfile.findFirst({
    where: { tenantId: tenant.id },
    select: { id: true, patreonCampaignId: true }
  });
  if (!profile) return;

  const existing = profile.patreonCampaignId?.trim();
  if (existing && existing !== pcid) {
    return;
  }
  if (existing === pcid) return;

  await prisma.creatorProfile.update({
    where: { id: profile.id },
    data: { patreonCampaignId: pcid }
  });
}
