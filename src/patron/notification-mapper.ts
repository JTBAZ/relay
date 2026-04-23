/**
 * PE-G (BO-P3-03) — `OutboxEvent` -> `Notification` mapping.
 *
 * The mapper is a pure(ish) dispatcher: take a single OutboxEvent row, return zero or more
 * `CreateNotificationInput`s. The delivery worker calls the mapper for each undelivered event
 * and persists every input via `createOrClusterNotification`.
 *
 * Recipient resolution is the only side that touches Prisma (to look up follower membership
 * ids, comment author memberships, etc.). The dispatcher itself is shape-only -- adding a new
 * event_name = adding a new branch + a `resolveRecipients*` helper if needed.
 *
 * v1 event coverage:
 *   - patron_entitlement.tier_changed -> NotificationKind.tier_changed (recipient = the patron
 *     whose tier moved). Already emitted from `upsertPatronEntitlementSnapshot` (BO-P1-07).
 *   - relay_comment.created           -> NotificationKind.comment_replied (recipient = parent
 *     comment author when this is a reply; otherwise no notification today -- post-author
 *     notification deferred).
 *   - relay_comment.reaction_added    -> NotificationKind.comment_liked (recipient = comment
 *     author; clustered so 5 likes in an hour fold into one row).
 *   - account_follow.created          -> NotificationKind.new_follower (recipient = followed
 *     account's primary patron membership).
 *
 * Out of v1 scope (event producers do not exist yet):
 *   - new_post_followed (needs producer in patreon ingest path)
 *   - mention (needs comment-body @-parsing)
 */

import type { PrismaClient } from "@prisma/client";

import type { CreateNotificationInput } from "./notification-service.js";
import { isPreferenceEnabled } from "./notification-prefs-service.js";

/** Event names produced by Relay. Adding a new producer = adding a const here. */
export const PEG_EVENT_NAMES = {
  TIER_CHANGED: "patron_entitlement.tier_changed",
  COMMENT_CREATED: "relay_comment.created",
  COMMENT_REACTION_ADDED: "relay_comment.reaction_added",
  ACCOUNT_FOLLOW_CREATED: "account_follow.created"
} as const;

export const PEG_NOTIFIABLE_EVENT_NAMES: readonly string[] = [
  PEG_EVENT_NAMES.TIER_CHANGED,
  PEG_EVENT_NAMES.COMMENT_CREATED,
  PEG_EVENT_NAMES.COMMENT_REACTION_ADDED,
  PEG_EVENT_NAMES.ACCOUNT_FOLLOW_CREATED
];

interface OutboxEventLike {
  id: string;
  eventName: string;
  tenantId: string;
  primaryId: string;
  payload: unknown;
}

function asObject(payload: unknown): Record<string, unknown> {
  return payload && typeof payload === "object" && !Array.isArray(payload)
    ? (payload as Record<string, unknown>)
    : {};
}

function asString(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

/**
 * Materialize the Notification rows that should be written for `event`. Returns an empty
 * array when the event is unknown / has no recipients / is muted by every recipient's prefs.
 */
export async function mapOutboxEventToNotifications(
  prisma: PrismaClient,
  event: OutboxEventLike
): Promise<CreateNotificationInput[]> {
  switch (event.eventName) {
    case PEG_EVENT_NAMES.TIER_CHANGED:
      return mapTierChanged(prisma, event);
    case PEG_EVENT_NAMES.COMMENT_CREATED:
      return mapCommentCreated(prisma, event);
    case PEG_EVENT_NAMES.COMMENT_REACTION_ADDED:
      return mapCommentReactionAdded(prisma, event);
    case PEG_EVENT_NAMES.ACCOUNT_FOLLOW_CREATED:
      return mapAccountFollowCreated(prisma, event);
    default:
      return [];
  }
}

/** patron_entitlement.tier_changed: primaryId = patronMembershipId; tenantId = creator scope. */
async function mapTierChanged(
  prisma: PrismaClient,
  event: OutboxEventLike
): Promise<CreateNotificationInput[]> {
  const recipientMembershipId = event.primaryId;
  const relayCreatorId = event.tenantId;
  const enabled = await isPreferenceEnabled(prisma, {
    membershipId: recipientMembershipId,
    relayCreatorId,
    preferenceType: "tier_changed"
  });
  if (!enabled) return [];
  const payload = asObject(event.payload);
  return [
    {
      recipientMembershipId,
      relayCreatorId,
      kind: "tier_changed",
      payload: {
        prior_tier_ids: payload.prior_tier_ids ?? [],
        next_tier_ids: payload.next_tier_ids ?? [],
        prior_active: payload.prior_active ?? null,
        next_active: payload.next_active ?? null,
        source: payload.source ?? null
      },
      // tier_changed is high-signal; never coalesce. Each transition is its own row.
      clusterKey: null,
      sourceEventId: event.id
    }
  ];
}

/**
 * relay_comment.created:
 *   payload: { post_id, comment_id, parent_comment_id?, author_membership_id }
 *   Routes a reply notification to the PARENT comment author. Top-level comments are
 *   intentionally silent for v1 (post-author notification = future work; needs an explicit
 *   "creator inbox" surface that we don't have yet).
 */
async function mapCommentCreated(
  prisma: PrismaClient,
  event: OutboxEventLike
): Promise<CreateNotificationInput[]> {
  const payload = asObject(event.payload);
  const parentCommentId = asString(payload.parent_comment_id);
  if (!parentCommentId) return [];
  const parent = await prisma.comment.findUnique({
    where: { id: parentCommentId },
    select: { patronUserId: true, relayCreatorId: true, postId: true }
  });
  if (!parent) return [];
  // Don't notify yourself when you reply to your own comment.
  if (parent.patronUserId === asString(payload.author_membership_id)) return [];
  const enabled = await isPreferenceEnabled(prisma, {
    membershipId: parent.patronUserId,
    relayCreatorId: parent.relayCreatorId,
    preferenceType: "comment_replied"
  });
  if (!enabled) return [];
  return [
    {
      recipientMembershipId: parent.patronUserId,
      relayCreatorId: parent.relayCreatorId,
      kind: "comment_replied",
      payload: {
        post_id: parent.postId,
        comment_id: payload.comment_id,
        parent_comment_id: parentCommentId,
        reply_membership_id: payload.author_membership_id ?? null
      },
      // Cluster replies on the same parent within the hour into one row.
      clusterKey: `comment_replied:${parentCommentId}`,
      sourceEventId: event.id
    }
  ];
}

/**
 * relay_comment.reaction_added:
 *   payload: { comment_id, account_id (the reactor), kind (reaction kind) }
 *   Routes to the COMMENT author. Clustered so a flurry of likes folds into one row.
 */
async function mapCommentReactionAdded(
  prisma: PrismaClient,
  event: OutboxEventLike
): Promise<CreateNotificationInput[]> {
  const payload = asObject(event.payload);
  const commentId = asString(payload.comment_id);
  if (!commentId) return [];
  const comment = await prisma.comment.findUnique({
    where: { id: commentId },
    select: { patronUserId: true, relayCreatorId: true, postId: true }
  });
  if (!comment) return [];
  // Don't notify yourself when you react to your own comment.
  if (comment.patronUserId === asString(payload.account_id)) return [];
  const enabled = await isPreferenceEnabled(prisma, {
    membershipId: comment.patronUserId,
    relayCreatorId: comment.relayCreatorId,
    preferenceType: "comment_liked"
  });
  if (!enabled) return [];
  return [
    {
      recipientMembershipId: comment.patronUserId,
      relayCreatorId: comment.relayCreatorId,
      kind: "comment_liked",
      payload: {
        post_id: comment.postId,
        comment_id: commentId,
        latest_actor_account_id: payload.account_id ?? null,
        latest_kind: payload.kind ?? null
      },
      clusterKey: `comment_liked:${commentId}`,
      sourceEventId: event.id
    }
  ];
}

/**
 * account_follow.created:
 *   payload: { follower_account_id, followed_account_id }
 *   Routes to ALL TenantMembership rows owned by the followed account (since notifications
 *   live per-membership in PE-G v1). This is the simplest correct fan-out: a multi-membership
 *   creator sees the follow on every studio they own. UI can de-dupe at render if needed.
 */
async function mapAccountFollowCreated(
  prisma: PrismaClient,
  event: OutboxEventLike
): Promise<CreateNotificationInput[]> {
  const payload = asObject(event.payload);
  const followedAccountId = asString(payload.followed_account_id);
  const followerAccountId = asString(payload.follower_account_id);
  if (!followedAccountId || !followerAccountId) return [];
  const memberships = await prisma.tenantMembership.findMany({
    where: { accountId: followedAccountId },
    select: { id: true, tenant: { select: { relayCreatorId: true } } }
  });
  const out: CreateNotificationInput[] = [];
  for (const m of memberships) {
    const relayCreatorId = m.tenant?.relayCreatorId ?? "";
    const enabled = await isPreferenceEnabled(prisma, {
      membershipId: m.id,
      relayCreatorId,
      preferenceType: "new_follower"
    });
    if (!enabled) continue;
    out.push({
      recipientMembershipId: m.id,
      relayCreatorId,
      kind: "new_follower",
      payload: {
        follower_account_id: followerAccountId,
        followed_account_id: followedAccountId
      },
      clusterKey: `new_follower:${followedAccountId}`,
      sourceEventId: event.id
    });
  }
  return out;
}
