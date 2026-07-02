/**
 * Performance intelligence Phase 2 — Platform Instance identity.
 * @see docs/analytics/PLATFORM_INSTANCE_SCHEMA.md
 */

import type {
  PlatformInstanceLinkSource,
  PlatformInstanceStatus,
  Prisma,
  PrismaClient
} from "@prisma/client";

export type PlatformInstanceDb = PrismaClient | Prisma.TransactionClient;

export const PLATFORM_INSTANCE_ATTEMPT_ID_PREFIX = "pi_attempt_";
export const RELAY_PLATFORM_INSTANCE_ID_PREFIX = "pi_relay_";
export const MANUAL_PLATFORM_INSTANCE_ID_PREFIX = "pi_manual_";

export const DEFAULT_REFRESH_POLICY = "conservative";

export function platformInstanceIdForAttempt(attemptId: string): string {
  return `${PLATFORM_INSTANCE_ATTEMPT_ID_PREFIX}${attemptId.trim()}`;
}

export function platformInstanceIdForManualLink(postId: string, destination: string): string {
  const safePost = postId.trim().replace(/[^a-zA-Z0-9_-]+/g, "_");
  const safeDest = destination.trim().replace(/[^a-zA-Z0-9_-]+/g, "_");
  return `${MANUAL_PLATFORM_INSTANCE_ID_PREFIX}${safePost}_${safeDest}`;
}

export function relayPlatformInstanceIdForPost(postId: string): string {
  return `${RELAY_PLATFORM_INSTANCE_ID_PREFIX}${postId.trim()}`;
}

export type UpsertPlatformInstanceFromAttemptArgs = {
  attemptId: string;
  creatorId: string;
  postId: string;
  destination: string;
  externalUrl?: string | null;
  externalId?: string | null;
  linkSource?: PlatformInstanceLinkSource;
  linkedAt?: Date;
  status?: PlatformInstanceStatus;
};

export type UpsertPlatformInstanceResult = {
  platformInstanceId: string;
  created: boolean;
};

/**
 * Upserts the canonical Platform Instance for a post + destination from a distribution attempt.
 * Requires a non-empty external URL for non-relay destinations.
 */
export async function upsertPlatformInstanceFromAttempt(
  db: PlatformInstanceDb,
  args: UpsertPlatformInstanceFromAttemptArgs
): Promise<UpsertPlatformInstanceResult | null> {
  const attemptId = args.attemptId.trim();
  const creatorId = args.creatorId.trim();
  const postId = args.postId.trim();
  const destination = args.destination.trim();
  const externalUrl = args.externalUrl?.trim() || null;
  const externalId = args.externalId?.trim() || null;
  const linkSource = args.linkSource ?? "autopost_success";
  const linkedAt = args.linkedAt ?? new Date();
  const status = args.status ?? "active";

  if (!attemptId || !creatorId || !postId || !destination) {
    throw new Error("attemptId, creatorId, postId, and destination are required");
  }

  if (destination !== "relay" && !externalUrl) {
    return null;
  }

  const id = platformInstanceIdForAttempt(attemptId);
  const existing = await db.platformInstance.findUnique({
    where: { postId_destination: { postId, destination } },
    select: { id: true }
  });

  await db.platformInstance.upsert({
    where: { postId_destination: { postId, destination } },
    create: {
      id,
      creatorId,
      postId,
      destination,
      externalUrl,
      externalId,
      attemptId,
      linkSource,
      status,
      refreshPolicy: DEFAULT_REFRESH_POLICY,
      linkedAt
    },
    update: {
      externalUrl,
      externalId,
      attemptId,
      linkSource,
      status,
      linkedAt,
      updatedAt: new Date()
    }
  });

  return {
    platformInstanceId: existing?.id ?? id,
    created: !existing
  };
}

/**
 * Ensures a Relay-native Platform Instance exists for first-party engagement metrics.
 */
export async function ensureRelayPlatformInstanceForPost(
  db: PlatformInstanceDb,
  args: { postId: string; creatorId: string; linkedAt?: Date }
): Promise<UpsertPlatformInstanceResult> {
  const postId = args.postId.trim();
  const creatorId = args.creatorId.trim();
  const linkedAt = args.linkedAt ?? new Date();
  const id = relayPlatformInstanceIdForPost(postId);

  const existing = await db.platformInstance.findUnique({
    where: { postId_destination: { postId, destination: "relay" } },
    select: { id: true }
  });

  await db.platformInstance.upsert({
    where: { postId_destination: { postId, destination: "relay" } },
    create: {
      id,
      creatorId,
      postId,
      destination: "relay",
      externalUrl: null,
      externalId: null,
      attemptId: null,
      linkSource: "relay_native",
      status: "active",
      refreshPolicy: DEFAULT_REFRESH_POLICY,
      linkedAt
    },
    update: {
      creatorId,
      status: "active",
      updatedAt: new Date()
    }
  });

  return {
    platformInstanceId: existing?.id ?? id,
    created: !existing
  };
}

export async function touchPlatformInstanceLastRefreshed(
  db: PlatformInstanceDb,
  platformInstanceId: string,
  refreshedAt: Date = new Date()
): Promise<void> {
  const id = platformInstanceId.trim();
  if (!id) return;

  await db.platformInstance.updateMany({
    where: { id },
    data: { lastRefreshedAt: refreshedAt, updatedAt: refreshedAt }
  });
}

export async function getPlatformInstanceForPostDestination(
  db: PlatformInstanceDb,
  postId: string,
  destination: string
): Promise<{
  id: string;
  destination: string;
  externalUrl: string | null;
  externalId: string | null;
  attemptId: string | null;
  linkSource: PlatformInstanceLinkSource;
  status: PlatformInstanceStatus;
  refreshPolicy: string;
  linkedAt: Date;
  lastRefreshedAt: Date | null;
} | null> {
  const row = await db.platformInstance.findUnique({
    where: {
      postId_destination: {
        postId: postId.trim(),
        destination: destination.trim()
      }
    },
    select: {
      id: true,
      destination: true,
      externalUrl: true,
      externalId: true,
      attemptId: true,
      linkSource: true,
      status: true,
      refreshPolicy: true,
      linkedAt: true,
      lastRefreshedAt: true
    }
  });

  return row;
}

export async function getPlatformInstancesForPost(
  db: PlatformInstanceDb,
  postId: string
): Promise<
  Array<{
    id: string;
    destination: string;
    externalUrl: string | null;
    externalId: string | null;
    attemptId: string | null;
    linkSource: PlatformInstanceLinkSource;
    status: PlatformInstanceStatus;
    refreshPolicy: string;
    linkedAt: Date;
    lastRefreshedAt: Date | null;
  }>
> {
  return db.platformInstance.findMany({
    where: { postId: postId.trim() },
    orderBy: [{ destination: "asc" }, { linkedAt: "desc" }],
    select: {
      id: true,
      destination: true,
      externalUrl: true,
      externalId: true,
      attemptId: true,
      linkSource: true,
      status: true,
      refreshPolicy: true,
      linkedAt: true,
      lastRefreshedAt: true
    }
  });
}
