/**

 * @fileoverview Patron experience module notification-mapper.ts — see exported symbols.

 * @see {@link ../jsdoc-core-entities.ts}

 * @see prisma/schema.prisma Account, TenantMembership, and related patron tables

 * @security-audit-required Patron PII or entitlement paths — audit responses and logs.

 */

/**

 * PE-G (BO-P3-03) — `OutboxEvent` -> `Notification` mapping.

 *

 * Patron lane: `recipientMembershipId`

 * Creator lane (Option B): `recipientCreatorAccountId` via `resolveCreatorAccountIdForRelayCreator`

 */



import type { PrismaClient } from "@prisma/client";
import { MediaUpstreamStatus } from "@prisma/client";
import { isPostMatureFromPatronSurfaces } from "../gallery/mature-post-ids.js";
import { isPostHiddenFromPatronSurfaces } from "../gallery/hidden-post-ids.js";
import { galleryOverridesRootFromRows } from "../gallery/overrides-store-db.js";



import { isCreatorPreferenceEnabled } from "./creator-notification-prefs-service.js";

import {

  resolveAccountIdForMembership,

  resolveCreatorAccountIdForRelayCreator

} from "./creator-notification-target.js";

import type { CreateNotificationInput } from "./notification-service.js";

import { isPreferenceEnabled } from "./notification-prefs-service.js";



/** Event names produced by Relay. Adding a new producer = adding a const here. */

export const PEG_EVENT_NAMES = {

  TIER_CHANGED: "patron_entitlement.tier_changed",

  COMMENT_CREATED: "relay_comment.created",

  COMMENT_MENTIONED: "relay_comment.mention_created",

  COMMENT_REACTION_ADDED: "relay_comment.reaction_added",

  ACCOUNT_FOLLOW_CREATED: "account_follow.created",

  POST_PUBLISHED: "relay_post.published",

  PATRON_FAVORITE_ADDED: "patron_favorite.added",

  PATRON_COLLECTION_ENTRY_ADDED: "patron_collection.entry_added"

} as const;



export const PEG_NOTIFIABLE_EVENT_NAMES: readonly string[] = [

  PEG_EVENT_NAMES.TIER_CHANGED,

  PEG_EVENT_NAMES.COMMENT_CREATED,

  PEG_EVENT_NAMES.COMMENT_MENTIONED,

  PEG_EVENT_NAMES.COMMENT_REACTION_ADDED,

  PEG_EVENT_NAMES.ACCOUNT_FOLLOW_CREATED,

  PEG_EVENT_NAMES.POST_PUBLISHED,

  PEG_EVENT_NAMES.PATRON_FAVORITE_ADDED,

  PEG_EVENT_NAMES.PATRON_COLLECTION_ENTRY_ADDED

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



function asBool(v: unknown): boolean | null {

  return typeof v === "boolean" ? v : null;

}



export async function mapOutboxEventToNotifications(

  prisma: PrismaClient,

  event: OutboxEventLike

): Promise<CreateNotificationInput[]> {

  switch (event.eventName) {

    case PEG_EVENT_NAMES.TIER_CHANGED:

      return mapTierChanged(prisma, event);

    case PEG_EVENT_NAMES.COMMENT_CREATED:

      return mapCommentCreated(prisma, event);

    case PEG_EVENT_NAMES.COMMENT_MENTIONED:

      return mapCommentMentioned(prisma, event);

    case PEG_EVENT_NAMES.COMMENT_REACTION_ADDED:

      return mapCommentReactionAdded(prisma, event);

    case PEG_EVENT_NAMES.ACCOUNT_FOLLOW_CREATED:

      return mapAccountFollowCreated(prisma, event);

    case PEG_EVENT_NAMES.POST_PUBLISHED:

      return mapPostPublished(prisma, event);

    case PEG_EVENT_NAMES.PATRON_FAVORITE_ADDED:

      return mapPatronFavoriteAdded(prisma, event);

    case PEG_EVENT_NAMES.PATRON_COLLECTION_ENTRY_ADDED:

      return mapPatronCollectionEntryAdded(prisma, event);

    default:

      return [];

  }

}



async function mapTierChanged(

  prisma: PrismaClient,

  event: OutboxEventLike

): Promise<CreateNotificationInput[]> {

  const recipientMembershipId = event.primaryId;

  const relayCreatorId = event.tenantId;

  const payload = asObject(event.payload);

  const priorActive = asBool(payload.prior_active) ?? false;

  const nextActive = asBool(payload.next_active) ?? false;

  const out: CreateNotificationInput[] = [];



  const patronEnabled = await isPreferenceEnabled(prisma, {

    membershipId: recipientMembershipId,

    relayCreatorId,

    preferenceType: "tier_changed"

  });

  if (patronEnabled) {

    out.push({

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

      clusterKey: null,

      sourceEventId: event.id

    });

  }



  if (nextActive && !priorActive) {

    const creatorAccountId = await resolveCreatorAccountIdForRelayCreator(prisma, relayCreatorId);

    if (creatorAccountId) {

      const creatorEnabled = await isCreatorPreferenceEnabled(prisma, {

        accountId: creatorAccountId,

        preferenceType: "new_subscriber"

      });

      if (creatorEnabled) {

        out.push({

          recipientCreatorAccountId: creatorAccountId,

          relayCreatorId,

          kind: "new_subscriber",

          payload: {

            patron_membership_id: recipientMembershipId,

            next_tier_ids: payload.next_tier_ids ?? [],

            source: payload.source ?? null

          },

          clusterKey: null,

          sourceEventId: `${event.id}:creator`

        });

      }

    }

  }



  return out;

}



async function mapCommentCreated(

  prisma: PrismaClient,

  event: OutboxEventLike

): Promise<CreateNotificationInput[]> {

  const payload = asObject(event.payload);

  const relayCreatorId = asString(payload.relay_creator_id) ?? event.tenantId;

  const postId = asString(payload.post_id);

  const commentId = asString(payload.comment_id);

  const authorMembershipId = asString(payload.author_membership_id);

  const parentCommentId = asString(payload.parent_comment_id);

  if (!commentId || !postId) return [];



  if (parentCommentId) {

    const parent = await prisma.comment.findUnique({

      where: { id: parentCommentId },

      select: { patronUserId: true, relayCreatorId: true, postId: true }

    });

    if (!parent) return [];

    if (parent.patronUserId === authorMembershipId) return [];

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

          comment_id: commentId,

          parent_comment_id: parentCommentId,

          reply_membership_id: authorMembershipId

        },

        clusterKey: `comment_replied:${parentCommentId}`,

        sourceEventId: event.id

      }

    ];

  }



  const creatorAccountId = await resolveCreatorAccountIdForRelayCreator(prisma, relayCreatorId);

  if (!creatorAccountId || !authorMembershipId) return [];

  const authorAccountId = await resolveAccountIdForMembership(prisma, authorMembershipId);

  if (authorAccountId === creatorAccountId) return [];



  const enabled = await isCreatorPreferenceEnabled(prisma, {

    accountId: creatorAccountId,

    preferenceType: "post_commented"

  });

  if (!enabled) return [];



  return [

    {

      recipientCreatorAccountId: creatorAccountId,

      relayCreatorId,

      kind: "post_commented",

      payload: {

        post_id: postId,

        comment_id: commentId,

        author_membership_id: authorMembershipId

      },

      clusterKey: `post_commented:${postId}`,

      sourceEventId: event.id

    }

  ];

}



async function mapCommentMentioned(

  prisma: PrismaClient,

  event: OutboxEventLike

): Promise<CreateNotificationInput[]> {

  const payload = asObject(event.payload);

  const recipientMembershipId = asString(payload.recipient_membership_id);

  const commentId = asString(payload.comment_id);

  const postId = asString(payload.post_id);

  const authorMembershipId = asString(payload.author_membership_id);

  const relayCreatorId = asString(payload.relay_creator_id) ?? event.tenantId;

  if (!recipientMembershipId || !commentId || !postId) return [];

  if (recipientMembershipId === authorMembershipId) return [];



  const enabled = await isPreferenceEnabled(prisma, {

    membershipId: recipientMembershipId,

    relayCreatorId,

    preferenceType: "mention"

  });

  if (!enabled) return [];



  return [

    {

      recipientMembershipId,

      relayCreatorId,

      kind: "mention",

      payload: {

        post_id: postId,

        comment_id: commentId,

        author_membership_id: authorMembershipId ?? null,

        mentioned_handle: payload.mentioned_handle ?? null,

        target_kind: payload.target_kind ?? null

      },

      clusterKey: `mention:${commentId}:${recipientMembershipId}`,

      sourceEventId: event.id

    }

  ];

}



async function mapCommentReactionAdded(

  prisma: PrismaClient,

  event: OutboxEventLike

): Promise<CreateNotificationInput[]> {

  const payload = asObject(event.payload);

  const commentId = asString(payload.comment_id);

  const reactorAccountId = asString(payload.account_id);

  if (!commentId || !reactorAccountId) return [];



  const comment = await prisma.comment.findUnique({

    where: { id: commentId },

    select: { patronUserId: true, relayCreatorId: true, postId: true }

  });

  if (!comment) return [];



  const authorAccountId = await resolveAccountIdForMembership(prisma, comment.patronUserId);

  if (authorAccountId === reactorAccountId) return [];



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

        latest_actor_account_id: reactorAccountId,

        latest_kind: payload.kind ?? null

      },

      clusterKey: `comment_liked:${commentId}`,

      sourceEventId: event.id

    }

  ];

}



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



async function mapPostPublished(

  prisma: PrismaClient,

  event: OutboxEventLike

): Promise<CreateNotificationInput[]> {

  const payload = asObject(event.payload);

  const postId = asString(payload.post_id) ?? event.primaryId;

  const relayCreatorId = asString(payload.relay_creator_id) ?? event.tenantId;

  if (!postId || !relayCreatorId) return [];

  const [overrideRows, postRow] = await Promise.all([
    prisma.postOverride.findMany({
      where: { creatorId: relayCreatorId, postId }
    }),
    prisma.post.findFirst({
      where: { id: postId, creatorId: relayCreatorId },
      select: {
        mediaAssets: {
          where: { upstreamStatus: MediaUpstreamStatus.active },
          select: { id: true }
        }
      }
    })
  ]);
  const overrides = galleryOverridesRootFromRows(overrideRows);
  const activeMediaIds = postRow?.mediaAssets.map((m) => m.id) ?? [];
  const postHidden = isPostHiddenFromPatronSurfaces({
    overrides,
    creatorId: relayCreatorId,
    postId,
    activeMediaIds
  });
  const postMature = isPostMatureFromPatronSurfaces({
    overrides,
    creatorId: relayCreatorId,
    postId,
    activeMediaIds
  });

  const follows = await prisma.patronFollow.findMany({

    where: { relayCreatorId },

    select: { patronMembershipId: true }

  });

  if (follows.length === 0) return [];



  const membershipIds = follows.map((f) => f.patronMembershipId);

  const profiles = await prisma.patronProfile.findMany({

    where: { tenantMembershipId: { in: membershipIds } },

    select: {
      tenantMembershipId: true,
      notificationDigestEnabled: true,
      notificationDigestCadence: true,
      hideMatureContent: true
    }

  });

  const digestEnabledByMembership = new Map(

    profiles.map((p) => [p.tenantMembershipId, p.notificationDigestEnabled])

  );
  const mutedNewPostByMembership = new Map(
    profiles.map((p) => [
      p.tenantMembershipId,
      !p.notificationDigestEnabled && p.notificationDigestCadence === "never"
    ])
  );
  const hideMatureByMembership = new Map(
    profiles.map((p) => [p.tenantMembershipId, p.hideMatureContent])
  );



  const out: CreateNotificationInput[] = [];

  for (const follow of follows) {

    const digestEnabled = digestEnabledByMembership.get(follow.patronMembershipId) ?? true;

    if (digestEnabled) continue;
    if (mutedNewPostByMembership.get(follow.patronMembershipId)) continue;

    if (postHidden) continue;

    const hideMature = hideMatureByMembership.get(follow.patronMembershipId) ?? false;
    if (hideMature && postMature) continue;

    const enabled = await isPreferenceEnabled(prisma, {

      membershipId: follow.patronMembershipId,

      relayCreatorId,

      preferenceType: "new_post_followed"

    });

    if (!enabled) continue;

    out.push({

      recipientMembershipId: follow.patronMembershipId,

      relayCreatorId,

      kind: "new_post_followed",

      payload: {

        post_id: postId,

        relay_creator_id: relayCreatorId,

        title: payload.title ?? null,

        published_at: payload.published_at ?? null

      },

      clusterKey: null,

      sourceEventId: event.id

    });

  }

  return out;

}



async function mapPatronFavoriteAdded(

  prisma: PrismaClient,

  event: OutboxEventLike

): Promise<CreateNotificationInput[]> {

  const payload = asObject(event.payload);

  const relayCreatorId = asString(payload.relay_creator_id) ?? event.tenantId;

  const actorAccountId = asString(payload.actor_account_id);

  const targetKind = asString(payload.target_kind);

  const targetId = asString(payload.target_id);

  const postId = asString(payload.post_id);

  if (!relayCreatorId || !actorAccountId || !targetKind || !targetId) return [];



  const creatorAccountId = await resolveCreatorAccountIdForRelayCreator(prisma, relayCreatorId);

  if (!creatorAccountId || creatorAccountId === actorAccountId) return [];



  const enabled = await isCreatorPreferenceEnabled(prisma, {

    accountId: creatorAccountId,

    preferenceType: "post_favorited"

  });

  if (!enabled) return [];



  return [

    {

      recipientCreatorAccountId: creatorAccountId,

      relayCreatorId,

      kind: "post_favorited",

      payload: {

        post_id: postId,

        target_kind: targetKind,

        target_id: targetId,

        actor_account_id: actorAccountId,

        actor_membership_id: payload.actor_membership_id ?? null

      },

      clusterKey: `post_favorited:${targetKind}:${targetId}`,

      sourceEventId: event.id

    }

  ];

}



async function mapPatronCollectionEntryAdded(

  prisma: PrismaClient,

  event: OutboxEventLike

): Promise<CreateNotificationInput[]> {

  const payload = asObject(event.payload);

  const relayCreatorId = asString(payload.relay_creator_id) ?? event.tenantId;

  const postId = asString(payload.post_id);

  const mediaId = asString(payload.media_id);

  const collectionId = asString(payload.collection_id);

  const actorMembershipId = asString(payload.actor_membership_id);

  if (!relayCreatorId || !postId || !mediaId || !collectionId || !actorMembershipId) return [];



  const creatorAccountId = await resolveCreatorAccountIdForRelayCreator(prisma, relayCreatorId);

  if (!creatorAccountId) return [];

  const actorAccountId = await resolveAccountIdForMembership(prisma, actorMembershipId);

  if (actorAccountId === creatorAccountId) return [];



  const enabled = await isCreatorPreferenceEnabled(prisma, {

    accountId: creatorAccountId,

    preferenceType: "post_collected"

  });

  if (!enabled) return [];



  return [

    {

      recipientCreatorAccountId: creatorAccountId,

      relayCreatorId,

      kind: "post_collected",

      payload: {

        post_id: postId,

        media_id: mediaId,

        collection_id: collectionId,

        actor_membership_id: actorMembershipId

      },

      clusterKey: `post_collected:${mediaId}`,

      sourceEventId: event.id

    }

  ];

}


