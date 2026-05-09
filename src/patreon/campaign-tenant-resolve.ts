/**
 * @fileoverview Patreon campaign id ↔ Relay studio (`Tenant.relayCreatorId`) binding checks and `CreatorProfile` campaign writes.
 * @description Used by signed webhooks and OAuth flows to prevent cross-tenant campaign hijack.
 * @see {@link ../jsdoc-core-entities.ts}
 * @see prisma/schema.prisma `Tenant`, `CreatorProfile`
 */
import type { PrismaClient } from "@prisma/client";

/**
 * Resolve Patreon numeric `campaign_id` → Relay `creator_id` via `CreatorProfile.patreonCampaignId`
 * and `Tenant.relayCreatorId` (relational ownership).
 * @async
 * @throws {Error} Prisma read failures.
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

/** Webhook campaign binding check outcome. */
export type WebhookCampaignOwnershipResult =
  | { ok: true }
  | { ok: false; reason: "file_index" | "creator_profile" };

/**
 * MIG-21 — Ensure webhook payload `campaign_id` belongs to the same Relay creator as the opaque
 * delivery URL: check file index first (operational map), then `CreatorProfile` when Prisma is available.
 * @async
 * @throws {Error} From `fileIndexGetCreatorId` or Prisma when wired.
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

/** Outcome of {@link ensureCreatorProfilePatreonCampaignId} — surfaces silent skips for ops logging. */
export type EnsureCreatorProfilePatreonCampaignIdResult =
  | { kind: "noop" }
  | { kind: "no_profile" }
  | { kind: "no_tenant" }
  | { kind: "invalid_args" }
  | { kind: "skipped_same" }
  | { kind: "written"; profileId: string }
  | { kind: "conflict"; existingCampaignId: string; attemptedCampaignId: string };

/**
 * After a successful sync, persist `CreatorProfile.patreonCampaignId` so webhooks can enforce DB ownership.
 * Skips if no profile row (e.g. file-only OAuth). Does not overwrite a conflicting non-null campaign id.
 * @async
 * @throws {Error} Prisma update failures on success path.
 */
export async function ensureCreatorProfilePatreonCampaignId(
  prisma: PrismaClient,
  args: { relayCreatorId: string; patreonCampaignId: string }
): Promise<EnsureCreatorProfilePatreonCampaignIdResult> {
  const rid = args.relayCreatorId.trim();
  const pcid = args.patreonCampaignId.trim();
  if (!rid || !pcid) return { kind: "invalid_args" };

  const tenant = await prisma.tenant.findUnique({
    where: { relayCreatorId: rid },
    select: { id: true }
  });
  if (!tenant) return { kind: "no_tenant" };

  const profile = await prisma.creatorProfile.findFirst({
    where: { tenantId: tenant.id },
    select: { id: true, patreonCampaignId: true }
  });
  if (!profile) return { kind: "no_profile" };

  const existing = profile.patreonCampaignId?.trim();
  if (existing && existing !== pcid) {
    // eslint-disable-next-line no-console -- multi-tenant binding safety visibility
    console.warn(
      `[patreon_campaign] profile conflict relay_creator_id=${rid} ` +
        `existing_patreon_campaign_id=${existing} attempted=${pcid}`
    );
    return {
      kind: "conflict",
      existingCampaignId: existing,
      attemptedCampaignId: pcid
    };
  }
  if (existing === pcid) return { kind: "skipped_same" };

  await prisma.creatorProfile.update({
    where: { id: profile.id },
    data: { patreonCampaignId: pcid }
  });
  return { kind: "written", profileId: profile.id };
}

/**
 * Reverse of campaign → creator: the canonical Patreon numeric id stored on the studio profile,
 * used when GET /campaigns cannot disambiguate (0 or 2+ rows) but Relay already knows the id.
 * @async
 * @throws {Error} Prisma read failures.
 */
export async function getCreatorProfilePatreonCampaignIdForRelayCreatorDb(
  prisma: PrismaClient,
  relayCreatorId: string
): Promise<string | null> {
  const rid = relayCreatorId.trim();
  if (!rid) return null;
  const tenant = await prisma.tenant.findUnique({
    where: { relayCreatorId: rid },
    select: { id: true }
  });
  if (!tenant) return null;
  const profile = await prisma.creatorProfile.findFirst({
    where: { tenantId: tenant.id },
    select: { patreonCampaignId: true }
  });
  const p = profile?.patreonCampaignId?.trim();
  return p && p.length > 0 ? p : null;
}
